'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuestShell } from '@/components/GuestShell';
import { PushOptInBanner } from '@/components/PushOptInBanner';
import {
  IconCart,
  IconOrders,
  IconStar,
  IconUtensils,
} from '@/components/NavIcons';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterChips,
  LoadingBlock,
  SearchField,
} from '@/components/ui';
import { formatGmd, formatDisplayDateTime } from '@/lib/money';
import { useCriticalForm } from '@/lib/criticalFormGate';
import { matchesQuery } from '@/lib/search';
import { useGuestSession } from '@/lib/guest-session';
import { useOnline } from '@/lib/useOnline';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import {
  announceEvent,
  announceGuestOrderStatus,
} from '@/lib/notifySound';
import {
  fetchGuestMenu,
  fetchGuestReceipt,
  fetchPriorOrders,
  guestCallWaiter,
  guestJoin,
  guestLeave,
  guestSubmitOrder,
  itemPrice,
  newClientRequestId,
  optionPriceDelta,
  type GuestCartLine,
  type GuestMenuItem,
  type GuestMenuResponse,
  type GuestPriorOrders,
  type GuestReceipt,
} from './api';
import { GuestQrScanner } from './GuestQrScanner';
import { BrandLogo } from '@/lib/brand';
import { recordGuestLaunch } from '@/lib/pwaLaunch';
import {
  downloadElementAsPng,
  receiptImageFilename,
} from './downloadReceiptImage';

type PriorItem = GuestPriorOrders['items'][number];

type PriorOrderGroup = {
  orderId: string;
  orderNumber: number | string;
  submittedAt: string;
  source: string;
  items: PriorItem[];
};

function groupPriorByOrder(items: PriorItem[]): PriorOrderGroup[] {
  const map = new Map<string, PriorOrderGroup>();
  for (const item of items) {
    const key = item.order.id;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        orderId: key,
        orderNumber: item.order.orderNumber,
        submittedAt: item.order.submittedAt,
        source: item.order.source,
        items: [item],
      });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}

function priorGroupProgress(items: PriorItem[]) {
  if (items.every((i) => i.settled || i.status === 'paid')) return 4;
  if (items.every((i) => i.status === 'served' || i.settled)) return 3;
  if (items.some((i) => i.status === 'ready')) return 2;
  if (items.some((i) => ['preparing', 'submitted'].includes(i.status)))
    return 1;
  return 0;
}

const ORDER_STAGE_LABELS = [
  'Received',
  'Preparing',
  'Ready',
  'Served',
  'Paid',
] as const;

