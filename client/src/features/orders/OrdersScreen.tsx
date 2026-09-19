'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal';
import { useAuth } from '@/lib/auth';
import { formatGmd } from '@/lib/money';
import { useOnline } from '@/lib/useOnline';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import { addGuest, closeSession } from '@/features/floor/api';
import {
  assignSessionWaiter,
  cancelOrderItem,
  fetchAssignableWaiters,
  fetchMenuItems,
  fetchNotifications,
  fetchWaiterTables,
  firstAccept,
  newClientRequestId,
  optionPriceDelta,
  requestCompOrderItem,
  requestVoidOrderItem,
  sendOrderToKitchen,
  serveOrderItem,
  submitOrder,
  type MenuItem,
  type StaffNotification,
  type WaiterTableSession,
} from './api';
import { Can, useCan } from '@/lib/rbac';

type CartLine = {
  key: string;
  guestId: string;
  guestName: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  modifierOptionIds: string[];
  modifierLabels: string[];
  kitchenNotes: string;
};

function tableName(s: WaiterTableSession) {
  return s.table.label?.trim() || `T${s.table.number}`;
}

function itemPrice(item: MenuItem): number {
  const special = item.specials.find(
    (s) =>
      s.specialPrice != null &&
      (s.quantityRemaining == null || s.quantityRemaining > 0),
  );
  if (special?.specialPrice != null) return Number(special.specialPrice);
  return Number(item.price);
}

const OPEN_ORDER_STATUSES = [
  'placed',
  'submitted',
  'preparing',
  'ready',
  'partially_paid',
];

