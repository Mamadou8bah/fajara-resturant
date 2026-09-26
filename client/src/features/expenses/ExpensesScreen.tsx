'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterSelect,
  LoadingBlock,
  Panel,
} from '@/components/ui';
import { formatDisplayDate, formatGmd, todayIso } from '@/lib/money';
import {
  createExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  fetchExpenses,
  type Expense,
} from './api';

function moneyNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function ExpensesScreen() {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<{
    amount: string;
    category: (typeof EXPENSE_CATEGORIES)[number];
    note: string;
    spentAt: string;
  }>({
    amount: '',
    category: EXPENSE_CATEGORIES[0],
    note: '',
    spentAt: todayIso(),
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchExpenses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!form.category.trim()) {
      setError('Choose a category');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createExpense({
        amount,
        category: form.category.trim(),
        note: form.note.trim() || undefined,
        spentAt: form.spentAt,
      });
      setForm((s) => ({
        ...s,
        amount: '',
        note: '',
        spentAt: todayIso(),
      }));
      setFlash('Expense recorded');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!window.confirm(`Delete expense “${label}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteExpense(id);
      setFlash('Expense deleted');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete expense');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffShell
      title="Expenses"
      actions={
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      }
    >
      {error ? (
        <ErrorBanner message={error} onClose={() => setError(null)} />
      ) : null}
      {flash ? (
        <div className="mb-4 rounded-2xl border border-ready bg-[#E4F0EB] px-4 py-3 text-sm font-medium text-ready">
          {flash}
        </div>
      ) : null}

      <Panel className="mb-5 !mt-0">
        <p className="mb-3 font-display text-lg font-bold">Add expense</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Amount (GMD)
            <input
              className="input-field mt-1"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) =>
                setForm((s) => ({ ...s, amount: e.target.value }))
              }
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm font-semibold">
            Date
            <input
              className="input-field mt-1"
              type="date"
              value={form.spentAt}
              onChange={(e) =>
                setForm((s) => ({ ...s, spentAt: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            Category
            <FilterSelect
              className="mt-1 w-full"
              value={form.category}
              onChange={(v) =>
                setForm((s) => ({
                  ...s,
                  category: v as (typeof EXPENSE_CATEGORIES)[number],
                }))
              }
              options={EXPENSE_CATEGORIES.map((c) => ({
                value: c,
                label: c,
              }))}
            />
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            Note (optional)
            <input
              className="input-field mt-1"
              value={form.note}
              onChange={(e) =>
                setForm((s) => ({ ...s, note: e.target.value }))
              }
              placeholder="What was this for?"
            />
          </label>
        </div>
        <Button
          className="mt-4 w-full sm:w-auto"
          disabled={busy}
          onClick={() => void onCreate()}
        >
          Save expense
        </Button>
      </Panel>

      {loading ? (
        <LoadingBlock label="Loading expenses…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          body="Record purchases, utilities, and other restaurant costs here."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((ex) => (
            <li
              key={ex.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-[#E0D5C4]"
            >
              <div className="min-w-0">
                <p className="font-bold">
                  {formatGmd(moneyNum(ex.amount))} · {ex.category}
                </p>
                <p className="text-sm text-muted">
                  {formatDisplayDate(ex.spentAt)}
                  {ex.actor?.fullName ? ` · ${ex.actor.fullName}` : ''}
                </p>
                {ex.note ? (
                  <p className="mt-1 text-sm text-ink">{ex.note}</p>
                ) : null}
              </div>
              <Button
                variant="danger"
                className="shrink-0 text-xs"
                disabled={busy}
                onClick={() =>
                  void onDelete(
                    ex.id,
                    `${ex.category} ${formatGmd(moneyNum(ex.amount))}`,
                  )
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
