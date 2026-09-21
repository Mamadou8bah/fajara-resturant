'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  SearchField,
} from '@/components/ui';
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal';
import { useAuth } from '@/lib/auth';
import { connectSocket } from '@/lib/socket';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import { matchesQuery } from '@/lib/search';
import {
  fetchKitchenTickets,
  requestKitchenRemake,
  transitionKitchenItem,
  type KitchenItemStatus,
  type KitchenTicketItem,
  type KitchenTickets,
} from './api';
import { markItemUnavailable } from '@/features/orders/api';
import { announceEvent, announceNotification } from '@/lib/notifySound';
import { fetchSettings } from '@/features/settings/api';

type ColKey = keyof KitchenTickets;

const COLUMNS: {
  key: ColKey;
  title: string;
  short: string;
  next?: KitchenItemStatus;
  nextLabel?: string;
}[] = [
  { key: 'submitted', title: 'New', short: 'New', next: 'preparing', nextLabel: 'Start' },
  {
    key: 'preparing',
    title: 'Preparing',
    short: 'Prep',
    next: 'ready',
    nextLabel: 'Ready',
  },
  { key: 'ready', title: 'Ready', short: 'Ready' },
];

function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ageTone(iso: string) {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins >= 20) return 'bg-cta text-cream';
  if (mins >= 10) return 'bg-warn text-ink';
  return 'bg-ready/15 text-ready';
}

function tableName(item: KitchenTicketItem) {
  const t = item.order.session.table;
  return t.label?.trim() || `T${t.number}`;
}

function groupByOrder(items: KitchenTicketItem[]) {
  const map = new Map<string, KitchenTicketItem[]>();
  for (const item of items) {
    const key = item.order.id;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.values()];
}

function orderPrepEta(items: KitchenTicketItem[]) {
  const mins = items
    .map((i) => i.menuItem?.prepMinutes)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  if (mins.length === 0) return null;
  return Math.max(...mins);
}

