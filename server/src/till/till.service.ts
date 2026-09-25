import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationStatus,
  Role,
  TillMovementType,
} from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { ApprovalService } from '../common/approval.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { fromCents, toCents } from '../shared/money';
import {
  CloseTillDto,
  OpenTillDto,
  TillAdjustmentDto,
  TillCashMovementDto,
} from './dto/till.dto';

const VARIANCE_CLOSE_TYPE = 'till.variance_close.request';

@Injectable()
export class TillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityLogService,
    private readonly approval: ApprovalService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async open(dto: OpenTillDto, cashierId: string) {
    const existing = await this.prisma.tillSession.findFirst({
      where: { cashierId, closedAt: null },
    });
    if (existing) {
      throw new ConflictException('Cashier already has an open till');
    }

    const session = await this.prisma.tillSession.create({
      data: {
        cashierId,
        openedById: cashierId,
        deviceLabel: dto.deviceLabel,
        openingBalance: fromCents(toCents(dto.openingBalance)),
      },
      include: {
        cashier: { select: { id: true, fullName: true } },
        movements: true,
      },
    });

    await this.activity.record({
      actorId: cashierId,
      actionType: 'till.open',
      entityType: 'till_session',
      entityId: session.id,
      description: `Till opened with ${session.openingBalance} in the drawer`,
    });

    return session;
  }

  async current(cashierId: string) {
    const session = await this.prisma.tillSession.findFirst({
      where: { cashierId, closedAt: null },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        cashier: { select: { id: true, fullName: true } },
      },
    });
    if (!session) return null;
    const expected = this.computeExpected(session);
    const pendingClose = await this.findPendingVarianceClose(session.id);
    return {
      ...session,
      expectedCash: expected,
      pendingVarianceClose: Boolean(pendingClose),
    };
  }

  async close(dto: CloseTillDto, actor: AuthUser) {
    const session = await this.requireOpenTill(actor.id);
    const expected = this.computeExpected(session);
    const actual = fromCents(toCents(dto.actualCash));
    const variance = fromCents(toCents(actual) - toCents(expected));
    const absVariance = Math.abs(toCents(variance)) / 100;

    const threshold =
      (await this.settings.get<number>('tillVarianceApprovalThreshold', 50)) ??
      50;

    if (absVariance > threshold) {
      return this.requestVarianceClose({
        session,
        actor,
        expected,
        actual,
        variance,
        threshold,
        notes: dto.notes,
      });
    }

    return this.finalizeClose({
      sessionId: session.id,
      actorId: actor.id,
      expected,
      actual,
      variance,
      notes: dto.notes,
      approvedById: null,
    });
  }

  async approveVarianceClose(notificationId: string, approverId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.type !== VARIANCE_CLOSE_TYPE) {
      throw new NotFoundException('Till close request not found');
    }
    if (
      notification.status === NotificationStatus.accepted ||
      notification.status === NotificationStatus.resolved
    ) {
      throw new ConflictException('This till close was already handled');
    }

    const payload = (notification.payload ?? {}) as {
      tillSessionId?: string;
      actualCash?: string | number;
      expectedCash?: string | number;
      variance?: string | number;
      notes?: string;
      actorId?: string;
    };
    if (
      !payload.tillSessionId ||
      payload.actualCash == null ||
      payload.expectedCash == null ||
      payload.variance == null
    ) {
      throw new BadRequestException('Till close request is missing details');
    }

    const claimed = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
      },
      data: {
        status: NotificationStatus.accepted,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('This till close was already handled');
    }

    await this.prisma.notification.updateMany({
      where: {
        type: VARIANCE_CLOSE_TYPE,
        id: { not: notificationId },
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
        payload: {
          path: ['tillSessionId'],
          equals: payload.tillSessionId,
        },
      },
      data: {
        status: NotificationStatus.resolved,
        resolvedAt: new Date(),
      },
    });

    const session = await this.prisma.tillSession.findUnique({
      where: { id: payload.tillSessionId },
    });
    if (!session) throw new NotFoundException('Till session not found');
    if (session.closedAt) {
      throw new ConflictException('Till is already closed');
    }

    return this.finalizeClose({
      sessionId: session.id,
      actorId: payload.actorId ?? session.cashierId,
      expected: fromCents(toCents(payload.expectedCash)),
      actual: fromCents(toCents(payload.actualCash)),
      variance: fromCents(toCents(payload.variance)),
      notes: payload.notes,
      approvedById: approverId,
    });
  }

  async declineVarianceClose(notificationId: string, managerId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.type !== VARIANCE_CLOSE_TYPE) {
      throw new NotFoundException('Till close request not found');
    }
    if (
      notification.status === NotificationStatus.accepted ||
      notification.status === NotificationStatus.resolved
    ) {
      throw new ConflictException('This till close was already handled');
    }

    const payload = (notification.payload ?? {}) as {
      tillSessionId?: string;
      actorId?: string;
      variance?: string | number;
    };

    const claimed = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
      },
      data: {
        status: NotificationStatus.resolved,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('This till close was already handled');
    }

    if (payload.tillSessionId) {
      await this.prisma.notification.updateMany({
        where: {
          type: VARIANCE_CLOSE_TYPE,
          id: { not: notificationId },
          status: {
            in: [
              NotificationStatus.created,
              NotificationStatus.delivered,
              NotificationStatus.seen,
            ],
          },
          payload: {
            path: ['tillSessionId'],
            equals: payload.tillSessionId,
          },
        },
        data: {
          status: NotificationStatus.resolved,
          resolvedAt: new Date(),
        },
      });
    }

    await this.activity.record({
      actorId: managerId,
      actionType: 'till.variance_close_declined',
      entityType: 'till_session',
      entityId: payload.tillSessionId,
      description: 'Till close with variance was declined',
      metadata: payload,
    });

    this.realtime.emitToRoom('managers', 'notification', {
      type: VARIANCE_CLOSE_TYPE,
      reason: 'till.variance_close_declined',
    });
    if (payload.actorId) {
      this.realtime.emitToRoom(`employee:${payload.actorId}`, 'notification', {
        type: VARIANCE_CLOSE_TYPE,
        reason: 'till.variance_close_declined',
      });
    }

    return { ok: true as const, declined: true as const };
  }

  paidIn(dto: TillCashMovementDto, actorId: string) {
    return this.addMovement(actorId, TillMovementType.paid_in, dto);
  }

  paidOut(dto: TillCashMovementDto, actorId: string) {
    return this.addMovement(actorId, TillMovementType.paid_out, dto);
  }

  async adjustment(dto: TillAdjustmentDto, actor: AuthUser) {
    const threshold =
      (await this.settings.get<number>('tillVarianceApprovalThreshold', 50)) ??
      50;

    let approvedById: string | null = null;
    if (dto.amount > threshold) {
      if (!dto.approverEmployeeId || !dto.approverPin) {
        throw new BadRequestException(
          `Adjustment over ${threshold} requires manager PIN approval`,
        );
      }
      const approver = await this.approval.requireManagerPin(
        actor,
        dto.approverEmployeeId,
        dto.approverPin,
      );
      approvedById = approver.id;
    }

    const movement = await this.addMovement(
      actor.id,
      TillMovementType.adjustment,
      dto,
    );

    if (approvedById) {
      await this.activity.record({
        actorId: actor.id,
        actionType: 'till.adjustment_approved',
        entityType: 'till_movement',
        entityId: movement.id,
        description: `Manager approved a till adjustment`,
        metadata: { approvedById, amount: dto.amount },
      });
    }

    return movement;
  }

  listRecent(limit = 20) {
    return this.prisma.tillSession.findMany({
      orderBy: { openedAt: 'desc' },
      take: limit,
      include: {
        cashier: { select: { id: true, fullName: true } },
        movements: true,
      },
    });
  }

  private async requestVarianceClose(input: {
    session: {
      id: string;
      cashierId: string;
      cashier?: { fullName?: string } | null;
    };
    actor: AuthUser;
    expected: string;
    actual: string;
    variance: string;
    threshold: number;
    notes?: string;
  }) {
    const pending = await this.findPendingVarianceClose(input.session.id);
    if (pending) {
      throw new BadRequestException(
        'A till close request is already waiting for manager approval',
      );
    }

    const cashierName =
      input.session.cashier?.fullName?.trim() ||
      (
        await this.prisma.employee.findUnique({
          where: { id: input.session.cashierId },
          select: { fullName: true },
        })
      )?.fullName ||
      'Cashier';

    const title = `Till close · variance ${input.variance}`;
    const body = `${cashierName} counted ${input.actual} vs expected ${input.expected}`;

    const managers = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.OWNER, Role.MANAGER] },
        isActive: true,
        archivedAt: null,
      },
      select: { id: true },
    });

    const payload = {
      tillSessionId: input.session.id,
      actualCash: input.actual,
      expectedCash: input.expected,
      variance: input.variance,
      threshold: input.threshold,
      notes: input.notes?.trim() || undefined,
      actorId: input.actor.id,
      cashierName,
      sound: VARIANCE_CLOSE_TYPE,
    };

    const created = [];
    for (const mgr of managers) {
      created.push(
        await this.notifications.create({
          type: VARIANCE_CLOSE_TYPE,
          title,
          body,
          employeeId: mgr.id,
          payload,
          broadcastRoom: `employee:${mgr.id}`,
        }),
      );
    }

    this.realtime.emitToRoom('managers', 'notification', {
      type: VARIANCE_CLOSE_TYPE,
      title,
      body,
      payload,
    });

    await this.activity.record({
      actorId: input.actor.id,
      actionType: 'till.variance_close_requested',
      entityType: 'till_session',
      entityId: input.session.id,
      description: `Till close requested · difference ${input.variance}`,
      metadata: payload,
    });

    return {
      ok: true as const,
      pendingApproval: true as const,
      notified: created.length,
      expectedCash: input.expected,
      actualCash: input.actual,
      variance: input.variance,
      message:
        'Counted amount differs from expected — sent to managers for approval. Till stays open until they approve.',
    };
  }

  private async finalizeClose(input: {
    sessionId: string;
    actorId: string;
    expected: string;
    actual: string;
    variance: string;
    notes?: string;
    approvedById: string | null;
  }) {
    const closed = await this.prisma.tillSession.update({
      where: { id: input.sessionId },
      data: {
        expectedCash: input.expected,
        actualCash: input.actual,
        variance: input.variance,
        closedAt: new Date(),
        notes: input.notes,
      },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        cashier: { select: { id: true, fullName: true } },
      },
    });

    await this.activity.record({
      actorId: input.actorId,
      actionType: 'till.close',
      entityType: 'till_session',
      entityId: input.sessionId,
      description: `Till closed · difference ${input.variance}`,
      metadata: {
        expected: input.expected,
        actual: input.actual,
        variance: input.variance,
        approvedById: input.approvedById,
      },
    });

    this.realtime.emitToRoom('managers', 'notification', {
      type: 'till.close',
      tillSessionId: input.sessionId,
    });
    this.realtime.emitToRoom(`employee:${closed.cashierId}`, 'notification', {
      type: 'till.close',
      tillSessionId: input.sessionId,
    });

    return closed;
  }

  private async findPendingVarianceClose(tillSessionId: string) {
    return this.prisma.notification.findFirst({
      where: {
        type: VARIANCE_CLOSE_TYPE,
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
        payload: {
          path: ['tillSessionId'],
          equals: tillSessionId,
        },
      },
    });
  }

  private async addMovement(
    cashierId: string,
    type: TillMovementType,
    dto: TillCashMovementDto,
  ) {
    const session = await this.requireOpenTill(cashierId);
    const movement = await this.prisma.tillMovement.create({
      data: {
        tillSessionId: session.id,
        type,
        amount: fromCents(toCents(dto.amount)),
        reason: dto.reason.trim(),
        actorId: cashierId,
      },
    });

    await this.activity.record({
      actorId: cashierId,
      actionType: `till.${type}`,
      entityType: 'till_movement',
      entityId: movement.id,
      description: `${type} ${movement.amount}: ${dto.reason}`,
    });

    return movement;
  }

  private computeExpected(session: {
    openingBalance: { toString(): string } | string | number;
    movements: Array<{
      type: TillMovementType;
      amount: { toString(): string } | string | number;
    }>;
  }): string {
    let cents = toCents(session.openingBalance.toString());
    for (const m of session.movements) {
      const amt = toCents(m.amount.toString());
      switch (m.type) {
        case TillMovementType.sale:
        case TillMovementType.paid_in:
          cents += amt;
          break;
        case TillMovementType.refund:
        case TillMovementType.paid_out:
          cents -= amt;
          break;
        case TillMovementType.adjustment:
          if (
            String(m.amount).startsWith('-') ||
            (typeof m.amount === 'object' && Number(m.amount) < 0)
          ) {
            cents -= Math.abs(amt);
          } else {
            cents += amt;
          }
          break;
        default:
          break;
      }
    }
    return fromCents(cents);
  }

  private async requireOpenTill(cashierId: string) {
    const session = await this.prisma.tillSession.findFirst({
      where: { cashierId, closedAt: null },
      include: {
        movements: true,
        cashier: { select: { id: true, fullName: true } },
      },
    });
    if (!session) {
      throw new NotFoundException('No open till for this cashier');
    }
    return session;
  }
}
