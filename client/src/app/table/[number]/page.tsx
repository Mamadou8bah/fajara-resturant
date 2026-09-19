'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EmptyState, ErrorBanner, LoadingBlock } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

/**
 * Dev/staging shortcut: /table/1 (or /table1 via rewrite) acts like scanning
 * that table's QR — but only when staff are not logged in.
 */
export default function TableGuestShortcutPage() {
  const params = useParams<{ number: string }>();
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const tableNumber = String(params.number ?? '').trim();

  useEffect(() => {
    if (authLoading) return;

    if (token) {
      router.replace('/app/floor');
      return;
    }

    if (!tableNumber) {
      setError('Missing table number');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ token: string; path: string }>(
          `/guest/table/${encodeURIComponent(tableNumber)}`,
          { public: true },
        );
        if (cancelled) return;
        router.replace(res.path || `/m/${res.token}`);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : `Could not open table ${tableNumber}`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token, tableNumber, router]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
        <ErrorBanner message={error} />
        <EmptyState
          title={`Table ${tableNumber || '?'}`}
          body="Use a seeded table number in development (e.g. /table/1 or /table1)."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <LoadingBlock label={`Opening table ${tableNumber}…`} />
    </main>
  );
}
