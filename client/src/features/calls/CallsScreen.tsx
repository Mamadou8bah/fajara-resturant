'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
} from '@/components/ui';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import {
  fetchNotifications,
  firstAccept,
  type StaffNotification,
} from '@/features/orders/api';

export function CallsScreen() {
  const [calls, setCalls] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const notesList = await fetchNotifications();
      setCalls(
        notesList.filter(
          (n) =>
            n.type === 'call_waiter' &&
            ['created', 'delivered', 'seen'].includes(n.status) &&
            !n.sessionWaiterId &&
            (n.sessionStatus == null || n.sessionStatus === 'OPEN'),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStaffRealtimeRefresh(() => {
    void load();
  });

  async function onAccept(n: StaffNotification) {
    setBusy(true);
    setBusyKey(`accept:${n.id}`);
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
      setBusyKey(null);
    }
  }

  return (
    <StaffShell
      title="Calls"
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
        <LoadingBlock label="Loading calls…" />
      ) : calls.length === 0 ? (
        <EmptyState
          title="No guest calls"
          body="When a guest taps Call waiter, it shows up here."
        />
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
                busy={busyKey === `accept:${n.id}`}
                busyLabel="Accepting…"
                onClick={() => void onAccept(n)}
              >
                Accept
              </Button>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
