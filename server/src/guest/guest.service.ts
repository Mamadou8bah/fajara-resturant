import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderSource, Role, SessionStatus, TableStatus } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { ShiftsLookupService } from '../common/shifts-lookup.service';
import { randomToken } from '../common/utils/ids';
import { MenuService } from '../menu/menu.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { SessionsService } from '../sessions/sessions.service';
import { resolveAppEnv } from '../common/env';
import {
  GuestCallWaiterDto,
  GuestJoinDto,
  GuestLeaveDto,
  GuestSubmitOrderDto,
} from './dto/guest.dto';

@Injectable()
export class GuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly activity: ActivityLogService,
    private readonly shiftsLookup: ShiftsLookupService,
    private readonly settings: SettingsService,
    private readonly sessions: SessionsService,
  ) {}

  async resolveMenuByToken(token: string) {
    const qr = await this.resolveToken(token);
    return this.buildPublicMenu(qr.token, qr.table);
  }

  /** Stable printable QR path: /t/{tableId} → active internal token + menu. */
  async resolveMenuByTableId(tableId: string) {
    const resolved = await this.resolveByTableId(tableId);
    const qr = await this.resolveToken(resolved.token);
    return this.buildPublicMenu(qr.token, qr.table);
  }

  private async buildPublicMenu(
    token: string,
    table: {
      id: string;
      number: string;
      label: string | null;
      status: TableStatus;
      seats: number;
    },
  ) {
    const menu = await this.menu.getPublicMenuTree();
    const open = await this.prisma.tableSession.findFirst({
      where: { tableId: table.id, status: SessionStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true,
        guestCount: true,
        reservationPartySize: true,
      },
    });
    const seats = table.seats;
    const joinedCount = open?.guestCount ?? 0;
    const remainingSeats = Math.max(0, seats - joinedCount);
    const sessionOpen = Boolean(open);
    return {
      token,
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        status: table.status,
        seats,
        joinedCount,
        remainingSeats,
        expectedPartySize: open?.reservationPartySize ?? null,
        /** Guests never open tables — staff must Open on Floor first. */
        canOpenSession: false,
        sessionOpen,
        canJoin: sessionOpen && remainingSeats > 0,
      },
      ...menu,
    };
  }

  /** Production-safe: table UUID → active QR token (printed stickers use /t/{id}). */
  async resolveByTableId(tableId: string) {
    const id = tableId?.trim();
    if (!id) {
      throw new BadRequestException('table id is required');
    }

    const table = await this.prisma.diningTable.findFirst({
      where: { id, isArchived: false },
      include: {
        qrTokens: {
          where: { isActive: true, deactivatedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    let token = table.qrTokens[0]?.token;
    if (!token) {
      const created = await this.prisma.tableQrToken.create({
        data: {
          tableId: table.id,
          token: randomToken(24),
          isActive: true,
        },
      });
      token = created.token;
    }

    return {
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        status: table.status,
      },
      token,
      path: `/t/${table.id}`,
    };
  }

  /** Dev/staging helper: table number → active QR token (like scanning the printed code). */
  async resolveByTableNumber(tableNumber: string) {
    const appEnv = resolveAppEnv();
    if (appEnv === 'production') {
      throw new NotFoundException('Not found');
    }

    const raw = tableNumber.trim().replace(/^table[-_]?/i, '');
    if (!raw) {
      throw new BadRequestException('table number is required');
    }

    const normalized = raw.replace(/^0+/, '') || raw;
    const table = await this.prisma.diningTable.findFirst({
      where: {
        isArchived: false,
        OR: [{ number: raw }, { number: normalized }],
      },
      include: {
        qrTokens: {
          where: { isActive: true, deactivatedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!table) {
      throw new NotFoundException(`Table ${raw} not found`);
    }
    const token = table.qrTokens[0]?.token;
    if (!token) {
      throw new NotFoundException(
        `Table ${table.number} has no active QR token`,
      );
    }

    return {
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        status: table.status,
      },
      token,
      // Staging demos keep /m/… shortcuts; /t/{id} also works.
      path: `/m/${token}`,
    };
  }

  async join(dto: GuestJoinDto) {
    const qr = await this.resolveToken(dto.token);
    const incomingDevice = dto.deviceToken?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      // One phone = one open visit. Resume same table, or leave the other first.
      if (incomingDevice) {
        const existingGuest = await tx.guest.findFirst({
          where: {
            deviceToken: incomingDevice,
            leftAt: null,
            session: { status: SessionStatus.OPEN },
          },
          include: {
            session: true,
          },
        });

        if (existingGuest) {
          if (existingGuest.session.tableId === qr.tableId) {
            const name = dto.displayName?.trim();
            if (name) {
              await tx.guest.update({
                where: { id: existingGuest.id },
                data: { displayName: name },
              });
            }
            const seats = qr.table.seats;
            return {
              guestId: existingGuest.id,
              sessionId: existingGuest.sessionId,
              deviceToken: incomingDevice,
              tableId: qr.tableId,
              openingNew: false,
              partySize: existingGuest.session.reservationPartySize,
              seats,
              joinedCount: existingGuest.session.guestCount,
              resumed: true as const,
            };
          }

            // Phone moves to a new table — unlink from the previous open visit.
            const ordered = await tx.orderItem.count({
              where: { guestId: existingGuest.id },
            });
            if (ordered === 0) {
              await tx.guest.delete({ where: { id: existingGuest.id } });
              await tx.tableSession.update({
                where: { id: existingGuest.sessionId },
                data: { guestCount: { decrement: 1 } },
              });
            } else {
              await tx.guest.update({
                where: { id: existingGuest.id },
                data: { deviceToken: null },
              });
            }
          }
        }

      let session = await tx.tableSession.findFirst({
        where: {
          tableId: qr.tableId,
          status: SessionStatus.OPEN,
        },
        orderBy: { openedAt: 'desc' },
        include: { guests: true },
      });

      if (!session) {
        throw new BadRequestException(
          `Table ${qr.table.number} is not open yet. Ask staff to open your table before ordering.`,
        );
      }

      const seats = qr.table.seats;
      const seated = session.guests.filter((g) => !g.leftAt);
      const currentCount = seated.length;
      if (currentCount >= seats) {
        throw new BadRequestException(
          `Table ${qr.table.number} is full (${seats} seats). Ask staff if you need another table.`,
        );
      }

      const partySize: number | null = session.reservationPartySize;

      const deviceToken = incomingDevice || randomToken(24);
      // Free this phone from any prior guest rows so unique deviceToken can attach here.
      if (incomingDevice) {
        await tx.guest.updateMany({
          where: { deviceToken: incomingDevice },
          data: { deviceToken: null },
        });
      }
      const guest = await tx.guest.create({
        data: {
          sessionId: session.id,
          displayName: dto.displayName?.trim() || null,
          deviceToken,
          sortOrder: seated.length,
        },
      });

      await tx.tableSession.update({
        where: { id: session.id },
        data: { guestCount: currentCount + 1 },
      });

      return {
        guestId: guest.id,
        sessionId: session.id,
        deviceToken,
        tableId: qr.tableId,
        openingNew: false as const,
        partySize,
        seats,
        joinedCount: currentCount + 1,
        resumed: false as const,
      };
    });

    if (!result.resumed) {
      await this.activity.record({
        actionType: 'guest.join',
        entityType: 'guest',
        entityId: result.guestId,
        description: 'Guest joined the table',
        metadata: {
          tableId: result.tableId,
          partySize: result.partySize,
        },
      });

      this.realtime.emitToRoom('floor', 'session.updated', {
        sessionId: result.sessionId,
        tableId: result.tableId,
      });
      this.realtime.emitToRoom(
        `session:${result.sessionId}`,
        'guest.joined',
        result,
      );
    }

    return {
      guestId: result.guestId,
      sessionId: result.sessionId,
      deviceToken: result.deviceToken,
      seats: result.seats,
      joinedCount: result.joinedCount,
      remainingSeats: Math.max(0, result.seats - result.joinedCount),
      expectedPartySize: result.partySize,
    };
  }

  async callWaiter(dto: GuestCallWaiterDto) {
    const qr = await this.resolveToken(dto.token);
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId: qr.tableId, status: SessionStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true } },
      },
    });
    if (!session) {
      throw new BadRequestException('No open session for this table');
    }

    if (dto.guestId) {
      const guest = await this.prisma.guest.findUnique({
        where: { id: dto.guestId },
      });
      if (!guest || guest.sessionId !== session.id) {
        throw new BadRequestException('Guest does not belong to this session');
      }
    }

    const escalationMinutes =
      (await this.settings.get<number>('escalationMinutes', 5)) ?? 5;
    const expiresAt = new Date(Date.now() + escalationMinutes * 60_000);

    const title = `Table ${session.table.number} needs assistance`;
    const body = dto.guestId
      ? 'A guest requested a waiter'
      : 'Table requested a waiter';
    const payload = {
      tableId: qr.tableId,
      tableNumber: session.table.number,
      guestId: dto.guestId ?? null,
      sound: 'call_waiter',
    };

    let primaryNotificationId: string;

    if (session.waiterId) {
      const notification = await this.notifications.create({
        type: 'call_waiter',
        title,
        body,
        employeeId: session.waiterId,
        sessionId: session.id,
        payload,
        expiresAt,
      });
      primaryNotificationId = notification.id;
    } else {
      const onShift = await this.shiftsLookup.findOnShiftEmployees(Role.WAITER);
      if (onShift.length > 0) {
        const created = await Promise.all(
          onShift.map((waiter) =>
            this.notifications.create({
              type: 'call_waiter',
              title,
              body,
              employeeId: waiter.id,
              sessionId: session.id,
              payload,
              expiresAt,
            }),
          ),
        );
        primaryNotificationId = created[0]!.id;
      } else {
        // No one on shift — broadcast so any waiter who opens the app can claim.
        const broadcast = await this.notifications.create({
          type: 'call_waiter',
          title,
          body,
          sessionId: session.id,
          payload,
          expiresAt,
          broadcastRoom: 'waiters',
        });
        primaryNotificationId = broadcast.id;
      }
    }

    this.realtime.emitToRoom('floor', 'waiter.call', {
      sessionId: session.id,
      tableId: qr.tableId,
      notificationId: primaryNotificationId,
    });

    return { ok: true, notificationId: primaryNotificationId };
  }

  /** Guest leaves on their own after settling — frees the seat for someone else. */
  async leave(dto: GuestLeaveDto) {
    const qr = await this.resolveToken(dto.token);
    const device = dto.deviceToken.trim();
    const guest = await this.prisma.guest.findFirst({
      where: {
        deviceToken: device,
        leftAt: null,
        session: {
          tableId: qr.tableId,
          status: SessionStatus.OPEN,
        },
      },
    });
    if (!guest) {
      throw new NotFoundException(
        'No active visit for this device on this table',
      );
    }
    return this.sessions.removeGuest(guest.sessionId, guest.id);
  }

  async submitOrder(dto: GuestSubmitOrderDto) {
    const qr = await this.resolveToken(dto.token);
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId: qr.tableId, status: SessionStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: { guests: true },
    });
    if (!session) {
      throw new BadRequestException(
        'No open session for this table. Join again to place an order.',
      );
    }

    const guestIds = new Set(session.guests.map((g) => g.id));
    for (const item of dto.items) {
      if (!guestIds.has(item.guestId)) {
        throw new BadRequestException(
          'Your seat on this table expired. Join again to place an order.',
        );
      }
    }

    if (dto.guestId && !guestIds.has(dto.guestId)) {
      throw new BadRequestException(
        'Your seat on this table expired. Join again to place an order.',
      );
    }

    return this.orders.submitOrder({
      sessionId: session.id,
      source: OrderSource.GUEST,
      clientRequestId: dto.clientRequestId,
      items: dto.items,
    });
  }

  async priorOrders(token: string, deviceToken: string) {
    const qr = await this.resolveToken(token);
    if (!deviceToken?.trim()) {
      throw new BadRequestException('deviceToken is required');
    }

    const guest = await this.prisma.guest.findFirst({
      where: { deviceToken: deviceToken.trim() },
      include: {
        session: {
          include: { table: true },
        },
      },
    });
    if (!guest) {
      throw new NotFoundException('Guest device not found');
    }
    if (
      guest.session.status !== SessionStatus.OPEN &&
      guest.session.status !== SessionStatus.SETTLED
    ) {
      throw new BadRequestException(
        'No active visit for this device on this table',
      );
    }
    if (guest.session.tableId !== qr.tableId) {
      throw new BadRequestException(
        'Device token does not match this table session',
      );
    }

    const items = await this.prisma.orderItem.findMany({
      where: { guestId: guest.id },
      orderBy: { createdAt: 'desc' },
      include: {
        modifiers: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            submittedAt: true,
            source: true,
          },
        },
      },
    });

    return {
      guestId: guest.id,
      sessionId: guest.sessionId,
      displayName: guest.displayName,
      table: {
        id: guest.session.table.id,
        number: guest.session.table.number,
        label: guest.session.table.label,
      },
      items: items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.priceSnapshot.toString(),
        status: item.status,
        kitchenNotes: item.kitchenNotes,
        isTakeaway: item.isTakeaway,
        createdAt: item.createdAt,
        settled: Boolean(item.settledTransactionId),
        settledTransactionId: item.settledTransactionId,
        modifiers: item.modifiers.map((m) => ({
          name: m.nameSnapshot,
          price: m.priceSnapshot.toString(),
        })),
        order: item.order,
      })),
    };
  }

  /**
   * Guest receipt download — device must own at least one line on the transaction.
   */
  async guestReceipt(
    token: string,
    deviceToken: string,
    transactionId?: string,
  ) {
    const qr = await this.resolveToken(token);
    if (!deviceToken?.trim()) {
      throw new BadRequestException('deviceToken is required');
    }

    const guest = await this.prisma.guest.findFirst({
      where: { deviceToken: deviceToken.trim() },
      include: { session: true },
    });
    if (!guest) {
      throw new NotFoundException('Guest device not found');
    }
    if (guest.session.tableId !== qr.tableId) {
      throw new BadRequestException(
        'Device token does not match this table session',
      );
    }

    let txnId = transactionId?.trim() || null;
    if (!txnId) {
      const settled = await this.prisma.orderItem.findFirst({
        where: {
          guestId: guest.id,
          settledTransactionId: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
        select: { settledTransactionId: true },
      });
      txnId = settled?.settledTransactionId ?? null;
    }
    if (!txnId) {
      throw new NotFoundException('No paid receipt for this visit yet');
    }

    const owned = await this.prisma.orderItem.count({
      where: {
        guestId: guest.id,
        settledTransactionId: txnId,
      },
    });
    // Also allow whole-table settle when guest is on the same session.
    const txn = await this.prisma.transaction.findUnique({
      where: { id: txnId },
      select: { id: true, sessionId: true, guestId: true },
    });
    if (!txn) {
      throw new NotFoundException('Receipt not found');
    }
    if (txn.sessionId !== guest.sessionId) {
      throw new ForbiddenException('This receipt is not for your table visit');
    }
    if (owned === 0 && txn.guestId && txn.guestId !== guest.id) {
      throw new ForbiddenException('This receipt is for another guest');
    }

    return this.payments.receipt(txnId);
  }

  private async resolveToken(token: string) {
    if (!token?.trim()) {
      throw new BadRequestException('token is required');
    }
    const qr = await this.prisma.tableQrToken.findUnique({
      where: { token: token.trim() },
      include: { table: true },
    });
    if (!qr || !qr.isActive || qr.deactivatedAt) {
      throw new NotFoundException('Invalid or inactive QR token');
    }
    if (qr.table.isArchived) {
      throw new NotFoundException('Table not found');
    }
    return qr;
  }
}
