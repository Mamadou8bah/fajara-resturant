'use client';

import { OfflineBanner } from '@/components/OfflineBanner';
import { IconBell } from '@/components/NavIcons';
import { BrandLogo } from '@/lib/brand';
import { useOnline } from '@/lib/useOnline';
import { unlockNotifyAudio } from '@/lib/notifySound';
import { useEffect } from 'react';

export function GuestShell({
  brandName = 'Fajara Kitchen',
  logoUrl,
  tableLabel,
  subtitle,
  joined,
  onCallWaiter,
  callBusy,
  children,
  footer,
  cartBar,
  hideBottomChrome,
  sidePanel,
}: {
  brandName?: string;
  logoUrl?: string | null;
  tableLabel?: string;
  subtitle?: string;
  joined?: boolean;
  onCallWaiter?: () => void;
  callBusy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Floating green “View order” bar (prototype) — mobile only when sidePanel is set. */
  cartBar?: React.ReactNode;
  /** Hide floating nav / cart bar (e.g. while an order sheet is open). */
  hideBottomChrome?: boolean;
  /** Desktop sticky cart / order panel. */
  sidePanel?: React.ReactNode;
}) {
  const hasDesktopSide = Boolean(sidePanel);
  const online = useOnline();
  const waiterDisabled = Boolean(callBusy) || !online;

  useEffect(() => {
    const unlock = () => unlockNotifyAudio();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <div className="app-shell mx-auto w-full max-w-lg md:h-auto md:max-h-none md:min-h-[100dvh] md:max-w-6xl md:overflow-visible">
      <header className="app-chrome shrink-0 border-b border-[#E0D5C4] bg-cream text-ink md:static">
        <div className="safe-pt">
          <OfflineBanner />
        </div>
        <div className="px-4 pb-3 pt-2 md:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <BrandLogo
                src={logoUrl}
                alt={brandName}
                className="mt-0.5 h-12 w-12 shrink-0 rounded-2xl bg-[#EDE6DA] object-contain p-1.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.65rem] font-extrabold leading-none tracking-tight text-ink md:text-[2rem]">
                  {brandName}
                </p>
                <p className="mt-1.5 text-sm font-medium text-muted">
                  {subtitle ??
                    (joined
                      ? tableLabel
                        ? `Ordering for ${tableLabel}`
                        : 'Ordering'
                      : tableLabel
                        ? `Table ${tableLabel}`
                        : 'Digital menu')}
                </p>
              </div>
            </div>
            {onCallWaiter ? (
              <button
                type="button"
                disabled={waiterDisabled}
                onClick={onCallWaiter}
                title={!online ? 'Reconnect to call a waiter' : undefined}
                aria-busy={callBusy || undefined}
                className="flex min-h-[48px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#EDE6DA] px-3 py-2 text-ink transition active:scale-[0.97] disabled:opacity-60"
                aria-label={
                  callBusy
                    ? 'Calling waiter'
                    : !online
                      ? 'Call waiter (offline)'
                      : 'Call waiter'
                }
              >
                {callBusy ? (
                  <span className="loader loader-sm" aria-hidden />
                ) : (
                  <IconBell className="h-5 w-5 text-cta" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  {callBusy ? 'Calling…' : 'Waiter'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={`app-scroll px-4 pt-0 md:flex-none md:overflow-visible md:px-8 ${
          hasDesktopSide
            ? 'pb-6 md:!pb-8'
            : cartBar
              ? 'app-pad-for-tabbar-fab'
              : 'app-pad-for-tabbar'
        }`}
      >
        {hasDesktopSide ? (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] md:items-start md:gap-6">
            <div className="min-w-0">{children}</div>
            <aside className="sticky top-4 mt-6 hidden md:mt-0 md:block">
              {sidePanel}
            </aside>
          </div>
        ) : (
          children
        )}
      </div>

      {cartBar && !hideBottomChrome ? (
        <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3 bottom-[calc(var(--app-tabbar-h)+var(--safe-bottom)+var(--app-tabbar-float)+0.65rem)] md:hidden">
          <div className="pointer-events-auto w-full max-w-lg">
            {cartBar}
          </div>
        </div>
      ) : null}

      {footer && !hideBottomChrome ? (
        <nav
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 md:hidden"
          style={{
            paddingBottom:
              'calc(var(--safe-bottom) + var(--app-tabbar-float))',
          }}
          aria-label="Guest"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-md">
            {footer}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
