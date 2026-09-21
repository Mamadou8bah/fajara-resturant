'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ConnectionStrip } from '@/components/ConnectionStrip';
import { SyncConflictPanel } from '@/components/SyncConflictPanel';
import { NotificationInbox } from '@/components/NotificationInbox';
import { PushOptInBanner } from '@/components/PushOptInBanner';
import { IconLogout, IconMore, NavIcon } from '@/components/NavIcons';
import { useAuth } from '@/lib/auth';
import { STAFF_NAV, type NavItem } from '@/lib/rbac';
import { greetingForNow } from '@/lib/money';
import {
  connectSocket,
  joinStaffRooms,
  notifyStaffDataChanged,
} from '@/lib/socket';
import { announceEvent, announceNotification } from '@/lib/notifySound';
import { BrandLogo, useRestaurantBrand } from '@/lib/brand';
import { fetchSettings } from '@/features/settings/api';
import { markNotificationDelivered } from '@/features/orders/api';

const SHORT: Record<string, string> = {
  '/app/dashboard': 'Home',
  '/app/orders': 'Orders',
  '/app/kitchen': 'Kitchen',
  '/app/floor': 'Floor',
  '/app/checkout': 'Pay',
  '/app/sales': 'Sales',
  '/app/menu': 'Menu',
  '/app/inventory': 'Stock',
  '/app/employees': 'Staff',
  '/app/shifts': 'Shifts',
  '/app/reports': 'Reports',
  '/app/activity': 'Activity',
  '/app/settings': 'Settings',
};

/** Preferred order for the fixed mobile tab slots (max 4 + More). */
const MOBILE_PRIORITY = [
  '/app/dashboard',
  '/app/orders',
  '/app/floor',
  '/app/kitchen',
  '/app/checkout',
  '/app/sales',
  '/app/menu',
  '/app/inventory',
  '/app/employees',
  '/app/shifts',
  '/app/reports',
  '/app/activity',
  '/app/settings',
];

const MOBILE_PRIMARY_SLOTS = 4;

