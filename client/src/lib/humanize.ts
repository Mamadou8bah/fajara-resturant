import { ROLE_LABELS, type Role } from '@/lib/rbac/permissions';

/** Turn snake/dot action codes into readable titles for owners & managers. */
const ACTIVITY_LABELS: Record<string, string> = {
  'auth.approval_pin': 'Manager approval used',
  'auth.approval_pin_failed': 'Manager approval failed',
  'auth.change_password': 'Password changed',
  'auth.change_pin': 'PIN changed',
  'auth.lock': 'Screen locked',
  'auth.logout': 'Logged out',
  'auth.password_login': 'Signed in with password',
  'auth.password_login_failed': 'Password sign-in failed',
  'auth.pin_login': 'Signed in with PIN',
  'auth.pin_login_failed': 'PIN sign-in failed',
  'auth.revoke_sessions': 'Signed out of all devices',
  'employee.archive': 'Employee removed',
  'employee.create': 'Employee added',
  'employee.deactivate': 'Employee deactivated',
  'employee.reactivate': 'Employee reactivated',
  'employee.update': 'Employee updated',
  'guest.join': 'Guest joined a table',
  'inventory.archive': 'Stock item archived',
  'inventory.count': 'Stock counted',
  'inventory.create': 'Stock item added',
  'inventory.receive': 'Stock received',
  'inventory.update': 'Stock item updated',
  'inventory.waste': 'Waste recorded',
  'inventory.staff_meal': 'Staff meal recorded',
  'inventory.spoilage': 'Spoilage recorded',
  'inventory.stock_return': 'Stock returned to supplier',
  'inventory.adjustment': 'Stock adjusted',
  'inventory.purchase_receipt': 'Delivery received',
  'inventory.production_input': 'Used in prep',
  'inventory.production_output': 'Made in prep',
  'inventory.sale_consumption': 'Used for guest order',
  'inventory.opening_stock': 'Opening stock set',
  'menu.category.archive': 'Menu category archived',
  'menu.category.create': 'Menu category added',
  'menu.category.update': 'Menu category updated',
  'menu.item.archive': 'Dish removed from menu',
  'menu.item.create': 'Dish added',
  'menu.item.update': 'Dish updated',
  'menu.modifier_group.archive': 'Modifier group archived',
  'menu.modifier_group.create': 'Modifier group added',
  'menu.modifier_group.update': 'Modifier group updated',
  'menu.modifier_option.archive': 'Modifier option archived',
  'menu.modifier_option.create': 'Modifier option added',
  'menu.modifier_option.update': 'Modifier option updated',
  'menu.special.create': 'Special created',
  'menu.special.deactivate': 'Special cleared',
  'menu.special.update': 'Special updated',
  'order_item.cancelled': 'Order item cancelled',
  'order_item.remake': 'Order item remake',
  'order_item.remake_requested': 'Remake requested',
  'order_item.remake_declined': 'Remake declined',
  'order_item.transition': 'Kitchen status changed',
  'order_item.unavailable': 'Item marked unavailable',
  'order.reopened': 'Paid order reopened',
  'order.sent_to_kitchen': 'Order sent to kitchen',
  'payment.correct_method': 'Payment method corrected',
  'payment.receipt_reprint': 'Receipt reprinted',
  'payment.refund': 'Refund issued',
  'payment.settle': 'Bill settled',
  'payroll.create': 'Payroll record created',
  'payroll.mark_paid': 'Salary marked paid',
  'production.confirm_batch': 'Production batch confirmed',
  'recipe.create': 'Recipe created',
  'recipe.deactivate': 'Recipe deactivated',
  'recipe.update': 'Recipe updated',
  'retention.guest_display_name_anonymize': 'Guest names cleared (privacy)',
  'session.close': 'Table closed',
  'session.guest.add': 'Guest added to table',
  'session.move': 'Table moved',
  'session.open': 'Table opened',
  'session.waiter_accepted': 'Waiter accepted table call',
  'session.waiter_assigned': 'Waiter assigned to table',
  'shift.apply_template': 'Shift template applied',
  'shift.assign': 'Shift assigned',
  'shift.copy_week': 'Shifts copied from last week',
  'shift.remove': 'Shift removed',
  'supplier.create': 'Supplier added',
  'supplier.update': 'Supplier updated',
  'table.archive': 'Table archived',
  'table.cleaning_complete': 'Table marked clean',
  'table.create': 'Table added',
  'table.qr.deactivate': 'Table QR deactivated',
  'table.qr.rotate': 'Table QR rotated',
  'table.status': 'Table status changed',
  'table.update': 'Table updated',
  'till.adjustment_approved': 'Till adjustment approved',
  'till.close': 'Till closed',
  'till.open': 'Till opened',
  'till.variance_close_requested': 'Till close requested (variance)',
  'till.variance_close_declined': 'Till close declined',
};

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_receipt: 'Delivery received',
  production_input: 'Used in prep batch',
  production_output: 'Made in prep batch',
  sale_consumption: 'Used for guest order',
  waste: 'Waste',
  staff_meal: 'Staff meal',
  spoilage: 'Spoilage',
  adjustment: 'Stock count adjustment',
  stock_return: 'Returned to supplier',
  opening_stock: 'Opening stock',
};

