'use client';

import { useEffect, useState } from 'react';
import { useStaffSyncOptional } from '@/lib/staffSync';

export function ConnectionStrip() {
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const sync = useStaffSyncOptional();

  useEffect(() => {
    const onChange = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setSyncedAt(new Date().toLocaleTimeString());
    };
    onChange();
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  useEffect(() => {
    if (sync && sync.pendingCount === 0 && sync.failedCount === 0 && online) {
      setSyncedAt(new Date().toLocaleTimeString());
    }
  }, [sync?.pendingCount, sync?.failedCount, online, sync]);

  if (!online) return null;

  const pending = sync?.pendingCount ?? 0;
  const failed = sync?.failedCount ?? 0;
  const flushing = sync?.flushing ?? false;

  let label = `Live · last sync ${syncedAt ?? '—'}`;
  if (failed > 0) {
    label = `Live · ${failed} sync conflict${failed === 1 ? '' : 's'}`;
  } else if (flushing) {
    label = `Syncing ${pending} queued action${pending === 1 ? '' : 's'}…`;
  } else if (pending > 0) {
    label = `Live · ${pending} pending sync`;
  }

  return (
    <div
      className={`px-4 py-1.5 text-center text-xs font-semibold text-cream ${
        failed > 0 ? 'bg-cta' : 'bg-ready'
      }`}
    >
      {label}
    </div>
  );
}
