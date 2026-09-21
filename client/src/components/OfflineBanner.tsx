'use client';

import { useEffect, useState } from 'react';
import { useStaffSyncOptional } from '@/lib/staffSync';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const sync = useStaffSyncOptional();

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  if (online) return null;

  const pending = sync?.pendingCount ?? 0;

  return (
    <div className="bg-warn px-4 py-2 text-center text-sm font-semibold text-ink">
      {pending > 0
        ? `You are offline — actions are queued (${pending} pending) and will sync when you reconnect.`
        : 'You are offline — you can keep working; actions will queue and sync when you reconnect.'}
    </div>
  );
}