function titleCaseDots(code: string) {
  return code
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeActivityAction(actionType: string): string {
  return ACTIVITY_LABELS[actionType] ?? titleCaseDots(actionType);
}

export function humanizeMovementType(type: string): string {
  return MOVEMENT_LABELS[type] ?? titleCaseDots(type);
}

export function humanizeRole(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role as Role] ?? titleCaseDots(role);
}

/** Soften stored audit sentences for owners & managers. */
export function humanizeActivityDescription(
  description: string | null | undefined,
): string {
  const raw = description?.trim() ?? '';
  if (!raw) return 'No extra details were recorded.';

  const rules: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
    [/^Settled\s+(\S+)\s+for\s+(.+)$/i, (m) => `Bill ${m[1]} paid · ${m[2]}`],
    [/^Refund\s+(.+)\s+on\s+(\S+)$/i, (m) => `Refund ${m[1]} · bill ${m[2]}`],
    [
      /^Corrected payment method\s+(.+)\s+→\s+(.+)$/i,
      (m) => `Payment method changed from ${m[1]} to ${m[2]}`,
    ],
    [/^Reprinted receipt\s+(\S+)$/i, (m) => `Receipt ${m[1]} printed again`],
    [/^Opened session on table\s+(.+)$/i, (m) => `Opened table ${m[1]}`],
    [/^Closed session on table\s+(.+)$/i, (m) => `Closed table ${m[1]}`],
    [
      /^Moved session from table\s+(.+)\s+to\s+(.+)$/i,
      (m) => `Moved guests from table ${m[1]} to ${m[2]}`,
    ],
    [/^Added guest to session\s+\S+$/i, 'Guest added to the table'],
    [/^Guest joined table session\s+\S+$/i, 'Guest joined the table'],
    [
      /^Assigned waiter\s+(.+)\s+to table\s+(.+)$/i,
      (m) => `${m[1]} assigned to table ${m[2]}`,
    ],
    [
      /^Waiter accepted table call \(first-accept-wins\)$/i,
      'Waiter took the table call',
    ],
    [/^Order\s+(\S+)\s+sent to kitchen$/i, (m) => `Order ${m[1]} sent to kitchen`],
    [/^Reopened paid order\s+(\S+)$/i, (m) => `Reopened order ${m[1]}`],
    [
      /^(.+):\s+([\w]+)\s+→\s+([\w]+)$/i,
      (m) =>
        `${m[1]} · kitchen status ${titleCaseDots(m[2])} → ${titleCaseDots(m[3])}`,
    ],
    [/^PIN login:\s+(.+)$/i, (m) => `${m[1]} signed in with PIN`],
    [/^Password login:\s+(.+)$/i, (m) => `${m[1]} signed in with password`],
    [/^PIN login failed$/i, 'Someone tried a wrong PIN'],
    [/^Password login failed$/i, 'Someone tried a wrong password'],
    [/^Logout:\s+(.+)$/i, (m) => `${m[1]} signed out`],
    [/^Session locked:\s+(.+)$/i, (m) => `${m[1]} locked the screen`],
    [/^All sessions revoked$/i, 'Signed out of every device'],
    [/^Approval PIN verified:\s+(.+)$/i, (m) => `${m[1]} approved with their PIN`],
    [/^Approval PIN verification failed$/i, 'Manager approval PIN was wrong'],
    [/^PIN changed$/i, 'Staff PIN was updated'],
    [/^Password changed$/i, 'Password was updated'],
    [/^Created employee\s+(.+)$/i, (m) => `Added ${m[1]} to the team`],
    [/^Updated employee\s+(.+)$/i, (m) => `Updated ${m[1]}’s profile`],
    [/^Archived employee\s+(.+)$/i, (m) => `Removed ${m[1]} from the team`],
    [/^Deactivated employee\s+(.+)$/i, (m) => `Deactivated ${m[1]}`],
    [/^Reactivated employee\s+(.+)$/i, (m) => `Reactivated ${m[1]}`],
    [/^Created inventory item\s+(.+)$/i, (m) => `Added stock item ${m[1]}`],
    [/^Updated inventory item\s+(.+)$/i, (m) => `Updated stock item ${m[1]}`],
    [/^Archived inventory item\s+(.+)$/i, (m) => `Archived stock item ${m[1]}`],
    [
      /^Received\s+(.+)\s+of\s+(.+)$/i,
      (m) => `Received ${m[1]} of ${m[2]}`,
    ],
    [
      /^Stock count for\s+(.+):\s+theoretical\s+(.+),\s+actual\s+(.+)$/i,
      (m) => `Counted ${m[1]} · expected ${m[2]}, found ${m[3]}`,
    ],
    [
      /^(waste|staff_meal|spoilage|adjustment|stock_return|purchase_receipt|production_input|production_output|sale_consumption|opening_stock)\s+(.+)$/i,
      (m) => `${humanizeMovementType(m[1])} · ${m[2]}`,
    ],
    [/^Created menu item\s+(.+)$/i, (m) => `Added dish ${m[1]}`],
    [/^Updated menu item\s+(.+)$/i, (m) => `Updated dish ${m[1]}`],
    [/^Archived menu item\s+(.+)$/i, (m) => `Removed dish ${m[1]}`],
    [/^Created category\s+(.+)$/i, (m) => `Added menu section ${m[1]}`],
    [/^Updated category\s+(.+)$/i, (m) => `Updated menu section ${m[1]}`],
    [/^Archived category\s+(.+)$/i, (m) => `Archived menu section ${m[1]}`],
    [/^Opened till with\s+(.+)$/i, (m) => `Till opened with ${m[1]} in the drawer`],
    [/^Closed till variance\s+(.+)$/i, (m) => `Till closed · difference ${m[1]}`],
    [/^Adjustment approved by manager$/i, 'Manager approved a till adjustment'],
    [/^Assigned shift to\s+(.+)\s+on\s+(.+)$/i, (m) => `Shift for ${m[1]} on ${m[2]}`],
    [/^Removed shift\s+\S+$/i, 'Shift removed from the schedule'],
    [
      /^Copied\s+(\d+)\s+shifts to week of\s+(.+)$/i,
      (m) => `Copied ${m[1]} shifts to the week of ${m[2]}`,
    ],
    [
      /^Applied template\s+(.+)\s+\((\d+)\s+shifts\)\s+to week of\s+(.+)$/i,
      (m) => `Applied “${m[1]}” (${m[2]} shifts) to the week of ${m[3]}`,
    ],
    [
      /^Created payroll period for\s+(.+)$/i,
      (m) => `Payroll period started for ${m[1]}`,
    ],
    [
      /^Marked payroll paid for\s+(.+)\s+via\s+(.+)$/i,
      (m) => `Marked ${m[1]}’s salary paid · ${m[2]}`,
    ],
    [/^Created table\s+(.+)$/i, (m) => `Added table ${m[1]}`],
    [/^Updated table\s+(.+)$/i, (m) => `Updated table ${m[1]}`],
    [/^Archived table\s+(.+)$/i, (m) => `Archived table ${m[1]}`],
    [
      /^Set table\s+(.+)\s+status to\s+(.+)$/i,
      (m) => `Table ${m[1]} marked ${titleCaseDots(m[2])}`,
    ],
    [
      /^Rotated QR token for table\s+(.+)$/i,
      (m) => `New QR code for table ${m[1]}`,
    ],
    [
      /^Deactivated QR tokens for table\s+(.+)$/i,
      (m) => `QR codes turned off for table ${m[1]}`,
    ],
    [
      /^Marked table\s+(.+)\s+cleaning complete$/i,
      (m) => `Table ${m[1]} marked clean`,
    ],
    [
      /^Confirmed\s+(.+)\s+batch of\s+(.+)$/i,
      (m) => `Prep batch confirmed · ${m[1]} of ${m[2]}`,
    ],
    [
      /^Anonymized\s+(\d+)\s+guest display names older than\s+(\d+)\s+days$/i,
      (m) => `Cleared ${m[1]} old guest names (privacy, ${m[2]}+ days)`,
    ],
  ];

  for (const [re, repl] of rules) {
    const m = raw.match(re);
    if (!m) continue;
    return typeof repl === 'function' ? repl(m) : repl;
  }

  return raw
    .replace(/\bsession\b/gi, 'table visit')
    .replace(/\bentity\b/gi, 'record')
    .replace(/\bmetadata\b/gi, 'details');
}

