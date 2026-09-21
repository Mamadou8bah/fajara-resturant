import { api } from '@/lib/api';
import type { Permission } from '@/lib/rbac';

/**
 * Prefetch common staff list endpoints while online so tab switches
 * work from IndexedDB when the network drops.
 */
export function warmStaffReadCaches(permissions: Permission[] = []): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const can = (p: Permission) =>
    permissions.length === 0 || permissions.includes(p);

  const paths = new Set<string>();

  if (can('orders.waiter') || can('checkout.operate') || can('session.move')) {
    paths.add('/sessions/floor');
  }
  if (can('orders.waiter')) {
    paths.add('/orders/waiter-tables');
    paths.add('/menu/items');
    paths.add('/notifications');
  }
  if (can('orders.kitchen')) {
    paths.add('/kitchen/tickets');
  }
  if (can('checkout.operate')) {
    paths.add('/sessions/floor');
    paths.add('/till/current');
  }
  if (can('menu.manage')) {
    paths.add('/menu/categories');
    paths.add('/menu/items');
    paths.add('/menu/specials');
    paths.add('/menu/promotions');
  }
  if (can('inventory.manage') || can('inventory.limited')) {
    paths.add('/inventory/stock?pageSize=100');
  }
  if (can('employees.manage')) {
    paths.add('/employees?pageSize=100&activeOnly=true');
    paths.add(
      '/employees?pageSize=100&activeOnly=false&includeArchived=true',
    );
  }
  if (can('tables.manage')) {
    paths.add('/tables');
    paths.add('/settings');
  }

  void Promise.allSettled([...paths].map((path) => api(path).catch(() => null)));
}
