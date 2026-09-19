import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TillMovementType } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { ApprovalService } from '../common/approval.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { fromCents, toCents } from '../shared/money';
import {
  CloseTillDto,
  OpenTillDto,
  TillAdjustmentDto,
  TillCashMovementDto,
} from './dto/till.dto';

@Injectable()
export class TillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityLogService,
    private readonly approval: ApprovalService,
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
    return { ...session, expectedCash: expected };
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

    let approvedById: string | null = null;
    if (absVariance > threshold) {
      if (!dto.approverEmployeeId || !dto.approverPin) {
        throw new BadRequestException(
          `Variance ${variance} exceeds threshold ${threshold}; manager PIN approval is required`,
        );
      }
      const approver = await this.approval.requireManagerPin(
        actor,
        dto.approverEmployeeId,
        dto.approverPin,
      );
      approvedById = approver.id;
    }

    const closed = await this.prisma.tillSession.update({
      where: { id: session.id },
      data: {
        expectedCash: expected,
        actualCash: actual,
        variance,
        closedAt: new Date(),
        notes: dto.notes,
      },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        cashier: { select: { id: true, fullName: true } },
      },
    });

    await this.activity.record({
      actorId: actor.id,
      actionType: 'till.close',
      entityType: 'till_session',
      entityId: session.id,
      description: `Till closed · difference ${variance}`,
      metadata: {
        expected,
        actual,
        variance,
        approvedById,
      },
    });

    return closed;
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
      include: { movements: true },
    });
    if (!session) {
      throw new NotFoundException('No open till for this cashier');
    }
    return session;
  }
}
