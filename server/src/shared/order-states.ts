export const ORDER_ITEM_STATES = [
  'draft',
  'placed',
  'submitted',
  'preparing',
  'ready',
  'served',
  'cancelled',
  'voided',
  'comped',
] as const;

export type OrderItemState = (typeof ORDER_ITEM_STATES)[number];

export const ORDER_STATES = [
  'draft',
  'placed',
  'submitted',
  'preparing',
  'ready',
  'served',
  'partially_paid',
  'paid',
  'cancelled',
  'voided',
  'refunded',
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

const ALLOWED_ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
  draft: ['placed', 'submitted', 'cancelled'],
  placed: ['submitted', 'cancelled'],
  submitted: ['preparing', 'cancelled', 'voided'],
  preparing: ['ready', 'voided'],
  ready: ['served', 'voided'],
  served: ['partially_paid', 'paid', 'voided'],
  partially_paid: ['paid', 'refunded'],
  paid: ['refunded'],
  cancelled: [],
  voided: [],
  refunded: [],
};

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export const TABLE_STATES = [
  'FREE',
  'OCCUPIED',
  'RESERVED',
  'NEEDS_CLEANING',
] as const;

export type TableState = (typeof TABLE_STATES)[number];

export const CURRENCY_CODE = 'GMD';
export const TIMEZONE = 'Africa/Banjul';
export const DATE_FORMAT = 'DD Mon YYYY';
