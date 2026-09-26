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
import { api, getStoredToken, isNetworkFailure, setStoredToken } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { recordStaffLaunch } from '@/lib/pwaLaunch';
import {
  ROLE_DEFAULT_ROUTE,
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from '@/lib/rbac';

export type StaffUser = {
  id: string;
  fullName: string;
  role: Role;
  email?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
  sessionId?: string;
  hasPassword?: boolean;
  hasPin?: boolean;
  permissions: Permission[];
  defaultRoute: string;
};

const USER_KEY = 'fajara_staff_user';

function loadCachedUser(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StaffUser;
  } catch {
    return null;
  }
}

function saveCachedUser(user: StaffUser | null) {
  if (typeof window === 'undefined') return;
  if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(USER_KEY);
}

type AuthState = {
  user: StaffUser | null;
  token: string | null;
  loading: boolean;
  loginPin: (email: string, pin: string) => Promise<StaffUser>;
  loginPassword: (email: string, password: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
  lock: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function normalizeUser(
  employee: {
    id: string;
    fullName: string;
    role: Role;
    email?: string | null;
    designation?: string | null;
    photoUrl?: string | null;
    hasPassword?: boolean;
    hasPin?: boolean;
  },
  extras?: Partial<StaffUser>,
): StaffUser {
  const role = employee.role;
  return {
    id: employee.id,
    fullName: employee.fullName,
    role,
    email: employee.email,
    designation: employee.designation,
    photoUrl: employee.photoUrl,
    hasPassword: employee.hasPassword ?? extras?.hasPassword,
    hasPin: employee.hasPin ?? extras?.hasPin,
    permissions: extras?.permissions ?? ROLE_PERMISSIONS[role],
    defaultRoute: extras?.defaultRoute ?? ROLE_DEFAULT_ROUTE[role],
    sessionId: extras?.sessionId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(
    (accessToken: string, payload: {
      employee: Parameters<typeof normalizeUser>[0];
      permissions?: Permission[];
      defaultRoute?: string;
      sessionId?: string;
    }) => {
      setStoredToken(accessToken);
      setToken(accessToken);
      const u = normalizeUser(payload.employee, {
        permissions: payload.permissions,
        defaultRoute: payload.defaultRoute,
        sessionId: payload.sessionId,
      });
      setUser(u);
      saveCachedUser(u);
      recordStaffLaunch();
      connectSocket(accessToken);
      return u;
    },
    [],
  );

  const clearSession = useCallback(() => {
    setStoredToken(null);
    saveCachedUser(null);
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  const refreshMe = useCallback(async () => {
    const t = getStoredToken();
    if (!t) {
      clearSession();
      return;
    }
    const me = await api<{
      id: string;
      fullName: string;
      role: Role;
      email?: string | null;
      designation?: string | null;
      photoUrl?: string | null;
      sessionId?: string;
      hasPassword?: boolean;
      hasPin?: boolean;
      permissions: Permission[];
      defaultRoute: string;
    }>('/auth/me', { token: t });
    setToken(t);
    const u = normalizeUser(me, {
      permissions: me.permissions,
      defaultRoute: me.defaultRoute,
      sessionId: me.sessionId,
      hasPassword: me.hasPassword,
      hasPin: me.hasPin,
    });
    setUser(u);
    saveCachedUser(u);
    recordStaffLaunch();
    connectSocket(t);
  }, [clearSession]);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setLoading(false);
      return;
    }
    refreshMe()
      .catch((err) => {
        if (isNetworkFailure(err)) {
          const cached = loadCachedUser();
          if (cached) {
            setToken(t);
            setUser(cached);
            return;
          }
        }
        clearSession();
      })
      .finally(() => setLoading(false));
  }, [refreshMe, clearSession]);

  const loginPin = useCallback(
    async (email: string, pin: string) => {
      const res = await api<{
        accessToken: string;
        sessionId: string;
        employee: Parameters<typeof normalizeUser>[0];
        permissions: Permission[];
        defaultRoute: string;
      }>('/auth/login/pin', {
        public: true,
        body: { email: email.trim().toLowerCase(), pin },
      });
      return applySession(res.accessToken, res);
    },
    [applySession],
  );

  const loginPassword = useCallback(
    async (email: string, password: string) => {
      const res = await api<{
        accessToken: string;
        sessionId: string;
        employee: Parameters<typeof normalizeUser>[0];
        permissions: Permission[];
        defaultRoute: string;
      }>('/auth/login/password', {
        public: true,
        body: { email: email.trim().toLowerCase(), password },
      });
      return applySession(res.accessToken, res);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
  }, [clearSession]);

  const lock = useCallback(async () => {
    try {
      if (getStoredToken()) await api('/auth/lock', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      loginPin,
      loginPassword,
      logout,
      lock,
      refreshMe,
    }),
    [user, token, loading, loginPin, loginPassword, logout, lock, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
