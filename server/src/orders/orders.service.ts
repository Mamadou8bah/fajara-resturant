import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdempotencyScope,
  InventoryItemType,
  InventoryMovementType,
  ModifierInventoryEffect,
  NotificationStatus,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  Role,
  SessionStatus,
} from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { SequenceService } from '../common/sequence.service';
import { ShiftsLookupService } from '../common/shifts-lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { canTransitionOrder, OrderItemState, OrderState } from '../shared';
import { SubmitOrderDto } from './dto/submit-order.dto';

const ORDER_ITEM_INCLUDE = {
  modifiers: true,
  guest: { select: { id: true, displayName: true, sortOrder: true } },
  menuItem: {
    select: {
      id: true,
      name: true,
      station: true,
      requiresKitchen: true,
      prepMinutes: true,
    },
  },
} satisfies Prisma.OrderItemInclude;

const ORDER_INCLUDE = {
  items: { include: ORDER_ITEM_INCLUDE, orderBy: { createdAt: 'asc' as const } },
  waiter: { select: { id: true, fullName: true } },
  session: {
    select: {
      id: true,
      tableId: true,
      status: true,
      waiterId: true,
      table: { select: { id: true, number: true, label: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type Tx = Prisma.TransactionClient;

const ITEM_TRANSITIONS: Record<OrderItemState, OrderItemState[]> = {
  draft: ['placed', 'submitted', 'cancelled'],
  placed: ['submitted', 'cancelled'],
  submitted: ['preparing', 'cancelled', 'voided'],
  preparing: ['ready', 'voided', 'comped'],
  ready: ['served', 'voided', 'comped'],
  served: ['voided', 'comped'],
  cancelled: [],
  voided: [],
  comped: [],
};

function canTransitionItem(from: OrderItemState, to: OrderItemState): boolean {
  return ITEM_TRANSITIONS[from]?.includes(to) ?? false;
}

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

function moneyString(value: Prisma.Decimal | string | number): string {
  if (typeof value === 'string') return Number(value).toFixed(2);
  if (typeof value === 'number') return value.toFixed(2);
  return value.toFixed(2);
}

function friendlyStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function isSpecialActive(
  special: {
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    weekday: number | null;
    type: string;
  },
  now: Date,
): boolean {
  if (!special.isActive) return false;
  if (special.startsAt && now < special.startsAt) return false;
  if (special.endsAt && now > special.endsAt) return false;
  if (special.weekday != null && special.weekday !== now.getDay()) return false;
  return true;
}

function isPromoActive(
  promo: {
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  now: Date,
): boolean {
  if (!promo.isActive) return false;
  if (promo.startsAt && now < promo.startsAt) return false;
  if (promo.endsAt && now > promo.endsAt) return false;
  return true;
}

/** Best single promotion after specials (higher priority, then lower price). */
function applyPromotionPrice(
  base: number,
  menuItem: { id: string; categoryId: string | null },
  promos: Array<{
    type: string;
    percentOff: Prisma.Decimal | null;
    fixedPrice: Prisma.Decimal | null;
    categoryIds: string[];
    menuItemIds: string[];
    priority: number;
  }>,
): number {
  let best = base;
  const ranked = [...promos].sort((a, b) => b.priority - a.priority);
  for (const p of ranked) {
    const applies =
      p.type === 'PERCENT_OFF_ALL' ||
      (p.type === 'PERCENT_OFF_CATEGORY' &&
        menuItem.categoryId != null &&
        p.categoryIds.includes(menuItem.categoryId)) ||
      ((p.type === 'PERCENT_OFF_ITEMS' || p.type === 'FIXED_PRICE_ITEMS') &&
        p.menuItemIds.includes(menuItem.id));
    if (!applies) continue;
    let next = best;
    if (
      (p.type === 'PERCENT_OFF_ALL' ||
        p.type === 'PERCENT_OFF_CATEGORY' ||
        p.type === 'PERCENT_OFF_ITEMS') &&
      p.percentOff != null
    ) {
      next = base * (1 - Number(p.percentOff) / 100);
    } else if (p.type === 'FIXED_PRICE_ITEMS' && p.fixedPrice != null) {
      next = Number(p.fixedPrice);
    }
    if (next < best) best = next;
  }
  return Math.max(0, Math.round(best * 100) / 100);
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly activity: ActivityLogService,
    private readonly realtime: RealtimeGateway,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly shiftsLookup: ShiftsLookupService,
  ) {}

  async submitOrder(
    input: SubmitOrderDto,
    actorId?: string | null,
  ) {
    const begin = await this.idempotency.begin(
      IdempotencyScope.ORDER,
      input.clientRequestId,
      actorId ?? input.waiterId,
    );
    if (begin.replay) {
      return begin.response;
    }

    try {
      const orderMeta = await this.prisma.$transaction(async (tx) => {
        const session = await tx.tableSession.findUnique({
          where: { id: input.sessionId },
          include: { guests: true },
        });
        if (!session) throw new NotFoundException('Session not found');
        if (session.status !== 'OPEN') {
          throw new BadRequestException('Session is not open');
        }

        const guestIds = new Set(session.guests.map((g) => g.id));
        for (const line of input.items) {
          if (!guestIds.has(line.guestId)) {
            throw new BadRequestException(
              `Guest ${line.guestId} is not on this session`,
            );
          }
        }

        const menuItemIds = [...new Set(input.items.map((i) => i.menuItemId))];
        const menuItems = await tx.menuItem.findMany({
          where: { id: { in: menuItemIds }, archivedAt: null },
          include: {
            specials: true,
            modifierGroups: { include: { options: true } },
          },
        });
        const menuById = new Map(menuItems.map((m) => [m.id, m]));

        const now = new Date();
        const activePromos = (
          await tx.promotion.findMany({
            where: { isActive: true },
            orderBy: [{ priority: 'desc' }],
          })
        ).filter((p) => isPromoActive(p, now));

        const allOptionIds = [
          ...new Set(
            input.items.flatMap((i) => i.modifierOptionIds ?? []),
          ),
        ];
        const options =
          allOptionIds.length === 0
            ? []
            : await tx.modifierOption.findMany({
                where: { id: { in: allOptionIds }, archivedAt: null },
                include: { group: true },
              });
        const optionById = new Map(options.map((o) => [o.id, o]));

        const preparedLines: Array<{
          guestId: string;
          menuItemId: string;
          nameSnapshot: string;
          priceSnapshot: string;
          quantity: number;
          kitchenNotes: string | null;
          isTakeaway: boolean;
          requiresKitchen: boolean;
          modifiers: Array<{
            modifierOptionId: string;
            nameSnapshot: string;
            priceSnapshot: string;
            groupNameSnapshot: string | null;
          }>;
          specialId: string | null;
          specialQty: number;
        }> = [];

        for (const line of input.items) {
          const menuItem = menuById.get(line.menuItemId);
          if (!menuItem) {
            throw new NotFoundException(`Menu item ${line.menuItemId} not found`);
          }
          if (!menuItem.isAvailable || menuItem.isSoldOut) {
            throw new BadRequestException(`${menuItem.name} is unavailable`);
          }

          const mods = (line.modifierOptionIds ?? []).map((id) => {
            const opt = optionById.get(id);
            if (!opt) {
              throw new BadRequestException(`Modifier option ${id} not found`);
            }
            if (
              opt.group.menuItemId &&
              opt.group.menuItemId !== menuItem.id
            ) {
              throw new BadRequestException(
                `Modifier ${opt.name} does not belong to ${menuItem.name}`,
              );
            }
            return {
              modifierOptionId: opt.id,
              nameSnapshot: opt.name,
              priceSnapshot: moneyString(opt.priceEffect),
              groupNameSnapshot: opt.group.name,
            };
          });

          // Enforce required / min–max selection per modifier group (CUS-005)
          for (const group of menuItem.modifierGroups) {
            if (group.archivedAt || !group.isActive) continue;
            const selectedInGroup = mods.filter((m) => {
              const opt = optionById.get(m.modifierOptionId);
              return opt?.groupId === group.id;
            });
            const min = group.isRequired
              ? Math.max(group.minSelect, 1)
              : group.minSelect;
            if (selectedInGroup.length < min) {
              throw new BadRequestException(
                `Choose ${group.name} for ${menuItem.name}`,
              );
            }
            if (
              group.maxSelect > 0 &&
              selectedInGroup.length > group.maxSelect
            ) {
              throw new BadRequestException(
                `Too many options for ${group.name} on ${menuItem.name}`,
              );
            }
          }

          const activeSpecial = menuItem.specials.find((s) =>
            isSpecialActive(s, now),
          );
          let unitPrice = moneyString(menuItem.price);
          let specialId: string | null = null;
          let specialQty = 0;

          if (activeSpecial?.specialPrice != null) {
            if (activeSpecial.quantityRemaining != null) {
              const decremented = await tx.special.updateMany({
                where: {
                  id: activeSpecial.id,
                  quantityRemaining: { gte: line.quantity },
                },
                data: {
                  quantityRemaining: {
                    decrement: line.quantity,
                  },
                },
              });
              if (decremented.count !== 1) {
                throw new ConflictException(
                  `Special for ${menuItem.name} is sold out`,
                );
              }
            }
            unitPrice = moneyString(activeSpecial.specialPrice);
            specialId = activeSpecial.id;
            specialQty = line.quantity;
          }

          const afterPromo = applyPromotionPrice(
            Number(unitPrice),
            { id: menuItem.id, categoryId: menuItem.categoryId },
            activePromos,
          );
          unitPrice = moneyString(afterPromo);

          preparedLines.push({
            guestId: line.guestId,
            menuItemId: menuItem.id,
            nameSnapshot: menuItem.name,
            priceSnapshot: unitPrice,
            quantity: line.quantity,
            kitchenNotes: line.kitchenNotes ?? null,
            isTakeaway: line.isTakeaway ?? false,
            requiresKitchen: menuItem.requiresKitchen !== false,
            modifiers: mods,
            specialId,
            specialQty,
          });
        }

        const orderNumber = await this.sequences.nextOrderNumber(tx);
        const anyKitchen = preparedLines.some((l) => l.requiresKitchen);
        // Kitchen lines hold as placed; drinks / no-cook go straight to ready (no KDS).
        const initialStatus = anyKitchen
          ? OrderStatus.placed
          : OrderStatus.ready;

        let waiterId =
          input.source === OrderSource.WAITER
            ? (input.waiterId ?? actorId ?? session.waiterId)
            : (input.waiterId ?? session.waiterId);

        if (!waiterId) {
          waiterId = await this.pickFreeWaiterId(tx);
          if (waiterId && !session.waiterId) {
            await tx.tableSession.update({
              where: { id: session.id },
              data: { waiterId },
            });
          }
        } else if (
          input.source === OrderSource.WAITER &&
          !session.waiterId &&
          waiterId
        ) {
          await tx.tableSession.update({
            where: { id: session.id },
            data: { waiterId },
          });
        }

        const order = await tx.order.create({
          data: {
            orderNumber,
            sessionId: session.id,
            waiterId: waiterId ?? null,
            source: input.source,
            status: initialStatus,
            clientRequestId: input.clientRequestId,
            submittedAt: now,
            items: {
              create: preparedLines.map((line) => ({
                guestId: line.guestId,
                menuItemId: line.menuItemId,
                nameSnapshot: line.nameSnapshot,
                priceSnapshot: line.priceSnapshot,
                quantity: line.quantity,
                status: line.requiresKitchen
                  ? OrderItemStatus.placed
                  : OrderItemStatus.ready,
                readyAt: line.requiresKitchen ? undefined : now,
                kitchenNotes: line.kitchenNotes,
                isTakeaway: line.isTakeaway,
                modifiers: {
                  create: line.modifiers.map((m) => ({
                    modifierOptionId: m.modifierOptionId,
                    nameSnapshot: m.nameSnapshot,
                    priceSnapshot: m.priceSnapshot,
                    groupNameSnapshot: m.groupNameSnapshot,
                  })),
                },
              })),
            },
          },
          include: ORDER_INCLUDE,
        });

        return { order, anyKitchen, waiterId };
      },
      { maxWait: 10_000, timeout: 20_000 },
      );

      await this.activity.record({
        actorId: actorId ?? orderMeta.waiterId ?? null,
        actionType: 'order.placed',
        entityType: 'order',
        entityId: orderMeta.order.id,
        description:
          input.source === OrderSource.GUEST
            ? `Order ${orderMeta.order.orderNumber} placed by guest`
            : orderMeta.anyKitchen
              ? `Order ${orderMeta.order.orderNumber} placed by waiter (kitchen hold)`
              : `Order ${orderMeta.order.orderNumber} placed — service only (no kitchen)`,
        metadata: {
          sessionId: orderMeta.order.sessionId,
          itemCount: orderMeta.order.items.length,
        },
      });

      const order = orderMeta.order;

      // Safety net if menu flags changed mid-flight.
      const afterRelease = await this.releaseNonKitchenItems(
        order.id,
        actorId ?? null,
      );
      const result = afterRelease ?? order;
      const payload = jsonSafe(result);
      await this.idempotency.complete(
        IdempotencyScope.ORDER,
        input.clientRequestId,
        payload,
      );

      if (input.source === OrderSource.GUEST) {
        await this.notifyGuestOrderPlaced(result);
        this.emitStaffRooms(result.sessionId, 'order.placed', result);
        if (result.waiterId) {
          this.realtime.emitToRoom(
            `employee:${result.waiterId}`,
            'order.placed',
            payload,
          );
        } else {
          this.realtime.emitToRoom('waiters', 'order.placed', payload);
        }
      } else {
        this.emitStaffRooms(result.sessionId, 'order.placed', result);
        this.emitOrderRooms(result.sessionId, 'order.placed', result);
      }
      return result;
    } catch (err) {
      throw err;
    }
  }

  async listSessionOrders(sessionId: string) {
    return this.prisma.order.findMany({
      where: { sessionId },
      include: ORDER_INCLUDE,
      orderBy: { submittedAt: 'asc' },
    });
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listForKds(station?: string) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        status: {
          in: [
            OrderItemStatus.submitted,
            OrderItemStatus.preparing,
            OrderItemStatus.ready,
          ],
        },
        // Drinks / no-cook never belong on the kitchen board.
        ...(station
          ? { menuItem: { station, requiresKitchen: true } }
          : {
              OR: [
                { menuItemId: null },
                { menuItem: { requiresKitchen: true } },
              ],
            }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        ...ORDER_ITEM_INCLUDE,
        order: {
          select: {
            id: true,
            orderNumber: true,
            source: true,
            submittedAt: true,
            waiter: { select: { id: true, fullName: true } },
            session: {
              select: {
                id: true,
                tableId: true,
                waiterId: true,
                waiter: { select: { id: true, fullName: true } },
                table: { select: { id: true, number: true, label: true } },
                guests: {
                  select: { id: true, displayName: true, sortOrder: true },
                },
                moves: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const priorTableIds = [
      ...new Set(
        items
          .map((i) => i.order.session.moves[0]?.fromTableId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const priorTables =
      priorTableIds.length === 0
        ? []
        : await this.prisma.diningTable.findMany({
            where: { id: { in: priorTableIds } },
            select: { id: true, number: true, label: true },
          });
    const priorById = new Map(priorTables.map((t) => [t.id, t]));

    const menuItemIds = [
      ...new Set(
        items
          .map((i) => i.menuItemId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const activeSpecials =
      menuItemIds.length === 0
        ? []
        : await this.prisma.special.findMany({
            where: {
              menuItemId: { in: menuItemIds },
              isActive: true,
            },
            select: { menuItemId: true, type: true, startsAt: true, endsAt: true, weekday: true },
          });
    const specialMenuIds = new Set(
      activeSpecials
        .filter((s) =>
          isSpecialActive(
            { ...s, isActive: true },
            new Date(),
          ),
        )
        .map((s) => s.menuItemId),
    );

    // First submitted order per session = original round; later orders = appended.
    const firstOrderBySession = new Map<
      string,
      { orderNumber: string; at: number }
    >();
    for (const item of items) {
      const sid = item.order.session.id;
      const orderNumber = item.order.orderNumber;
      const at = item.order.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const prev = firstOrderBySession.get(sid);
      if (
        prev == null ||
        at < prev.at ||
        (at === prev.at && orderNumber < prev.orderNumber)
      ) {
        firstOrderBySession.set(sid, { orderNumber, at });
      }
    }

    const enriched = items.map((item) => {
      const move = item.order.session.moves[0];
      const priorTable = move?.fromTableId
        ? priorById.get(move.fromTableId) ?? null
        : null;
      const waiter =
        item.order.waiter ?? item.order.session.waiter ?? null;
      const first = firstOrderBySession.get(item.order.session.id);
      const isAppendedRound =
        first != null && item.order.orderNumber !== first.orderNumber;
      const isSpecial = Boolean(
        item.menuItemId && specialMenuIds.has(item.menuItemId),
      );
      return {
        ...item,
        priorTable,
        waiter,
        isAppendedRound,
        isSpecial,
      };
    });

    return {
      submitted: enriched.filter((i) => i.status === OrderItemStatus.submitted),
      preparing: enriched.filter((i) => i.status === OrderItemStatus.preparing),
      ready: enriched.filter((i) => i.status === OrderItemStatus.ready),
    };
  }

  async listWaiterTables(waiterId?: string) {
    const sessions = await this.prisma.tableSession.findMany({
      where: {
        status: SessionStatus.OPEN,
        ...(waiterId
          ? { OR: [{ waiterId }, { waiterId: null }] }
          : {}),
      },
      orderBy: [{ waiterId: 'asc' }, { openedAt: 'asc' }],
      include: {
        table: true,
        guests: { orderBy: { sortOrder: 'asc' } },
        waiter: { select: { id: true, fullName: true } },
        orders: {
          include: ORDER_INCLUDE,
          orderBy: { submittedAt: 'asc' },
        },
      },
    });
    // Own tables first, then unassigned (pending)
    if (waiterId) {
      return [
        ...sessions.filter((s) => s.waiterId === waiterId),
        ...sessions.filter((s) => s.waiterId == null),
      ];
    }
    return sessions;
  }

  async cancelItem(
    itemId: string,
    actorId: string,
    reason?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await this.loadItem(tx, itemId);
      if (item.status !== OrderItemStatus.submitted && item.status !== OrderItemStatus.placed) {
        throw new BadRequestException(
          'Only placed or submitted items can be cancelled before preparation',
        );
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: { status: OrderItemStatus.cancelled },
        include: ORDER_ITEM_INCLUDE,
      });

      await tx.orderException.create({
        data: {
          orderId: item.orderId,
          orderItemId: item.id,
          type: 'cancel',
          reason: reason?.trim() || 'Cancelled before preparation',
          actorId,
        },
      });

      await this.recomputeOrderStatus(tx, item.orderId);
      await this.activity.record({
        actorId,
        actionType: 'order_item.cancelled',
        entityType: 'order_item',
        entityId: item.id,
        description: `Cancelled ${item.nameSnapshot} before preparation`,
        metadata: { reason: reason ?? null },
      });

      return { item: updated, sessionId: item.order.sessionId };
    });

    this.emitOrderRooms(result.sessionId, 'order_item.updated', result.item);
    return result.item;
  }

  async voidItem(
    itemId: string,
    actorId: string,
    reason: string,
    approvedById: string,
  ) {
    return this.postPrepException(itemId, actorId, {
      type: 'void',
      reason,
      approvedById,
      nextStatus: OrderItemStatus.voided,
      restoreInventory: false,
    });
  }

  async compItem(
    itemId: string,
    actorId: string,
    reason: string,
    approvedById: string,
  ) {
    return this.postPrepException(itemId, actorId, {
      type: 'comp',
      reason,
      approvedById,
      nextStatus: OrderItemStatus.comped,
      restoreInventory: false,
    });
  }

  async remakeItem(
    itemId: string,
    actorId: string,
    reason: string,
    approvedById: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await this.loadItem(tx, itemId);
      this.assertPrepared(item.status);
      if (!reason?.trim()) {
        throw new BadRequestException('Reason is required');
      }
      if (!approvedById) {
        throw new BadRequestException('approvedById is required');
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: {
          status: OrderItemStatus.submitted,
          preparedAt: null,
          readyAt: null,
          servedAt: null,
        },
        include: ORDER_ITEM_INCLUDE,
      });

      await tx.orderException.create({
        data: {
          orderId: item.orderId,
          orderItemId: item.id,
          type: 'remake',
          reason: reason.trim(),
          actorId,
          approvedById,
        },
      });

      await this.recomputeOrderStatus(tx, item.orderId);
      await this.activity.record({
        actorId,
        actionType: 'order_item.remake',
        entityType: 'order_item',
        entityId: item.id,
        description: `Remake approved for ${item.nameSnapshot}`,
        metadata: { reason, approvedById },
      });

      return { item: updated, sessionId: item.order.sessionId };
    });

    this.emitOrderRooms(result.sessionId, 'order_item.updated', result.item);
    return result.item;
  }

  /** Kitchen requests remake — owners/managers approve from their inbox. */
  async requestRemake(itemId: string, actorId: string, reason: string) {
    return this.requestItemApproval('remake', itemId, actorId, reason);
  }

  /** Waiter requests void after prep — managers approve from inbox. */
  async requestVoid(itemId: string, actorId: string, reason: string) {
    return this.requestItemApproval('void', itemId, actorId, reason);
  }

  /** Waiter requests comp — managers approve from inbox. */
  async requestComp(itemId: string, actorId: string, reason: string) {
    return this.requestItemApproval('comp', itemId, actorId, reason);
  }

  private async requestItemApproval(
    kind: 'remake' | 'void' | 'comp',
    itemId: string,
    actorId: string,
    reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Reason is required');
    }

    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        ...ORDER_ITEM_INCLUDE,
        order: {
          include: {
            session: { include: { table: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Order item not found');
    this.assertPrepared(item.status);

    const notifType = `${kind}.request` as const;
    const pending = await this.prisma.notification.findFirst({
      where: {
        type: notifType,
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
        payload: {
          path: ['orderItemId'],
          equals: itemId,
        },
      },
    });
    if (pending) {
      throw new BadRequestException(
        `A ${kind} request for this item is already waiting for approval`,
      );
    }

    const table =
      item.order.session?.table.label?.trim() ||
      (item.order.session?.table.number != null
        ? `T${item.order.session.table.number}`
        : 'Table');
    const labels = {
      remake: `Remake: ${item.nameSnapshot}`,
      void: `Void: ${item.nameSnapshot}`,
      comp: `Comp: ${item.nameSnapshot}`,
    } as const;
    const title = labels[kind];
    const body = `${table} · ${reason.trim()}`;

    const managers = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.OWNER, Role.MANAGER] },
        isActive: true,
        archivedAt: null,
      },
      select: { id: true },
    });

    const payload = {
      orderItemId: item.id,
      orderId: item.orderId,
      reason: reason.trim(),
      actorId,
      itemName: item.nameSnapshot,
      tableLabel: table,
      exceptionKind: kind,
      sound: notifType,
    };

    const created = [];
    for (const mgr of managers) {
      created.push(
        await this.notifications.create({
          type: notifType,
          title,
          body,
          employeeId: mgr.id,
          sessionId: item.order.sessionId,
          payload,
          broadcastRoom: `employee:${mgr.id}`,
        }),
      );
    }

    this.realtime.emitToRoom('managers', 'notification', {
      type: notifType,
      title,
      body,
      payload,
    });

    await this.activity.record({
      actorId,
      actionType: `order_item.${kind}_requested`,
      entityType: 'order_item',
      entityId: item.id,
      description: `${kind[0]!.toUpperCase()}${kind.slice(1)} requested for ${item.nameSnapshot}`,
      metadata: payload,
    });

    const messages = {
      remake: 'Remake sent to owners and managers for approval',
      void: 'Void request sent to owners and managers for approval',
      comp: 'Comp request sent to owners and managers for approval',
    } as const;

    return {
      ok: true as const,
      notified: created.length,
      message: messages[kind],
    };
  }

  async approveRemake(notificationId: string, approverId: string) {
    return this.approveItemApproval(notificationId, approverId, 'remake');
  }

  async approveVoid(notificationId: string, approverId: string) {
    return this.approveItemApproval(notificationId, approverId, 'void');
  }

  async approveComp(notificationId: string, approverId: string) {
    return this.approveItemApproval(notificationId, approverId, 'comp');
  }

  /** Approve any pending remake/void/comp request from the inbox. */
  async approveExceptionRequest(notificationId: string, approverId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new NotFoundException('Approval request not found');
    }
    if (notification.type === 'remake.request') {
      return this.approveItemApproval(notificationId, approverId, 'remake');
    }
    if (notification.type === 'void.request') {
      return this.approveItemApproval(notificationId, approverId, 'void');
    }
    if (notification.type === 'comp.request') {
      return this.approveItemApproval(notificationId, approverId, 'comp');
    }
    throw new BadRequestException('Not an item approval request');
  }

  private async approveItemApproval(
    notificationId: string,
    approverId: string,
    kind: 'remake' | 'void' | 'comp',
  ) {
    const expectedType = `${kind}.request`;
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.type !== expectedType) {
      throw new NotFoundException(`${kind} request not found`);
    }
    if (
      notification.status === NotificationStatus.accepted ||
      notification.status === NotificationStatus.resolved
    ) {
      throw new ConflictException(`This ${kind} was already handled`);
    }

    const payload = (notification.payload ?? {}) as {
      orderItemId?: string;
      reason?: string;
      actorId?: string;
    };
    if (!payload.orderItemId || !payload.reason) {
      throw new BadRequestException(`${kind} request is missing details`);
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
      throw new ConflictException(`This ${kind} was already handled`);
    }

    await this.prisma.notification.updateMany({
      where: {
        type: expectedType,
        id: { not: notificationId },
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
        payload: {
          path: ['orderItemId'],
          equals: payload.orderItemId,
        },
      },
      data: {
        status: NotificationStatus.resolved,
        resolvedAt: new Date(),
      },
    });

    if (kind === 'remake') {
      const item = await this.remakeItem(
        payload.orderItemId,
        payload.actorId ?? approverId,
        payload.reason,
        approverId,
      );
      this.realtime.emitToRoom('kds', 'notification', {
        type: 'remake.approved',
        title: 'Remake approved',
        body: payload.reason,
        payload: { orderItemId: payload.orderItemId },
      });
      return item;
    }

    if (kind === 'void') {
      return this.voidItem(
        payload.orderItemId,
        payload.actorId ?? approverId,
        payload.reason,
        approverId,
      );
    }

    return this.compItem(
      payload.orderItemId,
      payload.actorId ?? approverId,
      payload.reason,
      approverId,
    );
  }

  async declineRemake(notificationId: string, managerId: string) {
    return this.declineItemApproval(notificationId, managerId, 'remake');
  }

  async declineVoid(notificationId: string, managerId: string) {
    return this.declineItemApproval(notificationId, managerId, 'void');
  }

  async declineComp(notificationId: string, managerId: string) {
    return this.declineItemApproval(notificationId, managerId, 'comp');
  }

  async declineExceptionRequest(notificationId: string, managerId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new NotFoundException('Approval request not found');
    }
    if (notification.type === 'remake.request') {
      return this.declineItemApproval(notificationId, managerId, 'remake');
    }
    if (notification.type === 'void.request') {
      return this.declineItemApproval(notificationId, managerId, 'void');
    }
    if (notification.type === 'comp.request') {
      return this.declineItemApproval(notificationId, managerId, 'comp');
    }
    throw new BadRequestException('Not an item approval request');
  }

  private async declineItemApproval(
    notificationId: string,
    managerId: string,
    kind: 'remake' | 'void' | 'comp',
  ) {
    const expectedType = `${kind}.request`;
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.type !== expectedType) {
      throw new NotFoundException(`${kind} request not found`);
    }

    const payload = (notification.payload ?? {}) as {
      orderItemId?: string;
      itemName?: string;
    };

    if (payload.orderItemId) {
      await this.prisma.notification.updateMany({
        where: {
          type: expectedType,
          status: {
            in: [
              NotificationStatus.created,
              NotificationStatus.delivered,
              NotificationStatus.seen,
            ],
          },
          payload: {
            path: ['orderItemId'],
            equals: payload.orderItemId,
          },
        },
        data: {
          status: NotificationStatus.resolved,
          resolvedAt: new Date(),
        },
      });
    } else {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.resolved,
          resolvedAt: new Date(),
        },
      });
    }

    await this.activity.record({
      actorId: managerId,
      actionType: `order_item.${kind}_declined`,
      entityType: 'order_item',
      entityId: payload.orderItemId ?? notificationId,
      description: `${kind[0]!.toUpperCase()}${kind.slice(1)} declined${payload.itemName ? ` for ${payload.itemName}` : ''}`,
    });

    return { ok: true as const };
  }

  async reopenPaidOrder(
    orderId: string,
    actorId: string,
    reason: string,
    approvedById: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Reason is required');
    }
    if (!approvedById) {
      throw new BadRequestException('approvedById is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== OrderStatus.paid) {
        throw new BadRequestException('Only paid orders can be reopened');
      }

      await tx.orderItem.updateMany({
        where: { orderId },
        data: { settledTransactionId: null },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.served },
        include: ORDER_INCLUDE,
      });

      await tx.tableSession.updateMany({
        where: {
          id: order.sessionId,
          status: SessionStatus.SETTLED,
        },
        data: { status: SessionStatus.OPEN },
      });

      await tx.orderException.create({
        data: {
          orderId: order.id,
          type: 'reopen',
          reason: reason.trim(),
          actorId,
          approvedById,
        },
      });

      await this.activity.record({
        actorId,
        actionType: 'order.reopened',
        entityType: 'order',
        entityId: order.id,
        description: `Reopened paid order ${order.orderNumber}`,
        metadata: { reason: reason.trim(), approvedById },
      });

      return updated;
    });

    this.emitOrderRooms(result.sessionId, 'order.updated', result);
    return result;
  }

  async transitionItem(
    itemId: string,
    toStatus: OrderItemStatus,
    actorId?: string | null,
  ) {
    const allowedKitchen: OrderItemStatus[] = [
      OrderItemStatus.preparing,
      OrderItemStatus.ready,
      OrderItemStatus.served,
    ];
    if (!allowedKitchen.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid transition target: ${toStatus}. Use cancel/void/comp endpoints for exceptions.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await this.loadItem(tx, itemId);
      const from = item.status as OrderItemState;
      const to = toStatus as OrderItemState;

      // Idempotent replay (offline queue / double-tap): already at target = success.
      if (from === to) {
        return {
          item,
          sessionId: item.order.sessionId,
          noop: true as const,
        };
      }

      if (!canTransitionItem(from, to)) {
        throw new BadRequestException(
          `Cannot transition item from ${from} to ${to}`,
        );
      }

      const now = new Date();
      const data: Prisma.OrderItemUpdateInput = { status: toStatus };
      if (toStatus === OrderItemStatus.preparing) {
        data.preparedAt = now;
        await this.consumeInventoryForItem(tx, item, actorId ?? null, 'prepare');
      }
      if (toStatus === OrderItemStatus.ready) data.readyAt = now;
      if (toStatus === OrderItemStatus.served) {
        data.servedAt = now;
        await this.consumeInventoryForItem(tx, item, actorId ?? null, 'served');
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data,
        include: ORDER_ITEM_INCLUDE,
      });

      await this.recomputeOrderStatus(tx, item.orderId);
      await this.activity.record({
        actorId: actorId ?? null,
        actionType: 'order_item.transition',
        entityType: 'order_item',
        entityId: item.id,
        description: `${item.nameSnapshot}: ${friendlyStatus(from)} → ${friendlyStatus(to)}`,
      });

      return {
        item: updated,
        sessionId: item.order.sessionId,
        noop: false as const,
      };
    });

    if ('noop' in result && result.noop) {
      return result.item;
    }

    this.emitOrderRooms(result.sessionId, 'order_item.updated', result.item);
    if (toStatus === OrderItemStatus.preparing) {
      await this.notifyStatusChange(result.item, result.sessionId, 'preparing');
    } else if (toStatus === OrderItemStatus.ready) {
      await this.notifyStatusChange(result.item, result.sessionId, 'ready');
    } else if (toStatus === OrderItemStatus.served) {
      await this.notifyStatusChange(result.item, result.sessionId, 'served');
    }
    return result.item;
  }

  async serveItem(itemId: string, actorId: string) {
    return this.transitionItem(itemId, OrderItemStatus.served, actorId);
  }

  /**
   * Advance placed items: kitchen → submitted (KDS); non-kitchen → ready (cashier).
   * Optional itemIds = partial send; omit to send all still-placed lines.
   */
  async sendToKitchen(
    orderId: string,
    actor: { id: string; role: Role },
    itemIds?: string[],
  ) {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Order not found');

    const placed = existing.items.filter(
      (i) => i.status === OrderItemStatus.placed,
    );
    if (placed.length === 0) {
      throw new BadRequestException('No held items left to send');
    }

    const targets =
      itemIds && itemIds.length > 0
        ? placed.filter((i) => itemIds.includes(i.id))
        : placed;
    if (targets.length === 0) {
      throw new BadRequestException('None of the selected items are held');
    }

    const isManager =
      actor.role === Role.OWNER || actor.role === Role.MANAGER;
    if (
      !isManager &&
      existing.waiterId &&
      existing.waiterId !== actor.id &&
      existing.session.waiterId !== actor.id
    ) {
      throw new ForbiddenException('Only the assigned waiter can send this order');
    }

    const now = new Date();
    const kitchenIds = targets
      .filter((i) => i.menuItem?.requiresKitchen !== false)
      .map((i) => i.id);
    const serviceIds = targets
      .filter((i) => i.menuItem?.requiresKitchen === false)
      .map((i) => i.id);

    const order = await this.prisma.$transaction(async (tx) => {
      if (kitchenIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: kitchenIds } },
          data: { status: OrderItemStatus.submitted },
        });
      }
      if (serviceIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: serviceIds } },
          data: {
            status: OrderItemStatus.ready,
            readyAt: now,
          },
        });
      }

      await this.recomputeOrderStatus(tx, orderId);

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          waiterId: existing.waiterId ?? actor.id,
          ...(kitchenIds.length > 0 ? { submittedAt: now } : {}),
        },
        include: ORDER_INCLUDE,
      });

      if (!existing.session.waiterId) {
        await tx.tableSession.update({
          where: { id: existing.sessionId },
          data: { waiterId: updated.waiterId },
        });
      }

      await this.activity.record({
        actorId: actor.id,
        actionType: 'order.sent_to_kitchen',
        entityType: 'order',
        entityId: orderId,
        description: `Order ${updated.orderNumber}: sent ${kitchenIds.length} to kitchen, ${serviceIds.length} to service`,
        metadata: { kitchenIds, serviceIds },
      });

      return updated;
    });

    if (kitchenIds.length > 0) {
      await this.notifyKitchenNewOrder(order);
      this.emitOrderRooms(order.sessionId, 'order.submitted', order);
    }
    this.realtime.emitToRoom(`session:${order.sessionId}`, 'order.status', {
      orderId: order.id,
      status: kitchenIds.length > 0 ? 'submitted' : 'ready',
      name: `Order #${order.orderNumber}`,
    });
    for (const id of [...kitchenIds, ...serviceIds]) {
      const item = order.items.find((i) => i.id === id);
      if (item) {
        this.realtime.emitToRoom(`session:${order.sessionId}`, 'order_item.updated', {
          id: item.id,
          orderId: order.id,
          status: item.status,
          nameSnapshot: item.nameSnapshot,
        });
      }
    }
    return order;
  }

  /** Move placed non-kitchen items straight to ready (no KDS). */
  private async releaseNonKitchenItems(
    orderId: string,
    actorId: string | null,
  ) {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!existing) return null;
    const serviceIds = existing.items
      .filter(
        (i) =>
          i.status === OrderItemStatus.placed &&
          i.menuItem?.requiresKitchen === false,
      )
      .map((i) => i.id);
    if (serviceIds.length === 0) return existing;

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { id: { in: serviceIds } },
        data: { status: OrderItemStatus.ready, readyAt: now },
      });
      await this.recomputeOrderStatus(tx, orderId);
      if (actorId) {
        await this.activity.record({
          actorId,
          actionType: 'order.service_release',
          entityType: 'order',
          entityId: orderId,
          description: `Released ${serviceIds.length} non-kitchen item(s) for service/pay`,
        });
      }
      return tx.order.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
    });
  }

  async assignWaiterToSession(
    sessionId: string,
    waiterId: string,
    actorId: string,
  ) {
    const waiter = await this.prisma.employee.findFirst({
      where: {
        id: waiterId,
        role: Role.WAITER,
        isActive: true,
        archivedAt: null,
      },
    });
    if (!waiter) throw new NotFoundException('Waiter not found');

    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { table: true, waiter: { select: { id: true, fullName: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Session is not open');
    }

    const previousWaiterId = session.waiterId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.tableSession.update({
        where: { id: sessionId },
        data: { waiterId },
        include: {
          table: true,
          waiter: { select: { id: true, fullName: true } },
          guests: true,
        },
      });

      await tx.order.updateMany({
        where: {
          sessionId,
          status: {
            in: [
              OrderStatus.placed,
              OrderStatus.submitted,
              OrderStatus.preparing,
              OrderStatus.ready,
            ],
          },
        },
        data: { waiterId },
      });

      await this.activity.record({
        actorId,
        actionType: 'session.waiter_assigned',
        entityType: 'table_session',
        entityId: sessionId,
        description: `Assigned waiter ${waiter.fullName} to table ${session.table.number}`,
        metadata: { previousWaiterId, waiterId },
      });

      return next;
    });

    // Table now has an owner — clear open "Accept" claims for everyone else.
    await this.notifications.resolveClaimableForSession(sessionId);

    if (previousWaiterId && previousWaiterId !== waiterId) {
      await this.notifications.create({
        type: 'order.unassigned',
        title: `Table ${session.table.number} reassigned`,
        body: 'This table was assigned to another waiter',
        employeeId: previousWaiterId,
        sessionId,
        payload: { sessionId, waiterId },
      });
    }

    await this.notifications.create({
      type: 'order.assigned',
      title: `Table ${session.table.number} assigned to you`,
      body: 'You are responsible for this table',
      employeeId: waiterId,
      sessionId,
      payload: { sessionId, waiterId },
    });

    this.realtime.emitToRoom('floor', 'session.updated', updated);
    this.realtime.emitToRoom(`session:${sessionId}`, 'session.updated', updated);
    this.realtime.emitToRoom('managers', 'session.updated', updated);

    return updated;
  }

  async markItemUnavailable(
    itemId: string,
    actorId: string,
    reason?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await this.loadItem(tx, itemId);
      if (
        item.status === OrderItemStatus.cancelled ||
        item.status === OrderItemStatus.voided ||
        item.status === OrderItemStatus.comped ||
        item.status === OrderItemStatus.served
      ) {
        throw new BadRequestException(
          `Cannot mark unavailable from status ${item.status}`,
        );
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: { status: OrderItemStatus.cancelled },
        include: ORDER_ITEM_INCLUDE,
      });

      if (item.menuItemId) {
        await tx.menuItem.update({
          where: { id: item.menuItemId },
          data: { isSoldOut: true },
        });
      }

      await tx.orderException.create({
        data: {
          orderId: item.orderId,
          orderItemId: item.id,
          type: 'cancel',
          reason: reason?.trim() || 'Marked unavailable',
          actorId,
        },
      });

      await this.recomputeOrderStatus(tx, item.orderId);
      await this.activity.record({
        actorId,
        actionType: 'order_item.unavailable',
        entityType: 'order_item',
        entityId: item.id,
        description: `${item.nameSnapshot} marked unavailable`,
        metadata: { menuItemId: item.menuItemId },
      });

      return {
        item: updated,
        sessionId: item.order.sessionId,
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        orderId: item.orderId,
      };
    });

    this.emitOrderRooms(result.sessionId, 'order_item.updated', result.item);
    const unavailablePayload = {
      orderItemId: result.item.id,
      orderId: result.orderId,
      menuItemId: result.menuItemId,
      name: result.name,
      sessionId: result.sessionId,
    };
    this.realtime.emitToRoom(
      `session:${result.sessionId}`,
      'menu.item_unavailable',
      unavailablePayload,
    );
    this.realtime.emitToRoom('floor', 'menu.item_unavailable', unavailablePayload);

    return result.item;
  }

  async listAssignableWaiters() {
    const onShift = await this.shiftsLookup.findOnShiftEmployees(Role.WAITER);
    if (onShift.length > 0) return onShift;

    return this.prisma.employee.findMany({
      where: { role: Role.WAITER, isActive: true, archivedAt: null },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async firstAcceptWins(input: {
    notificationId?: string;
    sessionId?: string;
    waiterId: string;
  }) {
    if (!input.notificationId && !input.sessionId) {
      throw new BadRequestException('notificationId or sessionId is required');
    }

    const assigned = await this.prisma.$transaction(async (tx) => {
      let sessionId = input.sessionId ?? null;
      let notificationId = input.notificationId ?? null;

      if (notificationId) {
        const notification = await tx.notification.findUnique({
          where: { id: notificationId },
        });
        if (!notification) {
          throw new NotFoundException('Notification not found');
        }
        if (!notification.sessionId) {
          throw new BadRequestException('Notification has no session');
        }
        sessionId = notification.sessionId;

        if (
          notification.status === 'accepted' &&
          notification.employeeId &&
          notification.employeeId !== input.waiterId
        ) {
          throw new ConflictException('Call already accepted by another waiter');
        }
      }

      const session = await tx.tableSession.findUnique({
        where: { id: sessionId! },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'OPEN') {
        // Stale call after settle/close — clear it so Accept doesn't keep failing.
        if (notificationId) {
          await tx.notification.updateMany({
            where: {
              id: notificationId,
              status: {
                in: ['created', 'delivered', 'seen'],
              },
            },
            data: {
              status: 'resolved',
              resolvedAt: new Date(),
            },
          });
        }
        await tx.notification.updateMany({
          where: {
            sessionId: session.id,
            type: 'call_waiter',
            status: {
              in: ['created', 'delivered', 'seen'],
            },
          },
          data: {
            status: 'resolved',
            resolvedAt: new Date(),
          },
        });
        throw new BadRequestException(
          'This table visit has ended — the call was cleared. Refresh Orders.',
        );
      }

      if (notificationId) {
        await tx.notification.update({
          where: { id: notificationId },
          data: {
            status: 'accepted',
            employeeId: input.waiterId,
            resolvedAt: new Date(),
          },
        });
      }

      if (session.waiterId && session.waiterId !== input.waiterId) {
        throw new ConflictException('Session already assigned to another waiter');
      }

      const updated = await tx.tableSession.updateMany({
        where: {
          id: session.id,
          OR: [{ waiterId: null }, { waiterId: input.waiterId }],
        },
        data: { waiterId: input.waiterId },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Session already assigned to another waiter');
      }

      // Clear claim buttons for every other waiter on this table.
      await tx.notification.updateMany({
        where: {
          sessionId: session.id,
          type: 'call_waiter',
          ...(notificationId ? { id: { not: notificationId } } : {}),
          status: {
            in: ['created', 'delivered', 'seen'],
          },
        },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
        },
      });

      const assigned = await tx.tableSession.findUnique({
        where: { id: session.id },
        include: {
          table: true,
          waiter: { select: { id: true, fullName: true } },
          guests: true,
        },
      });

      await this.activity.record({
        actorId: input.waiterId,
        actionType: 'session.waiter_accepted',
        entityType: 'table_session',
        entityId: session.id,
        description: 'Waiter took the table call',
      });

      this.realtime.emitToRoom('floor', 'session.updated', assigned);
      this.realtime.emitToRoom('waiters', 'notification', {
        type: 'session.claimed',
        sessionId: session.id,
        waiterId: input.waiterId,
      });
      if (assigned) {
        this.realtime.emitToRoom(
          `session:${assigned.id}`,
          'session.updated',
          assigned,
        );
      }

      return assigned;
    });

    if (assigned?.guests?.length) {
      const guestPath = `/t/${assigned.tableId}`;
      const waiterName = assigned.waiter?.fullName?.split(' ')[0] || 'A waiter';
      await Promise.all(
        assigned.guests.map((g) =>
          this.notifications.pushGuest({
            type: 'order.assigned',
            title: `${waiterName} is on the way`,
            body: `Help is coming to table ${assigned.table.number}`,
            guestId: g.id,
            sessionId: assigned.id,
            url: guestPath,
          }),
        ),
      );
    }

    return assigned;
  }

  private async postPrepException(
    itemId: string,
    actorId: string,
    opts: {
      type: 'void' | 'comp';
      reason: string;
      approvedById: string;
      nextStatus: OrderItemStatus;
      restoreInventory: boolean;
    },
  ) {
    if (!opts.reason?.trim()) {
      throw new BadRequestException('Reason is required');
    }
    if (!opts.approvedById) {
      throw new BadRequestException('approvedById is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await this.loadItem(tx, itemId);
      this.assertPrepared(item.status);

      if (
        !canTransitionItem(
          item.status as OrderItemState,
          opts.nextStatus as OrderItemState,
        )
      ) {
        throw new BadRequestException(
          `Cannot ${opts.type} item in status ${item.status}`,
        );
      }

      void opts.restoreInventory;

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: { status: opts.nextStatus },
        include: ORDER_ITEM_INCLUDE,
      });

      await tx.orderException.create({
        data: {
          orderId: item.orderId,
          orderItemId: item.id,
          type: opts.type,
          reason: opts.reason.trim(),
          actorId,
          approvedById: opts.approvedById,
        },
      });

      await this.recomputeOrderStatus(tx, item.orderId);
      await this.activity.record({
        actorId,
        actionType: `order_item.${opts.type}`,
        entityType: 'order_item',
        entityId: item.id,
        description: `${opts.type} ${item.nameSnapshot}`,
        metadata: {
          reason: opts.reason,
          approvedById: opts.approvedById,
          inventoryRestored: false,
        },
      });

      return { item: updated, sessionId: item.order.sessionId };
    });

    this.emitOrderRooms(result.sessionId, 'order_item.updated', result.item);
    return result.item;
  }

  private assertPrepared(status: OrderItemStatus) {
    const prepared: OrderItemStatus[] = [
      OrderItemStatus.preparing,
      OrderItemStatus.ready,
      OrderItemStatus.served,
    ];
    if (!prepared.includes(status)) {
      throw new BadRequestException(
        'Item must be preparing/ready/served for void, comp, or remake',
      );
    }
  }

  private async loadItem(tx: Tx, itemId: string) {
    const item = await tx.orderItem.findUnique({
      where: { id: itemId },
      include: {
        ...ORDER_ITEM_INCLUDE,
        order: { select: { id: true, sessionId: true, status: true } },
        modifiers: {
          include: {
            modifierOption: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Order item not found');
    return item;
  }

  private async consumeInventoryForItem(
    tx: Tx,
    item: {
      id: string;
      menuItemId: string | null;
      quantity: number;
      nameSnapshot: string;
      modifiers: Array<{
        modifierOptionId: string | null;
        modifierOption: {
          inventoryEffect: ModifierInventoryEffect;
          inventoryItemId: string | null;
          quantityEffect: Prisma.Decimal | null;
        } | null;
      }>;
    },
    actorId: string | null,
    phase: 'prepare' | 'served',
  ) {
    if (!item.menuItemId) return;

    const consumption =
      (await this.settings.get<{
        packagedAt?: 'prepare' | 'served';
        directAtKitchenPrepare?: boolean;
      }>('inventoryConsumption', {
        packagedAt: 'prepare',
        directAtKitchenPrepare: true,
      })) ?? { packagedAt: 'prepare' };

    const packagedAt = consumption.packagedAt === 'served' ? 'served' : 'prepare';

    const already = await tx.inventoryMovement.findFirst({
      where: {
        referenceType: 'order_item',
        referenceId: item.id,
        type: InventoryMovementType.sale_consumption,
        ...(phase === 'served'
          ? { reason: { contains: 'PACKAGED@served' } }
          : { NOT: { reason: { contains: 'PACKAGED@served' } } }),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (already) {
      const remakeAfter = await tx.orderException.findFirst({
        where: {
          orderItemId: item.id,
          type: 'remake',
          createdAt: { gt: already.createdAt },
        },
      });
      if (!remakeAfter) return;
    }

    if (phase === 'served' && packagedAt !== 'served') return;

    const recipe = await tx.recipe.findFirst({
      where: {
        menuItemId: item.menuItemId,
        isActive: true,
        kind: 'dish',
      },
      include: {
        items: { include: { inventoryItem: true } },
      },
    });

    if (recipe) {
      for (const ri of recipe.items) {
        const inv = ri.inventoryItem;
        const qty = new Prisma.Decimal(ri.quantity).mul(item.quantity);
        const isPackaged = inv.type === InventoryItemType.PACKAGED;

        if (phase === 'prepare') {
          if (isPackaged && packagedAt === 'served') continue;
          if (
            inv.type === InventoryItemType.PREPARED_COMPONENT ||
            inv.type === InventoryItemType.PREPARED_FINISHED ||
            inv.type === InventoryItemType.RAW ||
            isPackaged
          ) {
            await this.applyStockDelta(
              tx,
              inv.id,
              qty.negated(),
              inv.baseUnit,
              actorId,
              item.id,
              isPackaged
                ? `Sale consumption PACKAGED@prepare: ${item.nameSnapshot}`
                : `Sale consumption: ${item.nameSnapshot}`,
            );
          }
        } else if (phase === 'served' && isPackaged) {
          await this.applyStockDelta(
            tx,
            inv.id,
            qty.negated(),
            inv.baseUnit,
            actorId,
            item.id,
            `Sale consumption PACKAGED@served: ${item.nameSnapshot}`,
          );
        }
      }
    }

    if (phase !== 'prepare') return;

    for (const mod of item.modifiers) {
      const opt = mod.modifierOption;
      if (!opt || opt.inventoryEffect === ModifierInventoryEffect.NONE) continue;
      if (!opt.inventoryItemId || opt.quantityEffect == null) continue;

      const effectQty = new Prisma.Decimal(opt.quantityEffect).mul(
        item.quantity,
      );
      const inv = await tx.inventoryItem.findUnique({
        where: { id: opt.inventoryItemId },
      });
      if (!inv) continue;

      if (
        opt.inventoryEffect === ModifierInventoryEffect.ADD ||
        opt.inventoryEffect === ModifierInventoryEffect.REPLACE
      ) {
        await this.applyStockDelta(
          tx,
          inv.id,
          effectQty.negated(),
          inv.baseUnit,
          actorId,
          item.id,
          `Modifier ${opt.inventoryEffect}: ${item.nameSnapshot}`,
        );
      } else if (opt.inventoryEffect === ModifierInventoryEffect.REMOVE) {
        await this.applyStockDelta(
          tx,
          inv.id,
          effectQty,
          inv.baseUnit,
          actorId,
          item.id,
          `Modifier REMOVE restore: ${item.nameSnapshot}`,
        );
      }
    }
  }

  private async applyStockDelta(
    tx: Tx,
    inventoryItemId: string,
    delta: Prisma.Decimal,
    unit: string,
    actorId: string | null,
    orderItemId: string,
    reason: string,
  ) {
    const inv = await tx.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });
    if (!inv) throw new NotFoundException('Inventory item not found');

    if (delta.isNeg()) {
      const next = new Prisma.Decimal(inv.currentStock).add(delta);
      if (next.isNeg()) {
        throw new BadRequestException(
          `Insufficient stock for ${inv.name}: need ${delta.abs().toString()} ${unit}, have ${inv.currentStock.toString()} ${unit}`,
        );
      }
    }

    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { increment: delta } },
    });
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        type: InventoryMovementType.sale_consumption,
        quantity: delta.abs(),
        unit,
        reason,
        actorId,
        referenceType: 'order_item',
        referenceId: orderItemId,
      },
    });
  }

  private async recomputeOrderStatus(tx: Tx, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;
    if (
      order.status === OrderStatus.paid ||
      order.status === OrderStatus.partially_paid ||
      order.status === OrderStatus.refunded
    ) {
      return;
    }

    const statuses = order.items.map((i) => i.status);
    let next: OrderStatus = order.status;

    if (statuses.every((s) => s === OrderItemStatus.cancelled)) {
      next = OrderStatus.cancelled;
    } else if (
      statuses.every(
        (s) =>
          s === OrderItemStatus.voided ||
          s === OrderItemStatus.cancelled ||
          s === OrderItemStatus.comped,
      ) &&
      statuses.some((s) => s === OrderItemStatus.voided)
    ) {
      next = OrderStatus.voided;
    } else if (
      statuses
        .filter(
          (s) =>
            s !== OrderItemStatus.cancelled &&
            s !== OrderItemStatus.voided &&
            s !== OrderItemStatus.comped,
        )
        .every((s) => s === OrderItemStatus.served)
    ) {
      next = OrderStatus.served;
    } else if (statuses.some((s) => s === OrderItemStatus.ready)) {
      next = OrderStatus.ready;
    } else if (statuses.some((s) => s === OrderItemStatus.preparing)) {
      next = OrderStatus.preparing;
    } else if (statuses.some((s) => s === OrderItemStatus.submitted)) {
      next = OrderStatus.submitted;
    } else if (statuses.some((s) => s === OrderItemStatus.placed)) {
      next = OrderStatus.placed;
    }

    if (
      next !== order.status &&
      canTransitionOrder(order.status as OrderState, next as OrderState)
    ) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: next },
      });
    } else if (next !== order.status) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: next },
      });
    }
  }

  private async pickFreeWaiterId(tx: Tx): Promise<string | null> {
    let candidates = await this.shiftsLookup.findOnShiftEmployees(Role.WAITER);
    if (candidates.length === 0) {
      candidates = await tx.employee.findMany({
        where: { role: Role.WAITER, isActive: true, archivedAt: null },
        select: { id: true, fullName: true, role: true },
      });
    }
    if (candidates.length === 0) return null;

    const openCounts = await tx.tableSession.groupBy({
      by: ['waiterId'],
      where: {
        status: SessionStatus.OPEN,
        waiterId: { in: candidates.map((c) => c.id) },
      },
      _count: { _all: true },
    });
    const countById = new Map(
      openCounts.map((row) => [row.waiterId!, row._count._all]),
    );

    candidates.sort((a, b) => {
      const ca = countById.get(a.id) ?? 0;
      const cb = countById.get(b.id) ?? 0;
      if (ca !== cb) return ca - cb;
      return a.fullName.localeCompare(b.fullName);
    });

    return candidates[0]?.id ?? null;
  }

  private async notifyGuestOrderPlaced(order: {
    id: string;
    orderNumber: number | string;
    sessionId: string;
    waiterId: string | null;
    session?: {
      table?: { number: number | string } | null;
    } | null;
  }) {
    const tableLabel = order.session?.table?.number ?? '—';
    const notifications =
      (await this.settings.get<{
        onQrOrder?: boolean;
        soundOn?: boolean;
      }>('notifications', { onQrOrder: true, soundOn: true })) ?? {};

    if (notifications.onQrOrder !== false) {
      await this.notifications.create({
        type: 'order.placed',
        title: `New QR order #${order.orderNumber}`,
        body: `Table ${tableLabel} placed an order`,
        sessionId: order.sessionId,
        payload: {
          orderId: order.id,
          sessionId: order.sessionId,
          sound: 'order.placed',
        },
        broadcastRoom: 'managers',
      });
    }

    if (order.waiterId) {
      await this.notifications.create({
        type: 'order.assigned',
        title: `Order #${order.orderNumber} assigned to you`,
        body: `Table ${tableLabel} — send to kitchen when ready`,
        employeeId: order.waiterId,
        sessionId: order.sessionId,
        payload: {
          orderId: order.id,
          sessionId: order.sessionId,
          sound: 'order.assigned',
        },
      });
    }
  }

  private async notifyKitchenNewOrder(order: {
    id: string;
    orderNumber: number | string;
    sessionId: string;
    session?: {
      table?: { number: number | string } | null;
    } | null;
  }) {
    const tableLabel = order.session?.table?.number ?? '—';
    await this.notifications.create({
      type: 'order.kitchen',
      title: `Kitchen ticket #${order.orderNumber}`,
      body: `Table ${tableLabel} — new ticket`,
      sessionId: order.sessionId,
      payload: {
        orderId: order.id,
        sessionId: order.sessionId,
        sound: 'order.kitchen',
      },
      broadcastRoom: 'kds',
    });
    // KDS + managers both need the ticket event for sound + refresh.
    this.realtime.emitToRoom('kds', 'order.submitted', jsonSafe(order));
    this.realtime.emitToRoom('managers', 'order.submitted', jsonSafe(order));
  }

  private async notifyStatusChange(
    item: { id: string; nameSnapshot: string; orderId: string; guestId?: string | null },
    sessionId: string,
    status: 'preparing' | 'ready' | 'served',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: item.orderId },
      select: {
        id: true,
        orderNumber: true,
        waiterId: true,
        session: {
          select: {
            table: {
              select: {
                id: true,
                number: true,
              },
            },
          },
        },
      },
    });
    if (!order) return;

    const tableLabel = order.session.table.number;
    const guestPath = `/t/${order.session.table.id}`;
    const titles = {
      preparing: `${item.nameSnapshot} is preparing`,
      ready: `${item.nameSnapshot} is ready`,
      served: `${item.nameSnapshot} served`,
    } as const;

    if (order.waiterId && status !== 'served') {
      const notifications =
        (await this.settings.get<{ onOrderReady?: boolean }>('notifications', {
          onOrderReady: true,
        })) ?? {};
      if (status !== 'ready' || notifications.onOrderReady !== false) {
        await this.notifications.create({
          type: status === 'ready' ? 'order.ready' : 'order.preparing',
          title: titles[status],
          body: `Table ${tableLabel} · order #${order.orderNumber}`,
          employeeId: order.waiterId,
          sessionId,
          payload: {
            orderId: order.id,
            orderItemId: item.id,
            status,
            sound: status === 'ready' ? 'order.ready' : 'order.preparing',
            url: '/app/orders',
          },
        });
      }
    }

    // Guest closed-browser / iOS Home Screen alerts
    if (item.guestId && (status === 'preparing' || status === 'ready')) {
      await this.notifications.pushGuest({
        type: status === 'ready' ? 'order.ready' : 'order.preparing',
        title: titles[status],
        body:
          status === 'ready'
            ? 'Your dish is ready — a waiter will bring it soon'
            : 'The kitchen has started your order',
        guestId: item.guestId,
        sessionId,
        url: guestPath,
        payload: {
          orderId: order.id,
          orderItemId: item.id,
          status,
        },
      });
    }

    this.realtime.emitToRoom(`session:${sessionId}`, 'order.status', {
      orderId: order.id,
      orderItemId: item.id,
      name: item.nameSnapshot,
      status,
      tableNumber: tableLabel,
    });
  }

  private emitStaffRooms(
    sessionId: string,
    event: string,
    payload: unknown,
  ) {
    const safe = jsonSafe(payload);
    this.realtime.emitToRoom('floor', event, safe);
    this.realtime.emitToRoom('managers', event, safe);
    this.realtime.emitToRoom(`session:${sessionId}`, event, safe);
  }

  private emitOrderRooms(
    sessionId: string,
    event: string,
    payload: unknown,
  ) {
    const safe = jsonSafe(payload);
    this.realtime.emitToRoom('kds', event, safe);
    this.realtime.emitToRoom('floor', event, safe);
    this.realtime.emitToRoom(`session:${sessionId}`, event, safe);
  }
}