function splitMobileNav(nav: NavItem[]) {
  const ranked = [...nav].sort((a, b) => {
    const ai = MOBILE_PRIORITY.indexOf(a.href);
    const bi = MOBILE_PRIORITY.indexOf(b.href);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (ranked.length <= MOBILE_PRIMARY_SLOTS) {
    return { primary: ranked, overflow: [] as NavItem[] };
  }

  return {
    primary: ranked.slice(0, MOBILE_PRIMARY_SLOTS),
    overflow: ranked.slice(MOBILE_PRIMARY_SLOTS),
  };
}

export function StaffShell({
  title,
  subtitle,
  actions,
  children,
  showLiveStrip = false,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  showLiveStrip?: boolean;
}) {
  const { user, logout, token } = useAuth();
  const brand = useRestaurantBrand();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!token || !user) return;
    let soundOn = true;
    void fetchSettings()
      .then((s) => {
        const n = (s.notifications ?? {}) as { soundOn?: boolean };
        soundOn = n.soundOn !== false;
      })
      .catch(() => undefined);

    const s = connectSocket(token);
    const joinRooms = () =>
      joinStaffRooms(s, {
        id: user.id,
        role: user.role,
        permissions: user.permissions,
      });
    joinRooms();

    const onNotification = (n: {
      id?: string;
      type?: string;
      title?: string;
      body?: string | null;
      payload?: unknown;
    }) => {
      announceNotification(n, soundOn);
      if (n.id) {
        void markNotificationDelivered(n.id).catch(() => undefined);
      }
      notifyStaffDataChanged();
    };
    const onKitchenTicket = (payload?: {
      orderNumber?: number | string;
      session?: { table?: { number?: number | string } };
    }) => {
      const isKitchen =
        user.role === 'KITCHEN' || user.permissions.includes('orders.kitchen');
      if (isKitchen) {
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
      }
      notifyStaffDataChanged();
    };
    const onPlaced = (payload?: {
      orderNumber?: number | string;
      waiterId?: string | null;
      session?: { table?: { number?: number | string } };
    }) => {
      // Assigned waiter gets a dedicated order.assigned notification with speech.
      if (payload?.waiterId && payload.waiterId === user.id) {
        notifyStaffDataChanged();
        return;
      }
      const forMe =
        !payload?.waiterId ||
        user.role === 'OWNER' ||
        user.role === 'MANAGER';
      if (forMe) {
        const table = payload?.session?.table?.number;
        const num = payload?.orderNumber;
        announceEvent({
          enabled: soundOn,
          kind: 'order.placed',
          text:
            table != null && num != null
              ? `New guest order number ${num} from table ${table}. Review and send to kitchen.`
              : undefined,
          title: num != null ? `New QR order #${num}` : undefined,
          body: table != null ? `Table ${table} placed an order` : undefined,
        });
      }
      notifyStaffDataChanged();
    };
    const onWaiterCall = () => {
      notifyStaffDataChanged();
    };
    const onConnect = () => {
      joinRooms();
      notifyStaffDataChanged();
    };

    s.on('connect', onConnect);
    s.on('notification', onNotification);
    s.on('order.placed', onPlaced);
    s.on('order.submitted', onKitchenTicket);
    s.on('waiter.call', onWaiterCall);
    s.on('session.updated', notifyStaffDataChanged);
    s.on('session.opened', notifyStaffDataChanged);
    s.on('session.closed', notifyStaffDataChanged);
    s.on('session.moved', notifyStaffDataChanged);
    s.on('table.status', notifyStaffDataChanged);
    s.on('payment.settled', notifyStaffDataChanged);
    s.on('order_item.updated', notifyStaffDataChanged);
    s.on('order.status', notifyStaffDataChanged);
    return () => {
      s.off('connect', onConnect);
      s.off('notification', onNotification);
      s.off('order.placed', onPlaced);
      s.off('order.submitted', onKitchenTicket);
      s.off('waiter.call', onWaiterCall);
      s.off('session.updated', notifyStaffDataChanged);
      s.off('session.opened', notifyStaffDataChanged);
      s.off('session.closed', notifyStaffDataChanged);
      s.off('session.moved', notifyStaffDataChanged);
      s.off('table.status', notifyStaffDataChanged);
      s.off('payment.settled', notifyStaffDataChanged);
      s.off('order_item.updated', notifyStaffDataChanged);
      s.off('order.status', notifyStaffDataChanged);
    };
  }, [token, user]);

  const nav = useMemo(
    () =>
      STAFF_NAV.filter(
        (item) =>
          user && item.anyOf.some((p) => user.permissions.includes(p)),
      ),
    [user],
  );

  const { primary, overflow } = useMemo(() => splitMobileNav(nav), [nav]);
  const moreActive = overflow.some((item) => pathname.startsWith(item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  async function onLogout() {
    setMoreOpen(false);
    await logout();
    router.replace('/app/login');
  }

  return (
    <div className="app-shell md:h-auto md:max-h-none md:min-h-[100dvh] md:overflow-visible">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar text-[color:var(--sidebar-fg)] md:flex">
        <div className="border-b border-[color:var(--sidebar-edge)] px-5 py-6">
          <div className="flex items-center gap-3">
            <BrandLogo
              src={brand.logoUrl}
              alt={brand.tradingName}
              className="h-11 w-11 shrink-0 rounded-xl bg-[color:var(--sidebar-hover)] object-contain p-1"
              fallback={
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cta font-display text-lg font-extrabold text-cream">
                  {(brand.name || 'F').slice(0, 1)}
                </div>
              }
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-extrabold tracking-tight">
                {brand.name}
              </p>
              <p className="truncate text-xs text-[color:var(--sidebar-muted)]">
                {brand.tradingName === brand.name
                  ? 'Restaurant Services'
                  : brand.tradingName}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-cta text-cream'
                    : 'text-[color:var(--sidebar-fg)]/90 hover:bg-[color:var(--sidebar-hover)]'
                }`}
              >
                <NavIcon href={item.href} className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[color:var(--sidebar-edge)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cta text-sm font-bold text-cream">
              {user?.fullName?.slice(0, 1) ?? '?'}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {user?.fullName}
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-[color:var(--sidebar-fg)]/80 hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-fg)]"
              aria-label="Log out"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-60">
        <div className="app-chrome sticky top-0 z-30 shrink-0 bg-cream md:static">
          <div className="safe-pt">
            <OfflineBanner />
            <SyncConflictPanel />
            <ConnectionStrip />
          </div>
          <header className="border-b border-[#E0D5C4] px-4 py-2.5 md:px-6 md:py-4">
            {/* Mobile */}
            <div className="md:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <BrandLogo
                    src={brand.logoUrl}
                    alt={brand.tradingName}
                    className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-[#EDE6DA] object-contain p-1"
                    fallback={
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cta font-display text-sm font-extrabold text-cream">
                        {(brand.name || 'F').slice(0, 1)}
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {greetingForNow()}
                      {user ? `, ${user.fullName.split(' ')[0]}` : ''}
                    </p>
                    <h1 className="font-display text-xl font-bold leading-tight">
                      {title ?? 'Fajara'}
                    </h1>
                    {subtitle ? (
                      <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
                    ) : null}
                  </div>
                </div>
                <NotificationInbox />
              </div>
            </div>

            {/* Desktop: one row */}
            <div className="hidden min-w-0 items-center gap-4 md:flex">
              <h1 className="shrink-0 font-display text-2xl font-bold leading-none">
                {title ?? 'Fajara'}
              </h1>
              {subtitle ? (
                <p className="min-w-0 flex-1 truncate text-sm text-muted">
                  {subtitle}
                </p>
              ) : (
                <span className="flex-1" />
              )}
              {actions ? (
                <div className="flex min-w-0 max-w-[65%] flex-wrap items-center justify-end gap-2">
                  {actions}
                </div>
              ) : null}
              <NotificationInbox />
            </div>
          </header>
          {actions ? (
            <div className="border-b border-[#E0D5C4] px-3 py-2 md:hidden">
              <div className="chip-scroll items-center gap-2 [&_button]:min-h-touch [&_input]:min-h-11 [&_select]:min-h-11">
                {actions}
              </div>
            </div>
          ) : null}
        </div>

        <main className="app-scroll app-pad-for-tabbar p-3 sm:px-4 sm:pt-4 md:flex-none md:overflow-visible md:p-6">
          {user ? (
            <PushOptInBanner
              audience={{ kind: 'staff' }}
              className="mb-3"
            />
          ) : null}
          {children}
        </main>

        <nav
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 md:hidden"
          style={{
            paddingBottom: 'calc(var(--safe-bottom) + var(--app-tabbar-float))',
          }}
          aria-label="Primary"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-md">
            <div className="mobile-pill-nav">
              {primary.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-pill-item ${active ? 'mobile-pill-item-active' : ''}`}
                  >
                    <NavIcon
                      href={item.href}
                      className="mobile-pill-icon h-5 w-5"
                      active={active}
                    />
                    <span className="text-[10px] font-bold tracking-wide">
                      {SHORT[item.href] ?? item.label}
                    </span>
                  </Link>
                );
              })}
              {overflow.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={`mobile-pill-item ${
                    moreActive || moreOpen ? 'mobile-pill-item-active' : ''
                  }`}
                >
                  <IconMore
                    className={`mobile-pill-icon h-5 w-5 ${
                      moreActive || moreOpen ? 'text-cta' : ''
                    }`}
                  />
                  <span className="text-[10px] font-bold tracking-wide">
                    More
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </nav>
      </div>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#271A11]/55"
            aria-label="Close more menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="safe-pb absolute inset-x-0 bottom-0 rounded-t-3xl bg-cream px-4 pt-3 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4C4B0]" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandLogo
                  src={brand.logoUrl}
                  alt={brand.tradingName}
                  className="h-9 w-9 shrink-0 rounded-xl bg-[#EDE6DA] object-contain p-1"
                  fallback={
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cta font-display text-sm font-extrabold text-cream">
                      {(brand.name || 'F').slice(0, 1)}
                    </div>
                  }
                />
                <p className="font-display text-lg font-bold">More</p>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ul className="space-y-1 pb-2">
              {overflow.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex min-h-[52px] items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${
                        active ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
                      }`}
                    >
                      <NavIcon href={item.href} className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-cta"
                >
                  <IconLogout className="h-5 w-5" />
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
