import { Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderStatus,
  Prisma,
  SessionStatus,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/auth.decorators';
import {
  paginationArgs,
  paginatedResult,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { humanizeActivityAction } from '../common/humanize-activity';
import {
  CashierSummaryQueryDto,
  DateRangeQueryDto,
  EndOfDayQueryDto,
  ExportQueryDto,
  SalesHistoryQueryDto,
} from './dto/reports.dto';

function dayBounds(dateIso: string): { start: Date; end: Date } {
  const d = new Date(dateIso);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function rangeBounds(from: string, to: string): { start: Date; end: Date } {
  const start = dayBounds(from).start;
  const end = dayBounds(to).end;
  return { start, end };
}

function startOfWeek(d: Date): Date {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = start.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday-start week
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ];
  return lines.join('\n');
}

function n(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async resolveCashierScope(
    user: AuthUser,
    opts: { mine?: boolean; cashierId?: string },
  ): Promise<string | undefined> {
    const perms = await this.settings.permissionsForRole(user.role);
    const canSeeAll = perms.includes('reports.view');
    if (opts.mine || !canSeeAll) return user.id;
    return opts.cashierId;
  }

  async dashboard(query: DateRangeQueryDto) {
    const { start, end } = rangeBounds(query.from, query.to);
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const [
      transactions,
      openSessions,
      orderItems,
      lowStockCandidates,
      tables,
      pipelineOrders,
      activeSpecials,
      weekShifts,
      payrollOpen,
      payrollDue,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          status: 'completed',
        },
        include: { payments: true },
      }),
      this.prisma.tableSession.count({
        where: { status: SessionStatus.OPEN },
      }),
      this.prisma.orderItem.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          status: {
            notIn: [
              OrderItemStatus.cancelled,
              OrderItemStatus.voided,
              OrderItemStatus.draft,
            ],
          },
        },
        select: {
          nameSnapshot: true,
          quantity: true,
          menuItemId: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          archivedAt: null,
          isActive: true,
          lowStockThreshold: { not: null },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.diningTable.findMany({
        where: { isArchived: false },
        select: { id: true, status: true, seats: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: {
          status: {
            in: [
              OrderStatus.submitted,
              OrderStatus.preparing,
              OrderStatus.ready,
              OrderStatus.served,
              OrderStatus.partially_paid,
            ],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.special.findMany({
        where: { isActive: true },
        include: {
          menuItem: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.employeeShift.findMany({
        where: {
          workDate: { gte: weekStart, lt: weekEnd },
        },
        include: {
          employee: { select: { id: true, fullName: true, role: true } },
          shiftType: {
            select: { id: true, name: true, startTime: true, endTime: true },
          },
        },
        orderBy: [{ workDate: 'asc' }],
        take: 100,
      }),
      this.prisma.payrollRecord.count({
        where: { status: 'DUE' },
      }),
      this.prisma.payrollRecord.aggregate({
        where: { status: 'DUE' },
        _sum: { amountDue: true },
      }),
    ]);

    const sales = transactions.reduce((sum, t) => sum + n(t.total), 0);
    const orderCount = transactions.length;
    const aov = orderCount ? sales / orderCount : 0;

    const dishMap = new Map<string, { name: string; qty: number }>();
    for (const item of orderItems) {
      const key = item.menuItemId ?? item.nameSnapshot;
      const prev = dishMap.get(key) ?? { name: item.nameSnapshot, qty: 0 };
      prev.qty += item.quantity;
      dishMap.set(key, prev);
    }
    const topDishes = [...dishMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const lowStock = lowStockCandidates.filter(
      (i) =>
        i.lowStockThreshold != null &&
        n(i.currentStock) <= n(i.lowStockThreshold),
    );

    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sales: 0,
      count: 0,
    }));
    for (const t of transactions) {
      const hour = t.createdAt.getUTCHours();
      byHour[hour].sales += n(t.total);
      byHour[hour].count += 1;
    }

    const occupied = tables.filter((t) => t.status === 'OCCUPIED').length;
    const reserved = tables.filter((t) => t.status === 'RESERVED').length;
    const free = tables.filter((t) => t.status === 'FREE').length;
    const needsCleaning = tables.filter(
      (t) => t.status === 'NEEDS_CLEANING',
    ).length;
    const totalTables = tables.length;
    const occupancyPercent = totalTables
      ? round2((occupied / totalTables) * 100)
      : 0;

    const pipeline: Record<string, number> = {};
    let openOrders = 0;
    for (const row of pipelineOrders) {
      pipeline[row.status] = row._count._all;
      openOrders += row._count._all;
    }

    return {
      from: query.from,
      to: query.to,
      sales: round2(sales),
      aov: round2(aov),
      orderCount,
      openSessions,
      openOrders,
      occupancy: {
        totalTables,
        occupied,
        reserved,
        free,
        needsCleaning,
        occupancyPercent,
      },
      pipeline,
      topDishes,
      lowStock: lowStock.map((i) => ({
        id: i.id,
        name: i.name,
        currentStock: n(i.currentStock),
        lowStockThreshold: n(i.lowStockThreshold),
        baseUnit: i.baseUnit,
      })),
      specials: activeSpecials.map((s) => ({
        id: s.id,
        type: s.type,
        menuItem: s.menuItem,
        specialPrice: s.specialPrice != null ? n(s.specialPrice) : null,
        quantityRemaining: s.quantityRemaining,
        weekday: s.weekday,
      })),
      roster: weekShifts.map((s) => ({
        id: s.id,
        date: s.workDate,
        employee: s.employee,
        shiftType: s.shiftType,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      payrollSummary: {
        openCount: payrollOpen,
        amountDue: round2(n(payrollDue._sum.amountDue)),
      },
      salesByHour: byHour,
    };
  }

  async salesTrend(query: DateRangeQueryDto) {
    const { start, end } = rangeBounds(query.from, query.to);
    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: 'completed',
      },
      select: {
        createdAt: true,
        total: true,
        discountAmount: true,
        tipAmount: true,
        taxAmount: true,
      },
    });

    const byDay = new Map<
      string,
      { date: string; sales: number; count: number; tips: number; tax: number }
    >();

    for (
      let d = new Date(start);
      d < end;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, sales: 0, count: 0, tips: 0, tax: 0 });
    }

    for (const t of transactions) {
      const key = t.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(key) ?? {
        date: key,
        sales: 0,
        count: 0,
        tips: 0,
        tax: 0,
      };
      row.sales += n(t.total);
      row.count += 1;
      row.tips += n(t.tipAmount);
      row.tax += n(t.taxAmount);
      byDay.set(key, row);
    }

    const series = [...byDay.values()].map((r) => ({
      date: r.date,
      sales: round2(r.sales),
      count: r.count,
      tips: round2(r.tips),
      tax: round2(r.tax),
      aov: r.count ? round2(r.sales / r.count) : 0,
    }));

    const totalSales = series.reduce((s, r) => s + r.sales, 0);
    return {
      from: query.from,
      to: query.to,
      totalSales: round2(totalSales),
      dayCount: series.length,
      series,
    };
  }

  async salesHistory(query: SalesHistoryQueryDto, user: AuthUser) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const cashierId = await this.resolveCashierScope(user, query);
    const where: Prisma.TransactionWhereInput = {
      ...(cashierId ? { cashierId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: dayBounds(query.from).start } : {}),
              ...(query.to ? { lt: dayBounds(query.to).end } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                transactionNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                session: {
                  table: {
                    number: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.method
        ? { payments: { some: { method: query.method } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          payments: true,
          cashier: { select: { id: true, fullName: true } },
          session: {
            select: {
              id: true,
              table: { select: { id: true, number: true, label: true } },
            },
          },
          refunds: true,
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return paginatedResult(items, total, page, pageSize);
  }

  async cashierSummary(query: CashierSummaryQueryDto, user: AuthUser) {
    const cashierId =
      (await this.resolveCashierScope(user, query)) ?? user.id;
    const { start, end } = rangeBounds(query.from, query.to);

    const [transactions, refunds] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          cashierId,
          createdAt: { gte: start, lt: end },
          status: 'completed',
        },
        include: { payments: true },
      }),
      this.prisma.refund.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          transaction: { cashierId },
        },
      }),
    ]);

    const byMethod: Record<string, { count: number; amount: number }> = {};
    let net = 0;
    let tips = 0;
    let discounts = 0;
    let tax = 0;

    for (const t of transactions) {
      net += n(t.total);
      tips += n(t.tipAmount);
      discounts += n(t.discountAmount);
      tax += n(t.taxAmount);
      for (const p of t.payments) {
        const cur = byMethod[p.method] ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += n(p.amount);
        byMethod[p.method] = cur;
      }
    }

    const refundTotal = refunds.reduce((s, r) => s + n(r.amount), 0);

    return {
      from: query.from,
      to: query.to,
      cashierId,
      scopedToSelf: cashierId === user.id,
      transactionCount: transactions.length,
      net: round2(net),
      tips: round2(tips),
      discounts: round2(discounts),
      tax: round2(tax),
      refunds: round2(refundTotal),
      aov: transactions.length ? round2(net / transactions.length) : 0,
      byMethod: Object.fromEntries(
        Object.entries(byMethod).map(([method, v]) => [
          method,
          { count: v.count, amount: round2(v.amount) },
        ]),
      ),
    };
  }

  async endOfDay(query: EndOfDayQueryDto) {
    const { start, end } = dayBounds(query.date);

    const [transactions, refunds, voids, comps, tills, orderCount] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: { createdAt: { gte: start, lt: end } },
          include: { payments: true },
        }),
        this.prisma.refund.findMany({
          where: { createdAt: { gte: start, lt: end } },
        }),
        this.prisma.orderException.findMany({
          where: {
            createdAt: { gte: start, lt: end },
            type: { in: ['void', 'VOID', 'order_void', 'item_void'] },
          },
        }),
        this.prisma.orderItem.findMany({
          where: {
            updatedAt: { gte: start, lt: end },
            status: OrderItemStatus.comped,
          },
        }),
        this.prisma.tillSession.findMany({
          where: {
            OR: [
              { openedAt: { gte: start, lt: end } },
              { closedAt: { gte: start, lt: end } },
            ],
          },
          include: {
            cashier: { select: { id: true, fullName: true } },
            movements: true,
          },
        }),
        this.prisma.order.count({
          where: {
            submittedAt: { gte: start, lt: end },
            status: { notIn: [OrderStatus.draft, OrderStatus.cancelled] },
          },
        }),
      ]);

    const completed = transactions.filter((t) => t.status === 'completed');
    const gross = completed.reduce(
      (s, t) => s + n(t.subtotal) + n(t.taxAmount) + n(t.tipAmount),
      0,
    );
    const discounts = completed.reduce((s, t) => s + n(t.discountAmount), 0);
    const tax = completed.reduce((s, t) => s + n(t.taxAmount), 0);
    const tips = completed.reduce((s, t) => s + n(t.tipAmount), 0);
    const net = completed.reduce((s, t) => s + n(t.total), 0);
    const refundTotal = refunds.reduce((s, r) => s + n(r.amount), 0);
    const compsTotal = comps.reduce(
      (s, i) => s + n(i.priceSnapshot) * i.quantity,
      0,
    );

    const paymentMethods: Record<string, number> = {};
    for (const t of completed) {
      for (const p of t.payments) {
        paymentMethods[p.method] =
          (paymentMethods[p.method] ?? 0) + n(p.amount);
      }
    }

    const txCount = completed.length;
    const aov = txCount ? net / txCount : 0;

    const tillSummary = tills.map((t) => ({
      id: t.id,
      cashier: t.cashier,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      openingBalance: n(t.openingBalance),
      expectedCash: t.expectedCash != null ? n(t.expectedCash) : null,
      actualCash: t.actualCash != null ? n(t.actualCash) : null,
      variance: t.variance != null ? n(t.variance) : null,
    }));

    return {
      date: query.date,
      gross: round2(gross),
      net: round2(net),
      discounts: round2(discounts),
      comps: round2(compsTotal),
      tax: round2(tax),
      tips: round2(tips),
      refunds: round2(refundTotal),
      voids: voids.length,
      paymentMethods,
      orderCount,
      transactionCount: txCount,
      aov: round2(aov),
      tills: tillSummary,
    };
  }

  async margins(query: DateRangeQueryDto) {
    const { start, end } = rangeBounds(query.from, query.to);

    const soldItems = await this.prisma.orderItem.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: {
          notIn: [
            OrderItemStatus.cancelled,
            OrderItemStatus.voided,
            OrderItemStatus.draft,
          ],
        },
        menuItemId: { not: null },
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            price: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
            recipes: {
              where: { isActive: true, kind: 'dish' },
              include: { items: true },
              take: 1,
            },
          },
        },
        modifiers: true,
      },
    });

    const costCache = new Map<string, number | null>();
    const resolveUnitCost = async (inventoryItemId: string) => {
      if (costCache.has(inventoryItemId)) return costCache.get(inventoryItemId)!;
      const latest = await this.prisma.stockReceipt.findFirst({
        where: { inventoryItemId, unitCost: { not: null } },
        orderBy: { receivedAt: 'desc' },
      });
      const cost = latest?.unitCost != null ? Number(latest.unitCost) : null;
      costCache.set(inventoryItemId, cost);
      return cost;
    };

    type Agg = {
      menuItemId: string;
      name: string;
      categoryId: string | null;
      categoryName: string | null;
      qty: number;
      revenue: number;
      theoreticalCost: number;
      incompleteCost: boolean;
    };
    const byDish = new Map<string, Agg>();

    for (const item of soldItems) {
      if (!item.menuItem) continue;
      const key = item.menuItem.id;
      const modRevenue = item.modifiers.reduce(
        (s, m) => s + n(m.priceSnapshot),
        0,
      );
      const lineRevenue =
        (n(item.priceSnapshot) + modRevenue) * item.quantity;

      let lineCost = 0;
      let incomplete = false;
      const recipe = item.menuItem.recipes[0];
      if (!recipe) {
        incomplete = true;
      } else {
        for (const ri of recipe.items) {
          const unitCost = await resolveUnitCost(ri.inventoryItemId);
          if (unitCost == null) {
            incomplete = true;
            continue;
          }
          lineCost += unitCost * Number(ri.quantity) * item.quantity;
        }
      }

      const prev = byDish.get(key) ?? {
        menuItemId: key,
        name: item.menuItem.name,
        categoryId: item.menuItem.categoryId,
        categoryName: item.menuItem.category?.name ?? null,
        qty: 0,
        revenue: 0,
        theoreticalCost: 0,
        incompleteCost: false,
      };
      prev.qty += item.quantity;
      prev.revenue += lineRevenue;
      prev.theoreticalCost += lineCost;
      prev.incompleteCost = prev.incompleteCost || incomplete;
      byDish.set(key, prev);
    }

    const dishes = [...byDish.values()].map((d) => {
      const margin = d.revenue - d.theoreticalCost;
      const marginPercent = d.revenue
        ? (margin / d.revenue) * 100
        : null;
      return {
        ...d,
        revenue: round2(d.revenue),
        theoreticalCost: round2(d.theoreticalCost),
        theoreticalMargin: round2(margin),
        theoreticalMarginPercent:
          marginPercent == null ? null : round2(marginPercent),
      };
    });

    const byCategory = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        revenue: number;
        theoreticalCost: number;
      }
    >();
    for (const d of dishes) {
      const key = d.categoryId ?? 'uncategorized';
      const prev = byCategory.get(key) ?? {
        categoryId: d.categoryId,
        categoryName: d.categoryName ?? 'Uncategorized',
        revenue: 0,
        theoreticalCost: 0,
      };
      prev.revenue += d.revenue;
      prev.theoreticalCost += d.theoreticalCost;
      byCategory.set(key, prev);
    }

    return {
      from: query.from,
      to: query.to,
      note: 'Theoretical recipe cost based on latest purchase unit costs; excludes physical stock variance.',
      dishes: dishes.sort((a, b) => b.revenue - a.revenue),
      categories: [...byCategory.values()].map((c) => ({
        ...c,
        revenue: round2(c.revenue),
        theoreticalCost: round2(c.theoreticalCost),
        theoreticalMargin: round2(c.revenue - c.theoreticalCost),
        theoreticalMarginPercent:
          c.revenue > 0
            ? round2(((c.revenue - c.theoreticalCost) / c.revenue) * 100)
            : null,
      })),
    };
  }

  async yieldVariance(query: DateRangeQueryDto) {
    const { start, end } = rangeBounds(query.from, query.to);
    const batches = await this.prisma.productionBatch.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      include: {
        recipe: { select: { id: true, name: true, yieldUnit: true } },
        outputItem: { select: { id: true, name: true, baseUnit: true } },
        actor: { select: { id: true, fullName: true } },
      },
    });

    const rows = batches.map((b) => {
      const expected = n(b.expectedYield);
      const actual = n(b.actualYield);
      const variance = actual - expected;
      const variancePercent =
        expected === 0 ? null : (variance / expected) * 100;
      return {
        id: b.id,
        createdAt: b.createdAt,
        recipeId: b.recipeId,
        recipeName: b.recipe.name,
        outputItemId: b.outputItemId,
        outputItemName: b.outputItem.name,
        unit: b.recipe.yieldUnit ?? b.outputItem.baseUnit,
        batchSizeLabel: b.batchSizeLabel,
        expectedYield: expected,
        actualYield: actual,
        variance,
        variancePercent:
          variancePercent == null
            ? null
            : Math.round(variancePercent * 10) / 10,
        notes: b.notes,
        actor: b.actor,
      };
    });

    const totalExpected = rows.reduce((s, r) => s + r.expectedYield, 0);
    const totalActual = rows.reduce((s, r) => s + r.actualYield, 0);
    const totalVariance = totalActual - totalExpected;

    return {
      from: query.from,
      to: query.to,
      summary: {
        batchCount: rows.length,
        totalExpected,
        totalActual,
        totalVariance,
        totalVariancePercent:
          totalExpected === 0
            ? null
            : Math.round((totalVariance / totalExpected) * 1000) / 10,
      },
      batches: rows,
    };
  }

  async handoffExport() {
    const [
      settings,
      employees,
      tables,
      categories,
      menuItems,
      inventoryItems,
      suppliers,
      recipes,
      shiftTypes,
    ] = await Promise.all([
      this.prisma.setting.findMany(),
      this.prisma.employee.findMany({
        select: {
          id: true,
          fullName: true,
          role: true,
          employeeCode: true,
          email: true,
          phone: true,
          designation: true,
          isActive: true,
          startDate: true,
          payStructure: true,
          baseAmount: true,
          paySchedule: true,
          archivedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.diningTable.findMany(),
      this.prisma.category.findMany(),
      this.prisma.menuItem.findMany({
        include: {
          modifierGroups: { include: { options: true } },
          specials: true,
        },
      }),
      this.prisma.inventoryItem.findMany(),
      this.prisma.supplier.findMany(),
      this.prisma.recipe.findMany({ include: { items: true } }),
      this.prisma.shiftType.findMany(),
    ]);

    const [transactions, movements, payroll, activity] = await Promise.all([
      this.prisma.transaction.findMany({
        include: { payments: true, refunds: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inventoryMovement.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payrollRecord.findMany(),
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: 50_000,
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      format: 'fajara-handoff-v1',
      note: 'Client-owned operational data export. Secrets/hashes excluded.',
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      employees,
      tables,
      categories,
      menuItems,
      inventoryItems,
      suppliers,
      recipes,
      shiftTypes,
      transactions,
      inventoryMovements: movements,
      payrollRecords: payroll,
      activityLogs: activity,
    };
  }

  // --- CSV exports ---

  async exportSalesCsv(query: ExportQueryDto): Promise<string> {
    const where = this.exportDateWhere(query);
    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        payments: true,
        cashier: { select: { fullName: true } },
        session: { select: { table: { select: { number: true } } } },
      },
    });

    return toCsv(
      [
        'transactionNumber',
        'createdAt',
        'table',
        'cashier',
        'subtotal',
        'discount',
        'tax',
        'tip',
        'total',
        'status',
        'methods',
      ],
      rows.map((r) => [
        r.transactionNumber,
        r.createdAt.toISOString(),
        r.session.table.number,
        r.cashier?.fullName ?? '',
        n(r.subtotal),
        n(r.discountAmount),
        n(r.taxAmount),
        n(r.tipAmount),
        n(r.total),
        r.status,
        r.payments.map((p) => p.method).join('|'),
      ]),
    );
  }

  async exportActivityCsv(query: ExportQueryDto): Promise<string> {
    const where = this.exportDateWhere(query, 'createdAt');
    const rows = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { fullName: true } } },
    });
    return toCsv(
      ['When', 'Who', 'What happened', 'Details'],
      rows.map((r) => [
        r.createdAt.toISOString(),
        r.actor?.fullName ?? 'System',
        humanizeActivityAction(r.actionType),
        r.description,
      ]),
    );
  }

  async exportPayrollCsv(query: ExportQueryDto): Promise<string> {
    const where: Prisma.PayrollRecordWhereInput =
      query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: dayBounds(query.from).start } : {}),
              ...(query.to ? { lte: dayBounds(query.to).start } : {}),
            },
          }
        : {};
    const rows = await this.prisma.payrollRecord.findMany({
      where,
      orderBy: { periodStart: 'asc' },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    });
    return toCsv(
      [
        'employee',
        'employeeCode',
        'periodStart',
        'periodEnd',
        'amountDue',
        'status',
        'paidAt',
        'method',
      ],
      rows.map((r) => [
        r.employee.fullName,
        r.employee.employeeCode ?? '',
        r.periodStart.toISOString().slice(0, 10),
        r.periodEnd.toISOString().slice(0, 10),
        n(r.amountDue),
        r.status,
        r.paidAt?.toISOString() ?? '',
        r.method ?? '',
      ]),
    );
  }

  async exportMenuCsv(): Promise<string> {
    const rows = await this.prisma.menuItem.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } } },
    });
    return toCsv(
      [
        'name',
        'category',
        'price',
        'station',
        'isAvailable',
        'isSoldOut',
        'allergens',
      ],
      rows.map((r) => [
        r.name,
        r.category?.name ?? '',
        n(r.price),
        r.station,
        r.isAvailable,
        r.isSoldOut,
        r.allergens.join('|'),
      ]),
    );
  }

  async exportInventoryMovementsCsv(query: ExportQueryDto): Promise<string> {
    const where = this.exportDateWhere(query);
    const rows = await this.prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        inventoryItem: { select: { name: true } },
        actor: { select: { fullName: true } },
      },
    });
    return toCsv(
      [
        'createdAt',
        'item',
        'type',
        'quantity',
        'unit',
        'reason',
        'actor',
        'referenceType',
        'referenceId',
      ],
      rows.map((r) => [
        r.createdAt.toISOString(),
        r.inventoryItem.name,
        r.type,
        n(r.quantity),
        r.unit,
        r.reason ?? '',
        r.actor?.fullName ?? '',
        r.referenceType ?? '',
        r.referenceId ?? '',
      ]),
    );
  }

  async staffPerformance(query: DateRangeQueryDto) {
    const { start, end } = rangeBounds(query.from, query.to);
    const from = query.from;
    const to = query.to;

    const employees = await this.prisma.employee.findMany({
      where: { archivedAt: null, isActive: true },
      select: {
        id: true,
        fullName: true,
        role: true,
        designation: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const orders = await this.prisma.order.findMany({
      where: {
        waiterId: { not: null },
        submittedAt: { gte: start, lt: end },
        status: {
          notIn: [
            OrderStatus.draft,
            OrderStatus.cancelled,
            OrderStatus.voided,
          ],
        },
      },
      select: {
        waiterId: true,
        submittedAt: true,
        items: {
          where: {
            status: {
              notIn: [
                OrderItemStatus.cancelled,
                OrderItemStatus.voided,
                OrderItemStatus.draft,
              ],
            },
          },
          select: { priceSnapshot: true, quantity: true },
        },
      },
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        cashierId: { not: null },
        createdAt: { gte: start, lt: end },
        status: 'completed',
      },
      select: {
        cashierId: true,
        total: true,
        tipAmount: true,
        createdAt: true,
      },
    });

    const voids = await this.prisma.orderException.groupBy({
      by: ['actorId'],
      where: {
        createdAt: { gte: start, lt: end },
        type: 'void',
      },
      _count: { _all: true },
    });

    type Acc = {
      orderCount: number;
      attributedSales: number;
      checkoutCount: number;
      checkoutSales: number;
      checkoutTips: number;
      voidCount: number;
    };
    const byId = new Map<string, Acc>();
    const ensure = (id: string): Acc => {
      let a = byId.get(id);
      if (!a) {
        a = {
          orderCount: 0,
          attributedSales: 0,
          checkoutCount: 0,
          checkoutSales: 0,
          checkoutTips: 0,
          voidCount: 0,
        };
        byId.set(id, a);
      }
      return a;
    };

    const dailyMap = new Map<
      string,
      { date: string; floorSales: number; checkoutSales: number; orders: number }
    >();
    const bumpDay = (
      iso: Date,
      patch: Partial<{ floorSales: number; checkoutSales: number; orders: number }>,
    ) => {
      const date = iso.toISOString().slice(0, 10);
      const cur = dailyMap.get(date) ?? {
        date,
        floorSales: 0,
        checkoutSales: 0,
        orders: 0,
      };
      cur.floorSales += patch.floorSales ?? 0;
      cur.checkoutSales += patch.checkoutSales ?? 0;
      cur.orders += patch.orders ?? 0;
      dailyMap.set(date, cur);
    };

    for (const order of orders) {
      if (!order.waiterId) continue;
      const acc = ensure(order.waiterId);
      acc.orderCount += 1;
      let sale = 0;
      for (const item of order.items) {
        sale += n(item.priceSnapshot) * item.quantity;
      }
      acc.attributedSales += sale;
      bumpDay(order.submittedAt, { floorSales: sale, orders: 1 });
    }

    for (const tx of transactions) {
      if (!tx.cashierId) continue;
      const acc = ensure(tx.cashierId);
      acc.checkoutCount += 1;
      acc.checkoutSales += n(tx.total);
      acc.checkoutTips += n(tx.tipAmount);
      bumpDay(tx.createdAt, { checkoutSales: n(tx.total) });
    }

    for (const v of voids) {
      ensure(v.actorId).voidCount += v._count._all;
    }

    const staff = employees
      .map((e) => {
        const a = byId.get(e.id) ?? {
          orderCount: 0,
          attributedSales: 0,
          checkoutCount: 0,
          checkoutSales: 0,
          checkoutTips: 0,
          voidCount: 0,
        };
        const aov = a.orderCount ? a.attributedSales / a.orderCount : 0;
        const checkoutAov = a.checkoutCount
          ? a.checkoutSales / a.checkoutCount
          : 0;
        return {
          employeeId: e.id,
          fullName: e.fullName,
          role: e.role,
          designation: e.designation,
          orderCount: a.orderCount,
          attributedSales: round2(a.attributedSales),
          averageOrderValue: round2(aov),
          checkoutCount: a.checkoutCount,
          checkoutSales: round2(a.checkoutSales),
          checkoutTips: round2(a.checkoutTips),
          checkoutAov: round2(checkoutAov),
          voidCount: a.voidCount,
          totalActivity: a.orderCount + a.checkoutCount,
        };
      })
      .filter((s) => s.totalActivity > 0 || s.voidCount > 0)
      .sort((a, b) => b.attributedSales + b.checkoutSales - (a.attributedSales + a.checkoutSales));

    const daily = [...dailyMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const insights: { id: string; title: string; detail: string }[] = [];
    const topFloor = [...staff].sort(
      (a, b) => b.attributedSales - a.attributedSales,
    )[0];
    const topCheckout = [...staff].sort(
      (a, b) => b.checkoutSales - a.checkoutSales,
    )[0];
    const topAov = [...staff]
      .filter((s) => s.orderCount >= 3)
      .sort((a, b) => b.averageOrderValue - a.averageOrderValue)[0];
    const topOrders = [...staff].sort((a, b) => b.orderCount - a.orderCount)[0];
    const mostVoids = [...staff]
      .filter((s) => s.voidCount > 0)
      .sort((a, b) => b.voidCount - a.voidCount)[0];

    if (topFloor && topFloor.attributedSales > 0) {
      insights.push({
        id: 'top-floor',
        title: 'Top floor sales',
        detail: `${topFloor.fullName} led waiter-attributed sales at ${round2(topFloor.attributedSales).toFixed(0)} across ${topFloor.orderCount} orders.`,
      });
    }
    if (topCheckout && topCheckout.checkoutSales > 0) {
      insights.push({
        id: 'top-checkout',
        title: 'Top checkout',
        detail: `${topCheckout.fullName} settled ${round2(topCheckout.checkoutSales).toFixed(0)} over ${topCheckout.checkoutCount} transactions (${round2(topCheckout.checkoutTips).toFixed(0)} tips).`,
      });
    }
    if (topAov) {
      insights.push({
        id: 'top-aov',
        title: 'Highest average order',
        detail: `${topAov.fullName} averaged ${round2(topAov.averageOrderValue).toFixed(0)} per order (${topAov.orderCount} orders).`,
      });
    }
    if (topOrders && topOrders.orderCount > 0) {
      insights.push({
        id: 'most-orders',
        title: 'Busiest waiter',
        detail: `${topOrders.fullName} handled ${topOrders.orderCount} orders in this range.`,
      });
    }
    if (mostVoids) {
      insights.push({
        id: 'voids',
        title: 'Void activity',
        detail: `${mostVoids.fullName} recorded ${mostVoids.voidCount} void-related actions — review if this looks high.`,
      });
    }
    if (staff.length === 0) {
      insights.push({
        id: 'empty',
        title: 'No staff activity',
        detail:
          'No waiter orders or cashier settlements in this range. Widen the dates or confirm seed/demo traffic.',
      });
    }

    const teamFloor = round2(
      staff.reduce((s, r) => s + r.attributedSales, 0),
    );
    const teamCheckout = round2(
      staff.reduce((s, r) => s + r.checkoutSales, 0),
    );
    const teamOrders = staff.reduce((s, r) => s + r.orderCount, 0);

    return {
      from,
      to,
      summary: {
        activeStaff: staff.length,
        teamFloorSales: teamFloor,
        teamCheckoutSales: teamCheckout,
        teamOrders,
        teamTips: round2(staff.reduce((s, r) => s + r.checkoutTips, 0)),
      },
      insights,
      daily: daily.map((d) => ({
        date: d.date,
        floorSales: round2(d.floorSales),
        checkoutSales: round2(d.checkoutSales),
        orders: d.orders,
      })),
      staff,
    };
  }

  private exportDateWhere(
    query: ExportQueryDto,
    field: 'createdAt' = 'createdAt',
  ): Prisma.TransactionWhereInput &
    Prisma.ActivityLogWhereInput &
    Prisma.InventoryMovementWhereInput {
    if (!query.from && !query.to) return {};
    return {
      [field]: {
        ...(query.from ? { gte: dayBounds(query.from).start } : {}),
        ...(query.to ? { lt: dayBounds(query.to).end } : {}),
      },
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
