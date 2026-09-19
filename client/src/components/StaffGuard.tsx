'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  ROLE_DEFAULT_ROUTE,
  ROUTE_PERMISSIONS,
  userHasAny,
} from '@/lib/rbac';
import { SessionLoading, SSR_SHELL_ID } from '@/components/SessionLoading';

export function StaffGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [allow, setAllow] = useState(false);

  useEffect(() => {
    if (pathname === '/app/login') {
      setAllow(true);
      return;
    }
    if (loading) return;
    if (!user) {
      setAllow(false);
      router.replace('/app/login');
      return;
    }
    const rule = ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
    if (rule && !userHasAny(user.permissions, rule.anyOf)) {
      setAllow(false);
      router.replace(user.defaultRoute || ROLE_DEFAULT_ROUTE[user.role]);
      return;
    }
    setAllow(true);
  }, [user, loading, pathname, router]);

  if (!allow) return <SessionLoading />;
  return children;
}

/**
 * Server renders sibling #fajara-app-ssr-shell. This hydrates as `null`, then
 * mounts the real app and removes the shell — no client SSR hole.
 */
export function ClientAppBoot({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.getElementById(SSR_SHELL_ID)?.remove();
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <StaffGuard>{children}</StaffGuard>;
}
