import { api } from '@/lib/api';

export type WaiterGuest = {
  id: string;
  displayName: string | null;
  sortOrder: number;
};

export type WaiterOrderItem = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  status: string;
  priceSnapshot: string | number;
  kitchenNotes: string | null;
  settledTransactionId?: string | null;
  guest: { id: string; displayName: string | null; sortOrder: number } | null;
  menuItem?: {
    id: string;
    name: string;
    station: string | null;
    requiresKitchen?: boolean;
    prepMinutes?: number | null;
  } | null;
};

export type WaiterOrder = {
  id: string;
  orderNumber: number;
  status: string;
  source: string;
  submittedAt: string;
  items: WaiterOrderItem[];
};

export type WaiterTableSession = {
  id: string;
  status: string;
  openedAt: string;
  waiterId: string | null;
  guestCount?: number;
  reservationPartySize?: number | null;
  table: {
    id: string;
    number: number;
    label: string | null;
    seats: number;
  };
  guests: WaiterGuest[];
  waiter: { id: string; fullName: string } | null;
  orders: WaiterOrder[];
};

export type MenuModifierOption = {
  id: string;
  name: string;
  priceDelta: string | number;
  priceEffect?: string | number;
  isDefault?: boolean;
};

export type MenuModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired?: boolean;
  options: MenuModifierOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  photoUrl?: string | null;
  isAvailable: boolean;
  isSoldOut: boolean;
  station: string;
  requiresKitchen?: boolean;
  prepMinutes?: number | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  modifierGroups: MenuModifierGroup[];
  specials: {
    id: string;
    type: string;
    specialPrice: string | number | null;
    quantityRemaining: number | null;
    endsAt: string | null;
  }[];
};

export type SubmitOrderItem = {
  guestId: string;
  menuItemId: string;
  quantity: number;
  kitchenNotes?: string;
  isTakeaway?: boolean;
  modifierOptionIds?: string[];
};

export type SubmitOrderInput = {
  sessionId: string;
  source?: 'WAITER' | 'GUEST';
  clientRequestId: string;
  items: SubmitOrderItem[];
};

export type StaffNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  sessionId: string | null;
  employeeId?: string | null;
  sessionWaiterId?: string | null;
  sessionStatus?: string | null;
  createdAt: string;
  payload?: unknown;
};

export function fetchWaiterTables(waiterId?: string) {
  const q = waiterId ? `?waiterId=${encodeURIComponent(waiterId)}` : '';
  return api<WaiterTableSession[]>(`/orders/waiter-tables${q}`);
}

export function fetchMenuItems(categoryId?: string) {
  const q = categoryId
    ? `?categoryId=${encodeURIComponent(categoryId)}`
    : '';
  return api<MenuItem[]>(`/menu/items${q}`).then((items) =>
    items.map(normalizeMenuItem),
  );
}

function normalizeMenuItem(item: MenuItem): MenuItem {
  return {
    ...item,
    modifierGroups: (item.modifierGroups ?? []).map((g) => ({
      ...g,
      options: (g.options ?? []).map((o) => ({
        ...o,
        priceDelta: o.priceDelta ?? o.priceEffect ?? 0,
        isDefault: Boolean(o.isDefault),
      })),
    })),
  };
}

export function optionPriceDelta(o: MenuModifierOption): number {
  return Number(o.priceDelta ?? o.priceEffect ?? 0);
}

export function cancelOrderItem(itemId: string, reason?: string) {
  return api(`/orders/items/${encodeURIComponent(itemId)}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

export function requestVoidOrderItem(itemId: string, reason: string) {
  return api<{ ok: true; message: string }>(
    `/orders/items/${encodeURIComponent(itemId)}/void-request`,
    { method: 'POST', body: { reason } },
  );
}

export function requestCompOrderItem(itemId: string, reason: string) {
  return api<{ ok: true; message: string }>(
    `/orders/items/${encodeURIComponent(itemId)}/comp-request`,
    { method: 'POST', body: { reason } },
  );
}

export function voidOrderItem(
  itemId: string,
  body: {
    reason: string;
    approverEmployeeId: string;
    approverPin: string;
  },
) {
  return api(`/orders/items/${encodeURIComponent(itemId)}/void`, {
    method: 'POST',
    body,
  });
}

export function compOrderItem(
  itemId: string,
  body: {
    reason: string;
    approverEmployeeId: string;
    approverPin: string;
  },
) {
  return api(`/orders/items/${encodeURIComponent(itemId)}/comp`, {
    method: 'POST',
    body,
  });
}

export function reopenPaidOrder(
  orderId: string,
  body: {
    reason: string;
    approverEmployeeId: string;
    approverPin: string;
  },
) {
  return api(`/orders/${encodeURIComponent(orderId)}/reopen`, {
    method: 'POST',
    body,
  });
}

export function submitOrder(body: SubmitOrderInput) {
  return api('/orders', {
    method: 'POST',
    body: { ...body, source: body.source ?? 'WAITER' },
  });
}

export function firstAccept(body: {
  notificationId?: string;
  sessionId?: string;
}) {
  return api('/orders/first-accept', { method: 'POST', body });
}

export function sendOrderToKitchen(orderId: string, itemIds?: string[]) {
  return api(`/orders/${orderId}/send-to-kitchen`, {
    method: 'POST',
    body: itemIds && itemIds.length > 0 ? { itemIds } : {},
  });
}

export function serveOrderItem(itemId: string) {
  return api(`/orders/items/${itemId}/serve`, { method: 'POST', body: {} });
}

export function markItemUnavailable(itemId: string, reason?: string) {
  return api(`/orders/items/${itemId}/unavailable`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

export function assignSessionWaiter(sessionId: string, waiterId: string) {
  return api(`/orders/sessions/${sessionId}/assign-waiter`, {
    method: 'POST',
    body: { waiterId },
  });
}

export function fetchAssignableWaiters() {
  return api<{ id: string; fullName: string; role: string }[]>(
    '/orders/assignable-waiters',
  );
}

export function fetchNotifications() {
  return api<StaffNotification[]>('/notifications');
}

export function markNotificationDelivered(id: string) {
  return api(`/notifications/${id}/delivered`, { method: 'PATCH', body: {} });
}

export function markNotificationSeen(id: string) {
  return api(`/notifications/${id}/seen`, { method: 'PATCH', body: {} });
}

export function approveRemake(notificationId: string) {
  return api('/orders/exceptions/approve', {
    method: 'POST',
    body: { notificationId },
  });
}

export function declineRemake(notificationId: string) {
  return api('/orders/exceptions/decline', {
    method: 'POST',
    body: { notificationId },
  });
}

export function approveException(notificationId: string) {
  return approveRemake(notificationId);
}

export function declineException(notificationId: string) {
  return declineRemake(notificationId);
}

export function newClientRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
