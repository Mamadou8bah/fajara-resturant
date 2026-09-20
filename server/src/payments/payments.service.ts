import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdempotencyScope,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  SessionStatus,
  TableStatus,
  TillMovementType,
} from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { ApprovalService } from '../common/approval.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { SessionsService } from '../sessions/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { roleHasPermission } from '../shared';
import { calculateBill, toCents, fromCents } from '../shared/money';
import {
  CorrectPaymentMethodDto,
  RefundDto,
  SettlePaymentDto,
} from './dto/payment.dto';

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v !== null &&
      typeof v === 'object' &&
      typeof (v as { toFixed?: unknown }).toFixed === 'function'
        ? String(v)
        : v,
    ),
  ) as Prisma.InputJsonValue;
}

function isCashMethod(method: string): boolean {
  return method.trim().toLowerCase() === 'cash';
}

function isBillableItem(item: {
  status: OrderItemStatus;
  settledTransactionId: string | null;
  guestId: string | null;
}, guestId?: string) {
  if (
    item.status === OrderItemStatus.cancelled ||
    item.status === OrderItemStatus.voided ||
    item.status === OrderItemStatus.comped
  ) {
    return false;
  }
  if (item.settledTransactionId) return false;
  if (guestId && item.guestId !== guestId) return false;
  return true;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityLogService,
    private readonly realtime: RealtimeGateway,
    private readonly approval: ApprovalService,
    private readonly sequences: SequenceService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async billPreview(sessionId: string, guestId?: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        guests: { orderBy: { sortOrder: 'asc' } },
        table: { select: { id: true, number: true, label: true } },
        orders: {
          orderBy: { submittedAt: 'asc' },
          include: {
            items: {
              include: {
                modifiers: true,
                guest: {
                  select: { id: true, displayName: true, sortOrder: true },
                },
              },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const taxCfg =
      (await this.settings.get<{
        inclusive?: boolean;
        ratePercent?: number;
        label?: string;
      }>('tax', { inclusive: false, ratePercent: 0, label: 'VAT' })) ?? {
        inclusive: false,
        ratePercent: 0,
        label: 'VAT',
      };

    const allUnpaid = session.orders.flatMap((order) =>
      order.items
        .filter((item) => isBillableItem(item))
        .map((item) => ({ order, item })),
    );

    const scoped = guestId
      ? allUnpaid.filter(({ item }) => item.guestId === guestId)
      : allUnpaid;

    const lines = scoped.map(({ order, item }) => {
      const modifierTotal = item.modifiers.reduce(
        (sum, m) => sum + toCents(m.priceSnapshot.toString()),
        0,
      );
      const unitCents =
        toCents(item.priceSnapshot.toString()) + modifierTotal;
      const lineTotal = fromCents(unitCents * item.quantity);
      return {
        id: item.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.priceSnapshot.toString(),
        modifiers: item.modifiers.map((m) => ({
          name: m.nameSnapshot,
          price: m.priceSnapshot.toString(),
        })),
        guestId: item.guestId,
        guestName: item.guest?.displayName ?? null,
        status: item.status,
        lineTotal,
      };
    });

    const bill = calculateBill({
      lines: lines.map((l) => ({
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        modifierTotal: l.modifiers.reduce(
          (s, m) => s + Number(m.price),
          0,
        ),
      })),
      discountAmount: 0,
      tipAmount: 0,
      taxRatePercent: taxCfg.ratePercent ?? 0,
      taxInclusive: Boolean(taxCfg.inclusive),
    });

    const shares = session.guests.map((g) => {
      const guestItems = allUnpaid.filter(({ item }) => item.guestId === g.id);
      const subtotalCents = guestItems.reduce((sum, { item }) => {
        const mod = item.modifiers.reduce(
          (s, m) => s + toCents(m.priceSnapshot.toString()),
          0,
        );
        return (
          sum +
          (toCents(item.priceSnapshot.toString()) + mod) * item.quantity
        );
      }, 0);
      const anyPaid = session.orders.some((o) =>
        o.items.some(
          (i) =>
            i.guestId === g.id &&
            i.settledTransactionId &&
            i.status !== OrderItemStatus.cancelled &&
            i.status !== OrderItemStatus.voided &&
            i.status !== OrderItemStatus.comped,
        ),
      );
      return {
        id: g.id,
        displayName: g.displayName,
        sortOrder: g.sortOrder,
        unpaidItemCount: guestItems.length,
        unpaidSubtotal: fromCents(subtotalCents),
        isSettled: guestItems.length === 0 && anyPaid,
        hasUnpaid: guestItems.length > 0,
      };
    });

    const unsettledGuestCount = shares.filter((s) => s.hasUnpaid).length;
    const settledGuestCount = shares.filter((s) => s.isSettled).length;

    return {
      sessionId: session.id,
      status: session.status,
      table: session.table,
      guestCount: session.guestCount,
      tax: {
        ratePercent: taxCfg.ratePercent ?? 0,
        label: taxCfg.label ?? 'VAT',
        inclusive: Boolean(taxCfg.inclusive),
      },
      lines,
      subtotal: bill.linesSubtotal,
      shares,
      unsettledGuestCount,
      settledGuestCount,
      unpaidItemCount: allUnpaid.length,
    };
  }

  async settle(dto: SettlePaymentDto, actor: AuthUser) {
    const cashierId = actor.id;
    const begin = await this.idempotency.begin(
      IdempotencyScope.PAYMENT,
      dto.clientRequestId,
      cashierId,
    );
    if (begin.replay) {
      return begin.response;
    }

    const taxCfg =
      (await this.settings.get<{
        inclusive?: boolean;
        ratePercent?: number;
        label?: string;
      }>('tax', { inclusive: false, ratePercent: 0, label: 'VAT' })) ?? {
        inclusive: false,
        ratePercent: 0,
        label: 'VAT',
      };

    const discountCapPercent =
      (await this.settings.get<number>('standardDiscountCapPercent', 10)) ?? 10;

    let discountApproverId: string | null = null;
    if (dto.approverEmployeeId && dto.approverPin) {
      const approver = await this.approval.requireManagerPin(
        actor,
        dto.approverEmployeeId,
        dto.approverPin,
      );
      discountApproverId = approver.id;
    }

    const allowedMethods =
      (await this.settings.get<string[]>('paymentMethods', [
        'Cash',
        'Mobile Money',
        'Card',
        'Afrimoney',
        'Bank Transfer',
      ])) ?? [];
    const methodCanonical = new Map(
      allowedMethods.map((m) => [m.trim().toLowerCase(), m.trim()]),
    );

    // Load outside the interactive transaction — Neon + settings reads inside
    // a 5s FOR UPDATE txn is what tripped settle timeouts in UAT.
    const requireCleaning = await this.sessions.requireCleaningAfterClose();

    const transaction = await this.prisma.$transaction(
      async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM table_sessions WHERE id = ${dto.sessionId}::uuid FOR UPDATE
      `;

      const session = await tx.tableSession.findUnique({
        where: { id: dto.sessionId },
        include: {
          guests: true,
          orders: {
            include: {
              items: {
                include: { modifiers: true },
              },
            },
          },
          table: true,
          waiter: { select: { id: true, fullName: true } },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== SessionStatus.OPEN) {
        throw new BadRequestException('Session is not open for payment');
      }

      if (dto.guestId) {
        const guestOk = session.guests.some((g) => g.id === dto.guestId);
        if (!guestOk) {
          throw new BadRequestException('guestId is not on this session');
        }
      }

      const billableItems = session.orders.flatMap((order) =>
        order.items.filter((item) => isBillableItem(item, dto.guestId)),
      );

      if (billableItems.length === 0) {
        throw new BadRequestException('No billable items for this settlement');
      }

      const lines = billableItems.map((item) => {
        const modifierTotal = item.modifiers.reduce(
          (sum, m) => sum + toCents(m.priceSnapshot.toString()),
          0,
        );
        return {
          unitPrice: item.priceSnapshot.toString(),
          quantity: item.quantity,
          modifierTotal: fromCents(modifierTotal),
        };
      });

      const discountAmount = dto.discountAmount ?? 0;
      if (discountAmount > 0) {
        if (!roleHasPermission(actor.role, 'discount.standard')) {
          throw new ForbiddenException(
            'discount.standard permission is required to apply a discount',
          );
        }
      }

      const bill = calculateBill({
        lines,
        discountAmount,
        tipAmount: dto.tipAmount ?? 0,
        taxRatePercent: taxCfg.ratePercent ?? 0,
        taxInclusive: Boolean(taxCfg.inclusive),
      });

      if (discountAmount > 0) {
        const linesSubtotalCents = toCents(bill.linesSubtotal);
        const maxStandardCents = Math.floor(
          (linesSubtotalCents * discountCapPercent) / 100,
        );
        if (toCents(discountAmount) > maxStandardCents) {
          const hasExceptional = roleHasPermission(
            actor.role,
            'discount.exceptional',
          );
          if (!hasExceptional && !discountApproverId) {
            throw new ForbiddenException(
              `Discount exceeds standard cap (${discountCapPercent}%); requires discount.exceptional or manager PIN`,
            );
          }
        }
      }

      const tenderCents = dto.payments.reduce(
        (sum, p) => sum + toCents(p.amount),
        0,
      );
      const totalCents = toCents(bill.total);
      if (tenderCents < totalCents) {
        throw new BadRequestException(
          `Payments (${fromCents(tenderCents)}) are less than total (${bill.total})`,
        );
      }

      const paymentRows = dto.payments.map((p) => {
        const key = p.method.trim().toLowerCase();
        const canonical = methodCanonical.get(key);
        if (!canonical) {
          throw new BadRequestException(
            `Payment method "${p.method}" is not enabled`,
          );
        }
        let cashChange: string | null = null;
        let cashReceived: string | null = null;
        if (isCashMethod(canonical)) {
          const received = p.cashReceived ?? p.amount;
          if (toCents(received) < toCents(p.amount)) {
            throw new BadRequestException(
              'cashReceived must be >= cash tender amount',
            );
          }
          cashReceived = fromCents(toCents(received));
          cashChange = fromCents(toCents(received) - toCents(p.amount));
        } else if (p.cashReceived != null) {
          throw new BadRequestException(
            'cashReceived is only valid for Cash tenders',
          );
        }
        return {
          method: canonical,
          amount: fromCents(toCents(p.amount)),
          reference: p.reference ?? null,
          cashReceived,
          cashChange,
        };
      });

      const txnNumber = await this.sequences.nextTransactionNumber(tx);
      const created = await tx.transaction.create({
        data: {
          transactionNumber: txnNumber,
          sessionId: session.id,
          cashierId,
          guestId: dto.guestId ?? null,
          subtotal: bill.linesSubtotal,
          discountAmount: bill.discountAmount,
          taxAmount: bill.taxAmount,
          taxLabel: taxCfg.label ?? 'VAT',
          taxRateSnapshot: taxCfg.ratePercent ?? 0,
          tipAmount: bill.tipAmount,
          total: bill.total,
          status: 'completed',
          clientRequestId: dto.clientRequestId,
          payments: {
            create: paymentRows.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              cashReceived: p.cashReceived,
              cashChange: p.cashChange,
            })),
          },
        },
        include: {
          payments: true,
          session: {
            include: {
              table: true,
              guests: true,
              waiter: { select: { id: true, fullName: true } },
            },
          },
          cashier: { select: { id: true, fullName: true } },
        },
      });

      await tx.orderItem.updateMany({
        where: { id: { in: billableItems.map((i) => i.id) } },
        data: { settledTransactionId: created.id },
      });

      const orderIds = [...new Set(billableItems.map((i) => i.orderId))];
      for (const orderId of orderIds) {
        const order = session.orders.find((o) => o.id === orderId)!;
        const remainingOpen = order.items.some((item) => {
          if (
            item.status === OrderItemStatus.cancelled ||
            item.status === OrderItemStatus.voided ||
            item.status === OrderItemStatus.comped
          ) {
            return false;
          }
          if (billableItems.some((b) => b.id === item.id)) return false;
          if (item.settledTransactionId) return false;
          return true;
        });

        const nextStatus = remainingOpen
          ? OrderStatus.partially_paid
          : OrderStatus.paid;

        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
      }

      const remainingSessionItems = await tx.orderItem.count({
        where: {
          order: { sessionId: session.id },
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

      let tableStatusAfter: TableStatus | null = null;
      if (remainingSessionItems === 0) {
        // SES-003: fully paid visit closes and enters cleaning (or Free if disabled).
        tableStatusAfter = await this.sessions.finalizeSettledSessionInTx(
          tx,
          session.id,
          session.tableId,
          requireCleaning,
        );
      }

      const openTill = await tx.tillSession.findFirst({
        where: { cashierId, closedAt: null },
        orderBy: { openedAt: 'desc' },
      });
      if (openTill) {
        const cashTender = paymentRows
          .filter((p) => isCashMethod(p.method))
          .reduce((sum, p) => sum + toCents(p.amount), 0);
        if (cashTender > 0) {
          await tx.tillMovement.create({
            data: {
              tillSessionId: openTill.id,
              type: TillMovementType.sale,
              amount: fromCents(cashTender),
              reason: `Sale ${created.transactionNumber}`,
              actorId: cashierId,
            },
          });
        }
      }

      return {
        created,
        tableStatusAfter,
        sessionId: session.id,
        tableId: session.tableId,
        billTotal: bill.total,
        paymentMethods: paymentRows.map((p) => p.method),
        itemIds: billableItems.map((i) => i.id),
        sessionSettled: remainingSessionItems === 0,
      };
    },
      {
        // Neon / remote Postgres can exceed the default 5s interactive timeout.
        maxWait: 10_000,
        timeout: 20_000,
      },
    );

    await this.activity.record({
      actorId: cashierId,
      actionType: 'payment.settle',
      entityType: 'transaction',
      entityId: transaction.created.id,
      description: `Bill ${transaction.created.transactionNumber} paid · ${transaction.billTotal}`,
      metadata: {
        sessionId: transaction.sessionId,
        guestId: dto.guestId ?? null,
        methods: transaction.paymentMethods,
        discountApproverId,
        itemIds: transaction.itemIds,
        sessionSettled: transaction.sessionSettled,
        tableStatusAfter: transaction.tableStatusAfter,
      },
    });

    const payload = jsonSafe(transaction.created);
    await this.idempotency.complete(
      IdempotencyScope.PAYMENT,
      dto.clientRequestId,
      payload,
    );

    this.realtime.emitToRoom('floor', 'payment.settled', payload);
    this.realtime.emitToRoom(
      `session:${dto.sessionId}`,
      'payment.settled',
      payload,
    );
    if (transaction.tableStatusAfter) {
      await this.notifications.resolveClaimableForSession(
        transaction.sessionId,
      );
      this.realtime.emitToRoom('floor', 'session.closed', {
        sessionId: transaction.sessionId,
        tableId: transaction.tableId,
        tableStatus: transaction.tableStatusAfter,
      });
    }

    return transaction.created;
  }

  async refund(dto: RefundDto, actor: AuthUser) {
    const approver = await this.approval.requireManagerPin(
      actor,
      dto.approverEmployeeId,
      dto.approverPin,
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
      const txn = await tx.transaction.findUnique({
        where: { id: dto.transactionId },
        include: { refunds: true, payments: true },
      });
      if (!txn) throw new NotFoundException('Transaction not found');
      if (txn.status === 'voided') {
        throw new BadRequestException('Cannot refund a voided transaction');
      }

      const alreadyRefunded = txn.refunds.reduce(
        (sum, r) => sum + toCents(r.amount.toString()),
        0,
      );
      const refundCents = toCents(dto.amount);
      const maxRefundable = toCents(txn.total.toString()) - alreadyRefunded;
      if (refundCents > maxRefundable) {
        throw new BadRequestException(
          `Refund exceeds remaining refundable amount (${fromCents(maxRefundable)})`,
        );
      }

      const refund = await tx.refund.create({
        data: {
          transactionId: txn.id,
          amount: fromCents(refundCents),
          reason: dto.reason.trim(),
          actorId: actor.id,
          method: dto.method ?? null,
        },
      });

      const openTill = await tx.tillSession.findFirst({
        where: { cashierId: actor.id, closedAt: null },
        orderBy: { openedAt: 'desc' },
      });
      if (openTill && isCashMethod(dto.method ?? 'Cash')) {
        await tx.tillMovement.create({
          data: {
            tillSessionId: openTill.id,
            type: TillMovementType.refund,
            amount: fromCents(refundCents),
            reason: `Refund ${txn.transactionNumber}: ${dto.reason}`,
            actorId: actor.id,
          },
        });
      }

      const fullyRefunded =
        alreadyRefunded + refundCents >= toCents(txn.total.toString());
      if (fullyRefunded) {
        await tx.transaction.update({
          where: { id: txn.id },
          data: { status: 'refunded' },
        });
      }

      return {
        refund,
        transactionId: txn.id,
        sessionId: txn.sessionId,
        transactionNumber: txn.transactionNumber,
        refundCents,
      };
    },
      { maxWait: 10_000, timeout: 20_000 },
    );

    await this.activity.record({
      actorId: actor.id,
      actionType: 'payment.refund',
      entityType: 'refund',
      entityId: result.refund.id,
      description: `Refund ${fromCents(result.refundCents)} · bill ${result.transactionNumber}`,
      metadata: {
        transactionId: result.transactionId,
        approvedById: approver.id,
        reason: dto.reason,
      },
    });

    this.realtime.emitToRoom('floor', 'payment.refunded', result.refund);
    return result.refund;
  }

  async correctPaymentMethod(dto: CorrectPaymentMethodDto, actor: AuthUser) {
    const approver = await this.approval.requireManagerPin(
      actor,
      dto.approverEmployeeId,
      dto.approverPin,
    );

    const payment = await this.prisma.transactionPayment.findUnique({
      where: { id: dto.transactionPaymentId },
    });
    if (!payment) {
      throw new NotFoundException('Transaction payment not found');
    }

    const previousMethod = payment.method;
    const newMethodRaw = dto.newMethod.trim();
    if (!newMethodRaw) {
      throw new BadRequestException('newMethod is required');
    }

    const allowedMethods =
      (await this.settings.get<string[]>('paymentMethods', [
        'Cash',
        'Mobile Money',
        'Card',
        'Afrimoney',
        'Bank Transfer',
      ])) ?? [];
    const methodCanonical = new Map(
      allowedMethods.map((m) => [m.trim().toLowerCase(), m.trim()]),
    );
    const newMethod = methodCanonical.get(newMethodRaw.toLowerCase());
    if (!newMethod) {
      throw new BadRequestException(
        `Payment method "${newMethodRaw}" is not enabled`,
      );
    }
    if (previousMethod === newMethod) {
      throw new BadRequestException('newMethod must differ from current method');
    }

    const [updated, correction] = await this.prisma.$transaction(
      async (tx) => {
        const updatedPayment = await tx.transactionPayment.update({
          where: { id: payment.id },
          data: { method: newMethod },
        });
        const created = await tx.paymentCorrection.create({
          data: {
            transactionPaymentId: payment.id,
            previousMethod,
            newMethod,
            reason: dto.reason.trim(),
            actorId: actor.id,
            approvedById: approver.id,
          },
        });
        return [updatedPayment, created] as const;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    await this.activity.record({
      actorId: actor.id,
      actionType: 'payment.correct_method',
      entityType: 'payment_correction',
      entityId: correction.id,
      description: `Payment method changed from ${previousMethod} to ${newMethod}`,
      metadata: {
        transactionPaymentId: payment.id,
        previousMethod,
        newMethod,
        approvedById: approver.id,
        reason: dto.reason,
      },
    });

    return { payment: updated, correction };
  }

  async receipt(transactionId: string, opts?: { isReprint?: boolean }) {
    const txn = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        payments: true,
        refunds: true,
        cashier: { select: { id: true, fullName: true } },
        session: {
          include: {
            table: true,
            guests: true,
            waiter: { select: { id: true, fullName: true } },
            orders: {
              include: {
                waiter: { select: { id: true, fullName: true } },
                items: {
                  include: { modifiers: true, guest: true },
                },
              },
            },
          },
        },
      },
    });
    if (!txn) throw new NotFoundException('Transaction not found');

    const restaurantName =
      (await this.settings.get<string>(
        'restaurantName',
        'Fajara Restaurant Services',
      )) ?? 'Fajara Restaurant Services';
    const profile =
      (await this.settings.get<{
        tradingName?: string;
        logoUrl?: string;
      }>('profile', {})) ?? {};
    const receiptCfg =
      (await this.settings.get<{ showLogo?: boolean }>('receipt', {
        showLogo: true,
      })) ?? { showLogo: true };
    const currency =
      (await this.settings.get<string>('currency', 'GMD')) ?? 'GMD';
    const receiptFooter =
      (await this.settings.get<string>('receiptFooter', '')) ?? '';

    const hasLinkedLines = txn.session.orders.some((order) =>
      order.items.some((item) => item.settledTransactionId === txn.id),
    );

    const lines = txn.session.orders.flatMap((order) =>
      order.items
        .filter((item) => {
          if (
            item.status === OrderItemStatus.cancelled ||
            item.status === OrderItemStatus.voided
          ) {
            return false;
          }
          if (hasLinkedLines) {
            return item.settledTransactionId === txn.id;
          }
          if (txn.guestId && item.guestId !== txn.guestId) return false;
          return true;
        })
        .map((item) => ({
          name: item.nameSnapshot,
          quantity: item.quantity,
          unitPrice: item.priceSnapshot.toString(),
          modifiers: item.modifiers.map((m) => ({
            name: m.nameSnapshot,
            price: m.priceSnapshot.toString(),
          })),
          guestName: item.guest.displayName,
          status: item.status,
        })),
    );

    const waiter =
      txn.session.waiter ??
      txn.session.orders.find((o) => o.waiter)?.waiter ??
      null;

    const orderIds = [
      ...new Set(
        txn.session.orders
          .filter((o) =>
            o.items.some((item) => {
              if (hasLinkedLines) {
                return item.settledTransactionId === txn.id;
              }
              if (txn.guestId && item.guestId !== txn.guestId) return false;
              return item.status !== OrderItemStatus.cancelled &&
                item.status !== OrderItemStatus.voided;
            }),
          )
          .map((o) => o.id),
      ),
    ];

    return {
      restaurantName: profile.tradingName?.trim() || restaurantName,
      logoUrl: profile.logoUrl?.trim() || null,
      showLogo: receiptCfg.showLogo !== false,
      currency,
      transactionNumber: txn.transactionNumber,
      createdAt: txn.createdAt,
      table: txn.session.table,
      sessionId: txn.sessionId,
      orderIds,
      cashier: txn.cashier,
      waiter,
      guestId: txn.guestId,
      lines,
      subtotal: txn.subtotal.toString(),
      discountAmount: txn.discountAmount.toString(),
      taxAmount: txn.taxAmount.toString(),
      taxLabel: txn.taxLabel,
      taxRateSnapshot: txn.taxRateSnapshot?.toString() ?? null,
      tipAmount: txn.tipAmount.toString(),
      total: txn.total.toString(),
      payments: txn.payments.map((p) => ({
        method: p.method,
        amount: p.amount.toString(),
        reference: p.reference,
        cashReceived: p.cashReceived?.toString() ?? null,
        cashChange: p.cashChange?.toString() ?? null,
      })),
      refunds: txn.refunds.map((r) => ({
        amount: r.amount.toString(),
        reason: r.reason,
        method: r.method,
        createdAt: r.createdAt,
      })),
      footer: receiptFooter || null,
      status: txn.status,
      isReprint: Boolean(opts?.isReprint),
    };
  }

  async reprint(transactionId: string, actorId: string) {
    const payload = await this.receipt(transactionId, { isReprint: true });
    await this.activity.record({
      actorId,
      actionType: 'payment.receipt_reprint',
      entityType: 'transaction',
      entityId: transactionId,
      description: `Receipt ${payload.transactionNumber} printed again`,
    });
    return payload;
  }
}
