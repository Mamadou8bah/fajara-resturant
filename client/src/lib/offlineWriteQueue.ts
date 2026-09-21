/** Durable staff offline write queue (IndexedDB). */

export type OfflineScope = 'ORDER' | 'PAYMENT' | 'SESSION' | 'KITCHEN' | 'MUTATION';

export type OfflineEntryStatus = 'pending' | 'syncing' | 'failed';

export type OfflineWriteEntry = {
  id: string;
  createdAt: number;
  method: string;
  path: string;
  body: unknown;
  clientRequestId: string;
  scope: OfflineScope;
  label: string;
  status: OfflineEntryStatus;
  lastError?: string | null;
  lastStatus?: number | null;
  /** Soft-sensitive: settle conflicts require confirm before discard. */
  requireConfirmDiscard?: boolean;
};

const DB_NAME = 'fajara-offline';
const DB_VERSION = 1;
const STORE = 'writes';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOfflineQueue(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let req: IDBRequest<T> | undefined;
    try {
      const result = fn(store);
      if (result) req = result;
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'));
    if (req) {
      req.onerror = () => reject(req!.error);
    }
  });
}

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueWrite(
  entry: Omit<OfflineWriteEntry, 'id' | 'createdAt' | 'status'> & {
    id?: string;
    status?: OfflineEntryStatus;
  },
): Promise<OfflineWriteEntry> {
  const row: OfflineWriteEntry = {
    id: entry.id ?? newClientRequestId(),
    createdAt: Date.now(),
    method: entry.method,
    path: entry.path,
    body: entry.body,
    clientRequestId: entry.clientRequestId,
    scope: entry.scope,
    label: entry.label,
    status: entry.status ?? 'pending',
    lastError: null,
    lastStatus: null,
    requireConfirmDiscard: entry.requireConfirmDiscard,
  };
  await withStore('readwrite', (store) => store.put(row));
  emit();
  return row;
}

export async function listWrites(): Promise<OfflineWriteEntry[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as OfflineWriteEntry[]) ?? [];
        rows.sort((a, b) => a.createdAt - b.createdAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getWrite(id: string): Promise<OfflineWriteEntry | null> {
  try {
    const result = await withStore<OfflineWriteEntry | undefined>(
      'readonly',
      (store) => store.get(id),
    );
    return (result as OfflineWriteEntry | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function updateWrite(
  id: string,
  patch: Partial<OfflineWriteEntry>,
): Promise<void> {
  const existing = await getWrite(id);
  if (!existing) return;
  const next = { ...existing, ...patch, id: existing.id };
  await withStore('readwrite', (store) => store.put(next));
  emit();
}

export async function removeWrite(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
  emit();
}

export async function pendingCount(): Promise<number> {
  const rows = await listWrites();
  return rows.filter((r) => r.status === 'pending' || r.status === 'failed')
    .length;
}

export function isLikelyOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

/** Map API path to idempotency scope for the queue / server header. */
export function scopeForPath(path: string, method: string): OfflineScope {
  const p = path.split('?')[0] ?? path;
  if (p.startsWith('/payments') || p.includes('/settle')) return 'PAYMENT';
  if (p.startsWith('/orders') && method === 'POST' && p === '/orders')
    return 'ORDER';
  if (p.startsWith('/orders')) return 'ORDER';
  if (p.startsWith('/sessions') || p.startsWith('/tables')) return 'SESSION';
  if (p.startsWith('/kitchen')) return 'KITCHEN';
  return 'MUTATION';
}

export function labelForPath(path: string, method: string): string {
  const p = path.split('?')[0] ?? path;
  if (p.includes('/settle') || p.startsWith('/payments')) return 'Settle payment';
  if (p === '/orders' && method === 'POST') return 'Place order';
  if (p.includes('send-to-kitchen')) return 'Send to kitchen';
  if (p.includes('/kitchen')) return 'Kitchen update';
  if (p === '/sessions' && method === 'POST') return 'Open table';
  if (p.startsWith('/sessions')) return 'Session update';
  if (p.startsWith('/menu')) return 'Menu update';
  if (p.startsWith('/inventory') || p.startsWith('/recipes'))
    return 'Inventory update';
  if (p.startsWith('/employees') || p.startsWith('/shifts') || p.startsWith('/payroll'))
    return 'Staff update';
  if (p.startsWith('/settings') || p.startsWith('/tables')) return 'Settings update';
  return `${method} ${p}`;
}
