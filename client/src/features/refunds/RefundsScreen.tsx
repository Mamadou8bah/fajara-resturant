'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Panel,
} from '@/components/ui';
import { useApprovalPrompt } from '@/components/ui/ApprovalPinModal';
import {
  fetchSalesHistory,
  num,
  refundPayment,
  type Transaction,
} from '@/features/checkout/api';
import {
  daysAgoIso,
  formatDisplayDateTime,
  formatGmd,
  todayIso,
} from '@/lib/money';

function refundedTotal(txn: Transaction): number {
  return (txn.refunds ?? []).reduce((s, r) => s + num(r.amount), 0);
}

function refundableAmount(txn: Transaction): number {
  if (txn.status === 'refunded' || txn.status === 'voided') return 0;
  return Math.max(0, num(txn.total) - refundedTotal(txn));
}

export function RefundsScreen() {
  const { requestApproval, modal } = useApprovalPrompt();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchSalesHistory({
        from: daysAgoIso(29),
        to: todayIso(),
        pageSize: 40,
      });
      setItems(res.items);
      setSelectedId((prev) => {
        if (prev && res.items.some((t) => t.id === prev)) return prev;
        const first = res.items.find((t) => refundableAmount(t) > 0);
        return first?.id ?? res.items[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((t) => t.id === selectedId) ?? null,
    [items, selectedId],
  );

  const maxRefund = selected ? refundableAmount(selected) : 0;

  useEffect(() => {
    if (!selected) {
      setAmount('');
      return;
    }
    const max = refundableAmount(selected);
    setAmount(max > 0 ? String(max) : '');
    setReason('');
  }, [selected?.id]);

  async function onRefund() {
    if (!selected) {
      setError('Select a transaction');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a refund amount');
      return;
    }
    if (value > maxRefund + 0.001) {
      setError(`Max refundable is ${formatGmd(maxRefund)}`);
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required');
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
        transactionId: selected.id,
        amount: value,
        reason: reason.trim(),
        approverEmployeeId: approval.approverEmployeeId,
        approverPin: approval.approverPin,
      });
      setFlash(`Refunded ${formatGmd(value)} on ${selected.transactionNumber}`);
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusy(false);
    }
  }

  const recentRefunds = useMemo(() => {
    return items
      .flatMap((t) =>
        (t.refunds ?? []).map((r) => ({
          id: r.id,
          txn: t,
          amount: num(r.amount),
          reason: r.reason,
        })),
      )
      .slice(0, 12);
  }, [items]);

  return (
    <StaffShell
      title="Refunds"
      actions={
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      }
    >
      {modal}
      {error ? (
        <ErrorBanner message={error} onClose={() => setError(null)} />
      ) : null}
      {flash ? (
        <div className="mb-4 rounded-2xl border border-ready bg-[#E4F0EB] px-4 py-3 text-sm font-medium text-ready">
          {flash}
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock label="Loading transactions…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No recent sales"
          body="Settled payments from the last 30 days show up here for refund."
        />
      ) : (
        <div className="space-y-5 pb-28 md:pb-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] md:items-start md:gap-5">
          <section>
            <h2 className="mb-2 font-display text-lg font-bold">
              Recent transactions
            </h2>
            <ul className="space-y-2">
              {items.map((t) => {
                const left = refundableAmount(t);
                const active = t.id === selectedId;
                const table =
                  t.session?.table?.label?.trim() ||
                  (t.session?.table?.number
                    ? `T${t.session.table.number}`
                    : null);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left ${
                        active
                          ? 'bg-cta text-cream'
                          : 'bg-white text-ink ring-1 ring-[#E0D5C4]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold">
                          {t.transactionNumber}
                          {table ? ` · ${table}` : ''}
                        </p>
                        <p
                          className={`text-sm ${active ? 'text-[#E8DFD0]' : 'text-muted'}`}
                        >
                          {formatDisplayDateTime(t.createdAt)}
                          {t.cashier?.fullName
                            ? ` · ${t.cashier.fullName}`
                            : ''}
                        </p>
                        {(t.refunds?.length ?? 0) > 0 ? (
                          <p
                            className={`mt-1 text-xs font-semibold ${
                              active ? 'text-[#E8DFD0]' : 'text-warn'
                            }`}
                          >
                            Refunded {formatGmd(refundedTotal(t))}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold">{formatGmd(num(t.total))}</p>
                        <p
                          className={`text-xs ${active ? 'text-[#E8DFD0]' : 'text-muted'}`}
                        >
                          {left > 0
                            ? `${formatGmd(left)} left`
                            : t.status === 'refunded'
                              ? 'Fully refunded'
                              : t.status}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="space-y-4">
            <Panel className="!mt-0">
              <p className="font-display text-lg font-bold">Issue refund</p>
              {selected ? (
                <>
                  <p className="mt-1 text-sm text-muted">
                    {selected.transactionNumber} · max{' '}
                    {formatGmd(maxRefund)}
                  </p>
                  <label className="mt-3 block text-sm font-semibold">
                    Amount
                    <input
                      className="input-field mt-1"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      disabled={maxRefund <= 0 || busy}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label className="mt-3 block text-sm font-semibold">
                    Reason
                    <input
                      className="input-field mt-1"
                      value={reason}
                      disabled={maxRefund <= 0 || busy}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Wrong item, guest dispute…"
                    />
                  </label>
                  <Button
                    className="mt-4 w-full"
                    disabled={busy || maxRefund <= 0}
                    onClick={() => void onRefund()}
                  >
                    Refund
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Select a transaction to refund.
                </p>
              )}
            </Panel>

            {recentRefunds.length > 0 ? (
              <section>
                <h2 className="mb-2 font-display text-base font-bold">
                  Recent refunds
                </h2>
                <ul className="space-y-2">
                  {recentRefunds.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl bg-[#F7F1E8] px-3 py-2 text-sm"
                    >
                      <p className="font-semibold">
                        {formatGmd(r.amount)} · {r.txn.transactionNumber}
                      </p>
                      <p className="text-muted">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </StaffShell>
  );
}
