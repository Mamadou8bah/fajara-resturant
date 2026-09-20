'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuestQrScanner } from '@/features/guest/GuestQrScanner';
import { BrandLogo } from '@/lib/brand';
import { getStoredToken, api } from '@/lib/api';
import {
  guestLaunchPath,
  readLaunchHint,
} from '@/lib/pwaLaunch';
import { Button, LoadingBlock } from '@/components/ui';

/**
 * Smart PWA start_url target. Never defaults guests to staff login.
 * Staff with a stored session → /app; last guest table → /t or /m; else scan home.
 */
export default function LaunchRouterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'routing' | 'home'>('routing');
  const [scanOpen, setScanOpen] = useState(false);
  const [brandName, setBrandName] = useState('Fajara');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const staffToken = getStoredToken();
      if (staffToken) {
        router.replace('/app/dashboard');
        return;
      }

      const hint = readLaunchHint();
      if (hint?.mode === 'staff') {
        router.replace('/app/login');
        return;
      }

      const guestPath = guestLaunchPath(hint);
      if (guestPath) {
        router.replace(guestPath);
        return;
      }

      if (cancelled) return;
      setMode('home');

      try {
        const pub = await api<{
          restaurantName?: string;
          profile?: { tradingName?: string; logoUrl?: string };
        }>('/settings/public', { public: true });
        if (cancelled) return;
        const name =
          pub.profile?.tradingName?.trim() ||
          pub.restaurantName?.trim() ||
          'Fajara';
        setBrandName(name);
        setLogoUrl(pub.profile?.logoUrl?.trim() || null);
      } catch {
        /* defaults */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (mode === 'routing') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <LoadingBlock label="Opening…" />
      </main>
    );
  }

  return (
    <main className="app-shell mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-cream text-ink">
      <div className="safe-pt" />
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        {scanOpen ? (
          <GuestQrScanner
            onPath={(path) => {
              setScanOpen(false);
              router.replace(path);
            }}
            onCancel={() => setScanOpen(false)}
          />
        ) : (
          <div className="mx-auto w-full max-w-sm space-y-6 text-center">
            <div className="flex justify-center">
              <BrandLogo
                src={logoUrl}
                alt={brandName}
                className="h-20 w-20 rounded-3xl bg-[#EDE6DA] object-contain p-2"
              />
            </div>
            <div>
              <p className="font-display text-3xl font-extrabold text-ink">
                {brandName}
              </p>
              <p className="mt-3 text-sm text-muted">
                Scan the QR on your table to open the menu and order.
              </p>
            </div>
            <Button
              className="w-full text-base"
              onClick={() => setScanOpen(true)}
            >
              Scan table QR
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/app/login')}
            >
              Staff login
            </Button>
          </div>
        )}
      </div>
      <div className="safe-pb" />
    </main>
  );
}