export function OrdersScreen() {
  const { user } = useAuth();
  const online = useOnline();
  const { can } = useCan();
  const [sessions, setSessions] = useState<WaiterTableSession[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [calls, setCalls] = useState<StaffNotification[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [modIds, setModIds] = useState<string[]>([]);
  const [lineNotes, setLineNotes] = useState('');
  const submitRequestIdRef = useRef<string | null>(null);
  const [waiters, setWaiters] = useState<{ id: string; fullName: string }[]>(
    [],
  );
  const [sendSelection, setSendSelection] = useState<Record<string, string[]>>(
    {},
  );
  const [exceptionConfirm, setExceptionConfirm] = useState<{
    kind: 'void' | 'comp';
    itemId: string;
    name: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tables, items, notesList] = await Promise.all([
        fetchWaiterTables(),
        fetchMenuItems().catch(() => [] as MenuItem[]),
        fetchNotifications().catch(() => [] as StaffNotification[]),
      ]);
      setSessions(tables);
      setMenu(items.filter((i) => i.isAvailable && !i.isSoldOut));
      setCalls(
        notesList.filter(
          (n) =>
            n.type === 'call_waiter' &&
            ['created', 'delivered', 'seen'].includes(n.status) &&
            !n.sessionWaiterId &&
            (n.sessionStatus == null || n.sessionStatus === 'OPEN'),
        ),
      );
      setSessionId((prev) => {
        if (prev && tables.some((t) => t.id === prev)) return prev;
        return tables[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAssignableWaiters()
      .then(setWaiters)
      .catch(() => setWaiters([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime refetch (sounds announced globally in StaffShell).
  useStaffRealtimeRefresh(() => {
    void load();
  });

  const selected = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  useEffect(() => {
    if (!selected) {
      setGuestId(null);
      return;
    }
    setGuestId((prev) => {
      if (prev && selected.guests.some((g) => g.id === prev)) return prev;
      return selected.guests[0]?.id ?? null;
    });
  }, [selected]);

  const filteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.category?.name.toLowerCase().includes(q),
    );
  }, [menu, query]);

  const placedOrders = useMemo(
    () =>
      sessions.flatMap((s) =>
        s.orders
          .filter((o) => o.items.some((i) => i.status === 'placed'))
          .map((o) => ({ session: s, order: o })),
      ),
    [sessions],
  );

  const kitchenOrders = useMemo(
    () =>
      sessions.flatMap((s) =>
        s.orders
          .filter((o) =>
            ['submitted', 'preparing', 'ready', 'partially_paid'].includes(
              o.status,
            ),
          )
          .map((o) => ({ session: s, order: o })),
      ),
    [sessions],
  );

  const activeTickets = useMemo(
    () =>
      sessions.flatMap((s) =>
        s.orders
          .filter((o) => OPEN_ORDER_STATUSES.includes(o.status))
          .map((o) => ({ session: s, order: o })),
      ),
    [sessions],
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart],
  );

  const cartByGuest = useMemo(() => {
    const map = new Map<
      string,
      { guestId: string; guestName: string; lines: CartLine[]; subtotal: number }
    >();
    for (const line of cart) {
      const cur = map.get(line.guestId) ?? {
        guestId: line.guestId,
        guestName: line.guestName,
        lines: [] as CartLine[],
        subtotal: 0,
      };
      cur.lines.push(line);
      cur.subtotal += line.price * line.quantity;
      map.set(line.guestId, cur);
    }
    return [...map.values()];
  }, [cart]);

  const mySessions = useMemo(
    () => sessions.filter((s) => s.waiterId === user?.id),
    [sessions, user?.id],
  );
  const unassignedSessions = useMemo(
    () => sessions.filter((s) => !s.waiterId),
    [sessions],
  );
  const otherSessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.waiterId && s.waiterId !== user?.id,
      ),
    [sessions, user?.id],
  );

  function guestLabel(g: { displayName: string | null } | null | undefined, i = 0) {
    return g?.displayName?.trim() || `Guest ${i + 1}`;
  }

  async function onAddGuestForOrder() {
    if (!selected) return;
    const seats = selected.table.seats;
    if (selected.guests.length >= seats) {
      setError(`Table is full (${seats} seats)`);
      return;
    }
    const name =
      window
        .prompt(
          'Name for this guest (optional).\nUse this for people without a phone — you’ll order on their behalf.',
          '',
        )
        ?.trim() ?? null;
    if (name === null) return;
    setBusy(true);
    setError(null);
    try {
      const guest = (await addGuest(
        selected.id,
        name || undefined,
      )) as { id: string };
      await load();
      setGuestId(guest.id);
      setFlash(
        name
          ? `Added ${name} — ordering on their behalf`
          : 'Guest added — ordering on their behalf',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add guest');
    } finally {
      setBusy(false);
    }
  }

  const canClearSelected = useMemo(() => {
    if (!selected) return false;
    if (
      user?.role === 'WAITER' &&
      selected.waiterId &&
      selected.waiterId !== user.id
    ) {
      return false;
    }
    const hasUnsettled = selected.orders.some((o) =>
      o.items.some((it) => {
        if (['cancelled', 'voided', 'comped'].includes(it.status)) return false;
        return !it.settledTransactionId;
      }),
    );
    return !hasUnsettled;
  }, [selected, user?.id, user?.role]);

  async function onClearTable() {
    if (!selected || !canClearSelected) return;
    if (
      !window.confirm(
        `Clear ${tableName(selected)}? Guests leave and the table goes to cleaning.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeSession(selected.id);
      setCart([]);
      setFlash(`${tableName(selected)} cleared — mark cleaned on Floor when ready`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear table');
    } finally {
      setBusy(false);
    }
  }

  function openItem(item: MenuItem) {
    if (!guestId || !selected) {
      setError('Select a guest first');
      return;
    }
    const defaults =
      item.modifierGroups?.flatMap((g) =>
        g.options.filter((o) => o.isDefault).map((o) => o.id),
      ) ?? [];
    setPicked(item);
    setModIds(defaults);
    setLineNotes('');
    setError(null);
  }

  function toggleMod(groupId: string, optionId: string, maxSelect: number) {
    if (!picked) return;
    const group = picked.modifierGroups.find((g) => g.id === groupId);
    if (!group) return;
    const groupOptionIds = new Set(group.options.map((o) => o.id));
    setModIds((prev) => {
      const without = prev.filter((id) => !groupOptionIds.has(id));
      if (prev.includes(optionId)) return without;
      if (maxSelect <= 1) return [...without, optionId];
      const currentInGroup = prev.filter((id) => groupOptionIds.has(id));
      if (currentInGroup.length >= maxSelect) return prev;
      return [...without, ...currentInGroup, optionId];
    });
  }

  function confirmAddToCart() {
    if (!picked || !guestId || !selected) return;
    for (const g of picked.modifierGroups ?? []) {
      const selectedIds = modIds.filter((id) =>
        g.options.some((o) => o.id === id),
      );
      const min = g.isRequired ? Math.max(g.minSelect, 1) : g.minSelect;
      if (selectedIds.length < min) {
        setError(`Choose ${g.name}`);
        return;
      }
    }
    const guest = selected.guests.find((g) => g.id === guestId);
    const guestName = guestLabel(
      guest,
      selected.guests.findIndex((g) => g.id === guestId),
    );
    const delta = (picked.modifierGroups ?? [])
      .flatMap((g) => g.options)
      .filter((o) => modIds.includes(o.id))
      .reduce((s, o) => s + optionPriceDelta(o), 0);
    const labels = (picked.modifierGroups ?? [])
      .flatMap((g) => g.options)
      .filter((o) => modIds.includes(o.id))
      .map((o) => o.name);
    const key = `${guestId}:${picked.id}:${[...modIds].sort().join(',')}:${lineNotes}`;
    const unit = itemPrice(picked) + delta;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          guestId,
          guestName,
          menuItemId: picked.id,
          name: picked.name,
          quantity: 1,
          price: unit,
          modifierOptionIds: modIds,
          modifierLabels: labels,
          kitchenNotes: lineNotes.trim(),
        },
      ];
    });
    setPicked(null);
    setError(null);
  }

  function setQty(key: string, next: number) {
    setCart((prev) => {
      if (next <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) =>
        l.key === key ? { ...l, quantity: next } : l,
      );
    });
  }

  async function onSubmit() {
    if (!selected || cart.length === 0) return;
    if (!online) {
      setError('You are offline — connect to send orders to the kitchen.');
      return;
    }
    if (!submitRequestIdRef.current) {
      submitRequestIdRef.current = newClientRequestId();
    }
    const clientRequestId = submitRequestIdRef.current;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await submitOrder({
        sessionId: selected.id,
        clientRequestId,
        items: cart.map((line) => ({
          guestId: line.guestId,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          kitchenNotes:
            line.kitchenNotes.trim() || notes.trim() || undefined,
          modifierOptionIds:
            line.modifierOptionIds.length > 0
              ? line.modifierOptionIds
              : undefined,
        })),
      });
      submitRequestIdRef.current = null;
      setCart([]);
      setNotes('');
      setCartOpen(false);
      setAddItemsOpen(false);
      setFlash('Order held — send items to kitchen when ready');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCancelItem(itemId: string, name: string) {
    if (!window.confirm(`Cancel ${name} before kitchen starts?`)) return;
    setBusy(true);
    setError(null);
    try {
      await cancelOrderItem(itemId, 'Cancelled by waiter before preparation');
      setFlash('Item cancelled');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitExceptionRequest(reason: string) {
    if (!exceptionConfirm) return;
    const { kind, itemId } = exceptionConfirm;
    setBusy(true);
    setError(null);
    try {
      const res =
        kind === 'void'
          ? await requestVoidOrderItem(itemId, reason)
          : await requestCompOrderItem(itemId, reason);
      setFlash(
        res.message ||
          (kind === 'void'
            ? 'Void request sent to manager'
            : 'Comp request sent to manager'),
      );
      setExceptionConfirm(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : kind === 'void'
            ? 'Void request failed'
            : 'Comp request failed',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(n: StaffNotification) {
    setBusy(true);
    setError(null);
    try {
      await firstAccept({
        notificationId: n.id,
        sessionId: n.sessionId ?? undefined,
      });
      setFlash('Call accepted — table assigned to you');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accept failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSendPlaced(orderId: string, itemIds?: string[]) {
    if (!online) {
      setError('You are offline — connect to send orders to the kitchen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendOrderToKitchen(orderId, itemIds);
      setSendSelection((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setFlash(
        itemIds && itemIds.length > 0
          ? 'Selected items sent'
          : 'All held items sent',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleSendItem(
    orderId: string,
    itemId: string,
    heldIds: string[],
  ) {
    setSendSelection((prev) => {
      const cur = prev[orderId] ?? heldIds;
      const next = cur.includes(itemId)
        ? cur.filter((id) => id !== itemId)
        : [...cur, itemId];
      return { ...prev, [orderId]: next };
    });
  }

  async function onServeItem(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      await serveOrderItem(itemId);
      setFlash('Marked served');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Serve failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReassign(sid: string, waiterId: string) {
    if (!waiterId) return;
    setBusy(true);
    setError(null);
    try {
      await assignSessionWaiter(sid, waiterId);
      setFlash('Waiter reassigned');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reassign failed');
    } finally {
      setBusy(false);
    }
  }

  const CartBody = (
    <>
      {cart.length === 0 ? (
        <p className="text-sm text-muted">Tap menu items to add.</p>
      ) : (
        <div className="mb-3 space-y-4">
          {cartByGuest.map((group) => (
            <div key={group.guestId}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                {group.guestName} · {formatGmd(group.subtotal)}
              </p>
              <ul className="space-y-3">
                {group.lines.map((line) => (
                  <li
                    key={line.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{line.name}</p>
                      {line.modifierLabels.length ? (
                        <p className="text-xs text-muted">
                          {line.modifierLabels.join(', ')}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted">
                        {formatGmd(line.price * line.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                        onClick={() => setQty(line.key, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center font-bold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-cta text-lg font-bold text-cream"
                        onClick={() => setQty(line.key, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <label className="mb-3 block text-sm font-semibold">
        Kitchen notes (all items)
        <input
          className="input-field mt-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Allergies, fire, hold…"
        />
      </label>
      <p className="mb-3 text-base font-bold">Total {formatGmd(cartTotal)}</p>
      <Button
        className="w-full text-base"
        disabled={busy || cart.length === 0 || !selected}
        onClick={() => void onSubmit()}
      >
        Send to kitchen
      </Button>
    </>
  );

  const OrderBuilder = selected ? (
    <Panel className="!mt-0">
      <div className="mb-3">
        <p className="font-display text-lg font-bold">{tableName(selected)}</p>
        <p className="text-sm text-muted">
          {selected.waiter ? selected.waiter.fullName : 'Unassigned'} ·{' '}
          {selected.guests.length} guest
          {selected.guests.length === 1 ? '' : 's'}
        </p>
        {canClearSelected ? (
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => void onClearTable()}
          >
            Clear my table
          </Button>
        ) : null}
      </div>
      <div className="mb-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
          Who is this for?
        </p>
        <p className="mb-2 text-xs text-muted">
          Guests without a phone — pick who you’re ordering for, or add them
          here.
        </p>
        <div className="flex flex-wrap gap-2">
          {selected.guests.map((g, i) => {
            const active = g.id === guestId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGuestId(g.id)}
                className={`min-h-[44px] rounded-full px-4 text-sm font-bold ${
                  active ? 'bg-sidebar text-cream' : 'bg-[#EDE6DA] text-ink'
                }`}
              >
                {guestLabel(g, i)}
              </button>
            );
          })}
          {selected.guests.length < selected.table.seats ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAddGuestForOrder()}
              className="min-h-[44px] rounded-full border border-dashed border-[#C4B5A0] px-4 text-sm font-bold text-ink"
            >
              + Add guest
            </button>
          ) : null}
        </div>
      </div>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search menu…"
        className="mb-3"
      />
      <div className="mb-3 grid max-h-[min(40vh,22rem)] gap-2 overflow-auto sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openItem(item)}
            className="flex min-h-[56px] items-center justify-between gap-2 rounded-xl border border-[#E0D5C4] bg-cream px-3 py-2 text-left active:scale-[0.99]"
          >
            <span className="min-w-0 truncate font-semibold">{item.name}</span>
            <span className="shrink-0 text-sm font-bold">
              {formatGmd(itemPrice(item))}
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-[#E0D5C4] pt-3">
        <p className="mb-2 font-display text-base font-bold">Cart</p>
        {CartBody}
      </div>
    </Panel>
  ) : (
    <Panel className="!mt-0">
      <p className="font-display text-lg font-bold">Take order</p>
      <p className="mt-1 text-sm text-muted">
        Select a table to build a cart and send to kitchen.
      </p>
    </Panel>
  );

  const isManager =
    user?.role === 'OWNER' || user?.role === 'MANAGER';

  return (
    <StaffShell
      title="Orders"
      showLiveStrip
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

      {loading ? (
        <LoadingBlock label="Loading…" />
      ) : (
        <div
          className={`md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] md:items-start md:gap-5 ${
            cartCount > 0 ? 'pb-28 md:pb-0' : ''
          }`}
        >
          <div className="space-y-5">
          {/* 1. Calls first */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Calls</h2>
              {calls.length > 0 ? (
                <span className="rounded-full bg-cta px-2.5 py-0.5 text-xs font-bold text-cream">
                  {calls.length}
                </span>
              ) : null}
            </div>
            {calls.length === 0 ? (
              <p className="text-sm text-muted">No guest calls right now.</p>
            ) : (
              <ul className="space-y-2">
                {calls.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-cta/40 bg-[#F6E4DC] px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{n.title}</p>
                      {n.body ? (
                        <p className="text-sm text-muted">{n.body}</p>
                      ) : null}
                    </div>
                    <Button
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => void onAccept(n)}
                    >
                      Accept
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2. Active orders — stay visible after send-to-kitchen */}
          <section>
            <h2 className="mb-2 font-display text-lg font-bold">
              Active orders
            </h2>
            {placedOrders.length === 0 && kitchenOrders.length === 0 ? (
              <p className="text-sm text-muted">
                No active tickets — guest orders and kitchen progress show here.
              </p>
            ) : (
              <ul className="space-y-2">
                {placedOrders.map(({ session: s, order: o }) => {
                  const held = o.items.filter((i) => i.status === 'placed');
                  const kitchenHeld = held.filter(
                    (i) => i.menuItem?.requiresKitchen !== false,
                  );
                  const serviceHeld = held.filter(
                    (i) => i.menuItem?.requiresKitchen === false,
                  );
                  const selected =
                    sendSelection[o.id] ?? kitchenHeld.map((i) => i.id);
                  return (
                  <li
                    key={o.id}
                    className="rounded-2xl border border-warn/50 bg-[#F7EDD4] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          {tableName(s)} · #{o.orderNumber}
                          <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-warn">
                            Hold
                          </span>
                        </p>
                        {serviceHeld.length > 0 ? (
                          <p className="mt-1 text-xs text-ready">
                            {serviceHeld
                              .map(
                                (i) =>
                                  `${i.quantity}× ${i.nameSnapshot}`,
                              )
                              .join(', ')}{' '}
                            — ready for service (no kitchen)
                          </p>
                        ) : null}
                        {kitchenHeld.length > 0 ? (
                          <ul className="mt-2 space-y-1.5 text-sm">
                            {kitchenHeld.map((i) => (
                              <li key={i.id} className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={selected.includes(i.id)}
                                  onChange={() =>
                                    toggleSendItem(
                                      o.id,
                                      i.id,
                                      kitchenHeld.map((h) => h.id),
                                    )
                                  }
                                  aria-label={`Send ${i.nameSnapshot}`}
                                />
                                <span>
                                  {i.quantity}× {i.nameSnapshot}
                                  {i.guest?.displayName
                                    ? ` · ${i.guest.displayName}`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-muted">
                            Nothing left for kitchen on this ticket.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          disabled={busy || selected.length === 0}
                          onClick={() => void onSendPlaced(o.id, selected)}
                        >
                          Send selected
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || kitchenHeld.length === 0}
                          onClick={() =>
                            void onSendPlaced(
                              o.id,
                              kitchenHeld.map((i) => i.id),
                            )
                          }
                        >
                          Send all to kitchen
                        </Button>
                      </div>
                    </div>
                    {isManager ? (
                      <Can anyOf={['session.move']}>
                        {waiters.length > 0 ? (
                          <label className="mt-2 block text-xs font-semibold text-muted">
                            Reassign
                            <select
                              className="input-field mt-1 text-sm"
                              value={s.waiterId ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                void onReassign(s.id, e.target.value)
                              }
                            >
                              <option value="" disabled>
                                Choose waiter
                              </option>
                              {waiters.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.fullName}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </Can>
                    ) : null}
                  </li>
                  );
                })}

                {kitchenOrders.map(({ session: s, order: o }) => (
                  <li
                    key={o.id}
                    className="rounded-2xl bg-white px-3 py-3 ring-1 ring-[#E0D5C4]"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">
                        {tableName(s)} · #{o.orderNumber}
                        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted">
                          {o.status === 'submitted'
                            ? 'In kitchen'
                            : o.status === 'preparing'
                              ? 'Preparing'
                              : o.status === 'ready'
                                ? 'Ready'
                                : o.status.replace('_', ' ')}
                        </span>
                      </p>
                      <button
                        type="button"
                        className="text-xs font-bold text-cta"
                        onClick={() => {
                          setSessionId(s.id);
                          setAddItemsOpen(false);
                        }}
                      >
                        Table
                      </button>
                    </div>
                    <ul className="space-y-1.5">
                      {o.items
                        .filter(
                          (it) =>
                            !['cancelled', 'voided', 'comped'].includes(
                              it.status,
                            ),
                        )
                        .map((it) => (
                          <li
                            key={it.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0">
                              {it.quantity}× {it.nameSnapshot}
                              <span className="ml-1 font-medium text-muted">
                                · {it.status}
                                {it.guest?.displayName
                                  ? ` · ${it.guest.displayName}`
                                  : ''}
                              </span>
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {it.status === 'ready' ? (
                                <Button
                                  disabled={busy}
                                  onClick={() => void onServeItem(it.id)}
                                >
                                  Serve
                                </Button>
                              ) : null}
                              {['placed', 'submitted'].includes(it.status) ? (
                                <Button
                                  variant="outline"
                                  className="text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    void onCancelItem(it.id, it.nameSnapshot)
                                  }
                                >
                                  Cancel
                                </Button>
                              ) : null}
                              {can('orders.waiter') &&
                              ['preparing', 'ready', 'served'].includes(
                                it.status,
                              ) ? (
                                <>
                                  <Button
                                    variant="danger"
                                    className="text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                      setExceptionConfirm({
                                        kind: 'void',
                                        itemId: it.id,
                                        name: it.nameSnapshot,
                                      })
                                    }
                                  >
                                    Request void
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                      setExceptionConfirm({
                                        kind: 'comp',
                                        itemId: it.id,
                                        name: it.nameSnapshot,
                                      })
                                    }
                                  >
                                    Request comp
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Tables you're handling + unassigned */}
          <section>
            <h2 className="mb-2 font-display text-lg font-bold">Tables</h2>
            {sessions.length === 0 ? (
              <EmptyState
                title="No tables yet"
                body="Accept a guest call or open a session on Floor."
              />
            ) : (
              <>
                {mySessions.length > 0 ? (
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                    Yours
                  </p>
                ) : null}
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
                  {mySessions.map((s) => {
                    const active = s.id === sessionId;
                    const needSend = s.orders.filter(
                      (o) => o.status === 'placed',
                    ).length;
                    const needServe = s.orders.reduce(
                      (n, o) =>
                        n + o.items.filter((i) => i.status === 'ready').length,
                      0,
                    );
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSessionId(s.id);
                          setAddItemsOpen(false);
                        }}
                        className={`relative min-h-[56px] min-w-[5.5rem] shrink-0 rounded-2xl px-3 py-2 text-left md:min-w-[6.5rem] ${
                          active
                            ? 'bg-cta text-cream'
                            : 'bg-white text-ink ring-1 ring-[#E0D5C4]'
                        }`}
                      >
                        <p className="text-sm font-bold">{tableName(s)}</p>
                        <p
                          className={`text-[11px] ${active ? 'text-[#E8DFD0]' : 'text-muted'}`}
                        >
                          <span
                            className={
                              active ? 'text-[#E8DFD0]' : 'font-semibold text-ready'
                            }
                          >
                            Occupied
                          </span>
                          {' · '}
                          {s.guests.length}g
                        </p>
                        {needSend + needServe > 0 ? (
                          <span
                            className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                              active
                                ? 'bg-cream text-cta'
                                : 'bg-cta text-cream'
                            }`}
                          >
                            {needSend + needServe}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {unassignedSessions.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-cta">
                      Unassigned / pending
                    </p>
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
                      {unassignedSessions.map((s) => {
                        const active = s.id === sessionId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSessionId(s.id);
                              setAddItemsOpen(false);
                            }}
                            className={`relative min-h-[56px] min-w-[5.5rem] shrink-0 rounded-2xl border border-dashed px-3 py-2 text-left md:min-w-[6.5rem] ${
                              active
                                ? 'border-cta bg-[#F6E4DC] text-ink'
                                : 'border-[#D4C4B0] bg-[#FAF7F2] text-ink'
                            }`}
                          >
                            <p className="text-sm font-bold">{tableName(s)}</p>
                            <p className="text-[11px] font-semibold text-warn">
                              Pending · needs waiter
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                {otherSessions.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                      Other waiters
                    </p>
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
                      {otherSessions.map((s) => {
                        const active = s.id === sessionId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSessionId(s.id);
                              setAddItemsOpen(false);
                            }}
                            className={`relative min-h-[56px] min-w-[5.5rem] shrink-0 rounded-2xl px-3 py-2 text-left md:min-w-[6.5rem] ${
                              active
                                ? 'bg-sidebar text-cream'
                                : 'bg-white text-ink ring-1 ring-[#E0D5C4]'
                            }`}
                          >
                            <p className="text-sm font-bold">{tableName(s)}</p>
                            <p
                              className={`truncate text-[11px] ${active ? 'text-[#E8DFD0]' : 'text-muted'}`}
                            >
                              Occupied · {s.waiter?.fullName ?? 'Waiter'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                {selected ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-muted">
                        {tableName(selected)}
                        {selected.waiter
                          ? ` · ${selected.waiter.fullName}`
                          : ''}
                      </p>
                      <button
                        type="button"
                        className="text-sm font-bold text-cta md:hidden"
                        onClick={() => setAddItemsOpen((v) => !v)}
                      >
                        {addItemsOpen ? 'Hide menu' : 'Add items'}
                      </button>
                    </div>

                    {/* Active tickets for this table */}
                    {selected.orders.filter((o) =>
                      OPEN_ORDER_STATUSES.includes(o.status),
                    ).length === 0 ? (
                      <p className="text-sm text-muted">No open tickets.</p>
                    ) : (
                      <ul className="space-y-2">
                        {selected.orders
                          .filter((o) =>
                            OPEN_ORDER_STATUSES.includes(o.status),
                          )
                          .map((o) => (
                            <li
                              key={o.id}
                              className="rounded-2xl bg-white px-3 py-3 ring-1 ring-[#E0D5C4]"
                            >
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold">
                                  #{o.orderNumber}
                                  <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted">
                                    {o.status}
                                  </span>
                                </p>
                                {o.items.some((i) => i.status === 'placed') ? (
                                  <Button
                                    disabled={busy}
                                    onClick={() => void onSendPlaced(o.id)}
                                  >
                                    Send held items
                                  </Button>
                                ) : null}
                              </div>
                              <ul className="space-y-1.5">
                                {o.items.map((it) => (
                                  <li
                                    key={it.id}
                                    className="flex items-center justify-between gap-2 text-sm"
                                  >
                                    <span>
                                      {it.quantity}× {it.nameSnapshot}
                                      <span className="ml-1 text-muted">
                                        ({it.status})
                                      </span>
                                    </span>
                                    {it.status === 'ready' ? (
                                      <Button
                                        disabled={busy}
                                        onClick={() => void onServeItem(it.id)}
                                      >
                                        Serve
                                      </Button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                      </ul>
                    )}

                    {addItemsOpen ? (
                      <div className="md:hidden">{OrderBuilder}</div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* Managers: overview of all active tickets */}
          {isManager && activeTickets.length > 0 ? (
            <section>
              <h2 className="mb-2 font-display text-lg font-bold">
                All open tickets
              </h2>
              <ul className="space-y-1.5">
                {activeTickets.map(({ session: s, order: o }) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#F7F1E8] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {tableName(s)} · #{o.orderNumber} · {o.status}
                    </span>
                    <span className="text-muted">
                      {s.waiter?.fullName ?? 'Unassigned'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          </div>

          <aside className="sticky top-4 hidden md:block">{OrderBuilder}</aside>
        </div>
      )}

      {cartCount > 0 && addItemsOpen && !loading ? (
        <div className="app-fab-above-tabbar fixed inset-x-0 z-20 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-lg min-h-[56px] items-center justify-between rounded-2xl bg-cta px-4 text-cream shadow-lg"
          >
            <span className="font-bold">
              Cart · {cartCount} item{cartCount === 1 ? '' : 's'}
            </span>
            <span className="font-bold">{formatGmd(cartTotal)}</span>
          </button>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/60 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          />
          <div className="safe-pb relative z-10 max-h-[85dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-cream px-4 pt-3 shadow-lg">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#D4C4B0]" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Cart</h2>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>
            {CartBody}
          </div>
        </div>
      ) : null}

      {picked ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#271A11]/55 md:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setPicked(null)}
          />
          <div className="safe-pb relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-cream shadow-lg md:rounded-3xl">
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[#D4C4B0] md:hidden" />
            <div className="flex items-start justify-between gap-3 border-b border-[#E0D5C4] px-4 py-3">
              <div className="min-w-0">
                <p className="font-display text-xl font-bold">{picked.name}</p>
                <p className="text-sm text-muted">
                  {formatGmd(itemPrice(picked))}
                  {selected && guestId
                    ? ` · for ${guestLabel(
                        selected.guests.find((g) => g.id === guestId),
                        selected.guests.findIndex((g) => g.id === guestId),
                      )}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                onClick={() => setPicked(null)}
              >
                ×
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
              {(picked.modifierGroups ?? []).map((g) => (
                <div key={g.id}>
                  <p className="mb-2 text-sm font-bold">
                    {g.name}
                    {g.isRequired || g.minSelect > 0
                      ? ` · pick ${Math.max(g.minSelect, g.isRequired ? 1 : 0)}+`
                      : ' · optional'}
                  </p>
                  <div className="space-y-2">
                    {g.options.map((o) => {
                      const on = modIds.includes(o.id);
                      const delta = optionPriceDelta(o);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleMod(g.id, o.id, g.maxSelect)}
                          className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-base ${
                            on
                              ? 'bg-cta text-cream'
                              : 'bg-white text-ink ring-1 ring-[#E0D5C4]'
                          }`}
                        >
                          <span className="font-semibold">{o.name}</span>
                          <span className={on ? 'text-cream' : 'text-muted'}>
                            {delta > 0
                              ? `+${formatGmd(delta)}`
                              : delta < 0
                                ? formatGmd(delta)
                                : 'Included'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <label className="block text-sm font-semibold">
                Kitchen notes
                <input
                  className="input-field mt-2"
                  value={lineNotes}
                  onChange={(e) => setLineNotes(e.target.value)}
                  placeholder="No onion, extra sauce…"
                />
              </label>
            </div>
            <div className="border-t border-[#E0D5C4] px-4 pt-3 pb-3">
              <Button className="w-full text-base" onClick={confirmAddToCart}>
                Add to cart
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionModal
        open={Boolean(exceptionConfirm)}
        title={
          exceptionConfirm?.kind === 'comp'
            ? `Request comp for ${exceptionConfirm.name}?`
            : `Request void for ${exceptionConfirm?.name ?? 'item'}?`
        }
        description={
          exceptionConfirm?.kind === 'comp'
            ? 'A manager must approve before this item is complimentary (no charge).'
            : 'A manager must approve before this item is voided after preparation.'
        }
        reasonLabel="Reason"
        reasonDefault={
          exceptionConfirm?.kind === 'comp'
            ? 'Complimentary — no charge'
            : 'Void after preparation'
        }
        reasonRequired
        confirmLabel={
          exceptionConfirm?.kind === 'comp' ? 'Send comp request' : 'Send void request'
        }
        danger={exceptionConfirm?.kind === 'void'}
        busy={busy}
        onCancel={() => setExceptionConfirm(null)}
        onConfirm={(reason) => void submitExceptionRequest(reason)}
      />
    </StaffShell>
  );
}