function TicketCard({
  group,
  colKey,
  next,
  nextLabel,
  hiVis,
  busyId,
  onTransition,
  onAdvanceGroup,
  onUnavailable,
  onRemake,
}: {
  group: KitchenTicketItem[];
  colKey: ColKey;
  next?: KitchenItemStatus;
  nextLabel?: string;
  hiVis: boolean;
  busyId: string | null;
  onTransition: (item: KitchenTicketItem, next: KitchenItemStatus) => void;
  onAdvanceGroup: (
    items: KitchenTicketItem[],
    next: KitchenItemStatus,
  ) => Promise<void>;
  onUnavailable: (item: KitchenTicketItem) => void;
  onRemake: (item: KitchenTicketItem) => void;
}) {
  const head = group[0]!;
  const eta = orderPrepEta(group);
  const busy = group.some((g) => g.id === busyId) || busyId === `group:${head.order.id}`;
  const accent =
    group.some((g) => g.isAppendedRound)
      ? 'border-warn'
      : colKey === 'submitted'
        ? 'border-cta'
        : colKey === 'preparing'
          ? 'border-warn'
          : 'border-ready';

  return (
    <article
      className={`overflow-hidden rounded-2xl border-2 bg-cream ${accent} ${
        hiVis ? 'shadow-none' : ''
      }`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[#E0D5C4] bg-[#FAF7F2] px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p
            className={`font-display font-extrabold leading-none text-ink ${
              hiVis ? 'text-4xl' : 'text-3xl sm:text-2xl'
            }`}
          >
            {tableName(head)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
            #{head.order.orderNumber}
            {head.waiter?.fullName ? ` · ${head.waiter.fullName}` : ''}
            {eta != null ? ` · ~${eta}m` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {group.some((g) => g.pendingSync) ? (
            <span className="rounded-md bg-warn px-2 py-0.5 text-[10px] font-bold uppercase text-ink">
              Pending sync
            </span>
          ) : null}
          {group.some((g) => g.isAppendedRound) ? (
            <span className="rounded-md bg-warn px-2 py-0.5 text-[10px] font-bold uppercase text-cream">
              Added
            </span>
          ) : null}
          <span
            className={`rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${ageTone(head.createdAt)}`}
          >
            {ageLabel(head.createdAt)}
          </span>
        </div>
      </header>

      <ul className="divide-y divide-[#E0D5C4]">
        {group.map((item) => (
          <li key={item.id} className="px-3 py-3 sm:px-4">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`font-bold leading-tight text-ink ${
                  hiVis ? 'text-2xl' : 'text-lg sm:text-xl'
                }`}
              >
                <span className="text-cta">{item.quantity}×</span>{' '}
                {item.nameSnapshot}
              </p>
              {item.isSpecial ? (
                <span className="shrink-0 rounded-md bg-cta px-2 py-0.5 text-[10px] font-bold uppercase text-cream">
                  Special
                </span>
              ) : null}
            </div>
            {item.modifiers.length > 0 ? (
              <p className="mt-1 text-sm font-semibold text-muted">
                {item.modifiers.map((m) => m.nameSnapshot).join(', ')}
              </p>
            ) : null}
            {item.kitchenNotes ? (
              <p className="mt-2 rounded-xl bg-[#F5E8C8] px-3 py-2 text-sm font-bold text-ink">
                {item.kitchenNotes}
              </p>
            ) : null}
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              {item.guest?.displayName || 'Guest'}
              {item.isTakeaway ? ' · Takeaway' : ''}
              {item.menuItem?.station ? ` · ${item.menuItem.station}` : ''}
              {item.menuItem?.prepMinutes
                ? ` · ${item.menuItem.prepMinutes}m`
                : ''}
            </p>

            <div className="mt-3 grid gap-2">
              {next && nextLabel ? (
                <Button
                  className="min-h-14 w-full text-lg font-bold"
                  disabled={busyId === item.id || busy}
                  busy={busyId === item.id}
                  busyLabel="Updating…"
                  onClick={() => void onTransition(item, next)}
                >
                  {nextLabel}
                </Button>
              ) : (
                <p className="rounded-xl bg-ready/10 px-3 py-3 text-center text-sm font-semibold text-ready">
                  Waiting for waiter to serve
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="min-h-12"
                  disabled={busyId === item.id || busy}
                  onClick={() => void onUnavailable(item)}
                >
                  Gone
                </Button>
                {colKey !== 'submitted' ? (
                  <Button
                    variant="danger"
                    className="min-h-12"
                    disabled={busyId === item.id || busy}
                    onClick={() => void onRemake(item)}
                  >
                    Remake
                  </Button>
                ) : (
                  <span className="min-h-12" aria-hidden />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {next && nextLabel && group.length > 1 ? (
        <div className="border-t border-[#E0D5C4] bg-[#FAF7F2] px-3 py-3 sm:px-4">
          <Button
            className="min-h-14 w-full text-base font-bold"
            disabled={busy}
            busy={busy}
            busyLabel="Updating…"
            onClick={() => void onAdvanceGroup(group, next)}
          >
            {nextLabel} all ({group.length})
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function KitchenScreen() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<KitchenTickets | null>(null);
  const [station, setStation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [ticketQuery, setTicketQuery] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [hiVis, setHiVis] = useState(false);
  const [mobileCol, setMobileCol] = useState<ColKey>('submitted');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [goneConfirm, setGoneConfirm] = useState<KitchenTicketItem | null>(
    null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchKitchenTickets(station.trim() || undefined);
      setTickets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load kitchen');
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void fetchSettings()
      .then((s) => {
        const n = (s.notifications ?? {}) as { soundOn?: boolean };
        setSoundOn(n.soundOn !== false);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      setHiVis(localStorage.getItem('fajara.kitchenHiVis') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const s = connectSocket(token);
    s.emit('join', { room: 'kds' });
    const refetch = () => void load();
    const onSubmitted = (payload?: {
      orderNumber?: number | string;
      session?: { table?: { number?: number | string } };
    }) => {
      const table = payload?.session?.table?.number;
      const num = payload?.orderNumber;
      announceEvent({
        enabled: soundOn,
        kind: 'order.kitchen',
        text:
          table != null && num != null
            ? `New kitchen ticket, order ${num}, table ${table}.`
            : 'New kitchen ticket. Please start preparation.',
      });
      setMobileCol('submitted');
      void load();
    };
    const onNotification = (n: {
      type?: string;
      title?: string;
      body?: string | null;
      payload?: unknown;
    }) => {
      if (n.type === 'order.kitchen' || n.type === 'remake.approved') {
        announceNotification(n, soundOn);
      }
      void load();
    };
    s.on('connect', refetch);
    s.on('reconnect', refetch);
    s.on('order.submitted', onSubmitted);
    s.on('order_item.updated', refetch);
    s.on('notification', onNotification);
    return () => {
      s.off('connect', refetch);
      s.off('reconnect', refetch);
      s.off('order.submitted', onSubmitted);
      s.off('order_item.updated', refetch);
      s.off('notification', onNotification);
    };
  }, [token, load, soundOn]);

  useStaffRealtimeRefresh(() => {
    void load();
  });

  const stations = useMemo(() => {
    if (!tickets) return [] as string[];
    const set = new Set<string>();
    for (const col of Object.values(tickets)) {
      for (const item of col) {
        if (item.menuItem?.station) set.add(item.menuItem.station);
      }
    }
    return [...set].sort();
  }, [tickets]);

  const totalOpen = useMemo(() => {
    if (!tickets) return 0;
    return (
      tickets.submitted.length +
      tickets.preparing.length +
      tickets.ready.length
    );
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (!tickets) return null;
    const filterCol = (items: KitchenTicketItem[]) =>
      items.filter((item) =>
        matchesQuery(
          ticketQuery,
          tableName(item),
          item.nameSnapshot,
          item.kitchenNotes,
          item.guest?.displayName,
          item.menuItem?.name,
          item.menuItem?.station,
          item.order.orderNumber,
        ),
      );
    return {
      submitted: filterCol(tickets.submitted),
      preparing: filterCol(tickets.preparing),
      ready: filterCol(tickets.ready),
    } satisfies KitchenTickets;
  }, [tickets, ticketQuery]);

  // Prefer a column that still has work when the active tab empties.
  useEffect(() => {
    if (!filteredTickets) return;
    if (filteredTickets[mobileCol].length > 0) return;
    const fallback = COLUMNS.find((c) => filteredTickets[c.key].length > 0);
    if (fallback) setMobileCol(fallback.key);
  }, [filteredTickets, mobileCol]);

  async function onTransition(item: KitchenTicketItem, next: KitchenItemStatus) {
    setBusyId(item.id);
    setError(null);
    // Optimistic column move for offline / slow networks.
    setTickets((prev) => {
      if (!prev) return prev;
      const remove = (list: KitchenTicketItem[]) =>
        list.filter((i) => i.id !== item.id);
      const moved: KitchenTicketItem = {
        ...item,
        status: next,
        pendingSync: true,
      };
      const nextTickets: KitchenTickets = {
        submitted: remove(prev.submitted),
        preparing: remove(prev.preparing),
        ready: remove(prev.ready),
      };
      if (next === 'submitted') nextTickets.submitted = [moved, ...nextTickets.submitted];
      else if (next === 'preparing')
        nextTickets.preparing = [moved, ...nextTickets.preparing];
      else if (next === 'ready') nextTickets.ready = [moved, ...nextTickets.ready];
      return nextTickets;
    });
    try {
      await transitionKitchenItem(item.id, next);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(12);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function onAdvanceGroup(
    items: KitchenTicketItem[],
    next: KitchenItemStatus,
  ) {
    const orderId = items[0]?.order.id;
    setBusyId(orderId ? `group:${orderId}` : items[0]?.id ?? null);
    setError(null);
    try {
      for (const item of items) {
        await transitionKitchenItem(item.id, next);
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(20);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function onUnavailable(item: KitchenTicketItem) {
    setGoneConfirm(item);
  }

  async function confirmGone(reason: string) {
    if (!goneConfirm) return;
    const item = goneConfirm;
    setBusyId(item.id);
    setError(null);
    try {
      await markItemUnavailable(
        item.id,
        reason || 'Kitchen marked unavailable',
      );
      setGoneConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark unavailable');
    } finally {
      setBusyId(null);
    }
  }

  async function onRemake(item: KitchenTicketItem) {
    const reason = window
      .prompt(
        `Ask managers to approve remake of ${item.nameSnapshot}?\nReason:`,
        'Quality issue',
      )
      ?.trim();
    if (!reason) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await requestKitchenRemake(item.id, reason);
      window.alert(
        'queued' in res && res.queued
          ? 'Remake request queued offline — will sync when you reconnect'
          : 'message' in res
            ? res.message
            : 'Remake request sent',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request remake');
    } finally {
      setBusyId(null);
    }
  }

  function toggleHiVis() {
    setHiVis((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fajara.kitchenHiVis', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const activeCol = COLUMNS.find((c) => c.key === mobileCol) ?? COLUMNS[0]!;

  return (
    <StaffShell title="Kitchen" showLiveStrip>
      {/* Compact mobile toolbar */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <SearchField
            value={ticketQuery}
            onChange={setTicketQuery}
            placeholder="Table or dish…"
            className="min-w-0 flex-1"
          />
          <Button
            variant="outline"
            className="min-h-11 shrink-0 px-3"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            Filter
          </Button>
          <Button
            variant="outline"
            className="min-h-11 shrink-0 px-3"
            onClick={() => void load()}
          >
            ↻
          </Button>
        </div>

        {filtersOpen ? (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[#E0D5C4] bg-[#FAF7F2] p-3">
            <select
              className="input-field min-w-0 flex-1"
              value={station}
              onChange={(e) => setStation(e.target.value)}
            >
              <option value="">All stations</option>
              {stations.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <Button
              variant={hiVis ? 'primary' : 'outline'}
              className="shrink-0"
              onClick={toggleHiVis}
              aria-pressed={hiVis}
            >
              {hiVis ? 'Hi-vis on' : 'Hi-vis'}
            </Button>
          </div>
        ) : null}

        {/* Mobile column tabs — sticky-friendly */}
        {!loading && filteredTickets && totalOpen > 0 ? (
          <div
            className="sticky top-0 z-10 -mx-1 grid grid-cols-3 gap-1 rounded-2xl bg-[#EDE6DA] p-1 md:hidden"
            role="tablist"
            aria-label="Kitchen columns"
          >
            {COLUMNS.map((col) => {
              const count = filteredTickets[col.key].length;
              const active = mobileCol === col.key;
              return (
                <button
                  key={col.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileCol(col.key)}
                  className={`min-h-12 rounded-xl px-2 text-sm font-bold transition-colors ${
                    active
                      ? col.key === 'submitted'
                        ? 'bg-cta text-cream'
                        : col.key === 'preparing'
                          ? 'bg-warn text-ink'
                          : 'bg-ready text-cream'
                      : 'text-ink'
                  }`}
                >
                  {col.short}
                  <span
                    className={`ml-1 tabular-nums ${
                      active ? 'opacity-90' : 'text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {error ? (
        <ErrorBanner message={error} onClose={() => setError(null)} />
      ) : null}

      {loading || !filteredTickets ? (
        <LoadingBlock label="Loading tickets…" />
      ) : totalOpen === 0 ? (
        <EmptyState
          title="All clear"
          body="No tickets in the kitchen pipeline."
        />
      ) : (
        <>
          {/* —— Mobile: one column at a time —— */}
          <div
            className={`space-y-3 md:hidden ${hiVis ? '[&_p]:tracking-wide' : ''}`}
            role="tabpanel"
          >
            {groupByOrder(filteredTickets[activeCol.key]).length === 0 ? (
              <EmptyState
                title={`No ${activeCol.title.toLowerCase()} tickets`}
                body="Swipe a tab above or wait for the next order."
              />
            ) : (
              groupByOrder(filteredTickets[activeCol.key]).map((group) => (
                <TicketCard
                  key={group[0]!.order.id}
                  group={group}
                  colKey={activeCol.key}
                  next={activeCol.next}
                  nextLabel={activeCol.nextLabel}
                  hiVis={hiVis}
                  busyId={busyId}
                  onTransition={onTransition}
                  onAdvanceGroup={onAdvanceGroup}
                  onUnavailable={onUnavailable}
                  onRemake={onRemake}
                />
              ))
            )}
          </div>

          {/* —— Desktop / tablet: three columns —— */}
          <div
            className={`hidden gap-4 md:grid md:grid-cols-3 ${
              hiVis ? 'font-bold [&_h2]:text-4xl' : ''
            }`}
          >
            {COLUMNS.map((col) => {
              const items = filteredTickets[col.key];
              return (
                <section key={col.key} className="min-w-0">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-display text-2xl font-extrabold text-ink lg:text-3xl">
                      {col.title}
                    </h2>
                    <span className="rounded-lg bg-cta px-2.5 py-1 text-sm font-bold text-cream">
                      {items.length}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {groupByOrder(items).map((group) => (
                      <li key={group[0]!.order.id}>
                        <TicketCard
                          group={group}
                          colKey={col.key}
                          next={col.next}
                          nextLabel={col.nextLabel}
                          hiVis={hiVis}
                          busyId={busyId}
                          onTransition={onTransition}
                          onAdvanceGroup={onAdvanceGroup}
                          onUnavailable={onUnavailable}
                          onRemake={onRemake}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}

      <ConfirmActionModal
        open={Boolean(goneConfirm)}
        title={`Mark ${goneConfirm?.nameSnapshot ?? 'item'} as gone?`}
        description="This removes the item from the ticket and tells the guest it is unavailable."
        reasonLabel="Note (optional)"
        reasonDefault="Kitchen marked unavailable"
        confirmLabel="Mark gone"
        danger
        busy={busyId === goneConfirm?.id}
        onCancel={() => setGoneConfirm(null)}
        onConfirm={(reason) => void confirmGone(reason)}
      />
    </StaffShell>
  );
}
