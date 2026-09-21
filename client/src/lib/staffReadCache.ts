/** IndexedDB cache for staff/guest GET responses (offline page switches). */

const DB_NAME = 'fajara-offline';
const DB_VERSION = 2;
const STORE = 'reads';

export type StaffReadEntry = {
  key: string;
  path: string;
  data: unknown;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('writes')) {
        const writes = db.createObjectStore('writes', { keyPath: 'id' });
        writes.createIndex('createdAt', 'createdAt', { unique: false });
        writes.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const reads = db.createObjectStore(STORE, { keyPath: 'key' });
        reads.createIndex('updatedAt', 'updatedAt', { unique: false });
        reads.createIndex('path', 'path', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

/** Scope cache per auth token so staff sessions do not leak across logins. */
export function readCacheKey(path: string, token: string | null): string {
  const who = token ? token.slice(-24) : 'anon';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${who}:${normalized}`;
}

export async function putStaffRead(
  path: string,
  token: string | null,
  data: unknown,
): Promise<void> {
  try {
    const db = await openDb();
    const entry: StaffReadEntry = {
      key: readCacheKey(path, token),
      path: path.startsWith('/') ? path : `/${path}`,
      data,
      updatedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('read cache put failed'));
    });
  } catch {
    /* offline cache is best-effort */
  }
}

export async function getStaffRead<T = unknown>(
  path: string,
  token: string | null,
): Promise<T | undefined> {
  try {
    const db = await openDb();
    const key = readCacheKey(path, token);
    const row = await new Promise<StaffReadEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as StaffReadEntry | undefined);
      req.onerror = () => reject(req.error);
    });
    return row?.data as T | undefined;
  } catch {
    return undefined;
  }
}

/** Drop cached GETs whose path starts with any of the prefixes (after successful writes). */
export async function invalidateStaffReads(
  pathPrefixes: string[],
): Promise<void> {
  if (!pathPrefixes.length) return;
  try {
    const db = await openDb();
    const all = await new Promise<StaffReadEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StaffReadEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const prefixes = pathPrefixes.map((p) => (p.startsWith('/') ? p : `/${p}`));
    const doomed = all.filter((row) =>
      prefixes.some((p) => row.path === p || row.path.startsWith(`${p}/`) || row.path.startsWith(`${p}?`)),
    );
    if (!doomed.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const row of doomed) store.delete(row.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('read cache invalidate failed'));
    });
  } catch {
    /* best-effort */
  }
}
