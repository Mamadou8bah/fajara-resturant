'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StaffShell } from '@/components/StaffShell';
import { useApprovalPrompt } from '@/components/ui/ApprovalPinModal';
import {
  Button,
  EmptyState,
  ErrorBanner,
  KpiCard,
  LoadingBlock,
  Panel,
} from '@/components/ui';
import { Can, useCan } from '@/lib/rbac';
import { BrandLogo, mediaUrl } from '@/lib/brand';
import { useCriticalForm } from '@/lib/criticalFormGate';
import { formatDisplayDateTime, formatGmd, todayIso } from '@/lib/money';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import { reopenPaidOrder } from '@/features/orders/api';
import {
  closeTill,
  fetchBillPreview,
  fetchCashierSummary,
  fetchFloor,
  fetchPublicFinance,
  fetchPublicPaymentMethods,
  fetchReceipt,
  fetchSalesHistory,
  fetchTillCurrent,
  num,
  openTill,
  refundPayment,
  reprintReceipt,
  settlePayment,
  tillAdjustment,
  tillPaidIn,
  tillPaidOut,
  type BillPreview,
  type CashierSummary,
  type FloorTable,
  type PaymentLine,
  type Receipt,
  type TillSession,
  type Transaction,
} from './api';

type Tab = 'settle' | 'till' | 'history';

const DISCOUNT_CHIPS = [0, 5, 10, 15] as const;

function newClientRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `settle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function calcLiveTotals(input: {
  subtotal: number;
  discountPct: number;
  tipPct: number | null;
  tipAmount: number;
  taxRatePercent: number;
  taxInclusive: boolean;
}) {
  const disc = round2((input.subtotal * input.discountPct) / 100);
  const after = Math.max(0, round2(input.subtotal - disc));
  let tax = 0;
  if (input.taxRatePercent > 0) {
    if (input.taxInclusive) {
      tax = round2(after - after / (1 + input.taxRatePercent / 100));
    } else {
      tax = round2((after * input.taxRatePercent) / 100);
    }
  }
  const tip =
    input.tipPct != null
      ? round2((input.subtotal * input.tipPct) / 100)
      : round2(input.tipAmount);
  const total = input.taxInclusive
    ? round2(after + tip)
    : round2(after + tax + tip);
  return { disc, tax, tip, total, after };
}

function lineAmount(l: Receipt['lines'][number]) {
  const mods = (l.modifiers ?? []).reduce(
    (sum, m) => sum + Number(m.price || 0),
    0,
  );
  return (Number(l.unitPrice) + mods) * l.quantity;
}

function CheckoutReceiptView({
  receipt,
  actions,
}: {
  receipt: Receipt;
  actions?: React.ReactNode;
}) {
  return (
    <div
      id="checkout-receipt"
      className="checkout-receipt mt-6 rounded-2xl border border-[#E0D5C4] bg-cream p-4 font-mono text-sm text-ink"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          {receipt.showLogo !== false && receipt.logoUrl ? (
            <BrandLogo
              src={mediaUrl(receipt.logoUrl)}
              alt={receipt.restaurantName}
              className="mb-2 h-12 w-auto max-w-[140px] object-contain"
            />
          ) : null}
          <p className="font-display text-base font-bold">
            {receipt.restaurantName}
          </p>
          <p className="text-xs text-muted">
            {receipt.transactionNumber}
            {receipt.isReprint ? ' · REPRINT' : ''}
          </p>
        </div>
        {actions ? <div className="no-print flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <p className="text-xs text-muted">
        Table {receipt.table.number}
        {receipt.table.label ? ` · ${receipt.table.label}` : ''} ·{' '}
        {formatDisplayDateTime(receipt.createdAt)}
      </p>
      {(receipt.cashier?.fullName || receipt.waiter?.fullName) && (
        <p className="mt-1 text-xs text-muted">
          {[
            receipt.cashier?.fullName
              ? `Cashier ${receipt.cashier.fullName}`
              : null,
            receipt.waiter?.fullName
              ? `Waiter ${receipt.waiter.fullName}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <ul className="mt-3 space-y-1 border-y border-dashed border-[#C9B8A0] py-3">
        {receipt.lines.map((l, i) => (
          <li key={`${l.name}-${i}`} className="flex justify-between gap-2">
            <div className="min-w-0">
              <span>
                {l.quantity}× {l.name}
              </span>
              {l.modifiers?.length ? (
                <p className="text-xs italic text-muted">
                  {l.modifiers.map((m) => m.name).join(', ')}
                </p>
              ) : null}
              {l.guestName ? (
                <p className="text-xs text-muted">{l.guestName}</p>
              ) : null}
            </div>
            <span className="shrink-0">{formatGmd(lineAmount(l))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatGmd(Number(receipt.subtotal))}</span>
        </div>
        {Number(receipt.discountAmount) > 0 ? (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{formatGmd(Number(receipt.discountAmount))}</span>
          </div>
        ) : null}
        {Number(receipt.taxAmount) > 0 ? (
          <div className="flex justify-between">
            <span>{receipt.taxLabel ?? 'Tax'}</span>
            <span>{formatGmd(Number(receipt.taxAmount))}</span>
          </div>
        ) : null}
        {Number(receipt.tipAmount) > 0 ? (
          <div className="flex justify-between">
            <span>Tip</span>
            <span>{formatGmd(Number(receipt.tipAmount))}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatGmd(Number(receipt.total))}</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {receipt.payments.map((p, i) => (
          <li key={`${p.method}-${i}`}>
            {p.method}: {formatGmd(Number(p.amount))}
            {p.cashReceived != null && p.cashReceived !== ''
              ? ` · received ${formatGmd(Number(p.cashReceived))}`
              : ''}
            {p.cashChange != null &&
            p.cashChange !== '' &&
            Number(p.cashChange) > 0
              ? ` · change ${formatGmd(Number(p.cashChange))}`
              : ''}
          </li>
        ))}
      </ul>
      {receipt.refunds?.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {receipt.refunds.map((r, i) => (
            <li key={`refund-${i}`}>
              Refund: {formatGmd(Number(r.amount))}
              {r.reason ? ` · ${r.reason}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {receipt.footer ? (
        <p className="mt-3 text-center text-xs text-muted">{receipt.footer}</p>
      ) : null}
    </div>
  );
}

export function CheckoutScreen() {
  const searchParams = useSearchParams();
  const { can } = useCan();
  const { requestApproval, modal } = useApprovalPrompt();

  const [tab, setTab] = useState<Tab>('settle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [floor, setFloor] = useState<FloorTable[]>([]);
  const [tableQuery, setTableQuery] = useState('');
  const [methods, setMethods] = useState<string[]>(['Cash']);
  const [sessionId, setSessionId] = useState(
    searchParams.get('sessionId') ?? '',
  );
  const [bill, setBill] = useState<BillPreview | null>(null);

  const [discountPct, setDiscountPct] = useState(0);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState('');
  const [tipOptions, setTipOptions] = useState<number[]>([5, 10, 15]);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [allowDiscounts, setAllowDiscounts] = useState(true);
  const [maxDiscountPct, setMaxDiscountPct] = useState(10);
  const [taxRate, setTaxRate] = useState(0);
  const [taxLabel, setTaxLabel] = useState('VAT');
  const [taxInclusive, setTaxInclusive] = useState(false);

  const [tenderMethod, setTenderMethod] = useState('Cash');
  const [splitMode, setSplitMode] = useState(false);
  const [tenderAmount, setTenderAmount] = useState('');
  const [tenders, setTenders] = useState<PaymentLine[]>([]);
  const [cashReceived, setCashReceived] = useState('');
  const [settleGuestId, setSettleGuestId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [lastTxnId, setLastTxnId] = useState<string | null>(null);

  const [till, setTill] = useState<TillSession | null>(null);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [actualCash, setActualCash] = useState('');
  const [tillNotes, setTillNotes] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');

  useCriticalForm(
    busy ||
      (Boolean(sessionId) && !receipt) ||
      tenders.length > 0 ||
      Boolean(tenderAmount.trim()) ||
      (tab === 'till' && Boolean(actualCash.trim() || moveAmount.trim())),
  );

  const [history, setHistory] = useState<Transaction[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMine, setHistoryMine] = useState(true);
  const [historySummary, setHistorySummary] = useState<CashierSummary | null>(
    null,
  );
  const [refundTxnId, setRefundTxnId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const canFloor = can('orders.waiter') || can('checkout.operate');
  const canHistory = can('sales_history.view');
  const canSeeAllSales = can('reports.view');
  const canDiscount = can('discount.standard');
  const canExceptional = can('discount.exceptional');

  const filteredFloor = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    if (!q) return floor;
    return floor.filter((t) => {
      const s = t.activeSession;
      const hay = [
        String(t.number),
        t.label ?? '',
        ...(s?.guests.map((g) => g.displayName) ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [floor, tableQuery]);

  const scopedSubtotal = useMemo(() => num(bill?.subtotal), [bill]);

  const live = useMemo(
    () =>
      calcLiveTotals({
        subtotal: scopedSubtotal,
        discountPct: allowDiscounts ? discountPct : 0,
        tipPct: tipsEnabled ? tipPct : null,
        tipAmount: tipsEnabled && tipPct == null ? Number(tipCustom) || 0 : 0,
        taxRatePercent: taxRate,
        taxInclusive,
      }),
    [
      scopedSubtotal,
      discountPct,
      tipPct,
      tipCustom,
      taxRate,
      taxInclusive,
      allowDiscounts,
      tipsEnabled,
    ],
  );

  const loadFloor = useCallback(async () => {
    if (!canFloor) return;
    try {
      const tables = await fetchFloor();
      setFloor(tables.filter((t) => t.activeSession?.status === 'OPEN'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load floor');
    }
  }, [canFloor]);

  const loadBill = useCallback(async (sid: string, guestId?: string | null) => {
    if (!sid.trim()) {
      setBill(null);
      return;
    }
    try {
      const preview = await fetchBillPreview(
        sid.trim(),
        guestId || undefined,
      );
      setBill(preview);
      if (preview.tax) {
        setTaxRate(Number(preview.tax.ratePercent) || 0);
        setTaxLabel(preview.tax.label || 'VAT');
        setTaxInclusive(Boolean(preview.tax.inclusive));
      }
    } catch (e) {
      setBill(null);
      setError(e instanceof Error ? e.message : 'Failed to load bill');
    }
  }, []);

  const loadTill = useCallback(async () => {
    if (!can('till.operate')) return;
    try {
      setTill(await fetchTillCurrent());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load till');
    }
  }, [can]);

  const loadHistory = useCallback(async () => {
    if (!canHistory) return;
    const day = todayIso();
    const mine = historyMine || !canSeeAllSales;
    try {
      const [res, summary] = await Promise.all([
        fetchSalesHistory({
          from: day,
          to: day,
          search: historySearch || undefined,
          mine,
          pageSize: 40,
        }),
        fetchCashierSummary({ from: day, to: day, mine }),
      ]);
      setHistory(res.items);
      setHistorySummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, [canHistory, canSeeAllSales, historyMine, historySearch]);

  useEffect(() => {
    void fetchPublicPaymentMethods().then((m) => {
      setMethods(m);
      setTenderMethod(m[0] ?? 'Cash');
    });
    void fetchPublicFinance().then((f) => {
      setTipsEnabled(f.tipsEnabled !== false);
      setAllowDiscounts(f.allowDiscounts !== false);
      if (Array.isArray(f.tipOptions) && f.tipOptions.length) {
        setTipOptions(f.tipOptions);
      }
      if (f.maxDiscountPct != null) setMaxDiscountPct(Number(f.maxDiscountPct));
      if (f.tax) {
        setTaxRate(Number(f.tax.ratePercent) || 0);
        setTaxLabel(f.tax.label || 'VAT');
        setTaxInclusive(Boolean(f.tax.inclusive));
      }
    });
    void loadFloor();
    void loadTill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    if (sessionId) void loadBill(sessionId, settleGuestId);
    else setBill(null);
  }, [sessionId, settleGuestId, loadBill]);

  useStaffRealtimeRefresh(() => {
    void loadFloor();
    void loadTill();
    if (sessionId) void loadBill(sessionId, settleGuestId);
    if (tab === 'history') void loadHistory();
  });

  function selectSession(id: string) {
    setSessionId(id);
    setReceipt(null);
    setTenders([]);
    setCashReceived('');
    setSettleGuestId(null);
    setDiscountPct(0);
    setTipPct(null);
    setTipCustom('');
    setSplitMode(false);
  }

  const cashChangePreview = useMemo(() => {
    if (tenderMethod !== 'Cash' || splitMode) return null;
    const received = Number(cashReceived);
    if (!Number.isFinite(received) || cashReceived.trim() === '') return null;
    return Math.max(0, received - live.total);
  }, [tenderMethod, splitMode, cashReceived, live.total]);

  function addTender() {
    const amount = Number(tenderAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid tender amount');
      return;
    }
    const line: PaymentLine = { method: tenderMethod, amount };
    if (tenderMethod === 'Cash') {
      const received = Number(cashReceived);
      if (Number.isFinite(received) && cashReceived.trim() !== '') {
        if (received < amount) {
          setError('Cash received must be at least the tender amount');
          return;
        }
        line.cashReceived = received;
      }
    }
    setTenders((prev) => [...prev, line]);
    setTenderAmount('');
    setCashReceived('');
    setError(null);
  }

  function printReceipt() {
    window.print();
  }

  async function onSettle(exact = true) {
    if (!sessionId.trim()) {
      setError('Select a table');
      return;
    }
    if (scopedSubtotal <= 0 && (!bill || bill.lines.length === 0)) {
      setError('Nothing left to settle');
      return;
    }

    let payments: PaymentLine[];
    if (exact && !splitMode) {
      const line: PaymentLine = { method: tenderMethod, amount: live.total };
      if (tenderMethod === 'Cash') {
        const received =
          cashReceived.trim() === '' ? live.total : Number(cashReceived);
        if (!Number.isFinite(received) || received < live.total) {
          setError('Cash received must be at least the bill total');
          return;
        }
        line.cashReceived = received;
      }
      payments = [line];
    } else {
      if (tenders.length === 0) {
        setError('Add at least one payment tender');
        return;
      }
      payments = tenders;
    }

    setBusy(true);
    setError(null);
    const discountAmount =
      allowDiscounts && discountPct > 0 ? live.disc : undefined;
    const tipAmount = tipsEnabled && live.tip > 0 ? live.tip : undefined;
    const base = {
      sessionId: sessionId.trim(),
      guestId: settleGuestId || undefined,
      clientRequestId: newClientRequestId(),
      discountAmount,
      tipAmount,
      payments,
    };
    try {
      const txn = await settlePayment(base).catch(async (e: unknown) => {
        const msg = e instanceof Error ? e.message : '';
        if (!/cap|approval|PIN|exceptional/i.test(msg)) throw e;
        const approval = await requestApproval({
          title: 'Discount approval',
          description: msg || 'Manager PIN required for this discount.',
        });
        if (!approval) throw e;
        return settlePayment({
          ...base,
          clientRequestId: newClientRequestId(),
          approverEmployeeId: approval.approverEmployeeId,
          approverPin: approval.approverPin,
        });
      });
      const r = await fetchReceipt(txn.id);
      setReceipt(r);
      setLastTxnId(txn.id);
      setTenders([]);
      setCashReceived('');
      setDiscountPct(0);
      setTipPct(null);
      setTipCustom('');
      await loadFloor();
      await loadTill();
      await loadBill(sessionId, settleGuestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settle failed');
    } finally {
      setBusy(false);
    }
  }

  async function onOpenTill() {
    setBusy(true);
    setError(null);
    try {
      setTill(
        await openTill({
          openingBalance: Number(openingBalance) || 0,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open till failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCloseTill() {
    setBusy(true);
    setError(null);
    try {
      let approverEmployeeId: string | undefined;
      let approverPin: string | undefined;
      const expected = num(till?.expectedCash);
      const actual = Number(actualCash);
      if (Number.isFinite(actual) && Math.abs(actual - expected) > 50) {
        const approval = await requestApproval({
          title: 'Till variance approval',
          description: `Variance vs expected ${formatGmd(expected)} needs manager PIN.`,
        });
        if (!approval) {
          setBusy(false);
          return;
        }
        approverEmployeeId = approval.approverEmployeeId;
        approverPin = approval.approverPin;
      }
      setTill(
        await closeTill({
          actualCash: Number(actualCash),
          notes: tillNotes || undefined,
          approverEmployeeId,
          approverPin,
        }),
      );
      setActualCash('');
      setTillNotes('');
      await loadTill();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close till failed');
    } finally {
      setBusy(false);
    }
  }

  async function onPaid(direction: 'in' | 'out') {
    const amount = Number(moveAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !moveReason.trim()) {
      setError('Amount and reason required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (direction === 'in') {
        await tillPaidIn({ amount, reason: moveReason.trim() });
      } else {
        await tillPaidOut({ amount, reason: moveReason.trim() });
      }
      setMoveAmount('');
      setMoveReason('');
      await loadTill();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Till movement failed');
    } finally {
      setBusy(false);
    }
  }

  async function onTillAdjust() {
    const amount = Number(moveAmount);
    if (!Number.isFinite(amount) || amount === 0 || !moveReason.trim()) {
      setError('Amount and reason required for adjustment');
      return;
    }
    const approval = await requestApproval({
      title: 'Till adjustment',
      description: 'Manager PIN required to adjust till cash.',
    });
    if (!approval) return;
    setBusy(true);
    setError(null);
    try {
      await tillAdjustment({
        amount: Math.abs(amount),
        reason: moveReason.trim(),
        approverEmployeeId: approval.approverEmployeeId,
        approverPin: approval.approverPin,
      });
      setMoveAmount('');
      setMoveReason('');
      await loadTill();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Till adjustment failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRefund() {
    if (!refundTxnId.trim() || !refundAmount || !refundReason.trim()) {
      setError('Transaction, amount, and reason required');
      return;
    }
    const approval = await requestApproval({
      title: 'Refund approval',
      description: 'Manager PIN required to refund.',
    });
    if (!approval) return;
    setBusy(true);
    setError(null);
    try {
      await refundPayment({
        transactionId: refundTxnId.trim(),
        amount: Number(refundAmount),
        reason: refundReason.trim(),
        approverEmployeeId: approval.approverEmployeeId,
        approverPin: approval.approverPin,
      });
      setRefundAmount('');
      setRefundReason('');
      await loadHistory();
      await loadTill();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusy(false);
    }
  }

  async function showReceipt(id: string) {
    setBusy(true);
    setError(null);
    try {
      setReceipt(await fetchReceipt(id));
      setLastTxnId(id);
      setTab('settle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receipt failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReprint() {
    if (!receipt) return;
    setBusy(true);
    try {
      let id = lastTxnId;
      if (!id) {
        const hit = (
          await fetchSalesHistory({
            search: receipt.transactionNumber,
            pageSize: 5,
          })
        ).items.find((h) => h.transactionNumber === receipt.transactionNumber);
        id = hit?.id ?? null;
      }
      if (!id) throw new Error('Transaction id not found for reprint');
      setReceipt(await reprintReceipt(id));
      setLastTxnId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reprint failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReopenOrders() {
    const ids = receipt?.orderIds ?? [];
    const sessionToSelect = receipt?.sessionId;
    if (ids.length === 0) {
      setError('No paid orders linked to this receipt');
      return;
    }
    const approval = await requestApproval({
      title: 'Reopen paid order',
      description:
        'Manager PIN required to reopen a settled order for corrections.',
    });
    if (!approval) return;
    const reason =
      window.prompt('Reason for reopening', 'Correction after settlement') ??
      '';
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      for (const orderId of ids) {
        await reopenPaidOrder(orderId, {
          reason: reason.trim(),
          approverEmployeeId: approval.approverEmployeeId,
          approverPin: approval.approverPin,
        });
      }
      setReceipt(null);
      if (sessionToSelect) {
        selectSession(sessionToSelect);
      }
      await loadFloor();
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reopen failed');
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'settle', label: 'Settle' },
    { id: 'till', label: 'Till' },
    ...(canHistory
      ? [{ id: 'history' as const, label: 'My sales' }]
      : []),
  ];

  const linesByOrder = useMemo(() => {
    const map = new Map<number, NonNullable<typeof bill>['lines']>();
    for (const line of bill?.lines ?? []) {
      const list = map.get(line.orderNumber) ?? [];
      list.push(line);
      map.set(line.orderNumber, list);
    }
    return [...map.entries()];
  }, [bill]);

  return (
    <StaffShell
      title="Checkout"
      actions={
        <div className="chip-scroll max-w-full">
          <div className="flex min-w-0 gap-1 rounded-xl border border-[#E0D5C4] bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-touch shrink-0 rounded-lg px-4 text-sm font-semibold ${
                  tab === t.id ? 'bg-cta text-cream' : 'text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {modal}
      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

      {tab === 'settle' ? (
        <div className="grid gap-4 md:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          <Panel>
            <h2 className="mb-3 font-display text-lg font-bold">Open tables</h2>
            {canFloor ? (
              <>
                <input
                  className="mb-3 w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                  placeholder="Search table, guest or label…"
                  value={tableQuery}
                  onChange={(e) => setTableQuery(e.target.value)}
                />
                {filteredFloor.length === 0 ? (
                  <EmptyState
                    title="All settled up"
                    body="No open tables match."
                  />
                ) : (
                  <ul className="max-h-[40vh] space-y-2 overflow-auto md:max-h-[70vh]">
                    {filteredFloor.map((t) => {
                      const s = t.activeSession!;
                      const due = Math.max(
                        0,
                        (s.settlement?.estimatedOrderTotal ?? 0) -
                          (s.settlement?.transactionTotal ?? 0),
                      );
                      const active = s.id === sessionId;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => selectSession(s.id)}
                            className={`flex min-h-[64px] w-full flex-col rounded-xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                              active
                                ? 'border-cta bg-[#F6E4DC]'
                                : 'border-[#E0D5C4] bg-white hover:border-[#B8A48A]'
                            }`}
                          >
                            <div className="flex justify-between gap-2">
                              <span className="font-semibold">
                                Table {t.number}
                                {t.label ? ` · ${t.label}` : ''}
                              </span>
                              <span className="text-sm font-bold text-cta">
                                {formatGmd(due)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {s.guestCount} guests · unpaid{' '}
                              {s.settlement?.unpaidOrderCount ?? 0}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                Paste a session ID to settle.
              </p>
            )}
            <label className="mt-4 block text-xs font-semibold uppercase text-muted">
              Session ID
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
              value={sessionId}
              onChange={(e) => selectSession(e.target.value)}
              placeholder="UUID"
            />
          </Panel>

          <Panel>
            <Can
              permission="checkout.operate"
              fallback={<EmptyState title="No checkout access" />}
            >
              {!sessionId ? (
                <EmptyState
                  title="Select a table"
                  body="Pick an open table to settle."
                />
              ) : !bill ? (
                <LoadingBlock label="Loading bill…" />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-display text-lg font-bold">
                      Table {bill.table.number}
                      {bill.table.label ? ` · ${bill.table.label}` : ''}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {settleGuestId
                        ? 'Settling one guest — others stay open'
                        : 'Settling all unpaid items together'}
                      {bill.unsettledGuestCount > 0
                        ? ` · ${bill.unsettledGuestCount} guest share(s) open`
                        : ''}
                    </p>
                  </div>

                  {bill.shares.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted">
                        Settle
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSettleGuestId(null)}
                          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            settleGuestId === null
                              ? 'bg-ready text-cream'
                              : 'border border-[#E0D5C4] bg-white'
                          }`}
                        >
                          All guests
                          {!settleGuestId
                            ? ` · ${formatGmd(num(bill.subtotal))}`
                            : ''}
                        </button>
                        {bill.shares.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            disabled={!g.hasUnpaid}
                            onClick={() => setSettleGuestId(g.id)}
                            className={`rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-40 ${
                              settleGuestId === g.id
                                ? 'bg-ready text-cream'
                                : 'border border-[#E0D5C4] bg-white'
                            }`}
                          >
                            {g.displayName || `Guest ${g.sortOrder + 1}`}
                            {g.hasUnpaid
                              ? ` · ${formatGmd(num(g.unpaidSubtotal))}`
                              : ' · settled'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {linesByOrder.length === 0 ? (
                    <EmptyState title="Nothing left on this bill" />
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-[#E0D5C4] bg-cream/60 p-3">
                      {linesByOrder.map(([orderNumber, lines], idx) => (
                        <div key={orderNumber}>
                          <p className="mb-1 text-xs font-semibold uppercase text-muted">
                            {idx === 0 ? 'First order' : 'Added'} · #{orderNumber}
                          </p>
                          <ul className="space-y-2">
                            {lines.map((line) => (
                              <li
                                key={line.id}
                                className="flex justify-between gap-3 text-sm"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {line.quantity}× {line.name}
                                  </p>
                                  {line.modifiers.length > 0 ? (
                                    <p className="text-xs italic text-muted">
                                      {line.modifiers
                                        .map((m) => m.name)
                                        .join(', ')}
                                    </p>
                                  ) : null}
                                  {line.guestName ? (
                                    <p className="text-xs text-muted">
                                      {line.guestName}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 font-semibold">
                                  {formatGmd(line.lineTotal)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {allowDiscounts && canDiscount ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted">
                        Discount
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {DISCOUNT_CHIPS.map((pct) => {
                          const locked =
                            pct > maxDiscountPct && !canExceptional;
                          return (
                            <button
                              key={pct}
                              type="button"
                              disabled={locked}
                              onClick={() => {
                                if (locked) {
                                  setError(
                                    `Discounts above ${maxDiscountPct}% need manager approval`,
                                  );
                                  return;
                                }
                                setDiscountPct(pct);
                              }}
                              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                                discountPct === pct
                                  ? 'bg-cta text-cream'
                                  : locked
                                    ? 'bg-[#EDE6DA] text-muted opacity-50'
                                    : 'bg-[#EDE6DA] text-ink'
                              }`}
                            >
                              {pct}%
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {tipsEnabled ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted">
                        Tip
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                            tipPct === null && !tipCustom
                              ? 'bg-cta text-cream'
                              : 'bg-[#EDE6DA]'
                          }`}
                          onClick={() => {
                            setTipPct(null);
                            setTipCustom('');
                          }}
                        >
                          None
                        </button>
                        {tipOptions.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                              tipPct === pct
                                ? 'bg-cta text-cream'
                                : 'bg-[#EDE6DA]'
                            }`}
                            onClick={() => {
                              setTipPct(pct);
                              setTipCustom('');
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1 rounded-2xl border border-[#E0D5C4] bg-white p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Subtotal</span>
                      <span>{formatGmd(scopedSubtotal)}</span>
                    </div>
                    {live.disc > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted">
                          Discount ({discountPct}%)
                        </span>
                        <span>-{formatGmd(live.disc)}</span>
                      </div>
                    ) : null}
                    {live.tax > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted">
                          {taxLabel} ({taxRate}%)
                        </span>
                        <span>{formatGmd(live.tax)}</span>
                      </div>
                    ) : null}
                    {live.tip > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted">Tip</span>
                        <span>{formatGmd(live.tip)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-[#E0D5C4] pt-2 font-display text-lg font-bold">
                      <span>Total</span>
                      <span>{formatGmd(live.total)}</span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted">
                      Payment method
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {methods.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setTenderMethod(m);
                            if (m !== 'Cash') setCashReceived('');
                          }}
                          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            tenderMethod === m
                              ? 'bg-ready text-cream'
                              : 'border border-[#E0D5C4] bg-white'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tenderMethod === 'Cash' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm">
                        Cash received
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                          placeholder={String(live.total)}
                          value={cashReceived}
                          onChange={(e) => setCashReceived(e.target.value)}
                        />
                      </label>
                      <div className="text-sm">
                        <p className="text-muted">Change</p>
                        <p className="mt-1 font-display text-lg font-bold">
                          {cashChangePreview != null
                            ? formatGmd(cashChangePreview)
                            : formatGmd(0)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="text-xs font-semibold text-muted underline"
                    onClick={() => setSplitMode((v) => !v)}
                  >
                    {splitMode
                      ? 'Hide split tender'
                      : 'Split across payment methods'}
                  </button>

                  {splitMode ? (
                    <div className="space-y-2 rounded-xl border border-dashed border-[#C9B8A0] p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          placeholder="Amount"
                          className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                          value={tenderAmount}
                          onChange={(e) => setTenderAmount(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addTender}
                        >
                          Add tender
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setTenderAmount(String(live.total))
                          }
                        >
                          Fill total
                        </Button>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {tenders.map((t, i) => (
                          <li
                            key={`${t.method}-${i}`}
                            className="flex justify-between rounded-lg bg-[#EDE6DA] px-3 py-2"
                          >
                            <span>
                              {t.method} · {formatGmd(t.amount)}
                              {t.cashReceived != null
                                ? ` · recv ${formatGmd(t.cashReceived)}`
                                : ''}
                            </span>
                            <button
                              type="button"
                              className="font-semibold text-cta"
                              onClick={() =>
                                setTenders((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        disabled={busy || tenders.length === 0}
                        onClick={() => void onSettle(false)}
                      >
                        Settle split tenders
                      </Button>
                    </div>
                  ) : null}

                  <div className="pb-20 md:pb-0">
                    <Button
                      className="min-h-touch w-full text-base"
                      onClick={() => void onSettle(true)}
                      disabled={busy || bill.lines.length === 0 || splitMode}
                    >
                      {settleGuestId
                        ? `Settle guest · ${formatGmd(live.total)}`
                        : `Settle all · ${formatGmd(live.total)}`}
                    </Button>
                  </div>
                </div>
              )}
            </Can>

            {receipt ? (
              <CheckoutReceiptView
                receipt={receipt}
                actions={
                  <>
                    <Button
                      variant="outline"
                      onClick={printReceipt}
                      disabled={busy}
                    >
                      Print / PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onReprint}
                      disabled={busy}
                    >
                      Reprint
                    </Button>
                    <Can permission="void.approve">
                      <Button
                        variant="danger"
                        onClick={() => void onReopenOrders()}
                        disabled={busy || !(receipt.orderIds?.length)}
                      >
                        Reopen order
                      </Button>
                    </Can>
                  </>
                }
              />
            ) : null}
          </Panel>
        </div>
      ) : null}

      {tab === 'till' ? (
        <Can
          permission="till.operate"
          fallback={<EmptyState title="No till access" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                Current till
              </h2>
              {!till || till.closedAt ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">No open till session.</p>
                  <label className="text-xs font-semibold uppercase text-muted">
                    Opening balance
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                  <Button onClick={onOpenTill} disabled={busy}>
                    Open till
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">
                    Opened {formatDisplayDateTime(till.openedAt)}
                  </p>
                  <p className="font-display text-2xl font-bold">
                    Expected {formatGmd(num(till.expectedCash))}
                  </p>
                  <p className="text-sm text-muted">
                    Opening {formatGmd(num(till.openingBalance))} ·{' '}
                    {till.movements.length} movements
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-sm">
                    {till.movements.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="capitalize text-muted">{m.type}</span>
                        <span>{formatGmd(num(m.amount))}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="text-xs font-semibold uppercase text-muted">
                    Actual cash
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                  />
                  <input
                    placeholder="Close notes"
                    className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                    value={tillNotes}
                    onChange={(e) => setTillNotes(e.target.value)}
                  />
                  <Button onClick={onCloseTill} disabled={busy}>
                    Close till
                  </Button>
                </div>
              )}
            </Panel>
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                Paid in / out
              </h2>
              {!till || till.closedAt ? (
                <p className="text-sm text-muted">Open a till first.</p>
              ) : (
                <div className="space-y-3">
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    placeholder="Amount"
                    className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                    value={moveAmount}
                    onChange={(e) => setMoveAmount(e.target.value)}
                  />
                  <input
                    placeholder="Reason"
                    className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onPaid('in')} disabled={busy}>
                      Paid in
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onPaid('out')}
                      disabled={busy}
                    >
                      Paid out
                    </Button>
                    <Can permission="void.approve">
                      <Button
                        variant="ghost"
                        onClick={() => void onTillAdjust()}
                        disabled={busy}
                      >
                        Adjust (mgr)
                      </Button>
                    </Can>
                  </div>
                  <p className="text-xs text-muted">
                    Adjustment requires manager PIN and logs a till variance
                    correction.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </Can>
      ) : null}

      {tab === 'history' ? (
        <div className="space-y-4">
          {historySummary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={historyMine || !canSeeAllSales ? 'My sales today' : 'Sales today'}
                value={formatGmd(historySummary.net)}
                hint={`${historySummary.transactionCount} payments`}
              />
              <KpiCard
                label="Tips"
                value={formatGmd(historySummary.tips)}
                hint={`AOV ${formatGmd(historySummary.aov)}`}
              />
              <KpiCard
                label="Discounts"
                value={formatGmd(historySummary.discounts)}
              />
              <KpiCard
                label="Refunds"
                value={formatGmd(historySummary.refunds)}
              />
            </div>
          ) : null}

          {historySummary && Object.keys(historySummary.byMethod).length > 0 ? (
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                By payment method
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(historySummary.byMethod).map(([method, v]) => (
                  <li
                    key={method}
                    className="flex items-center justify-between rounded-xl bg-[#EDE6DA]/70 px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold">{method}</span>
                    <span className="text-muted">
                      {v.count} · {formatGmd(v.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {canSeeAllSales ? (
                <div className="flex rounded-full border border-[#D4C4B0] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setHistoryMine(true)}
                    className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${
                      historyMine ? 'bg-cta text-cream' : 'text-muted'
                    }`}
                  >
                    My payments
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryMine(false)}
                    className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${
                      !historyMine ? 'bg-cta text-cream' : 'text-muted'
                    }`}
                  >
                    All cashiers
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-muted">
                  Showing your payments today
                </p>
              )}
              <input
                className="min-w-0 w-full flex-1 rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm sm:min-w-[200px]"
                placeholder="Search txn / table"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <Button onClick={() => void loadHistory()} disabled={busy}>
                Search
              </Button>
            </div>
            {history.length === 0 ? (
              <EmptyState
                title="No payments yet"
                body="Settled tables will show here."
              />
            ) : (
              <ul className="divide-y divide-[#E0D5C4]">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{h.transactionNumber}</p>
                      <p className="text-xs text-muted">
                        Table {h.session?.table?.number ?? '—'} ·{' '}
                        {formatGmd(num(h.total))} ·{' '}
                        {formatDisplayDateTime(h.createdAt)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {(h.payments ?? [])
                          .map(
                            (p) =>
                              `${p.method} ${formatGmd(num(p.amount))}`,
                          )
                          .join(' · ') || '—'}
                        {h.cashier?.fullName && !(historyMine || !canSeeAllSales)
                          ? ` · ${h.cashier.fullName}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => showReceipt(h.id)}
                      >
                        Receipt
                      </Button>
                      <Can permission="refund.approve">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRefundTxnId(h.id);
                            setRefundAmount(String(num(h.total)));
                          }}
                        >
                          Refund
                        </Button>
                      </Can>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Can permission="refund.approve">
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">Refund</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                  placeholder="Transaction ID"
                  value={refundTxnId}
                  onChange={(e) => setRefundTxnId(e.target.value)}
                />
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                  placeholder="Amount"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <input
                  className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                  placeholder="Reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
              <Button className="mt-3" onClick={onRefund} disabled={busy}>
                Refund with approval
              </Button>
            </Panel>
          </Can>
        </div>
      ) : null}
    </StaffShell>
  );
}
