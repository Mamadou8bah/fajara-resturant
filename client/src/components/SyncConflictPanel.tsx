'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useStaffSyncOptional } from '@/lib/staffSync';
import { notifyStaffDataChanged } from '@/lib/socket';
import type { OfflineWriteEntry } from '@/lib/offlineWriteQueue';

export function SyncConflictPanel({
  onRefreshLive,
}: {
  onRefreshLive?: () => void;
}) {
  const sync = useStaffSyncOptional();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!sync) return null;
  const failed = sync.entries.filter((e) => e.status === 'failed');
  const pending = sync.entries.filter(
    (e) => e.status === 'pending' || e.status === 'syncing',
  );
  if (failed.length === 0 && pending.length === 0 && !sync.pausedForAuth) {
    return null;
  }

  async function onRetry(entry: OfflineWriteEntry) {
    setBusyId(entry.id);
    try {
      await sync!.retry(entry.id);
      onRefreshLive?.();
      notifyStaffDataChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function onDiscard(entry: OfflineWriteEntry) {
    if (entry.requireConfirmDiscard && confirmId !== entry.id) {
      setConfirmId(entry.id);
      return;
    }
    setBusyId(entry.id);
    try {
      await sync!.discard(entry.id);
      setConfirmId(null);
      onRefreshLive?.();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-[#E0D5C4] bg-[#F7F4EF] px-4 py-3 text-sm text-ink">
      {sync.pausedForAuth ? (
        <p className="mb-2 font-semibold text-cta">
          Sign in again to sync {pending.length + failed.length} offline action
          {pending.length + failed.length === 1 ? '' : 's'}.
        </p>
      ) : null}

      {pending.length > 0 && failed.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            {sync.flushing ? 'Syncing' : 'Queued'} {pending.length} offline
            action{pending.length === 1 ? '' : 's'}
          </p>
          <Button
            variant="outline"
            className="text-xs"
            busy={sync.flushing}
            busyLabel="Syncing…"
            onClick={() => void sync.flush()}
          >
            Sync now
          </Button>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="space-y-3">
          <p className="font-bold text-cta">
            {failed.length} sync conflict{failed.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {failed.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-cta/30 bg-white px-3 py-3"
              >
                <p className="font-semibold">{entry.label}</p>
                <p className="mt-1 text-xs text-muted">
                  {entry.lastError || 'Could not apply this change on the server'}
                </p>
                {confirmId === entry.id ? (
                  <p className="mt-2 text-xs font-medium text-cta">
                    Discard this settle/payment permanently? Confirm below.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="text-xs"
                    busy={busyId === entry.id}
                    busyLabel="Retrying…"
                    onClick={() => void onRetry(entry)}
                  >
                    Retry
                  </Button>
                  <Button
                    variant="outline"
                    className="text-xs"
                    disabled={busyId === entry.id}
                    onClick={() => {
                      onRefreshLive?.();
                      notifyStaffDataChanged();
                    }}
                  >
                    Refresh live data
                  </Button>
                  <Button
                    variant="outline"
                    className="text-xs text-cta"
                    disabled={busyId === entry.id}
                    onClick={() => void onDiscard(entry)}
                  >
                    {confirmId === entry.id ? 'Confirm discard' : 'Discard'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
