import type { Permission } from './permissions';

export type NavItem = {
  href: string;
  label: string;
  anyOf: Permission[];
};

export const STAFF_NAV: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', anyOf: ['dashboard.view'] },
  {
    href: '/app/orders',
    label: 'Orders',
    anyOf: ['orders.waiter'],
  },
  {
    href: '/app/kitchen',
    label: 'Kitchen',
    anyOf: ['orders.kitchen'],
  },
  {
    href: '/app/floor',
    label: 'Floor',
    anyOf: ['orders.waiter', 'session.move', 'tables.manage'],
  },
  {
    href: '/app/checkout',
    label: 'Checkout',
    anyOf: ['checkout.operate'],
  },
  {
    href: '/app/sales',
    label: 'Sales',
    anyOf: ['sales_history.view'],
  },
  { href: '/app/menu', label: 'Menu', anyOf: ['menu.manage'] },
  {
    href: '/app/inventory',
    label: 'Inventory',
    anyOf: ['inventory.manage', 'inventory.limited', 'inventory.production'],
  },
  {
    href: '/app/employees',
    label: 'Employees',
    anyOf: ['employees.manage'],
  },
  {
    href: '/app/shifts',
    label: 'Shifts',
    anyOf: ['shifts.manage'],
  },
  {
    href: '/app/reports',
    label: 'Reports',
    anyOf: ['reports.view'],
  },
  {
    href: '/app/activity',
    label: 'Activity',
    anyOf: ['activity_log.view'],
  },
  {
    href: '/app/settings',
    label: 'Settings',
    anyOf: [
      'tables.manage',
      'roles.manage',
      'dashboard.view',
      'credentials.own',
    ],
  },
];

export const ROUTE_PERMISSIONS: { prefix: string; anyOf: Permission[] }[] = [
  { prefix: '/app/dashboard', anyOf: ['dashboard.view'] },
  { prefix: '/app/orders', anyOf: ['orders.waiter'] },
  { prefix: '/app/kitchen', anyOf: ['orders.kitchen'] },
  {
    prefix: '/app/floor',
    anyOf: ['orders.waiter', 'session.move', 'tables.manage'],
  },
  { prefix: '/app/checkout', anyOf: ['checkout.operate'] },
  { prefix: '/app/sales', anyOf: ['sales_history.view'] },
  { prefix: '/app/menu', anyOf: ['menu.manage'] },
  {
    prefix: '/app/inventory',
    anyOf: ['inventory.manage', 'inventory.limited', 'inventory.production'],
  },
  {
    prefix: '/app/employees',
    anyOf: ['employees.manage', 'shifts.manage'],
  },
  { prefix: '/app/shifts', anyOf: ['shifts.manage'] },
  {
    prefix: '/app/reports',
    anyOf: ['reports.view', 'sales_history.view', 'activity_log.view'],
  },
  { prefix: '/app/activity', anyOf: ['activity_log.view'] },
  {
    prefix: '/app/settings',
    anyOf: [
      'tables.manage',
      'roles.manage',
      'dashboard.view',
      'credentials.own',
    ],
  },
];
