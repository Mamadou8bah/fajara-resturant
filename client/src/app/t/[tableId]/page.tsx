'use client';

import { use, useEffect, useState } from 'react';
import { GuestMenuScreen } from '@/features/guest/GuestMenuScreen';
import {
  fetchGuestMenuByTableId,
  resolveGuestByTableId,
} from '@/features/guest/api';
import { EmptyState, ErrorBanner, LoadingBlock, Button } from '@/components/ui';

/**
 * Stable printable table QR: /t/{tableId}
 * Resolves the current internal token so rotating QR never breaks stickers.
 */
export default function StableTableGuestPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Prefer menu-by-table (returns token); fall back to by-table resolve.
        try {
          const menu = await fetchGuestMenuByTableId(tableId);
          if (cancelled) return;
          if (menu.token) {
            setToken(menu.token);
            return;
          }
        } catch {
          /* try resolve */
        }
        const res = await resolveGuestByTableId(tableId);
        if (cancelled) return;
        setToken(res.token);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not open this table');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
        <ErrorBanner message={error} />
        <EmptyState
          title="Table unavailable"
          body="This table link may be wrong. Ask staff for a working QR sticker."
        />
        <Button className="w-full" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <LoadingBlock label="Opening table…" />
      </main>
    );
  }

  return <GuestMenuScreen token={token} tableId={tableId} />;
}
