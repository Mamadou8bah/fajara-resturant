'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterChips,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCan } from '@/lib/rbac';
import {
  connectSocket,
  joinStaffRooms,
  onStaffDataChanged,
} from '@/lib/socket';
import { formatGmd } from '@/lib/money';
import { matchesQuery } from '@/lib/search';
import {
  addGuest,
  closeSession,
  fetchFloorPlan,
  markCleaningComplete,
  moveSession,
  openSession,
  updateTableStatus,
  updateTablePosition,
  type FloorTable,
  type TableStatus,
} from './api';
import { FloorPlanMap } from './FloorPlanMap';

function tableLabel(t: FloorTable) {
  return t.label?.trim() || `Table ${t.number}`;
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDE6DA] text-xl font-bold"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-[2rem] text-center text-xl font-bold">{value}</span>
      <button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-cta text-xl font-bold text-cream"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}

export function FloorScreen() {
  const { user, token } = useAuth();
  const { can } = useCan();
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [moveToId, setMoveToId] = useState('');
  const [reserveName, setReserveName] = useState('');
  const [reserveParty, setReserveParty] = useState(2);
  const [floorQuery, setFloorQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'ALL'>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<
    'mine' | 'unassigned' | 'all'
  >(user?.role === 'WAITER' ? 'mine' : 'all');
  const [arrangeMode, setArrangeMode] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchFloorPlan();
      setTables(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load floor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !user) return;
    const s = connectSocket(token);
    const join = () => {
      joinStaffRooms(s, user);
      s.emit('join', { room: 'floor' });
    };
    join();

    // Debounce bursts (e.g. settle emits payment + session.closed).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 120);
    };

    const floorEvents = [
      'table.status',
      'session.updated',
      'session.opened',
      'session.closed',
      'session.moved',
      'order.placed',
      'order.submitted',
      'order_item.updated',
      'order.status',
      'payment.settled',
      'waiter.call',
      'guest.added',
    ] as const;

    const onConnect = () => {
      join();
      refetch();
    };

    s.on('connect', onConnect);
    for (const event of floorEvents) {
      s.on(event, refetch);
    }
    const offStaff = onStaffDataChanged(refetch);
    const onOnline = () => void load();
    window.addEventListener('online', onOnline);

    return () => {
      if (timer) clearTimeout(timer);
      s.off('connect', onConnect);
      for (const event of floorEvents) {
        s.off(event, refetch);
      }
      offStaff();
      window.removeEventListener('online', onOnline);
    };
  }, [token, user, load]);

  const selected = useMemo(
    () => tables.find((t) => t.id === selectedId) ?? null,
    [tables, selectedId],
  );

  const freeTables = useMemo(
    () => tables.filter((t) => t.status === 'FREE'),
    [tables],
  );

  const visibleTables = useMemo(() => {
    return tables.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (ownershipFilter === 'mine') {
        if (t.status === 'NEEDS_CLEANING') {
          // Own dirty tables (or unassigned last visit).
          const clearer = t.clearingWaiter?.id;
          if (clearer && clearer !== user?.id) return false;
          return true;
        }
        if (!t.activeSession) return false;
        if (t.activeSession.waiter?.id !== user?.id) return false;
      } else if (ownershipFilter === 'unassigned') {
        const open = t.activeSession;
        if (!open || open.waiter?.id) return false;
      }
      return matchesQuery(
        floorQuery,
        t.number,
        t.label,
        t.activeSession?.waiter?.fullName,
        t.clearingWaiter?.fullName,
        t.reservation?.name,
      );
    });
  }, [tables, statusFilter, ownershipFilter, floorQuery, user?.id]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onTableMoved(id: string, posX: number, posY: number) {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, posX, posY } : t)),
    );
    try {
      await updateTablePosition(id, posX, posY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save table position');
      void load();
    }
  }

  async function onOpenSession() {
    if (!selected) return;
    const party = Math.min(
      Math.max(1, guestCount),
      selected.seats,
    );
    await run(() =>
      openSession({
        tableId: selected.id,
        waiterId: user?.id,
        // One seated guest (lead); party size is expected headcount so others can QR-join
        guests: [
          {
            displayName: guestName.trim() || undefined,
          },
        ],
        reservationPartySize: party,
      }),
    );
  }

  async function onAddGuest() {
    if (!selected?.activeSession) return;
    await run(() =>
      addGuest(selected.activeSession!.id, guestName.trim() || undefined),
    );
    setGuestName('');
  }

  async function onMove() {
    if (!selected?.activeSession || !moveToId) return;
    await run(() => moveSession(selected.activeSession!.id, moveToId));
    setMoveToId('');
  }

  async function onClean() {
    if (!selected) return;
    await run(() => markCleaningComplete(selected.id));
  }

  async function onCloseTable() {
    if (!selected?.activeSession) return;
    await run(() => closeSession(selected.activeSession!.id));
  }

  async function onSetStatus(status: TableStatus) {
    if (!selected) return;
    await run(() =>
      updateTableStatus(selected.id, {
        status,
        ...(status === 'RESERVED'
          ? {
              reservationName: reserveName.trim() || 'Guest',
              reservationPartySize: reserveParty,
              reservationAt: new Date().toISOString(),
            }
          : {}),
      }),
    );
  }

  function TableDetail({
    compact,
  }: {
    compact?: boolean;
  }) {
    if (!selected) {
      return (
        <p className="text-sm text-muted">Tap a table to manage it.</p>
      );
    }
    return (
      <div className={`space-y-4 ${compact ? 'pb-2' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">
              {tableLabel(selected)}
            </h2>
            <p className="text-sm text-muted">
              #{selected.number} · {selected.status.replaceAll('_', ' ')}
            </p>
          </div>
          {compact ? (
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
            >
              ×
            </button>
          ) : null}
        </div>

        {(selected.status === 'FREE' || selected.status === 'RESERVED') && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Seat guests
            </p>
            <div>
              <p className="mb-2 text-sm font-semibold">Party size</p>
              <Stepper
                value={guestCount}
                min={1}
                max={selected.seats}
                onChange={setGuestCount}
              />
            </div>
            <input
              className="input-field"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Lead name (optional)"
            />
            <Button
              className="w-full text-base"
              disabled={busy}
              onClick={() => void onOpenSession()}
            >
              Open table
            </Button>
          </div>
        )}

        {selected.status === 'NEEDS_CLEANING' ? (
          (user?.role !== 'WAITER' ||
            !selected.clearingWaiter?.id ||
            selected.clearingWaiter.id === user?.id) && (
            <Button
              className="w-full text-base"
              disabled={busy}
              onClick={() => void onClean()}
            >
              Clear table (cleaned)
            </Button>
          )
        ) : null}

        {selected.activeSession ? (
          <div className="space-y-3 border-t border-[#E0D5C4] pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Live session
            </p>
            <p className="text-base">
              {selected.activeSession.guestCount} seated
              {selected.activeSession.reservationPartySize
                ? ` · party of ${selected.activeSession.reservationPartySize}`
                : ''}
              {` · ${selected.seats} seats`}
              {selected.activeSession.waiter
                ? ` · ${selected.activeSession.waiter.fullName}`
                : ' · unassigned'}
            </p>
            <p className="text-sm text-muted">
              Guests can still scan this table’s QR until all seats are filled.
            </p>
            {selected.activeSession.settlement ? (
              <p className="text-sm text-muted">
                Orders {selected.activeSession.settlement.orderCount} · Est.{' '}
                {formatGmd(
                  selected.activeSession.settlement.estimatedOrderTotal,
                )}
                {selected.activeSession.status === 'SETTLED'
                  ? ' · Paid'
                  : selected.activeSession.settlement.unpaidOrderCount === 0
                    ? ' · Ready to clear'
                    : ` · ${selected.activeSession.settlement.unpaidOrderCount} unpaid`}
              </p>
            ) : null}
            {(() => {
              const unpaid =
                (selected.activeSession.settlement?.unpaidOrderCount ?? 0) > 0 &&
                selected.activeSession.status !== 'SETTLED';
              const canOwnClear =
                user?.role !== 'WAITER' ||
                !selected.activeSession.waiter?.id ||
                selected.activeSession.waiter.id === user?.id;
              if (!canOwnClear) {
                return (
                  <p className="rounded-xl bg-[#EDE6DA] px-3 py-2 text-sm text-muted">
                    Assigned to {selected.activeSession.waiter?.fullName}. That
                    waiter (or a manager) can clear this table after payment.
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  {unpaid && can('checkout.operate') ? (
                    <Link
                      href={`/app/checkout?sessionId=${encodeURIComponent(selected.activeSession.id)}`}
                      className="btn-primary flex min-h-touch w-full items-center justify-center rounded-2xl text-base font-bold"
                    >
                      Settle bill to clear
                    </Link>
                  ) : null}
                  {unpaid && !can('checkout.operate') ? (
                    <p className="rounded-xl bg-[#F7EDD4] px-3 py-2 text-sm font-medium text-ink">
                      Ask cashier to settle the unpaid bill, then you can clear
                      this table.
                    </p>
                  ) : null}
                  <Button
                    className="w-full text-base"
                    disabled={busy || unpaid}
                    onClick={() => void onCloseTable()}
                  >
                    {unpaid ? 'Clear table (pay first)' : 'Clear table'}
                  </Button>
                </div>
              );
            })()}
            <ul className="space-y-1 text-sm">
              {selected.activeSession.guests.map((g, i) => (
                <li key={g.id}>
                  {g.displayName?.trim() || `Guest ${i + 1}`}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="New guest name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <Button disabled={busy} onClick={() => void onAddGuest()}>
                Add
              </Button>
            </div>
            {can('session.move') ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Move table
                </p>
                <select
                  className="input-field"
                  value={moveToId}
                  onChange={(e) => setMoveToId(e.target.value)}
                >
                  <option value="">Free table…</option>
                  {freeTables
                    .filter((t) => t.id !== selected.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {tableLabel(t)}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy || !moveToId}
                  onClick={() => void onMove()}
                >
                  Move session
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {can('tables.manage') ? (
          <div className="space-y-2 border-t border-[#E0D5C4] pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Set status
            </p>
            <div className="grid grid-cols-1 gap-2">
              {(['FREE', 'RESERVED', 'NEEDS_CLEANING'] as TableStatus[]).map(
                (s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="w-full"
                    disabled={busy || selected.status === s}
                    onClick={() => void onSetStatus(s)}
                  >
                    {s.replaceAll('_', ' ')}
                  </Button>
                ),
              )}
            </div>
            {selected.status !== 'RESERVED' ? (
              <div className="space-y-2">
                <input
                  className="input-field"
                  placeholder="Reservation name"
                  value={reserveName}
                  onChange={(e) => setReserveName(e.target.value)}
                />
                <div>
                  <p className="mb-2 text-sm font-semibold">Party size</p>
                  <Stepper
                    value={reserveParty}
                    min={1}
                    max={20}
                    onChange={setReserveParty}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <StaffShell
      title="Floor"
      showLiveStrip
      actions={
        <>
          <Button
            variant={arrangeMode ? 'primary' : 'outline'}
            className="h-10 min-h-0 shrink-0 px-4"
            onClick={() => setArrangeMode((v) => !v)}
          >
            {arrangeMode ? 'Done arranging' : 'Arrange'}
          </Button>
          <Button
            variant="outline"
            className="h-10 min-h-0 shrink-0 px-4"
            onClick={() => void load()}
            disabled={busy}
          >
            Refresh
          </Button>
        </>
      }
    >
      <div className="mb-3 space-y-2">
        <SearchField
          value={floorQuery}
          onChange={setFloorQuery}
          placeholder="Find table or guest…"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <FilterChips
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'FREE', label: 'Free' },
              { value: 'OCCUPIED', label: 'Busy' },
              { value: 'RESERVED', label: 'Hold' },
              { value: 'NEEDS_CLEANING', label: 'Clean' },
            ]}
          />
          <FilterChips
            value={ownershipFilter}
            onChange={setOwnershipFilter}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'unassigned', label: 'Open' },
              { value: 'all', label: 'All staff' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: '#2f7d63' }}
            />
            Free
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: '#c0613d' }}
            />
            Occupied
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: '#d39a2d' }}
            />
            Reserved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: '#8a7355' }}
            />
            Needs cleaning
          </span>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

      {loading ? (
        <LoadingBlock label="Loading floor…" />
      ) : tables.length === 0 ? (
        <EmptyState title="No tables" body="Add tables in settings first." />
      ) : visibleTables.length === 0 ? (
        <EmptyState
          title="No tables match"
          body="Try another status or clear the search."
        />
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <FloorPlanMap
            tables={visibleTables}
            selectedId={selectedId}
            arrangeMode={arrangeMode}
            onSelect={(id) => {
              setSelectedId(id);
              if (arrangeMode) return;
            }}
            onMove={onTableMoved}
          />

          <Panel className="hidden h-fit max-h-[min(68dvh,860px)] overflow-auto bg-cream lg:block">
            <TableDetail />
          </Panel>
        </div>
      )}

      {selected && !arrangeMode ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 lg:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close table"
            onClick={() => setSelectedId(null)}
          />
          <div className="safe-pb relative z-10 max-h-[85dvh] w-full overflow-auto rounded-t-3xl bg-cream px-4 pt-4 shadow-lg">
            <TableDetail compact />
          </div>
        </div>
      ) : null}
    </StaffShell>
  );
}
