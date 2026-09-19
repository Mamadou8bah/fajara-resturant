'use client';

import { useEffect, useState } from 'react';

export function ConnectionStrip() {
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setSyncedAt(new Date().toLocaleTimeString());
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!online) return null;

  return (
    <div className="bg-ready px-4 py-1.5 text-center text-xs font-semibold text-cream">
      Live · last sync {syncedAt ?? '—'}
    </div>
  );
}
