import { api, apiBlob } from '@/lib/api';

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SalesHistoryItem = {
  id: string;
  transactionNumber: string;
  sessionId: string;
  cashierId: string | null;
  guestId: string | null;
  subtotal: string | number;
  discountAmount: string | number;
  taxAmount: string | number;
  taxLabel: string | null;
  tipAmount: string | number;
  total: string | number;
  status: string;
  createdAt: string;
  cashier: { id: string; fullName: string } | null;
  session: {
    id: string;
    table: { id: string; number: string | number; label: string | null } | null;
  } | null;
  payments: {
    id: string;
    method: string;
    amount: string | number;
    reference: string | null;
  }[];
  refunds: { id: string; amount: string | number; reason: string | null }[];
};

export type EndOfDayReport = {
  date: string;
  gross: number;
  net: number;
  discounts: number;
  comps: number;
  tax: number;
  tips: number;
  refunds: number;
  voids: number;
  paymentMethods: Record<string, number>;
  orderCount: number;
  transactionCount: number;
  aov: number;
  tills: {
    id: string;
    cashier: { id: string; fullName: string } | null;
    openedAt: string;
    closedAt: string | null;
    openingBalance: string | number;
    expectedCash: string | number | null;
    actualCash: string | number | null;
    variance: string | number | null;
  }[];
};

export type MarginsReport = {
  from: string;
  to: string;
  note?: string;
  dishes: {
    menuItemId: string;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    qty: number;
    revenue: number;
    theoreticalCost: number;
    incompleteCost: boolean;
    theoreticalMargin: number;
    theoreticalMarginPercent: number;
  }[];
  categories: {
    categoryId: string | null;
    categoryName: string | null;
    revenue: number;
    theoreticalCost: number;
    theoreticalMargin: number;
    theoreticalMarginPercent: number;
  }[];
};

export type ActivityItem = {
  id: string;
  actorId: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    role: string;
    designation: string | null;
  } | null;
};

export type SalesTrend = {
  from: string;
  to: string;
  totalSales: number;
  series: { date: string; sales: number; count: number; aov: number }[];
};

export function fetchSalesTrend(from: string, to: string) {
  return api<SalesTrend>(
    `/reports/sales-trend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function fetchSalesHistory(params: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  search?: string;
  method?: string;
  mine?: boolean;
  cashierId?: string;
} = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.search) q.set('search', params.search);
  if (params.method) q.set('method', params.method);
  if (params.mine) q.set('mine', 'true');
  if (params.cashierId) q.set('cashierId', params.cashierId);
  const qs = q.toString();
  return api<Paginated<SalesHistoryItem>>(
    `/reports/sales-history${qs ? `?${qs}` : ''}`,
  );
}

export type CashierSummary = {
  from: string;
  to: string;
  cashierId: string;
  scopedToSelf: boolean;
  transactionCount: number;
  net: number;
  tips: number;
  discounts: number;
  tax: number;
  refunds: number;
  aov: number;
  byMethod: Record<string, { count: number; amount: number }>;
};

export function fetchCashierSummary(params: {
  from: string;
  to: string;
  mine?: boolean;
  cashierId?: string;
}) {
  const q = new URLSearchParams();
  q.set('from', params.from);
  q.set('to', params.to);
  if (params.mine) q.set('mine', 'true');
  if (params.cashierId) q.set('cashierId', params.cashierId);
  return api<CashierSummary>(`/reports/cashier-summary?${q.toString()}`);
}

export function fetchEndOfDay(date: string) {
  return api<EndOfDayReport>(
    `/reports/end-of-day?date=${encodeURIComponent(date)}`,
  );
}

export function fetchMargins(from: string, to: string) {
  return api<MarginsReport>(
    `/reports/margins?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export type YieldVarianceReport = {
  from: string;
  to: string;
  summary: {
    batchCount: number;
    totalExpected: number;
    totalActual: number;
    totalVariance: number;
    totalVariancePercent: number | null;
  };
  batches: {
    id: string;
    createdAt: string;
    recipeId: string;
    recipeName: string;
    outputItemId: string;
    outputItemName: string;
    unit: string;
    batchSizeLabel: string;
    expectedYield: number;
    actualYield: number;
    variance: number;
    variancePercent: number | null;
    notes: string | null;
    actor: { id: string; fullName: string } | null;
  }[];
};

export function fetchYieldVariance(from: string, to: string) {
  return api<YieldVarianceReport>(
    `/reports/yield-variance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export type StaffPerformanceReport = {
  from: string;
  to: string;
  summary: {
    activeStaff: number;
    teamFloorSales: number;
    teamCheckoutSales: number;
    teamOrders: number;
    teamTips: number;
  };
  insights: { id: string; title: string; detail: string }[];
  daily: {
    date: string;
    floorSales: number;
    checkoutSales: number;
    orders: number;
  }[];
  staff: {
    employeeId: string;
    fullName: string;
    role: string;
    designation: string | null;
    orderCount: number;
    attributedSales: number;
    averageOrderValue: number;
    checkoutCount: number;
    checkoutSales: number;
    checkoutTips: number;
    checkoutAov: number;
    voidCount: number;
    totalActivity: number;
  }[];
};

export function fetchStaffPerformance(from: string, to: string) {
  return api<StaffPerformanceReport>(
    `/reports/staff-performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function fetchActivity(params: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  actionType?: string;
} = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.actionType) q.set('actionType', params.actionType);
  const qs = q.toString();
  return api<Paginated<ActivityItem>>(
    `/audit/activity${qs ? `?${qs}` : ''}`,
  );
}

async function downloadBlob(path: string, filename: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSalesCsv(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return downloadBlob(
    `/reports/export/sales${qs ? `?${qs}` : ''}`,
    'sales.csv',
  );
}

export function downloadActivityCsv(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return downloadBlob(
    `/reports/export/activity${qs ? `?${qs}` : ''}`,
    'activity.csv',
  );
}
