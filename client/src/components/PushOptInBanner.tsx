'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import {
  canRequestPushPermission,
  dismissEnablePrompt,
  dismissInstallPrompt,
  enableWebPush,
  isIos,
  isStandalonePwa,
  pushSupported,
  refreshWebPushIfEnabled,
  shouldShowEnablePrompt,
  shouldShowIosInstallPrompt,
  type PushAudience,
} from '@/lib/webPush';

export function PushOptInBanner({
  audience,
  className = '',
}: {
  audience: PushAudience | null;
  className?: string;
}) {
  const [mode, setMode] = useState<'hidden' | 'install' | 'enable'>('hidden');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = audience?.kind === 'guest';

  useEffect(() => {
    if (!audience) {
      setMode('hidden');
      return;
    }
    // Guests: no iOS Add-to-Home-Screen nag. Android (and other in-tab push
    // browsers) still see Enable when canRequestPushPermission() is true.
    if (!isGuest && shouldShowIosInstallPrompt()) {
      setMode('install');
      return;
    }
    if (shouldShowEnablePrompt()) {
      setMode('enable');
      return;
    }
    setMode('hidden');
    void refreshWebPushIfEnabled(audience);
  }, [audience, isGuest]);

  if (!audience || mode === 'hidden') return null;
  // Guests never need the iOS-only install shell; hide if push unsupported.
  if (!pushSupported()) {
    if (isGuest) return null;
    if (!(isIos() && !isStandalonePwa())) return null;
  }
  // Guest on iOS Safari (no Home Screen): cannot enable — don't show banner.
  if (isGuest && !canRequestPushPermission() && mode !== 'enable') {
    return null;
  }

  async function onEnable() {
    if (!audience) return;
    if (!canRequestPushPermission()) {
      if (isGuest) {
        setMode('hidden');
        return;
      }
      setMode('install');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await enableWebPush(audience);
      if (!ok) {
        setError(
          Notification.permission === 'denied'
            ? 'Notifications are blocked in browser settings'
            : 'Could not enable alerts — try again',
        );
        return;
      }
      setMode('hidden');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable alerts');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border border-cta/30 bg-[#F6E4DC] px-4 py-3 text-ink shadow-sm ${className}`}
      role="status"
    >
      {mode === 'install' ? (
        <>
          <p className="text-sm font-bold">Get alerts on this iPhone</p>
          <p className="mt-1 text-sm text-muted">
            Tap Share, then{' '}
            <span className="font-semibold">Add to Home Screen</span>. Open from
            that icon (not Safari) to turn on staff alerts. Works on iOS 16.4+.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                dismissInstallPrompt();
                setMode('hidden');
              }}
            >
              Not now
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                dismissInstallPrompt();
                setMode(isStandalonePwa() ? 'enable' : 'hidden');
              }}
            >
              Got it
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold">Enable closed-app alerts</p>
          <p className="mt-1 text-sm text-muted">
            {audience.kind === 'guest'
              ? 'Get notified when your order is preparing or ready — even if you leave this screen.'
              : 'Get waiter calls, kitchen tickets, and approvals when the app is closed.'}
            {!isGuest && isIos()
              ? ' Works on Home Screen apps (iOS 16.4+).'
              : ''}
          </p>
          {error ? (
            <p className="mt-2 text-sm font-medium text-cta">{error}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                dismissEnablePrompt();
                setMode('hidden');
              }}
            >
              Not now
            </Button>
            <Button
              className="flex-1"
              busy={busy}
              busyLabel="Enabling…"
              onClick={() => void onEnable()}
            >
              Enable
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