/** Filters shown in Team activity (real backend action types). */
export const ACTIVITY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'payment.settle', label: 'Bill settled' },
  { value: 'payment.refund', label: 'Refund' },
  { value: 'order.sent_to_kitchen', label: 'Order to kitchen' },
  { value: 'session.open', label: 'Table opened' },
  { value: 'session.close', label: 'Table closed' },
  { value: 'session.move', label: 'Table moved' },
  { value: 'session.waiter_assigned', label: 'Waiter assigned' },
  { value: 'till.open', label: 'Till opened' },
  { value: 'till.close', label: 'Till closed' },
  { value: 'inventory.receive', label: 'Stock received' },
  { value: 'inventory.count', label: 'Stock counted' },
  { value: 'payroll.mark_paid', label: 'Salary paid' },
  { value: 'employee.create', label: 'Employee added' },
  { value: 'shift.assign', label: 'Shift assigned' },
  { value: 'menu.item.update', label: 'Dish updated' },
];

export const MOVEMENT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'purchase_receipt', label: 'Delivery received' },
  { value: 'adjustment', label: 'Stock count' },
  { value: 'waste', label: 'Waste' },
  { value: 'staff_meal', label: 'Staff meal' },
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'stock_return', label: 'Return to supplier' },
  { value: 'production_input', label: 'Used in prep' },
  { value: 'production_output', label: 'Made in prep' },
  { value: 'sale_consumption', label: 'Used for orders' },
  { value: 'opening_stock', label: 'Opening stock' },
];
