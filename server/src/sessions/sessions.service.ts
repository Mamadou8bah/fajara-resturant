import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus, TableStatus, OrderItemStatus, Prisma } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { randomToken } from '../common/utils/ids';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AddGuestDto } from './dto/add-guest.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { OpenSessionDto } from './dto/open-session.dto';

const UNSETTLED_ORDER_STATUSES = [
  'draft',
  'placed',
  'submitted',
  'preparing',
  'ready',
  'served',
  'partially_paid',
] as const;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Whether closed/settled tables must go through NEEDS_CLEANING before FREE (SES-003). */
  async requireCleaningAfterClose(): Promise<boolean> {
    const floor =
      (await this.settings.get<{ requireCleaningAfterClose?: boolean }>(
        'floor',
        { requireCleaningAfterClose: false },
      )) ?? { requireCleaningAfterClose: false };
    return floor.requireCleaningAfterClose === true;
  }

  async openSession(dto: OpenSessionDto, actorId?: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { id: dto.tableId },
    });
    if (!table || table.isArchived) {
      throw new NotFoundException('Table not found');
    }
    if (
      table.status !== TableStatus.FREE &&
      table.status !== TableStatus.RESERVED
    ) {
      throw new BadRequestException(
        `Table ${table.number} is ${table.status} and cannot be opened`,
      );
    }

    const existingOpen = await this.prisma.tableSession.findFirst({
      where: { tableId: dto.tableId, status: SessionStatus.OPEN },
    });
    if (existingOpen) {
      throw new ConflictException('Table already has an open session');
    }

    if (dto.waiterId) {
      const waiter = await this.prisma.employee.findFirst({
        where: { id: dto.waiterId, isActive: true, archivedAt: null },
      });
      if (!waiter) throw new BadRequestException('Waiter not found or inactive');
    }

    const guests = dto.guests ?? [];
    if (guests.length > table.seats) {
      throw new BadRequestException(
        `Table ${table.number} seats ${table.seats}; cannot open with ${guests.length} guests`,
      );
    }

    const expectedParty =
      dto.reservationPartySize ??
      (guests.length > 0 ? guests.length : 1);
    if (expectedParty < 1 || expectedParty > table.seats) {
      throw new BadRequestException(
        `Party size must be between 1 and ${table.seats} for this table`,
      );
    }

    // Only create real seated guests from the payload (usually the lead).
    // Expected party size is stored separately so QR scanners can still join.
    const seatedGuests =
      guests.length > 0
        ? guests.slice(0, table.seats)
        : [{ displayName: undefined as string | undefined }];

    const session = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.diningTable.updateMany({
        where: {
          id: dto.tableId,
          isArchived: false,
          status: { in: [TableStatus.FREE, TableStatus.RESERVED] },
        },
        data: {
          status: TableStatus.OCCUPIED,
          reservationName: null,
          reservationPartySize: null,
          reservationAt: null,
          reservationNote: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Table is no longer available');
      }

      return tx.tableSession.create({
        data: {
          tableId: dto.tableId,
          waiterId: dto.waiterId ?? actorId ?? null,
          status: SessionStatus.OPEN,
          guestCount: seatedGuests.length,
          reservationName: dto.reservationName,
          reservationNote: dto.reservationNote,
          reservationAt: dto.reservationAt
            ? new Date(dto.reservationAt)
            : undefined,
          reservationPartySize: expectedParty,
          guests: {
            create: seatedGuests.map((g, index) => ({
              displayName: g.displayName,
              deviceToken: randomToken(24),
              sortOrder: index,
            })),
          },
        },
        include: {
          guests: true,
          waiter: {
            select: { id: true, fullName: true, role: true },
          },
          table: true,
        },
      });
    });

    await this.activityLog.record({
      actorId,
      actionType: 'session.open',
      entityType: 'TableSession',
      entityId: session.id,
      description: `Opened table ${table.number}`,
      metadata: {
        tableId: dto.tableId,
        guestCount: seatedGuests.length,
        expectedPartySize: expectedParty,
      },
    });

    this.realtime.emitToRoom('floor', 'session.opened', {
      sessionId: session.id,
      tableId: session.tableId,
    });

    return session;
  }

  async closeSession(
    sessionId: string,
    dto: CloseSessionDto,
    actor?: AuthUser,
  ) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        orders: {
          select: {
            status: true,
            items: {
              select: { status: true, settledTransactionId: true },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === SessionStatus.CLOSED) {
      throw new BadRequestException('Session is already closed');
    }

    // Waiters may only clear tables assigned to them (or still unassigned).
    if (
      actor &&
      actor.role === 'WAITER' &&
      session.waiterId &&
      session.waiterId !== actor.id
    ) {
      throw new ForbiddenException(
        'You can only clear tables assigned to you',
      );
    }

    const hasUnsettledItems = session.orders.some((o) =>
      o.items.some((item) => {
        if (
          item.status === 'cancelled' ||
          item.status === 'voided' ||
          item.status === 'comped'
        ) {
          return false;
        }
        return !item.settledTransactionId;
      }),
    );
    if (session.status !== SessionStatus.SETTLED && hasUnsettledItems) {
      throw new BadRequestException(
        'Session must be settled before closing (unsettled orders remain)',
      );
    }

    // SES-003: configured cleaning workflow — cannot skip when required.
    const requireCleaning = await this.requireCleaningAfterClose();
    const needsCleaning = requireCleaning ? true : dto.needsCleaning === true;
    const nextTableStatus = needsCleaning
      ? TableStatus.NEEDS_CLEANING
      : TableStatus.FREE;

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: new Date(),
        },
        include: {
          table: true,
          waiter: { select: { id: true, fullName: true } },
          guests: true,
        },
      });

      await tx.diningTable.update({
        where: { id: session.tableId },
        data: { status: nextTableStatus },
      });

      return updated;
    });

    await this.activityLog.record({
      actorId: actor?.id,
      actionType: 'session.close',
      entityType: 'TableSession',
      entityId: sessionId,
      description: `Closed table ${session.table.number}`,
      metadata: { needsCleaning, nextTableStatus, requireCleaning },
    });

    await this.notifications.resolveClaimableForSession(sessionId);

    this.realtime.emitToRoom('floor', 'session.closed', {
      sessionId,
      tableId: session.tableId,
      tableStatus: nextTableStatus,
    });

    return closed;
  }

  /**
   * After the last billable items are paid: close the visit and release the table
   * into the cleaning workflow (or Free when cleaning is disabled).
   */
  async finalizeSettledSessionInTx(
    tx: Prisma.TransactionClient,
    sessionId: string,
    tableId: string,
    requireCleaning: boolean,
  ): Promise<TableStatus> {
    const nextTableStatus = requireCleaning
      ? TableStatus.NEEDS_CLEANING
      : TableStatus.FREE;

    await tx.tableSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.CLOSED,
        closedAt: new Date(),
      },
    });
    await tx.diningTable.update({
      where: { id: tableId },
      data: { status: nextTableStatus },
    });
    return nextTableStatus;
  }

  async markCleaningComplete(tableId: string, actorId?: string, actor?: AuthUser) {
    const table = await this.prisma.diningTable.findUnique({
      where: { id: tableId },
    });
    if (!table || table.isArchived) {
      throw new NotFoundException('Table not found');
    }
    if (table.status !== TableStatus.NEEDS_CLEANING) {
      throw new BadRequestException('Table is not awaiting cleaning');
    }

    const updated = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: { status: TableStatus.FREE },
    });

    await this.activityLog.record({
      actorId: actorId ?? actor?.id,
      actionType: 'table.cleaning_complete',
      entityType: 'DiningTable',
      entityId: tableId,
      description: `Table ${table.number} marked clean`,
    });

    this.realtime.emitToRoom('floor', 'table.status', {
      tableId,
      status: TableStatus.FREE,
    });

    return updated;
  }

  async moveSession(sessionId: string, toTableId: string, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findUnique({
        where: { id: sessionId },
        include: { table: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== SessionStatus.OPEN) {
        throw new BadRequestException('Only open sessions can be moved');
      }
      if (session.tableId === toTableId) {
        throw new BadRequestException('Session is already on that table');
      }

      const toTable = await tx.diningTable.findUnique({
        where: { id: toTableId },
      });
      if (!toTable || toTable.isArchived) {
        throw new NotFoundException('Destination table not found');
      }

      const claimed = await tx.diningTable.updateMany({
        where: {
          id: toTableId,
          status: TableStatus.FREE,
          isArchived: false,
        },
        data: { status: TableStatus.OCCUPIED },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Destination table is not free');
      }

      await tx.diningTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.NEEDS_CLEANING },
      });

      const moved = await tx.tableSession.update({
        where: { id: sessionId },
        data: { tableId: toTableId },
        include: {
          table: true,
          waiter: { select: { id: true, fullName: true } },
          guests: true,
        },
      });

      const moveRecord = await tx.tableSessionMove.create({
        data: {
          sessionId,
          fromTableId: session.tableId,
          toTableId,
          movedById: actorId ?? null,
        },
      });

      return {
        session: moved,
        move: moveRecord,
        fromTable: session.table,
        toTable,
      };
    });

    await this.activityLog.record({
      actorId,
      actionType: 'session.move',
      entityType: 'TableSession',
      entityId: sessionId,
      description: `Moved guests from table ${result.fromTable.number} to ${result.toTable.number}`,
      metadata: {
        fromTableId: result.fromTable.id,
        toTableId: result.toTable.id,
        moveId: result.move.id,
      },
    });

    this.realtime.emitToRoom('floor', 'session.moved', {
      sessionId,
      fromTableId: result.fromTable.id,
      toTableId: result.toTable.id,
    });

    return result.session;
  }

  async addGuest(sessionId: string, dto: AddGuestDto, actorId?: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Cannot add guests to a closed session');
    }
    if (session.guestCount >= session.table.seats) {
      throw new BadRequestException(
        `Table ${session.table.number} is at capacity (${session.table.seats} seats)`,
      );
    }

    const guest = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guest.create({
        data: {
          sessionId,
          displayName: dto.displayName,
          deviceToken: randomToken(24),
          sortOrder: session.guestCount,
        },
      });
      await tx.tableSession.update({
        where: { id: sessionId },
        data: { guestCount: { increment: 1 } },
      });
      return created;
    });

    await this.activityLog.record({
      actorId,
      actionType: 'session.guest.add',
      entityType: 'Guest',
      entityId: guest.id,
      description: `Guest added to table`,
    });

    this.realtime.emitToRoom(`session:${sessionId}`, 'guest.added', {
      guestId: guest.id,
      sessionId,
    });

    return guest;
  }

  /**
   * One guest leaves independently — frees a seat without ending the whole visit.
   * Guest must have no unpaid items. When the last seated guest leaves and the
   * bill is clear, the table is released (cleaning / Free per floor settings).
   */
  async removeGuest(
    sessionId: string,
    guestId: string,
    actorId?: string,
  ) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        guests: true,
        orders: { include: { items: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Session is not open');
    }

    const guest = session.guests.find((g) => g.id === guestId);
    if (!guest) throw new NotFoundException('Guest not found on this session');
    if (guest.leftAt) {
      throw new BadRequestException('Guest already left');
    }

    const unpaid = session.orders
      .flatMap((o) => o.items)
      .filter(
        (item) =>
          item.guestId === guestId &&
          !item.settledTransactionId &&
          item.status !== OrderItemStatus.cancelled &&
          item.status !== OrderItemStatus.voided &&
          item.status !== OrderItemStatus.comped,
      );
    if (unpaid.length > 0) {
      throw new BadRequestException(
        'Guest still has unpaid items — settle their share first',
      );
    }

    const requireCleaning = await this.requireCleaningAfterClose();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.guest.update({
        where: { id: guestId },
        data: {
          leftAt: new Date(),
          deviceToken: null,
        },
      });

      const remainingSeated = session.guests.filter(
        (g) => g.id !== guestId && !g.leftAt,
      ).length;

      await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          guestCount: Math.max(0, remainingSeated),
        },
      });

      const remainingUnpaid = await tx.orderItem.count({
        where: {
          order: { sessionId },
          settledTransactionId: null,
          status: {
            notIn: [
              OrderItemStatus.cancelled,
              OrderItemStatus.voided,
              OrderItemStatus.comped,
            ],
          },
        },
      });

      let tableStatus: TableStatus | null = null;
      if (remainingSeated === 0 && remainingUnpaid === 0) {
        tableStatus = await this.finalizeSettledSessionInTx(
          tx,
          sessionId,
          session.tableId,
          requireCleaning,
        );
      }

      return {
        guestId,
        remainingSeated,
        tableStatus,
        tableId: session.tableId,
      };
    });

    await this.activityLog.record({
      actorId,
      actionType: 'session.guest.leave',
      entityType: 'Guest',
      entityId: guestId,
      description: `Guest left table ${session.table.number}`,
      metadata: {
        remainingSeated: result.remainingSeated,
        tableStatus: result.tableStatus,
      },
    });

    this.realtime.emitToRoom(`session:${sessionId}`, 'guest.left', {
      guestId,
      sessionId,
      remainingSeated: result.remainingSeated,
    });
    this.realtime.emitToRoom('floor', 'session.updated', {
      sessionId,
      tableId: result.tableId,
      tableStatus: result.tableStatus,
    });

    if (result.tableStatus) {
      await this.notifications.resolveClaimableForSession(sessionId);
    }

    return result;
  }

  async getFloorPlan() {
    const tables = await this.prisma.diningTable.findMany({
      where: { isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      include: {
        sessions: {
          where: { status: { in: [SessionStatus.OPEN, SessionStatus.SETTLED] } },
          orderBy: { openedAt: 'desc' },
          take: 1,
          include: {
            waiter: { select: { id: true, fullName: true } },
            guests: {
              where: { leftAt: null },
              select: {
                id: true,
                displayName: true,
                sortOrder: true,
                leftAt: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
            orders: {
              select: {
                id: true,
                status: true,
                items: {
                  select: {
                    id: true,
                    status: true,
                    priceSnapshot: true,
                    quantity: true,
                    settledTransactionId: true,
                    modifiers: { select: { priceSnapshot: true } },
                  },
                },
              },
            },
            transactions: {
              select: { id: true, total: true, status: true },
            },
          },
        },
      },
    });

    const cleaningIds = tables
      .filter((t) => t.status === TableStatus.NEEDS_CLEANING)
      .map((t) => t.id);

    const clearingWaiterByTable = new Map<
      string,
      { id: string; fullName: string } | null
    >();
    if (cleaningIds.length > 0) {
      const closed = await this.prisma.tableSession.findMany({
        where: {
          tableId: { in: cleaningIds },
          status: SessionStatus.CLOSED,
        },
        orderBy: { closedAt: 'desc' },
        include: {
          waiter: { select: { id: true, fullName: true } },
        },
      });
      for (const session of closed) {
        if (!clearingWaiterByTable.has(session.tableId)) {
          clearingWaiterByTable.set(session.tableId, session.waiter);
        }
      }
    }

    return tables.map((table) => {
      const active = table.sessions[0] ?? null;
      let settlement: {
        orderCount: number;
        unpaidOrderCount: number;
        transactionTotal: number;
        estimatedOrderTotal: number;
        progressPercent: number | null;
      } | null = null;

      if (active) {
        const orderCount = active.orders.length;
        // Prefer unsettled billable *items* so waiters can clear after full settle
        // even if an order header still looks open.
        const unpaidItemCount = active.orders.reduce((sum, order) => {
          return (
            sum +
            order.items.filter((item) => {
              if (
                item.status === 'cancelled' ||
                item.status === 'voided' ||
                item.status === 'comped'
              ) {
                return false;
              }
              return !item.settledTransactionId;
            }).length
          );
        }, 0);
        const unpaidOrderCount =
          unpaidItemCount > 0
            ? active.orders.filter((o) =>
                (UNSETTLED_ORDER_STATUSES as readonly string[]).includes(
                  o.status,
                ),
              ).length
            : 0;
        const transactionTotal = active.transactions.reduce(
          (sum, t) => sum + Number(t.total),
          0,
        );
        const estimatedOrderTotal = active.orders.reduce((sum, order) => {
          const itemsTotal = order.items.reduce((s, item) => {
            const mod = item.modifiers.reduce(
              (m, x) => m + Number(x.priceSnapshot),
              0,
            );
            return s + (Number(item.priceSnapshot) + mod) * item.quantity;
          }, 0);
          return sum + itemsTotal;
        }, 0);
        const progressPercent =
          estimatedOrderTotal > 0
            ? Math.min(
                100,
                Math.round((transactionTotal / estimatedOrderTotal) * 100),
              )
            : orderCount === 0
              ? null
              : unpaidItemCount === 0
                ? 100
                : 0;

        settlement = {
          orderCount,
          unpaidOrderCount: unpaidItemCount > 0 ? Math.max(1, unpaidOrderCount) : 0,
          transactionTotal,
          estimatedOrderTotal,
          progressPercent,
        };
      }

      return {
        id: table.id,
        number: table.number,
        label: table.label,
        seats: table.seats,
        status: table.status,
        sortOrder: table.sortOrder,
        posX: table.posX,
        posY: table.posY,
        clearingWaiter: clearingWaiterByTable.get(table.id) ?? null,
        activeSession: active
          ? {
              id: active.id,
              status: active.status,
              openedAt: active.openedAt,
              guestCount: active.guestCount,
              waiter: active.waiter,
              guests: active.guests,
              reservationName: active.reservationName,
              reservationAt: active.reservationAt,
              reservationPartySize: active.reservationPartySize,
              settlement,
            }
          : null,
        reservation:
          table.status === TableStatus.RESERVED
            ? {
                name: table.reservationName,
                partySize: table.reservationPartySize,
                at: table.reservationAt,
                note: table.reservationNote,
              }
            : null,
      };
    });
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, role: true } },
        guests: { orderBy: { sortOrder: 'asc' } },
        moves: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
