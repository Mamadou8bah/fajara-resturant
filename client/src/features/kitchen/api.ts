import { api } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';

export type KitchenItemStatus =
  | 'draft'
  | 'submitted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled'
  | 'voided'
  | 'comped';

export type KitchenTicketItem = {
  id: string;
  quantity: number;
  nameSnapshot: string;
  status: KitchenItemStatus;
  kitchenNotes: string | null;
  isTakeaway: boolean;
  createdAt: string;
  pendingSync?: boolean;
  modifiers: {
    id: string;
    nameSnapshot: string;
    priceSnapshot: string | number;
  }[];
  guest: {
    id: string;
    displayName: string | null;
    sortOrder: number;
  } | null;
  menuItem: {
    id: string;
    name: string;
    station: string | null;
    requiresKitchen?: boolean;
    prepMinutes?: number | null;
  } | null;
  order: {
    id: string;
    orderNumber: number;
    source: string;
    submittedAt: string | null;
    session: {
      id: string;
      tableId: string;
      table: {
        id: string;
        number: string | number;
        label: string | null;
      };
      guests: {
        id: string;
        displayName: string | null;
        sortOrder: number;
      }[];
    };
  };
  priorTable: {
    id: string;
    number: string | number;
    label: string | null;
  } | null;
  waiter: { id: string; fullName: string } | null;
  /** Later order round on the same session (KDS-003). */
  isAppendedRound?: boolean;
  /** Dish is currently on an active special. */
  isSpecial?: boolean;
};

export type KitchenTickets = {
  submitted: KitchenTicketItem[];
  preparing: KitchenTicketItem[];
  ready: KitchenTicketItem[];
};

export function fetchKitchenTickets(station?: string) {
  const query = station
    ? `?station=${encodeURIComponent(station)}`
    : '';
  return api<KitchenTickets>(`/kitchen/tickets${query}`);
}

export function transitionKitchenItem(
  itemId: string,
  status: KitchenItemStatus,
) {
  return staffMutate<KitchenTicketItem>(`/kitchen/items/${itemId}/transition`, {
    method: 'POST',
    body: { status },
    scope: 'KITCHEN',
    label: `Kitchen → ${status}`,
    optimisticResult: {
      id: itemId,
      status,
      pendingSync: true,
    } as KitchenTicketItem,
  });
}

export function remakeKitchenItem(
  itemId: string,
  body: {
    reason: string;
    approverEmployeeId: string;
    approverPin: string;
  },
) {
  return staffMutate<KitchenTicketItem>(`/kitchen/items/${itemId}/remake`, {
    method: 'POST',
    body,
    scope: 'KITCHEN',
    label: 'Remake item',
  });
}

/** Ask owners/managers to approve a remake (no PIN on the kitchen device). */
export function requestKitchenRemake(itemId: string, reason: string) {
  return staffMutate<{ ok: true; notified: number; message: string }>(
    `/kitchen/items/${itemId}/remake-request`,
    {
      method: 'POST',
      body: { reason },
      scope: 'KITCHEN',
      label: 'Request remake',
    },
  );
}
