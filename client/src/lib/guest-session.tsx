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

function readAllSessions(): Record<string, GuestSession> {
  // Migrate from sessionStorage once if present.
  if (typeof window !== 'undefined') {
    try {
      const legacy = sessionStorage.getItem(GUEST_KEY);
      if (legacy && !localStorage.getItem(GUEST_KEY)) {
        localStorage.setItem(GUEST_KEY, legacy);
        sessionStorage.removeItem(GUEST_KEY);
      }
    } catch {
      /* ignore */
    }
  }
  return readJson(GUEST_KEY, {});
}

function writeAllSessions(map: Record<string, GuestSession>) {
  writeJson(GUEST_KEY, map);
}

function readAllCarts(): Record<string, GuestCartLine[]> {
  return readJson(CART_KEY, {});
}

function writeAllCarts(map: Record<string, GuestCartLine[]>) {
  writeJson(CART_KEY, map);
}

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<GuestSession | null>(null);

  const setSession = useCallback((s: GuestSession | null) => {
    setSessionState(s);
    if (!s) return;
    const all = readAllSessions();
    all[s.token] = s;
    writeAllSessions(all);
  }, []);

  const clearCart = useCallback((qrToken: string) => {
    const carts = readAllCarts();
    if (carts[qrToken]) {
      delete carts[qrToken];
      writeAllCarts(carts);
    }
  }, []);

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
