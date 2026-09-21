'use client';

import { api, ApiError, getStoredToken, isNetworkFailure } from '@/lib/api';
import {
  enqueueWrite,
  findOpenWrite,
  isLikelyOffline,
  labelForPath,
  listWrites,
  newClientRequestId,
  removeWrite,
  scopeForPath,
  subscribeOfflineQueue,
  updateWrite,
  type OfflineScope,
  type OfflineWriteEntry,
} from '@/lib/offlineWriteQueue';
import { invalidateStaffReads } from '@/lib/staffReadCache';

export type StaffMutateOpts = {
  method?: string;
  body?: unknown;
  /** Human label in the sync panel. */
  label?: string;
  scope?: OfflineScope;
  /** Force a specific idempotency key (settle/order). */
  clientRequestId?: string;
  /** Put clientRequestId into JSON body when DTO requires it. */
  injectBodyClientRequestId?: boolean;
  /** Settle and similar — discard needs confirm. */
  requireConfirmDiscard?: boolean;
  /**
   * When offline, return this instead of `{ queued: true }`.
   * Used for optimistic UI.
   */
  optimisticResult?: unknown;
  /** Skip queue even offline (auth, uploads). */
  onlineOnly?: boolean;
  headers?: Record<string, string>;
};

export type QueuedResult = {
  queued: true;
  clientRequestId: string;
  queueId: string;
};

let flushing = false;
let pausedForAuth = false;
const flushListeners = new Set<() => void>();

export function subscribeFlushState(listener: () => void) {
  flushListeners.add(listener);
  return () => flushListeners.delete(listener);
}

export function isFlushPausedForAuth() {
  return pausedForAuth;
}

export function resumeFlushAfterAuth() {
  pausedForAuth = false;
  void flushOfflineQueue();
}

function emitFlush() {
  flushListeners.forEach((l) => l());
}

function networkFailure(err: unknown): boolean {
  return isNetworkFailure(err);
}

function readPrefixesToInvalidate(path: string): string[] {
  const p = (path.split('?')[0] ?? path).replace(/\/$/, '') || '/';
  if (p.startsWith('/payments') || p.includes('/settle')) {
    return ['/payments', '/orders', '/sessions', '/reports', '/dashboard'];
  }
  if (p.startsWith('/orders') || p.startsWith('/kitchen')) {
    return ['/orders', '/kitchen', '/sessions', '/dashboard'];
  }
  if (p.startsWith('/sessions') || p.startsWith('/tables')) {
    return ['/sessions', '/tables', '/orders', '/dashboard'];
  }
  if (p.startsWith('/menu')) return ['/menu', '/guest'];
  if (p.startsWith('/inventory') || p.startsWith('/recipes') || p.startsWith('/production') || p.startsWith('/suppliers')) {
    return ['/inventory', '/recipes', '/production', '/suppliers'];
  }
  if (p.startsWith('/employees') || p.startsWith('/shifts') || p.startsWith('/payroll')) {
    return ['/employees', '/shifts', '/payroll'];
  }
  if (p.startsWith('/settings')) return ['/settings'];
  const root = `/${p.split('/').filter(Boolean)[0] ?? ''}`;
  return root === '/' ? [] : [root];
}

async function afterSuccessfulWrite(path: string) {
  await invalidateStaffReads(readPrefixesToInvalidate(path));
}

/**
 * Staff mutation helper: send now when online; durable queue when offline.
 * Always attaches X-Client-Request-Id for server idempotency replay.
 */
