import { api } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';
import { newClientRequestId as offlineId } from '@/lib/offlineWriteQueue';

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
  pendingSync?: boolean;
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
  pendingSync?: boolean;
  items: WaiterOrderItem[];
};

export type WaiterTableSession = {
  id: string;
  status: string;
  openedAt: string;
  waiterId: string | null;
  guestCount?: number;
  reservationPartySize?: number | null;
  pendingSync?: boolean;
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
  return staffMutate(`/orders/items/${encodeURIComponent(itemId)}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
    scope: 'ORDER',
    label: 'Cancel item',
  });
}

export function requestVoidOrderItem(itemId: string, reason: string) {
  return staffMutate<{ ok: true; message: string }>(
    `/orders/items/${encodeURIComponent(itemId)}/void-request`,
    { method: 'POST', body: { reason }, scope: 'ORDER', label: 'Void request' },
  );
}

export function requestCompOrderItem(itemId: string, reason: string) {
  return staffMutate<{ ok: true; message: string }>(
    `/orders/items/${encodeURIComponent(itemId)}/comp-request`,
    { method: 'POST', body: { reason }, scope: 'ORDER', label: 'Comp request' },
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
  return staffMutate(`/orders/items/${encodeURIComponent(itemId)}/void`, {
    method: 'POST',
    body,
    scope: 'ORDER',
    label: 'Void item',
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
  return staffMutate(`/orders/items/${encodeURIComponent(itemId)}/comp`, {
    method: 'POST',
    body,
    scope: 'ORDER',
    label: 'Comp item',
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
  return staffMutate(`/orders/${encodeURIComponent(orderId)}/reopen`, {
    method: 'POST',
    body,
    scope: 'ORDER',
    label: 'Reopen order',
  });
}

export function submitOrder(body: SubmitOrderInput) {
  const clientRequestId = body.clientRequestId || offlineId();
  return staffMutate('/orders', {
    method: 'POST',
    body: { ...body, source: body.source ?? 'WAITER', clientRequestId },
    scope: 'ORDER',
    label: 'Place order',
    clientRequestId,
    injectBodyClientRequestId: true,
    optimisticResult: {
      id: `pending-${clientRequestId}`,
      orderNumber: 0,
      status: 'submitted',
      source: body.source ?? 'WAITER',
      submittedAt: new Date().toISOString(),
      pendingSync: true,
      clientRequestId,
      items: [],
    },
  });
}

export function firstAccept(body: {
  notificationId?: string;
  sessionId?: string;
}) {
  return staffMutate('/orders/first-accept', {
    method: 'POST',
    body,
    scope: 'ORDER',
    label: 'Accept call',
  });
}

export function sendOrderToKitchen(orderId: string, itemIds?: string[]) {
  return staffMutate(`/orders/${orderId}/send-to-kitchen`, {
    method: 'POST',
    body: itemIds && itemIds.length > 0 ? { itemIds } : {},
    scope: 'ORDER',
    label: 'Send to kitchen',
    optimisticResult: { ok: true, pendingSync: true },
  });
}

export function serveOrderItem(itemId: string) {
  return staffMutate(`/orders/items/${itemId}/serve`, {
    method: 'POST',
    body: {},
    scope: 'ORDER',
    label: 'Mark served',
    optimisticResult: { id: itemId, status: 'served', pendingSync: true },
  });
}

export function markItemUnavailable(itemId: string, reason?: string) {
  return staffMutate(`/orders/items/${itemId}/unavailable`, {
    method: 'POST',
    body: reason ? { reason } : {},
    scope: 'ORDER',
    label: 'Mark unavailable',
  });
}

export function assignSessionWaiter(sessionId: string, waiterId: string) {
  return staffMutate(`/orders/sessions/${sessionId}/assign-waiter`, {
    method: 'POST',
    body: { waiterId },
    scope: 'SESSION',
    label: 'Assign waiter',
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
  return staffMutate(`/notifications/${id}/delivered`, {
    method: 'PATCH',
    body: {},
    scope: 'MUTATION',
    label: 'Mark notification delivered',
  });
}

export function markNotificationSeen(id: string) {
  return staffMutate(`/notifications/${id}/seen`, {
    method: 'PATCH',
    body: {},
    scope: 'MUTATION',
    label: 'Mark notification seen',
  });
}

export function approveRemake(notificationId: string) {
  return staffMutate('/orders/exceptions/approve', {
    method: 'POST',
    body: { notificationId },
    scope: 'ORDER',
    label: 'Approve exception',
  });
}

export function declineRemake(notificationId: string) {
  return staffMutate('/orders/exceptions/decline', {
    method: 'POST',
    body: { notificationId },
    scope: 'ORDER',
    label: 'Decline exception',
  });
}

export function approveException(notificationId: string) {
  return approveRemake(notificationId);
}

export function declineException(notificationId: string) {
  return declineRemake(notificationId);
}

export function newClientRequestId() {
  return offlineId();
}
