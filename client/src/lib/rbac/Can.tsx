'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import {
  type Permission,
  userHasAny,
  userHasPermission,
} from './permissions';

export function useCan() {
  const { user } = useAuth();
  const permissions = user?.permissions;

  return {
    can: (permission: Permission) =>
      userHasPermission(permissions, permission),
    canAny: (needed: Permission[]) => userHasAny(permissions, needed),
  };
}

export function Can({
  permission,
  anyOf,
  children,
  fallback = null,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny } = useCan();
  const ok = permission
    ? can(permission)
    : anyOf
      ? canAny(anyOf)
      : false;
  return <>{ok ? children : fallback}</>;
}
