import { api } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';
import { newClientRequestId as offlineId } from '@/lib/offlineWriteQueue';

export type PaymentLine = {
  method: string;
  amount: number;
  reference?: string;
  cashReceived?: number;
};

export type SettlePaymentBody = {
  sessionId: string;
  guestId?: string;
  clientRequestId: string;
  discountAmount?: number;
  tipAmount?: number;
  payments: PaymentLine[];
  approverEmployeeId?: string;
  approverPin?: string;
};

export type RefundBody = {
  transactionId: string;
  amount: number;
  reason: string;
  method?: string;
  approverEmployeeId: string;
  approverPin: string;
};

export type FloorTable = {
  id: string;
  number: string;
  label: string | null;
  seats: number;
  status: string;
  activeSession: {
    id: string;
    status: string;
    openedAt: string;
    guestCount: number;
    waiter: { id: string; fullName: string } | null;
    guests: { id: string; displayName: string; sortOrder: number }[];
    settlement: {
      orderCount: number;
      unpaidOrderCount: number;
      transactionTotal: number;
      estimatedOrderTotal: number;
      progressPercent: number | null;
    } | null;
  } | null;
};

export type TillSession = {
  id: string;
  cashierId: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: string | number;
  expectedCash?: string | number;
  actualCash?: string | number | null;
  variance?: string | number | null;
  deviceLabel?: string | null;
  notes?: string | null;
  movements: {
    id: string;
    type: string;
    amount: string | number;
    reason: string | null;
    createdAt: string;
  }[];
  cashier?: { id: string; fullName: string };
};

export type Transaction = {
  id: string;
  transactionNumber: string;
  sessionId: string;
  total: string | number;
  subtotal: string | number;
  discountAmount: string | number;
  tipAmount: string | number;
  taxAmount: string | number;
  status: string;
  createdAt: string;
  payments: { id: string; method: string; amount: string | number }[];
  refunds?: { id: string; amount: string | number; reason: string }[];
  cashier?: { id: string; fullName: string };
  session?: {
    id: string;
    table?: { id: string; number: string; label: string | null };
  };
};

