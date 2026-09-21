import { getStaffRead, putStaffRead } from '@/lib/staffReadCache';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'fajara_staff_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function baseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'http://localhost:4000/api'
  );
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  token?: string | null;
  public?: boolean;
  headers?: Record<string, string>;
  /** Skip IndexedDB read-cache (rare). */
  skipReadCache?: boolean;
};

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError && (err.status === 0 || err.status >= 500))
    return true;
  const msg = err instanceof Error ? err.message : '';
  return /failed to fetch|networkerror|network request failed|offline/i.test(
    msg,
  );
}

export async function api<T = unknown>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const method = (
    opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  ).toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = opts.public ? null : (opts.token ?? getStoredToken());
  if (token) headers.Authorization = `Bearer ${token}`;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const useReadCache = method === 'GET' && !opts.skipReadCache;

  try {
    const res = await fetch(`${baseUrl()}${normalizedPath}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message =
        typeof data === 'object' &&
        data &&
        'message' in data &&
        (data as { message: unknown }).message
          ? Array.isArray((data as { message: unknown }).message)
            ? ((data as { message: string[] }).message).join(', ')
            : String((data as { message: unknown }).message)
          : res.statusText || 'Request failed';
      throw new ApiError(message, res.status, data);
    }

    if (useReadCache) {
      void putStaffRead(normalizedPath, token, data);
    }

    return data as T;
  } catch (err) {
    if (useReadCache && isNetworkFailure(err)) {
      const cached = await getStaffRead<T>(normalizedPath, token);
      if (cached !== undefined) return cached;
    }
    throw err;
  }
}

export async function apiBlob(
  path: string,
  opts: { token?: string | null } = {},
): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = opts.token ?? getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl()}${path}`, { headers });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.blob();
}

export async function apiUpload<T = { url: string }>(
  path: string,
  file: File,
  fieldName = 'file',
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = new FormData();
  body.append(fieldName, file);
  const res = await fetch(
    `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`,
    { method: 'POST', headers, body },
  );
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data &&
      'message' in data &&
      (data as { message: unknown }).message
        ? Array.isArray((data as { message: unknown }).message)
          ? ((data as { message: string[] }).message).join(', ')
          : String((data as { message: unknown }).message)
        : res.statusText || 'Upload failed';
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