export async function staffMutate<T = unknown>(
  path: string,
  opts: StaffMutateOpts = {},
): Promise<T | QueuedResult> {
  const method = (
    opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  ).toUpperCase();
  if (method === 'GET') {
    return api<T>(path, opts);
  }

  if (opts.onlineOnly) {
    if (isLikelyOffline()) {
      throw new ApiError('This action requires a network connection', 0);
    }
    return api<T>(path, opts);
  }

  if (!getStoredToken()) {
    throw new ApiError('Sign in required', 401);
  }

  const clientRequestId =
    opts.clientRequestId?.trim() || newClientRequestId();
  const scope = opts.scope ?? scopeForPath(path, method);
  const label = opts.label ?? labelForPath(path, method);

  let body = opts.body;
  if (
    opts.injectBodyClientRequestId &&
    body &&
    typeof body === 'object' &&
    !Array.isArray(body)
  ) {
    body = {
      ...(body as Record<string, unknown>),
      clientRequestId:
        (body as { clientRequestId?: string }).clientRequestId ||
        clientRequestId,
    };
  }

  const headers: Record<string, string> = {
    'X-Client-Request-Id': clientRequestId,
    'X-Idempotency-Scope': scope,
    ...opts.headers,
  };

  const send = () =>
    api<T>(path, {
      method,
      body,
      headers,
    });

  const enqueue = async () => {
    const existing = await findOpenWrite(method, path);
    if (existing) {
      if (opts.optimisticResult !== undefined) {
        return opts.optimisticResult as T;
      }
      return {
        queued: true,
        clientRequestId: existing.clientRequestId,
        queueId: existing.id,
      } satisfies QueuedResult;
    }
    const row = await enqueueWrite({
      method,
      path,
      body: body ?? null,
      clientRequestId,
      scope,
      label,
      requireConfirmDiscard: opts.requireConfirmDiscard ?? scope === 'PAYMENT',
    });
    if (opts.optimisticResult !== undefined) {
      return opts.optimisticResult as T;
    }
    return {
      queued: true,
      clientRequestId,
      queueId: row.id,
    } satisfies QueuedResult;
  };

  if (isLikelyOffline()) {
    return enqueue();
  }

  try {
    const result = await send();
    void afterSuccessfulWrite(path);
    return result;
  } catch (err) {
    if (networkFailure(err)) {
      return enqueue();
    }
    throw err;
  }
}

export function isQueuedResult(value: unknown): value is QueuedResult {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as QueuedResult).queued === true &&
    typeof (value as QueuedResult).clientRequestId === 'string'
  );
}

export async function flushOfflineQueue(): Promise<{
  synced: number;
  failed: number;
}> {
  if (flushing || pausedForAuth) {
    return { synced: 0, failed: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }
  if (!getStoredToken()) {
    return { synced: 0, failed: 0 };
  }

  flushing = true;
  emitFlush();
  let synced = 0;
  let failed = 0;

  try {
    const rows = await listWrites();
    const todo = rows.filter(
      (r) => r.status === 'pending' || r.status === 'failed',
    );
    for (const entry of todo) {
      if (pausedForAuth) break;
      await updateWrite(entry.id, { status: 'syncing', lastError: null });
      try {
        await api(entry.path, {
          method: entry.method,
          body: entry.body === null ? undefined : entry.body,
          headers: {
            'X-Client-Request-Id': entry.clientRequestId,
            'X-Idempotency-Scope': entry.scope,
          },
        });
        await removeWrite(entry.id);
        void afterSuccessfulWrite(entry.path);
        synced += 1;
      } catch (err) {
        // Already-applied kitchen/serve transitions (stale duplicate queue).
        if (
          err instanceof ApiError &&
          err.status === 400 &&
          /cannot transition item from (\w+) to \1/i.test(err.message)
        ) {
          await removeWrite(entry.id);
          void afterSuccessfulWrite(entry.path);
          synced += 1;
          continue;
        }
        if (err instanceof ApiError && err.status === 401) {
          pausedForAuth = true;
          await updateWrite(entry.id, {
            status: 'pending',
            lastError: 'Sign in required to sync',
            lastStatus: 401,
          });
          break;
        }
        if (networkFailure(err)) {
          await updateWrite(entry.id, {
            status: 'pending',
            lastError: err instanceof Error ? err.message : 'Network error',
          });
          break;
        }
        failed += 1;
        await updateWrite(entry.id, {
          status: 'failed',
          lastError: err instanceof Error ? err.message : 'Sync failed',
          lastStatus: err instanceof ApiError ? err.status : null,
        });
      }
    }
  } finally {
    flushing = false;
    emitFlush();
  }

  return { synced, failed };
}

export async function retryWrite(id: string) {
  await updateWrite(id, { status: 'pending', lastError: null });
  return flushOfflineQueue();
}

export async function discardWrite(id: string) {
  await removeWrite(id);
}

export function startOfflineQueueWatch() {
  if (typeof window === 'undefined') return () => undefined;

  const onOnline = () => {
    void flushOfflineQueue();
  };
  const onFocus = () => {
    if (navigator.onLine) void flushOfflineQueue();
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  const unsub = subscribeOfflineQueue(() => {
    /* UI listeners only */
  });

  void flushOfflineQueue();

  const interval = window.setInterval(() => {
    if (navigator.onLine) void flushOfflineQueue();
  }, 30_000);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    window.clearInterval(interval);
    unsub();
  };
}

export type { OfflineWriteEntry };
