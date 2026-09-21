'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  listWrites,
  subscribeOfflineQueue,
  type OfflineWriteEntry,
} from '@/lib/offlineWriteQueue';
import {
  discardWrite,
  flushOfflineQueue,
  isFlushPausedForAuth,
  resumeFlushAfterAuth,
  retryWrite,
  startOfflineQueueWatch,
  subscribeFlushState,
} from '@/lib/staffMutate';
import { useAuth } from '@/lib/auth';
import { notifyStaffDataChanged } from '@/lib/socket';

type SyncCtx = {
  entries: OfflineWriteEntry[];
  pendingCount: number;
  failedCount: number;
  flushing: boolean;
  pausedForAuth: boolean;
  refresh: () => Promise<void>;
  flush: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  resumeAuth: () => void;
};

const SyncContext = createContext<SyncCtx | null>(null);

export function StaffSyncProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [entries, setEntries] = useState<OfflineWriteEntry[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [pausedForAuth, setPausedForAuth] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await listWrites());
    setPausedForAuth(isFlushPausedForAuth());
  }, []);

  useEffect(() => {
    void refresh();
    const unsubQ = subscribeOfflineQueue(() => {
      void refresh();
    });
    const unsubF = subscribeFlushState(() => {
      setFlushing(true);
      void refresh().finally(() => setFlushing(false));
    });
    const stop = startOfflineQueueWatch();
    return () => {
      unsubQ();
      unsubF();
      stop();
    };
  }, [refresh]);

  useEffect(() => {
    if (token && user) {
      resumeFlushAfterAuth();
      void flushOfflineQueue().then((r) => {
        if (r.synced > 0) notifyStaffDataChanged();
        void refresh();
      });
    }
  }, [token, user, refresh]);

  const flush = useCallback(async () => {
    const r = await flushOfflineQueue();
    if (r.synced > 0) notifyStaffDataChanged();
    await refresh();
  }, [refresh]);

  const retry = useCallback(
    async (id: string) => {
      await retryWrite(id);
      notifyStaffDataChanged();
      await refresh();
    },
    [refresh],
  );

  const discard = useCallback(
    async (id: string) => {
      await discardWrite(id);
      await refresh();
    },
    [refresh],
  );

  const resumeAuth = useCallback(() => {
    resumeFlushAfterAuth();
    void flush();
  }, [flush]);

  const value = useMemo<SyncCtx>(() => {
    const pendingCount = entries.filter(
      (e) => e.status === 'pending' || e.status === 'syncing',
    ).length;
    const failedCount = entries.filter((e) => e.status === 'failed').length;
    return {
      entries,
      pendingCount,
      failedCount,
      flushing,
      pausedForAuth,
      refresh,
      flush,
      retry,
      discard,
      resumeAuth,
    };
  }, [
    entries,
    flushing,
    pausedForAuth,
    refresh,
    flush,
    retry,
    discard,
    resumeAuth,
  ]);

  return (
    <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
  );
}

export function useStaffSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useStaffSync must be used within StaffSyncProvider');
  }
  return ctx;
}

/** Safe for components that may render outside staff shell. */
export function useStaffSyncOptional() {
  return useContext(SyncContext);
}