export type Receipt = {
  restaurantName: string;
  logoUrl?: string | null;
  showLogo?: boolean;
  currency: string;
  transactionNumber: string;
  createdAt: string;
  table: { number: string; label: string | null };
  sessionId: string;
  orderIds?: string[];
  cashier: { id: string; fullName: string };
  waiter: { id: string; fullName: string } | null;
  guestId: string | null;
  lines: {
    name: string;
    quantity: number;
    unitPrice: string;
    modifiers: { name: string; price: string }[];
    guestName: string;
    status: string;
  }[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  taxLabel: string | null;
  tipAmount: string;
  total: string;
  payments: {
    method: string;
    amount: string;
    reference: string | null;
    cashReceived: string | null;
    cashChange: string | null;
  }[];
  refunds: {
    amount: string;
    reason: string;
    method: string | null;
    createdAt: string;
  }[];
  footer: string | null;
  status: string;
  isReprint?: boolean;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function fetchFloor() {
  return api<FloorTable[]>('/sessions/floor');
}

export function fetchPublicPaymentMethods() {
  return api<{ paymentMethods?: string[] }>('/settings/public', {
    public: true,
  }).then((s) => s.paymentMethods ?? ['Cash', 'Mobile Money', 'Card']);
}

export function fetchPublicFinance() {
  return api<{
    tax?: {
      inclusive?: boolean;
      ratePercent?: number;
      label?: string;
    };
    finance?: {
      tipsEnabled?: boolean;
      tipOptions?: number[];
      allowDiscounts?: boolean;
      maxDiscountAmt?: number;
      maxDiscountPct?: number;
    };
  }>('/settings/public', { public: true }).then((s) => ({
    tax: s.tax ?? { inclusive: false, ratePercent: 0, label: 'VAT' },
    ...(s.finance ?? {
      tipsEnabled: true,
      tipOptions: [5, 10, 15],
      allowDiscounts: true,
      maxDiscountPct: 10,
      maxDiscountAmt: 200,
    }),
  }));
}

export type BillPreviewLine = {
  id: string;
  orderId: string;
  orderNumber: number;
  name: string;
  quantity: number;
  unitPrice: string;
  modifiers: { name: string; price: string }[];
  guestId: string | null;
  guestName: string | null;
  status: string;
  lineTotal: string;
};

export type BillGuestShare = {
  id: string;
  displayName: string;
  sortOrder: number;
  unpaidItemCount: number;
  unpaidSubtotal: string;
  isSettled: boolean;
  hasUnpaid: boolean;
};

export type BillPreview = {
  sessionId: string;
  status: string;
  table: { id: string; number: string | number; label: string | null };
  guestCount: number;
  tax: { ratePercent: number; label: string; inclusive: boolean };
  lines: BillPreviewLine[];
  subtotal: string;
  shares: BillGuestShare[];
  unsettledGuestCount: number;
  settledGuestCount: number;
  unpaidItemCount: number;
};

export function fetchBillPreview(sessionId: string, guestId?: string) {
  const q = guestId ? `?guestId=${encodeURIComponent(guestId)}` : '';
  return api<BillPreview>(`/payments/session/${sessionId}/bill${q}`);
}

export function settlePayment(body: SettlePaymentBody) {
  const clientRequestId = body.clientRequestId || offlineId();
  return staffMutate<Transaction>('/payments/settle', {
    method: 'POST',
    body: { ...body, clientRequestId },
    scope: 'PAYMENT',
    label: 'Settle payment',
    clientRequestId,
    injectBodyClientRequestId: true,
    requireConfirmDiscard: true,
    optimisticResult: {
      id: `pending-txn-${clientRequestId}`,
      transactionNumber: 'PENDING',
      sessionId: body.sessionId,
      total: 0,
      subtotal: 0,
      discountAmount: body.discountAmount ?? 0,
      tipAmount: body.tipAmount ?? 0,
      taxAmount: 0,
      status: 'pending_sync',
      createdAt: new Date().toISOString(),
      payments: body.payments.map((p, i) => ({
        id: `pending-pay-${i}`,
        method: p.method,
        amount: p.amount,
      })),
      pendingSync: true,
      clientRequestId,
    } as Transaction & { pendingSync?: boolean; clientRequestId?: string },
  });
}

export function refundPayment(body: RefundBody) {
  return staffMutate('/payments/refund', {
    method: 'POST',
    body,
    scope: 'PAYMENT',
    label: 'Refund',
    requireConfirmDiscard: true,
  });
}

export function fetchReceipt(transactionId: string) {
  return api<Receipt>(`/payments/${transactionId}/receipt`);
}

export function reprintReceipt(transactionId: string) {
  return staffMutate<Receipt>(`/payments/${transactionId}/receipt/reprint`, {
    method: 'POST',
    body: {},
    scope: 'PAYMENT',
    label: 'Reprint receipt',
  });
}

export function fetchTillCurrent() {
  return api<TillSession | null>('/till/current');
}

export function openTill(body: {
  openingBalance: number;
  deviceLabel?: string;
}) {
  return staffMutate<TillSession>('/till/open', {
    method: 'POST',
    body,
    scope: 'MUTATION',
    label: 'Open till',
  });
}

export function closeTill(body: {
  actualCash: number;
  notes?: string;
  approverEmployeeId?: string;
  approverPin?: string;
}) {
  return staffMutate<TillSession>('/till/close', {
    method: 'POST',
    body,
    scope: 'MUTATION',
    label: 'Close till',
    requireConfirmDiscard: true,
  });
}

export function tillPaidIn(body: { amount: number; reason: string }) {
  return staffMutate('/till/paid-in', {
    method: 'POST',
    body,
    scope: 'MUTATION',
    label: 'Till paid in',
  });
}

export function tillPaidOut(body: { amount: number; reason: string }) {
  return staffMutate('/till/paid-out', {
    method: 'POST',
    body,
    scope: 'MUTATION',
    label: 'Till paid out',
  });
}

export function tillAdjustment(body: {
  amount: number;
  reason: string;
  approverEmployeeId?: string;
  approverPin?: string;
}) {
  return staffMutate('/till/adjustment', {
    method: 'POST',
    body,
    scope: 'MUTATION',
    label: 'Till adjustment',
    requireConfirmDiscard: true,
  });
}

export function fetchSalesHistory(params?: {
  from?: string;
  to?: string;
  search?: string;
  method?: string;
  mine?: boolean;
  cashierId?: string;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.search) q.set('search', params.search);
  if (params?.method) q.set('method', params.method);
  if (params?.mine) q.set('mine', 'true');
  if (params?.cashierId) q.set('cashierId', params.cashierId);
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  const qs = q.toString();
  return api<Paginated<Transaction>>(
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

export function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
