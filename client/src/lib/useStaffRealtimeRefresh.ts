'use client';

import { useEffect, useRef } from 'react';
import { onStaffDataChanged } from '@/lib/socket';

/**
 * Refetch critical staff screens when Socket.IO / StaffShell broadcasts
 * data changes (orders, payments, sessions, etc.).
 */
export function useStaffRealtimeRefresh(
  refresh: () => void,
  opts?: {
    enabled?: boolean;
    /** Collapse event bursts (settle emits several messages). Default 150ms. */
    debounceMs?: number;
  },
) {
  const enabled = opts?.enabled !== false;
  const debounceMs = opts?.debounceMs ?? 150;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refreshRef.current();
      }, debounceMs);
    };

    const offStaff = onStaffDataChanged(run);
    window.addEventListener('online', run);

    return () => {
      if (timer) clearTimeout(timer);
      offStaff();
      window.removeEventListener('online', run);
    };
  }, [enabled, debounceMs]);
}
