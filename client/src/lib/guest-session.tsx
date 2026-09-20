'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { GuestCartLine, GuestMenuResponse } from '@/features/guest/api';

const GUEST_KEY = 'fajara_guest_session';
const CART_KEY = 'fajara_guest_cart';
const DEVICE_KEY = 'fajara_guest_device';
const MENU_CACHE_PREFIX = 'fajara_guest_menu:';

export type GuestSession = {
  token: string;
  guestId: string;
  sessionId: string;
  deviceToken: string;
  displayName?: string | null;
};

type GuestCtx = {
  session: GuestSession | null;
  setSession: (s: GuestSession | null) => void;
  clearSession: (qrToken?: string) => void;
  loadForToken: (qrToken: string) => GuestSession | null;
  getOrCreateDeviceToken: () => string;
  rememberDeviceToken: (deviceToken: string) => void;
  clearOtherTableSessions: (keepToken: string) => void;
  loadCart: (qrToken: string) => GuestCartLine[];
  saveCart: (qrToken: string, cart: GuestCartLine[]) => void;
  clearCart: (qrToken: string) => void;
  cacheMenu: (qrToken: string, menu: GuestMenuResponse) => void;
  loadCachedMenu: (qrToken: string) => GuestMenuResponse | null;
};

const GuestContext = createContext<GuestCtx | null>(null);

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function writeAllSessions(map: Record<string, GuestSession>) {
  writeJson(GUEST_KEY, map);
  // Mirror to sessionStorage so a brief localStorage blip on mobile
  // does not drop the visit mid-order.
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(GUEST_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }
}

function readAllSessions(): Record<string, GuestSession> {
  if (typeof window !== 'undefined') {
    try {
      const fromLocal = localStorage.getItem(GUEST_KEY);
      const fromSession = sessionStorage.getItem(GUEST_KEY);
      if (!fromLocal && fromSession) {
        localStorage.setItem(GUEST_KEY, fromSession);
      } else if (fromLocal && !fromSession) {
        sessionStorage.setItem(GUEST_KEY, fromLocal);
      }
    } catch {
      /* ignore */
    }
  }
  return readJson(GUEST_KEY, {});
}

function readAllCarts(): Record<string, GuestCartLine[]> {
  return readJson(CART_KEY, {});
}

function writeAllCarts(map: Record<string, GuestCartLine[]>) {
  writeJson(CART_KEY, map);
}

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<GuestSession | null>(null);

  const rememberDeviceToken = useCallback((deviceToken: string) => {
    const s = storage();
    if (!s || !deviceToken.trim()) return;
    try {
      s.setItem(DEVICE_KEY, deviceToken.trim());
      sessionStorage.setItem(DEVICE_KEY, deviceToken.trim());
    } catch {
      /* ignore */
    }
  }, []);

  const clearCart = useCallback((qrToken: string) => {
    const carts = readAllCarts();
    if (carts[qrToken]) {
      delete carts[qrToken];
      writeAllCarts(carts);
    }
  }, []);

  const setSession = useCallback(
    (s: GuestSession | null) => {
      setSessionState(s);
      if (!s) return;
      const all = readAllSessions();
      // One phone → one active table visit locally.
      for (const key of Object.keys(all)) {
        if (key !== s.token) {
          delete all[key];
          clearCart(key);
        }
      }
      all[s.token] = s;
      writeAllSessions(all);
      rememberDeviceToken(s.deviceToken);
    },
    [clearCart, rememberDeviceToken],
  );

  const getOrCreateDeviceToken = useCallback(() => {
    const s = storage();
    try {
      const existing = s?.getItem(DEVICE_KEY)?.trim();
      if (existing && existing.length >= 8) return existing;
      const fromSession = sessionStorage.getItem(DEVICE_KEY)?.trim();
      if (fromSession && fromSession.length >= 8) {
        rememberDeviceToken(fromSession);
        return fromSession;
      }
    } catch {
      /* ignore */
    }
    const all = readAllSessions();
    for (const row of Object.values(all)) {
      if (row.deviceToken?.trim()) {
        rememberDeviceToken(row.deviceToken);
        return row.deviceToken.trim();
      }
    }
    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    rememberDeviceToken(created);
    return created;
  }, [rememberDeviceToken]);

  const clearOtherTableSessions = useCallback(
    (keepToken: string) => {
      const all = readAllSessions();
      let changed = false;
      for (const key of Object.keys(all)) {
        if (key !== keepToken) {
          delete all[key];
          changed = true;
          clearCart(key);
        }
      }
      if (changed) writeAllSessions(all);
    },
    [clearCart],
  );

  const clearSession = useCallback(
    (qrToken?: string) => {
      setSessionState((prev) => {
        const token = qrToken ?? prev?.token;
        if (token) {
          const all = readAllSessions();
          if (all[token]) {
            delete all[token];
            writeAllSessions(all);
          }
          clearCart(token);
          try {
            storage()?.removeItem(`${MENU_CACHE_PREFIX}${token}`);
          } catch {
            /* ignore */
          }
        }
        if (qrToken && prev && prev.token !== qrToken) return prev;
        return null;
      });
    },
    [clearCart],
  );

  const loadForToken = useCallback((qrToken: string) => {
    const all = readAllSessions();
    const found = all[qrToken] ?? null;
    setSessionState(found);
    return found;
  }, []);

  const loadCart = useCallback((qrToken: string) => {
    const carts = readAllCarts();
    return Array.isArray(carts[qrToken]) ? carts[qrToken] : [];
  }, []);

  const saveCart = useCallback((qrToken: string, cart: GuestCartLine[]) => {
    const carts = readAllCarts();
    if (cart.length === 0) {
      delete carts[qrToken];
    } else {
      carts[qrToken] = cart;
    }
    writeAllCarts(carts);
  }, []);

  const cacheMenu = useCallback((qrToken: string, menu: GuestMenuResponse) => {
    writeJson(`${MENU_CACHE_PREFIX}${qrToken}`, {
      savedAt: Date.now(),
      menu,
    });
  }, []);

  const loadCachedMenu = useCallback((qrToken: string) => {
    const packed = readJson<{ menu?: GuestMenuResponse } | null>(
      `${MENU_CACHE_PREFIX}${qrToken}`,
      null,
    );
    return packed?.menu ?? null;
  }, []);

  const value = useMemo(
    () => ({
      session,
      setSession,
      clearSession,
      loadForToken,
      getOrCreateDeviceToken,
      rememberDeviceToken,
      clearOtherTableSessions,
      loadCart,
      saveCart,
      clearCart,
      cacheMenu,
      loadCachedMenu,
    }),
    [
      session,
      setSession,
      clearSession,
      loadForToken,
      getOrCreateDeviceToken,
      rememberDeviceToken,
      clearOtherTableSessions,
      loadCart,
      saveCart,
      clearCart,
      cacheMenu,
      loadCachedMenu,
    ],
  );

  return (
    <GuestContext.Provider value={value}>{children}</GuestContext.Provider>
  );
}

export function useGuestSession() {
  const ctx = useContext(GuestContext);
  if (!ctx) {
    throw new Error('useGuestSession must be used within GuestSessionProvider');
  }
  return ctx;
}
