/**
 * Optional last-table / staff markers in localStorage.
 * Site `/` always goes to staff login (or dashboard) — these hints do not
 * divert the public root. Guests enter only via /t or /m QR links.
 */

const KEY = 'fajara_pwa_launch';

export type PwaLaunchHint =
  | { mode: 'guest'; path: string; tableId?: string; token?: string }
  | { mode: 'staff' };

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLaunchHint(): PwaLaunchHint | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PwaLaunchHint;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.mode === 'staff') return { mode: 'staff' };
    if (parsed.mode === 'guest' && typeof parsed.path === 'string') {
      return {
        mode: 'guest',
        path: parsed.path,
        tableId:
          typeof parsed.tableId === 'string' ? parsed.tableId : undefined,
        token: typeof parsed.token === 'string' ? parsed.token : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeHint(hint: PwaLaunchHint) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(hint));
  } catch {
    /* quota / private mode */
  }
}

/** Record last guest table after a successful QR join (not used to divert `/`). */
export function recordGuestLaunch(opts: {
  tableId?: string | null;
  token?: string | null;
}) {
  const tableId = opts.tableId?.trim() || undefined;
  const token = opts.token?.trim() || undefined;
  if (tableId) {
    writeHint({ mode: 'guest', path: `/t/${tableId}`, tableId, token });
    return;
  }
  if (token) {
    writeHint({
      mode: 'guest',
      path: `/m/${encodeURIComponent(token)}`,
      token,
    });
  }
}

export function recordStaffLaunch() {
  writeHint({ mode: 'staff' });
}

export function guestLaunchPath(hint: PwaLaunchHint | null): string | null {
  if (!hint || hint.mode !== 'guest') return null;
  if (hint.tableId) return `/t/${hint.tableId}`;
  if (hint.path?.startsWith('/t/') || hint.path?.startsWith('/m/')) {
    return hint.path;
  }
  if (hint.token) return `/m/${encodeURIComponent(hint.token)}`;
  return null;
}