function PriorProgressDots({ stage }: { stage: number }) {
  return (
    <div className="flex justify-between gap-1">
      {ORDER_STAGE_LABELS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-1">
          <span
            className={`h-2 w-2 rounded-full ${
              i <= stage ? 'bg-ready' : 'bg-[#E0D5C4]'
            }`}
          />
          <span
            className={`text-[9px] font-semibold ${
              i <= stage ? 'text-ready' : 'text-muted'
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function GuestMenuScreen({
  token,
  tableId,
}: {
  token: string;
  tableId?: string;
}) {
  const router = useRouter();
  const {
    session,
    setSession,
    clearSession,
    loadForToken,
    getOrCreateDeviceToken,
    rememberDeviceToken,
    clearOtherTableSessions,
    loadCart,
    saveCart,
    clearCart,
    cacheMenu,
    loadCachedMenu,
  } = useGuestSession();
  const online = useOnline();
  const [menu, setMenu] = useState<GuestMenuResponse | null>(null);
  const [prior, setPrior] = useState<GuestPriorOrders | null>(null);
  const [cart, setCart] = useState<GuestCartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  useCriticalForm(busy || cart.length > 0);
  const [view, setView] = useState<'menu' | 'cart' | 'orders'>('menu');
  const [picked, setPicked] = useState<GuestMenuItem | null>(null);
  const [modIds, setModIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [takeaway, setTakeaway] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [receiptPrompt, setReceiptPrompt] = useState<GuestReceipt | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptDownloadBusy, setReceiptDownloadBusy] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [brandName, setBrandName] = useState('Fajara Kitchen');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState('Tujereng Road');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [menuSettings, setMenuSettings] = useState<{
    specialsPosition?: string;
    showAllergens?: boolean;
    showTodayOnlyBadge?: boolean;
  }>({});
  const [guestNotify, setGuestNotify] = useState({
    guestPushOn: true,
    guestAnnounceOn: true,
  });
  const [qtyBumpLine, setQtyBumpLine] = useState<GuestCartLine | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCartHydrated(false);
    try {
      const existing = loadForToken(token);
      const draftCart = loadCart(token);
      if (draftCart.length > 0) {
        setCart(draftCart);
      }

      let m: GuestMenuResponse | null = null;
      try {
        m = await fetchGuestMenu(token);
        cacheMenu(token, m);
      } catch (e) {
        m = loadCachedMenu(token);
        if (!m) throw e;
        setToast('Showing cached menu — you are offline or reconnecting');
      }

      const pub = await api<{
        restaurantName?: string;
        profile?: {
          tradingName?: string;
          address?: string;
          logoUrl?: string;
        };
        menuSettings?: typeof menuSettings;
        notifications?: {
          guestPushOn?: boolean;
          guestAnnounceOn?: boolean;
        };
      }>('/settings/public', { public: true }).catch(() => null);

      setMenu(m);
      recordGuestLaunch({
        tableId: tableId || m.table.id,
        token: m.token || token,
      });
      if (pub?.menuSettings) setMenuSettings(pub.menuSettings);
      if (pub?.notifications) {
        setGuestNotify({
          guestPushOn: pub.notifications.guestPushOn !== false,
          guestAnnounceOn: pub.notifications.guestAnnounceOn !== false,
        });
      }
      const trading = pub?.profile?.tradingName?.trim();
      const rest = pub?.restaurantName?.trim();
      setBrandName(trading || rest || 'Fajara Kitchen');
      setLogoUrl(pub?.profile?.logoUrl?.trim() || null);
      if (pub?.profile?.address?.trim()) {
        setAddressLine(pub.profile.address.split(',')[0]!.trim());
      }
      if (existing?.deviceToken) {
        try {
          setPrior(await fetchPriorOrders(token, existing.deviceToken));
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          // Only drop the visit when the server says it is truly gone.
          if (
            /no active visit|does not match this table|guest device not found/i.test(
              msg,
            )
          ) {
            clearSession(token);
            setCart([]);
          }
          setPrior(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load menu');
    } finally {
      setCartHydrated(true);
      setLoading(false);
    }
  }, [
    token,
    tableId,
    loadForToken,
    loadCart,
    clearSession,
    cacheMenu,
    loadCachedMenu,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!cartHydrated) return;
    saveCart(token, cart);
  }, [cart, token, saveCart, cartHydrated]);

  useEffect(() => {
    if (!session?.sessionId || !session.deviceToken) return;
    const s = connectSocket();
    const room = `session:${session.sessionId}`;
    const join = () => s.emit('join', { room });

    const refreshOrders = () => {
      void fetchPriorOrders(token, session.deviceToken)
        .then(setPrior)
        .catch(() => undefined);
    };

    const patchItem = (payload: {
      id?: string;
      orderId?: string;
      orderItemId?: string;
      status?: string;
      nameSnapshot?: string;
      name?: string;
    }) => {
      const id = payload.id ?? payload.orderItemId;
      const status = payload.status;
      if (status) {
        setPrior((prev) => {
          if (!prev) return prev;
          let touched = false;
          const items = prev.items.map((it) => {
            if (id && it.id === id) {
              touched = true;
              return { ...it, status };
            }
            // Whole-order events (e.g. sent to kitchen)
            if (
              !id &&
              payload.orderId &&
              it.order.id === payload.orderId &&
              ['placed'].includes(it.status)
            ) {
              touched = true;
              return { ...it, status };
            }
            return it;
          });
          return touched ? { ...prev, items } : prev;
        });
      }
      refreshOrders();
    };

    join();
    refreshOrders();

    const onConnect = () => {
      join();
      refreshOrders();
    };

    const onStatus = (payload: {
      name?: string;
      status?: string;
      orderItemId?: string;
    }) => {
      if (payload.name && payload.status) {
        setToast(`${payload.name}: ${payload.status}`);
      }
      announceGuestOrderStatus(payload, guestNotify.guestAnnounceOn);
      patchItem(payload);
    };

    const onUnavailable = (payload: { name?: string }) => {
      const msg = payload.name
        ? `${payload.name} is unavailable — removed from your order`
        : 'An item is unavailable';
      setToast(msg);
      announceEvent({
        enabled: guestNotify.guestAnnounceOn,
        kind: 'default',
        text: payload.name
          ? `${payload.name} is unavailable and was removed from your order.`
          : 'An item on your order is unavailable.',
      });
      refreshOrders();
      void load();
    };

    const openReceipt = (transactionId?: string) => {
      setReceiptBusy(true);
      void fetchGuestReceipt(token, session.deviceToken, transactionId)
        .then((r) => {
          setReceiptPrompt(r);
          setView('orders');
          announceEvent({
            enabled: guestNotify.guestAnnounceOn,
            kind: 'default',
            text: 'Your bill is paid. You can download your receipt.',
          });
        })
        .catch(() => undefined)
        .finally(() => setReceiptBusy(false));
    };

    const onSettled = (payload?: {
      id?: string;
      guestId?: string | null;
      transactionNumber?: string;
      total?: string | number;
    }) => {
      refreshOrders();
      const forMe =
        !payload?.guestId ||
        !session.guestId ||
        payload.guestId === session.guestId;
      if (!forMe) return;
      setToast('Your bill is paid — thank you');
      announceEvent({
        enabled: guestNotify.guestAnnounceOn,
        kind: 'default',
        text: 'Your bill is paid. You can download your receipt.',
      });
      openReceipt(payload?.id);
    };

    s.on('connect', onConnect);
    s.on('order.status', onStatus);
    s.on('order.submitted', refreshOrders);
    s.on('order.placed', refreshOrders);
    s.on('order_item.updated', patchItem);
    s.on('order.updated', refreshOrders);
    s.on('menu.item_unavailable', onUnavailable);
    s.on('payment.settled', onSettled);

    return () => {
      s.off('connect', onConnect);
      s.off('order.status', onStatus);
      s.off('order.submitted', refreshOrders);
      s.off('order.placed', refreshOrders);
      s.off('order_item.updated', patchItem);
      s.off('order.updated', refreshOrders);
      s.off('menu.item_unavailable', onUnavailable);
      s.off('payment.settled', onSettled);
    };
  }, [
    session?.sessionId,
    session?.deviceToken,
    session?.guestId,
    token,
    load,
    guestNotify.guestAnnounceOn,
  ]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const cartCount = useMemo(
    () => cart.reduce((n, line) => n + line.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () => cart.reduce((s, line) => s + line.unitPrice * line.quantity, 0),
    [cart],
  );

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    return menu.categories
      .filter((c) => categoryId === 'all' || c.id === categoryId)
      .map((cat) => ({
        ...cat,
        menuItems: cat.menuItems.filter((item) => {
          return matchesQuery(
            menuQuery,
            item.name,
            item.description,
            ...(menuSettings.showAllergens !== false
              ? (item.allergens ?? [])
              : []),
            cat.name,
          );
        }),
      }))
      .filter((cat) => cat.menuItems.length > 0);
  }, [menu, categoryId, menuQuery, menuSettings.showAllergens]);

  const filteredSpecials = useMemo(() => {
    if (!menu) return [];
    return menu.specials.filter((s) => {
      if (!s.menuItem) return false;
      return matchesQuery(menuQuery, s.menuItem.name, s.type);
    });
  }, [menu, menuQuery]);

  const tableLabel = menu
    ? String(menu.table.label ?? `Table ${menu.table.number}`)
    : 'Your table';

  const subtitle = session
    ? session.displayName
      ? `Adding to ${session.displayName}'s order`
      : `${addressLine} · ordering for ${tableLabel}`
    : `${addressLine} · ${tableLabel}`;

  function openItem(item: GuestMenuItem) {
    if (item.isSoldOut) return;
    if (!session) {
      setToast(
        menu?.table.sessionOpen
          ? 'Join the table first to add items'
          : 'Ask staff to open your table before ordering',
      );
      return;
    }
    const defaults =
      item.modifierGroups?.flatMap((g) =>
        g.options.filter((o) => o.isDefault).map((o) => o.id),
      ) ?? [];
    setPicked(item);
    setModIds(defaults);
    setNotes('');
    setTakeaway(false);
    setError(null);
  }

  function renderDishCard({
    item,
    price,
    badge,
    meta,
  }: {
    item: GuestMenuItem;
    price: string | number;
    badge?: string;
    meta?: string;
  }) {
    const soldOut = item.isSoldOut;
    return (
      <button
        type="button"
        disabled={soldOut}
        onClick={() => openItem(item)}
        className={`flex h-[6.25rem] w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-[#E0D5C4] bg-white p-2.5 text-left transition active:scale-[0.99] ${
          soldOut ? 'opacity-70' : ''
        }`}
      >
        <div className="relative h-full w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-[#EDE6DA]">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl font-extrabold text-cta/70">
              {item.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          {badge ? (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink">
              {badge}
            </span>
          ) : null}
          {soldOut ? (
            <span className="absolute inset-x-0 bottom-0 bg-[#271A11]/75 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-cream">
              Sold out
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-[0.95rem] font-semibold leading-tight text-ink">
              {item.name}
            </p>
            <p className="shrink-0 text-[0.95rem] font-bold tabular-nums text-ink">
              {soldOut ? '—' : formatGmd(price)}
            </p>
          </div>
          <p className="text-sm leading-snug text-muted line-clamp-2">
            {soldOut
              ? 'Sold out for now'
              : item.description?.trim() || meta || '\u00a0'}
          </p>
          {!soldOut &&
          menuSettings.showAllergens !== false &&
          item.allergens &&
          item.allergens.length > 0 ? (
            <p className="truncate text-[11px] font-medium text-muted">
              Contains {item.allergens.join(', ')}
            </p>
          ) : !soldOut && meta && item.description?.trim() ? (
            <p className="truncate text-[11px] font-medium text-muted">{meta}</p>
          ) : null}
        </div>
      </button>
    );
  }

  const specialsBlock =
    categoryId === 'all' && filteredSpecials.length > 0 ? (
      <section key="specials">
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
          <IconStar className="h-5 w-5 text-warn" />
          Specials
        </h2>
        <ul className="space-y-3">
          {filteredSpecials.map((s) => {
            if (!s.menuItem) return null;
            const full = menu!.categories
              .flatMap((c) => c.menuItems)
              .find((i) => i.id === s.menuItem!.id);
            if (!full) return null;
            const metaBits = [
              full.isSoldOut ? 'Sold out' : null,
              menuSettings.showTodayOnlyBadge !== false && s.type === 'CHEF'
                ? 'Today only'
                : null,
              !full.isSoldOut && s.quantityRemaining != null
                ? `${s.quantityRemaining} left`
                : !full.isSoldOut
                  ? 'Chef special'
                  : null,
            ].filter(Boolean);
            return (
              <li key={s.id}>
                {renderDishCard({
                  item: full,
                  price:
                    s.specialPrice != null ? s.specialPrice : full.price,
                  badge: 'Special',
                  meta: metaBits.join(' · '),
                })}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  const browseMenuBlock = (
    <div className="space-y-6 pt-2">
      <SearchField
        value={menuQuery}
        onChange={setMenuQuery}
        placeholder="Search the menu"
        collapsible
      />
      <FilterChips
        value={categoryId}
        onChange={setCategoryId}
        options={[
          { value: 'all', label: 'All' },
          ...(menu?.categories.map((c) => ({
            value: c.id,
            label: c.name,
          })) ?? []),
        ]}
      />
      {menuSettings.specialsPosition !== 'bottom' ? specialsBlock : null}
      {filteredCategories.map((cat) => (
        <section key={cat.id}>
          <h2 className="mb-3 font-display text-xl font-bold">{cat.name}</h2>
          <ul className="space-y-3">
            {cat.menuItems.map((item) => (
              <li key={item.id}>
                {renderDishCard({
                  item,
                  price: itemPrice(item),
                })}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {menuSettings.specialsPosition === 'bottom' ? specialsBlock : null}
      {filteredCategories.length === 0 && filteredSpecials.length === 0 ? (
        <EmptyState title="No dishes found" body="Try another search." />
      ) : null}
    </div>
  );

  async function onJoin(e?: React.FormEvent) {
    e?.preventDefault();
    const name = displayName.trim();
    const seats = menu?.table.seats ?? 1;
    const remaining = menu?.table.remainingSeats ?? seats;
    if (!menu?.table.sessionOpen) {
      setJoinError('Ask staff to open your table before ordering.');
      return;
    }
    if (remaining <= 0) {
      setJoinError('This table is full. Ask staff for help.');
      return;
    }
    setBusy(true);
    setJoinError(null);
    setError(null);
    try {
      const res = await guestJoin(token, {
        displayName: name || undefined,
        deviceToken: getOrCreateDeviceToken(),
      });
      rememberDeviceToken(res.deviceToken);
      clearOtherTableSessions(token);
      setSession({
        token,
        guestId: res.guestId,
        sessionId: res.sessionId,
        deviceToken: res.deviceToken,
        displayName: name || null,
      });
      setToast(name ? `Welcome, ${name}` : 'Welcome — you can order now');
      // Refresh seating counts for any follow-up UI
      void fetchGuestMenu(token).then(setMenu).catch(() => undefined);
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : 'Could not join table',
      );
    } finally {
      setBusy(false);
    }
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

  function addPickedToCart() {
    if (!picked || !session) return;
    for (const g of picked.modifierGroups ?? []) {
      const selected = modIds.filter((id) =>
        g.options.some((o) => o.id === id),
      );
      if (selected.length < (g.minSelect ?? 0)) {
        setError(`Choose ${g.name}`);
        return;
      }
    }
    const delta = (picked.modifierGroups ?? [])
      .flatMap((g) => g.options)
      .filter((o) => modIds.includes(o.id))
      .reduce((s, o) => s + optionPriceDelta(o), 0);
    const labels = (picked.modifierGroups ?? [])
      .flatMap((g) => g.options)
      .filter((o) => modIds.includes(o.id))
      .map((o) => o.name);
    const unit = itemPrice(picked) + delta;
    const key = `${picked.id}:${modIds.slice().sort().join(',')}:${takeaway ? 1 : 0}:${notes}`;
    setCart((c) => {
      const existing = c.find((l) => l.key === key);
      if (existing) {
        return c.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...c,
        {
          key,
          menuItemId: picked.id,
          name: picked.name,
          unitPrice: unit,
          quantity: 1,
          kitchenNotes: notes || undefined,
          isTakeaway: takeaway || undefined,
          modifierOptionIds: modIds,
          modifierLabels: labels,
        },
      ];
    });
    setPicked(null);
    setToast('Added to cart');
    setError(null);
  }

  function setQty(key: string, next: number) {
    setCart((c) => {
      if (next <= 0) return c.filter((l) => l.key !== key);
      return c.map((l) => (l.key === key ? { ...l, quantity: next } : l));
    });
  }

  function requestBumpQty(line: GuestCartLine) {
    if (line.modifierOptionIds.length > 0) {
      setQtyBumpLine(line);
      return;
    }
    setQty(line.key, line.quantity + 1);
  }

  function confirmBumpSame() {
    if (!qtyBumpLine) return;
    setQty(qtyBumpLine.key, qtyBumpLine.quantity + 1);
    setQtyBumpLine(null);
  }

  function confirmBumpDifferent() {
    if (!qtyBumpLine || !menu) return;
    const item = menu.categories
      .flatMap((c) => c.menuItems)
      .find((i) => i.id === qtyBumpLine.menuItemId);
    setQtyBumpLine(null);
    if (item) openItem(item);
  }

  async function onSubmitOrder() {
    if (!session || cart.length === 0) return;
    if (!online) {
      setError(
        'You are offline. Browse the menu, then place your order when you reconnect.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    const clientRequestId = newClientRequestId();

    const placeWith = async (guestId: string) => {
      await guestSubmitOrder({
        clientRequestId,
        token,
        guestId,
        items: cart.map((line) => ({
          guestId,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          kitchenNotes: line.kitchenNotes,
          isTakeaway: line.isTakeaway,
          modifierOptionIds: line.modifierOptionIds.length
            ? line.modifierOptionIds
            : undefined,
        })),
      });
    };

    try {
      let guestId = session.guestId;
      let deviceToken = session.deviceToken;
      try {
        await placeWith(guestId);
      } catch (first) {
        const msg = first instanceof Error ? first.message : '';
        // Stale guest row on an still-open table — resume this phone and retry once.
        if (/not on this session|seat on this table expired/i.test(msg)) {
          const res = await guestJoin(token, {
            displayName: session.displayName ?? undefined,
            deviceToken: getOrCreateDeviceToken(),
          });
          rememberDeviceToken(res.deviceToken);
          guestId = res.guestId;
          deviceToken = res.deviceToken;
          setSession({
            token,
            guestId: res.guestId,
            sessionId: res.sessionId,
            deviceToken: res.deviceToken,
            displayName: session.displayName ?? null,
          });
          await placeWith(guestId);
        } else {
          throw first;
        }
      }
      setCart([]);
      clearCart(token);
      setView('orders');
      setToast('Order placed — staff will send it to the kitchen');
      try {
        setPrior(await fetchPriorOrders(token, deviceToken));
      } catch {
        /* order already placed — keep guest in the visit */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Order failed';
      // Only drop the visit when the table truly has no open seating left.
      if (
        /not open yet|no open session for this table|session is not open|no active visit|table .* is not available|table is full/i.test(
          msg,
        )
      ) {
        clearSession(token);
        setCart([]);
        setError('This table visit ended. Join again when you are seated.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCallWaiter() {
    if (!session) return;
    if (!online) {
      setError('You are offline. Reconnect to call a waiter.');
      return;
    }
    setCallBusy(true);
    setError(null);
    try {
      await guestCallWaiter(token, session.guestId);
      setToast('Waiter is on the way');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not call waiter');
    } finally {
      setCallBusy(false);
    }
  }

  async function onLeaveTable() {
    if (!session?.deviceToken) return;
    if (!online) {
      setError('You are offline. Reconnect to leave the table.');
      return;
    }
    const unpaid = (prior?.items ?? []).some(
      (i) => !i.settled && i.status !== 'cancelled' && i.status !== 'voided',
    );
    if (unpaid) {
      setError('Settle your order with staff before leaving the table.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await guestLeave(token, session.deviceToken);
      clearSession(token);
      setToast('You left the table — enjoy the rest of your day');
      setView('menu');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave table');
    } finally {
      setBusy(false);
    }
  }

  function goOrders() {
    setView('orders');
    if (session?.deviceToken) {
      void fetchPriorOrders(token, session.deviceToken)
        .then(setPrior)
        .catch(() => setPrior(null));
    }
  }

  const footer = (
    <div className="mobile-pill-nav mx-auto w-full max-w-md">
      {(
        [
          { id: 'menu' as const, label: 'Menu', Icon: IconUtensils },
          { id: 'cart' as const, label: 'Cart', Icon: IconCart },
          { id: 'orders' as const, label: 'Orders', Icon: IconOrders },
        ] as const
      ).map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (tab.id === 'orders') goOrders();
              else setView(tab.id);
            }}
            className={`mobile-pill-item ${active ? 'mobile-pill-item-active' : ''}`}
          >
            <span className="relative mobile-pill-icon">
              <tab.Icon className="h-5 w-5" />
              {tab.id === 'cart' && cartCount > 0 ? (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold text-cream">
                  {cartCount}
                </span>
              ) : null}
            </span>
            <span className="text-[10px] font-bold tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const cartBar =
    view === 'menu' && cartCount > 0 ? (
      <button
        type="button"
        className="guest-cart-bar w-full text-left"
        onClick={() => setView('cart')}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cream/20 px-2 text-sm">
            {cartCount}
          </span>
          View order
        </span>
        <span>{formatGmd(cartTotal)}</span>
      </button>
    ) : null;

  const desktopSidePanel = (
    <div className="space-y-4 rounded-2xl border border-[#E0D5C4] bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('menu')}
          className={`min-h-[40px] flex-1 rounded-full text-sm font-bold ${
            view === 'menu' ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Menu
        </button>
        <button
          type="button"
          onClick={() => setView('cart')}
          className={`relative min-h-[40px] flex-1 rounded-full text-sm font-bold ${
            view === 'cart' ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Cart
          {cartCount > 0 ? (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar px-1 text-[10px] text-cream">
              {cartCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={goOrders}
          className={`min-h-[40px] flex-1 rounded-full text-sm font-bold ${
            view === 'orders' ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Orders
        </button>
      </div>
      <div>
        <p className="font-display text-lg font-bold">Your cart</p>
        <p className="text-sm text-muted">
          {cartCount === 0
            ? 'Tap a dish to add it'
            : `${cartCount} item${cartCount === 1 ? '' : 's'} · ${formatGmd(cartTotal)}`}
        </p>
      </div>
      {cart.length === 0 ? (
        <p className="text-sm text-muted">Cart is empty.</p>
      ) : (
        <ul className="max-h-[40vh] space-y-3 overflow-auto">
          {cart.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{line.name}</p>
                {line.modifierLabels.length ? (
                  <p className="truncate text-xs text-muted">
                    {line.modifierLabels.join(', ')}
                  </p>
                ) : null}
                <p className="text-xs text-muted">
                  {formatGmd(line.unitPrice * line.quantity)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EDE6DA] font-bold"
                  onClick={() => setQty(line.key, line.quantity - 1)}
                >
                  −
                </button>
                <span className="min-w-[1.25rem] text-center text-sm font-bold">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-cta font-bold text-cream"
                  onClick={() => requestBumpQty(line)}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        className="w-full"
        disabled={busy || cart.length === 0 || !online}
        busy={busy}
        busyLabel="Placing order…"
        onClick={() => void onSubmitOrder()}
      >
        {!online
          ? 'Reconnect to place order'
          : `Place order · ${formatGmd(cartTotal)}`}
      </Button>
      {!online && cart.length > 0 ? (
        <p className="text-center text-xs font-medium text-muted">
          Ordering pauses while offline — browsing still works.
        </p>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <GuestShell brandName={brandName} logoUrl={logoUrl} tableLabel={tableLabel}>
        <div className="pt-4">
          <LoadingBlock label="Loading…" />
        </div>
      </GuestShell>
    );
  }

  if (!menu) {
    return (
      <GuestShell brandName={brandName} logoUrl={logoUrl} tableLabel={tableLabel}>
        <div className="space-y-4 pt-4">
          {error ? (
            <ErrorBanner message={error} onClose={() => setError(null)} />
          ) : null}
          {scanOpen ? (
            <GuestQrScanner
              onPath={(path) => {
                setScanOpen(false);
                const current =
                  tableId != null
                    ? `/t/${tableId}`
                    : `/m/${encodeURIComponent(token)}`;
                if (path === current || path === `/m/${token}`) {
                  setError(
                    'That QR is the same link — ask staff if it still fails.',
                  );
                  return;
                }
                router.replace(path);
              }}
              onCancel={() => setScanOpen(false)}
            />
          ) : (
            <>
              <EmptyState
                title="Menu unavailable"
                body="This link may be old. Scan the QR on your table to open the menu."
              />
              <Button
                className="w-full text-base"
                onClick={() => {
                  setError(null);
                  setScanOpen(true);
                }}
              >
                Scan table QR
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void load()}
              >
                Try again
              </Button>
            </>
          )}
        </div>
      </GuestShell>
    );
  }

  // Staff must open the table first. Until then guests can browse only.
  if (!session && !menu.table.sessionOpen) {
    return (
      <GuestShell
        brandName={brandName}
        logoUrl={logoUrl}
        tableLabel={tableLabel}
        subtitle={subtitle}
        footer={
          <p className="px-1 text-center text-sm text-muted">
            Browse the menu — ask staff to open your table when you are seated.
          </p>
        }
      >
        <div className="mb-3 mt-3 rounded-2xl bg-[#F6E4DC] px-4 py-3 text-sm text-ink">
          <p className="font-bold">Waiting for staff</p>
          <p className="mt-1 text-muted">
            Ask a staff member to open {tableLabel || 'this table'} on the floor
            plan before you can join and order.
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => void load()}
          >
            Check again
          </Button>
        </div>
        {toast ? (
          <p className="mb-3 rounded-2xl bg-[#DCEBE4] px-4 py-3 text-sm font-medium text-ready">
            {toast}
          </p>
        ) : null}
        {error ? (
          <ErrorBanner message={error} onClose={() => setError(null)} />
        ) : null}
        {browseMenuBlock}
      </GuestShell>
    );
  }

  // Session open — name then the guest menu.
  if (!session) {
    const seats = menu.table.seats ?? 1;
    const remaining = menu.table.remainingSeats ?? seats;
    const tableFull = remaining <= 0;
    return (
      <div className="app-shell mx-auto w-full max-w-lg bg-cream text-ink md:h-auto md:max-h-none md:min-h-[100dvh] md:max-w-xl md:overflow-visible">
        <div className="safe-pt" />
        <div className="flex flex-1 flex-col justify-center px-6 py-10">
          <form onSubmit={onJoin} className="mx-auto w-full max-w-sm space-y-5">
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <BrandLogo
                  src={logoUrl}
                  alt={brandName}
                  className="h-20 w-20 rounded-3xl bg-[#EDE6DA] object-contain p-2"
                />
              </div>
              <p className="font-display text-3xl font-extrabold text-ink">
                {brandName}
              </p>
              {tableLabel ? (
                <p className="mt-2 text-base text-muted">{tableLabel}</p>
              ) : null}
              <p className="mt-3 text-sm text-muted">
                {tableFull
                  ? 'This table is full — please ask a member of staff.'
                  : 'Enter your name to start ordering.'}
              </p>
            </div>
            {joinError ? (
              <ErrorBanner
                message={joinError}
                onClose={() => setJoinError(null)}
              />
            ) : null}
            {!tableFull ? (
              <>
                <label className="block text-left text-sm font-semibold">
                  Your name{' '}
                  <span className="font-normal text-muted">(optional)</span>
                  <input
                    className="input-field mt-2"
                    placeholder="e.g. Awa"
                    value={displayName}
                    autoFocus
                    autoComplete="name"
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                  />
                </label>
                <Button
                  type="submit"
                  className="w-full text-base"
                  busy={busy}
                  busyLabel="Joining…"
                >
                  Start ordering
                </Button>
              </>
            ) : null}
          </form>
        </div>
        <div className="safe-pb" />
      </div>
    );
  }

  return (
    <GuestShell
      brandName={brandName}
      logoUrl={logoUrl}
      tableLabel={tableLabel}
      subtitle={subtitle}
      joined
      onCallWaiter={() => void onCallWaiter()}
      callBusy={callBusy}
      footer={footer}
      cartBar={cartBar}
      hideBottomChrome={Boolean(picked)}
      sidePanel={desktopSidePanel}
    >
      {toast ? (
        <p className="mb-3 mt-3 rounded-2xl bg-[#DCEBE4] px-4 py-3 text-sm font-medium text-ready">
          {toast}
        </p>
      ) : null}
      {session?.guestId && session.deviceToken && guestNotify.guestPushOn ? (
        <PushOptInBanner
          audience={{
            kind: 'guest',
            guestId: session.guestId,
            deviceToken: session.deviceToken,
          }}
          className="mb-3 mt-3"
        />
      ) : null}
      {error ? (
        <ErrorBanner message={error} onClose={() => setError(null)} />
      ) : null}

      {view === 'menu' && prior && prior.items.length > 0 ? (
        <section className="mb-4 mt-3 rounded-2xl border border-[#E0D5C4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-display text-base font-bold">Your order</p>
            <button
              type="button"
              className="text-xs font-bold text-cta"
              onClick={goOrders}
            >
              Details
            </button>
          </div>
          <ul className="space-y-4">
            {groupPriorByOrder(prior.items).map((group) => {
              const stage = priorGroupProgress(group.items);
              return (
                <li key={group.orderId}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Order #{group.orderNumber}
                  </p>
                  <PriorProgressDots stage={stage} />
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium">
                          {item.quantity}× {item.name}
                        </span>
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">
                          {item.settled ? 'paid' : item.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {view === 'cart' ? (
        <div className="space-y-3 pt-4 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Your order</h2>
            <button
              type="button"
              className="text-sm font-bold text-cta"
              onClick={() => setView('menu')}
            >
              Add more items
            </button>
          </div>
          {cart.length === 0 ? (
            <EmptyState
              title="Cart is empty"
              body="Tap a dish on the menu to add it."
            />
          ) : (
            <>
              {cart.map((line) => (
                <div
                  key={line.key}
                  className="rounded-2xl border border-[#E0D5C4] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{line.name}</p>
                      {line.modifierLabels.length ? (
                        <p className="mt-0.5 text-sm text-muted">
                          {line.modifierLabels.join(', ')}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm font-medium">
                        {formatGmd(line.unitPrice * line.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                        onClick={() => setQty(line.key, line.quantity - 1)}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-base font-bold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-cta text-lg font-bold text-cream"
                        onClick={() => requestBumpQty(line)}
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                className="mt-2 w-full text-base"
                disabled={busy || !online}
                busy={busy}
                busyLabel="Placing order…"
                onClick={() => void onSubmitOrder()}
              >
                {!online
                  ? 'Reconnect to place order'
                  : `Place order · ${formatGmd(cartTotal)}`}
              </Button>
              {!online ? (
                <p className="mt-2 text-center text-sm font-medium text-muted">
                  You can keep browsing — ordering is paused until you are online.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {view === 'orders' ? (
        <div className="space-y-4 pt-4">
          {!prior || prior.items.length === 0 ? (
            <EmptyState
              title="No orders yet"
              body="After you place an order, it shows up here."
            />
          ) : (
            groupPriorByOrder(prior.items).map((group) => {
              const stage = priorGroupProgress(group.items);
              const total = group.items.reduce(
                (sum, item) =>
                  sum +
                  Number(item.unitPrice) * item.quantity +
                  item.modifiers.reduce(
                    (m, mod) => m + Number(mod.price) * item.quantity,
                    0,
                  ),
                0,
              );
              return (
                <section
                  key={group.orderId}
                  className="overflow-hidden rounded-2xl border border-[#E0D5C4] bg-white"
                >
                  <header className="flex items-start justify-between gap-3 border-b border-[#E0D5C4] bg-[#FAF7F2] px-4 py-3">
                    <div>
                      <p className="font-display text-lg font-bold text-ink">
                        Order #{group.orderNumber}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {group.source === 'GUEST' ? 'From menu' : 'With waiter'}
                        {group.items.length > 1
                          ? ` · ${group.items.length} items`
                          : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-bold tabular-nums">
                      {formatGmd(total)}
                    </p>
                  </header>
                  <div className="px-4 py-3">
                    <PriorProgressDots stage={stage} />
                  </div>
                  <ul className="divide-y divide-[#EDE6DA] border-t border-[#E0D5C4]">
                    {group.items.map((item) => (
                      <li key={item.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">
                              {item.quantity}× {item.name}
                            </p>
                            {item.modifiers.length > 0 ? (
                              <p className="mt-0.5 text-sm text-muted">
                                {item.modifiers.map((m) => m.name).join(', ')}
                              </p>
                            ) : null}
                            {item.kitchenNotes ? (
                              <p className="mt-1 text-sm font-medium text-ink">
                                Note: {item.kitchenNotes}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">
                              {item.settled ? 'Paid' : item.status}
                              {item.isTakeaway ? ' · Takeaway' : ''}
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums">
                            {formatGmd(
                              Number(item.unitPrice) * item.quantity +
                                item.modifiers.reduce(
                                  (m, mod) =>
                                    m + Number(mod.price) * item.quantity,
                                  0,
                                ),
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {group.items.some((i) => i.settled) ? (
                    <div className="space-y-2 border-t border-[#E0D5C4] px-4 py-3">
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={receiptBusy || !session?.deviceToken}
                        onClick={() => {
                          const txnId =
                            group.items.find((i) => i.settledTransactionId)
                              ?.settledTransactionId ?? undefined;
                          if (!session?.deviceToken) return;
                          setReceiptBusy(true);
                          void fetchGuestReceipt(
                            token,
                            session.deviceToken,
                            txnId ?? undefined,
                          )
                            .then(setReceiptPrompt)
                            .catch((e) =>
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : 'Could not load receipt',
                              ),
                            )
                            .finally(() => setReceiptBusy(false));
                        }}
                      >
                        {receiptBusy ? 'Loading…' : 'View / download receipt'}
                      </Button>
                      {group.items.every(
                        (i) =>
                          i.settled ||
                          i.status === 'cancelled' ||
                          i.status === 'voided',
                      ) ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={busy || !session?.deviceToken}
                          onClick={() => void onLeaveTable()}
                        >
                          Leave table
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      ) : null}

      {view === 'menu' || view === 'cart' ? (
        <div className={`space-y-5 ${view === 'cart' ? 'hidden md:block' : ''}`}>
          <div className="sticky top-0 z-[5] -mx-4 space-y-3 border-b border-[#EDE6DA] bg-cream px-4 pb-3 pt-0 md:-mx-0 md:px-0">
            <SearchField
              value={menuQuery}
              onChange={setMenuQuery}
              placeholder="Search dishes…"
              collapsible
            />
            <FilterChips
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: 'all', label: 'All' },
                ...menu.categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </div>

          {specialsBlock}

          {filteredCategories.length === 0 && !specialsBlock ? (
            <EmptyState
              title="No dishes match"
              body="Try another search or clear filters."
            />
          ) : (
            filteredCategories.map((cat) => (
              <section key={cat.id}>
                <h2 className="mb-3 font-display text-xl font-bold">
                  {cat.name}
                </h2>
                <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
                  {cat.menuItems.map((item) => (
                    <li key={item.id}>
                      {renderDishCard({
                        item,
                        price: itemPrice(item),
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}

      {picked ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 md:items-center md:p-6">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setPicked(null)}
          />
          <div className="safe-pb relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-cream shadow-lg md:max-h-[min(90dvh,40rem)] md:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E0D5C4] px-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                {picked.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={picked.photoUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : null}
                <div>
                  <p className="font-display text-2xl font-bold">{picked.name}</p>
                  <p className="mt-1 text-base text-muted">
                    {formatGmd(itemPrice(picked))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
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
                            {optionPriceDelta(o) > 0
                              ? `+${formatGmd(optionPriceDelta(o))}`
                              : optionPriceDelta(o) < 0
                                ? formatGmd(optionPriceDelta(o))
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
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="No onion, extra sauce…"
                />
              </label>
              <button
                type="button"
                onClick={() => setTakeaway((v) => !v)}
                className={`flex min-h-[52px] w-full items-center justify-between rounded-2xl px-4 text-base font-semibold ${
                  takeaway
                    ? 'bg-cta text-cream'
                    : 'bg-white ring-1 ring-[#E0D5C4]'
                }`}
              >
                Takeaway
                <span>{takeaway ? 'Yes' : 'No'}</span>
              </button>
            </div>
            <div className="border-t border-[#E0D5C4] px-4 pt-3">
              <Button className="w-full text-base" onClick={addPickedToCart}>
                Add to cart
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptPrompt ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-[#271A11]/45"
            aria-label="Close receipt"
            onClick={() => setReceiptPrompt(null)}
          />
          <div className="safe-pb relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-lg md:max-h-[min(90dvh,40rem)] md:rounded-3xl">
            <div className="border-b border-[#E0D5C4] px-4 py-3">
              <p className="font-display text-lg font-bold">Your receipt</p>
              <p className="text-xs text-muted">
                {receiptPrompt.transactionNumber} · paid
              </p>
            </div>
            <div
              id="guest-receipt-card"
              className="flex-1 space-y-2 overflow-auto bg-cream px-4 py-4 font-mono text-sm"
            >
              <p className="text-center font-sans text-base font-bold">
                {receiptPrompt.restaurantName}
              </p>
              <p className="text-center text-xs text-muted">
                Receipt {receiptPrompt.transactionNumber}
              </p>
              <p className="text-center text-xs text-muted">
                Table {receiptPrompt.table.number}
                {receiptPrompt.table.label
                  ? ` · ${receiptPrompt.table.label}`
                  : ''}{' '}
                · {formatDisplayDateTime(receiptPrompt.createdAt)}
              </p>
              <ul className="mt-3 space-y-2 border-t border-dashed border-[#E0D5C4] pt-3">
                {receiptPrompt.lines.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="flex justify-between gap-2">
                    <span>
                      {l.quantity}× {l.name}
                      {l.modifiers.length > 0 ? (
                        <span className="block text-xs text-muted">
                          {l.modifiers.map((m) => m.name).join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatGmd(
                        Number(l.unitPrice) * l.quantity +
                          l.modifiers.reduce(
                            (s, m) => s + Number(m.price) * l.quantity,
                            0,
                          ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-dashed border-[#E0D5C4] pt-3">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatGmd(receiptPrompt.subtotal)}</span>
                </div>
                {Number(receiptPrompt.taxAmount) > 0 ? (
                  <div className="flex justify-between">
                    <span>{receiptPrompt.taxLabel ?? 'Tax'}</span>
                    <span>{formatGmd(receiptPrompt.taxAmount)}</span>
                  </div>
                ) : null}
                {Number(receiptPrompt.tipAmount) > 0 ? (
                  <div className="flex justify-between">
                    <span>Tip</span>
                    <span>{formatGmd(receiptPrompt.tipAmount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatGmd(receiptPrompt.total)}</span>
                </div>
              </div>
              {receiptPrompt.payments.length > 0 ? (
                <ul className="space-y-1 border-t border-dashed border-[#E0D5C4] pt-3 text-xs">
                  {receiptPrompt.payments.map((p, i) => (
                    <li key={`${p.method}-${i}`} className="space-y-0.5">
                      <div className="flex justify-between gap-2">
                        <span>{p.method}</span>
                        <span className="tabular-nums">{formatGmd(p.amount)}</span>
                      </div>
                      {p.cashReceived != null && Number(p.cashReceived) > 0 ? (
                        <div className="flex justify-between gap-2 text-muted">
                          <span>Expected</span>
                          <span className="tabular-nums">
                            {formatGmd(Number(p.cashReceived))}
                          </span>
                        </div>
                      ) : null}
                      {p.cashChange != null && Number(p.cashChange) > 0 ? (
                        <div className="flex justify-between gap-2 font-semibold">
                          <span>Change</span>
                          <span className="tabular-nums">
                            {formatGmd(Number(p.cashChange))}
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {receiptPrompt.footer ? (
                <p className="pt-3 text-center text-xs text-muted">
                  {receiptPrompt.footer}
                </p>
              ) : (
                <p className="pt-3 text-center text-xs text-muted">
                  Thank you for dining with us.
                </p>
              )}
            </div>
            <div className="flex gap-2 border-t border-[#E0D5C4] px-4 py-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReceiptPrompt(null)}
              >
                Close
              </Button>
              <Button
                className="flex-1"
                disabled={receiptDownloadBusy}
                onClick={() => {
                  const el = document.getElementById('guest-receipt-card');
                  if (!el || !receiptPrompt) return;
                  setReceiptDownloadBusy(true);
                  void downloadElementAsPng(
                    el,
                    receiptImageFilename(receiptPrompt),
                  )
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not download receipt image',
                      ),
                    )
                    .finally(() => setReceiptDownloadBusy(false));
                }}
              >
                {receiptDownloadBusy ? 'Saving…' : 'Download PNG'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {qtyBumpLine ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 p-0 md:items-center md:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setQtyBumpLine(null)}
          />
          <div className="safe-pb relative z-10 w-full max-w-md rounded-t-3xl bg-cream p-4 shadow-lg md:rounded-3xl">
            <p className="font-display text-lg font-bold text-ink">
              Same as previous?
            </p>
            <p className="mt-1 text-sm text-muted">
              {qtyBumpLine.name}
              {qtyBumpLine.modifierLabels.length
                ? ` · ${qtyBumpLine.modifierLabels.join(', ')}`
                : ''}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={confirmBumpDifferent}
              >
                Different
              </Button>
              <Button className="flex-1" onClick={confirmBumpSame}>
                Same
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </GuestShell>
  );
}
