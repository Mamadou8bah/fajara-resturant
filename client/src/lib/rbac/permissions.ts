export type Role = 'OWNER' | 'MANAGER' | 'WAITER' | 'KITCHEN' | 'CASHIER';

export type Permission =
  | 'dashboard.view'
  | 'reports.view'
  | 'sales_history.view'
  | 'activity_log.view'
  | 'menu.manage'
  | 'inventory.manage'
  | 'inventory.production'
  | 'inventory.limited'
  | 'discount.standard'
  | 'discount.exceptional'
  | 'void.approve'
  | 'refund.approve'
  | 'session.move'
  | 'tables.manage'
  | 'employees.manage'
  | 'shifts.manage'
  | 'roles.manage'
  | 'credentials.own'
  | 'checkout.operate'
  | 'till.operate'
  | 'orders.waiter'
  | 'orders.kitchen';

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'reports.view',
  'sales_history.view',
  'activity_log.view',
  'menu.manage',
  'inventory.manage',
  'inventory.production',
  'inventory.limited',
  'discount.standard',
  'discount.exceptional',
  'void.approve',
  'refund.approve',
  'session.move',
  'tables.manage',
  'employees.manage',
  'shifts.manage',
  'roles.manage',
  'credentials.own',
  'checkout.operate',
  'till.operate',
  'orders.waiter',
  'orders.kitchen',
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'View the home dashboard',
  'reports.view': 'View reports',
  'sales_history.view': 'View sales history',
  'activity_log.view': 'View activity',
  'menu.manage': 'Edit the menu and specials',
  'inventory.manage': 'Manage stock and inventory',
  'inventory.production': 'Run kitchen production',
  'inventory.limited': 'Do basic stock actions',
  'discount.standard': 'Apply normal discounts',
  'discount.exceptional': 'Approve large discounts',
  'void.approve': 'Approve cancelled items (voids)',
  'refund.approve': 'Approve refunds',
  'session.move': 'Move guests between tables',
  'tables.manage': 'Manage tables and QR codes',
  'employees.manage': 'Manage staff accounts',
  'shifts.manage': 'Manage shifts and pay periods',
  'roles.manage': 'Change roles and permissions',
  'credentials.own': 'Change their own PIN or password',
  'checkout.operate': 'Take customer payments',
  'till.operate': 'Open and close the till',
  'orders.waiter': 'Take and serve floor orders',
  'orders.kitchen': 'Use the kitchen display',
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  CASHIER: 'Cashier',
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  /** Same operational rights as Owner by default; Owner may narrow via matrix. */
  MANAGER: [...ALL_PERMISSIONS],
  WAITER: [
    'session.move',
    'credentials.own',
    'orders.waiter',
    'inventory.limited',
  ],
  KITCHEN: [
    'credentials.own',
    'orders.kitchen',
    'inventory.production',
    'inventory.limited',
  ],
  CASHIER: [
    'sales_history.view',
    'discount.standard',
    'credentials.own',
    'checkout.operate',
    'till.operate',
  ],
};

export const OWNER_LOCKED_PERMISSIONS: Permission[] = [
  'roles.manage',
  'credentials.own',
];

export type RolePermissionMatrix = Record<Role, Permission[]>;

export function sanitizeRolePermissions(
  raw: unknown,
): RolePermissionMatrix {
  const base: RolePermissionMatrix = {
    OWNER: [...ROLE_PERMISSIONS.OWNER],
    MANAGER: [...ROLE_PERMISSIONS.MANAGER],
    WAITER: [...ROLE_PERMISSIONS.WAITER],
    KITCHEN: [...ROLE_PERMISSIONS.KITCHEN],
    CASHIER: [...ROLE_PERMISSIONS.CASHIER],
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const input = raw as Record<string, unknown>;
  for (const role of Object.keys(base) as Role[]) {
    const list = input[role];
    if (!Array.isArray(list)) continue;
    const cleaned = list.filter(
      (p): p is Permission =>
        typeof p === 'string' && ALL_PERMISSIONS.includes(p as Permission),
    );
    if (role === 'OWNER') {
      for (const locked of OWNER_LOCKED_PERMISSIONS) {
        if (!cleaned.includes(locked)) cleaned.push(locked);
      }
    }
    if (!cleaned.includes('credentials.own')) cleaned.push('credentials.own');
    base[role] = cleaned;
  }
  return base;
}

export const ROLE_DEFAULT_ROUTE: Record<Role, string> = {
  OWNER: '/app/dashboard',
  MANAGER: '/app/dashboard',
  WAITER: '/app/orders',
  KITCHEN: '/app/kitchen',
  CASHIER: '/app/checkout',
};

export function roleHasPermission(
  role: Role,
  permission: Permission,
  matrix?: RolePermissionMatrix | null,
): boolean {
  const list = matrix?.[role] ?? ROLE_PERMISSIONS[role];
  return list?.includes(permission) ?? false;
}

export function roleHasAny(
  role: Role,
  permissions: Permission[],
  matrix?: RolePermissionMatrix | null,
): boolean {
  return permissions.some((p) => roleHasPermission(role, p, matrix));
}

export function userHasPermission(
  permissions: Permission[] | undefined,
  permission: Permission,
): boolean {
  return permissions?.includes(permission) ?? false;
}

export function userHasAny(
  permissions: Permission[] | undefined,
  needed: Permission[],
): boolean {
  return needed.some((p) => userHasPermission(permissions, p));
}
