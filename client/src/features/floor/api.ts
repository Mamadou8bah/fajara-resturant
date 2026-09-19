import { api } from '@/lib/api';

export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED' | 'NEEDS_CLEANING';

export type FloorGuest = {
  id: string;
  displayName: string | null;
  sortOrder: number;
};

export type FloorSettlement = {
  orderCount: number;
  unpaidOrderCount: number;
  transactionTotal: number;
  estimatedOrderTotal: number;
  progressPercent: number | null;
};

export type FloorSession = {
  id: string;
  status: string;
  openedAt: string;
  guestCount: number;
  waiter: { id: string; fullName: string } | null;
  guests: FloorGuest[];
  reservationName: string | null;
  reservationAt: string | null;
  reservationPartySize: number | null;
  settlement: FloorSettlement | null;
};

export type FloorTable = {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  status: TableStatus;
  sortOrder: number;
  posX: number | null;
  posY: number | null;
  /** Waiter who last closed this table (for Needs cleaning ownership). */
  clearingWaiter?: { id: string; fullName: string } | null;
  activeSession: FloorSession | null;
  reservation: {
    name: string | null;
    partySize: number | null;
    at: string | null;
    note: string | null;
  } | null;
};

export type OpenSessionInput = {
  tableId: string;
  waiterId?: string;
  guests?: { displayName?: string }[];
  reservationName?: string;
  reservationNote?: string;
  reservationAt?: string;
  reservationPartySize?: number;
};

export type UpdateTableStatusInput = {
  status: TableStatus;
  reservationName?: string;
  reservationPartySize?: number;
  reservationAt?: string;
  reservationNote?: string;
};

export function fetchFloorPlan() {
  return api<FloorTable[]>('/sessions/floor');
}

export function openSession(body: OpenSessionInput) {
  return api('/sessions', { method: 'POST', body });
}

export function moveSession(sessionId: string, toTableId: string) {
  return api(`/sessions/${sessionId}/move`, {
    method: 'POST',
    body: { toTableId },
  });
}

export function addGuest(sessionId: string, displayName?: string) {
  return api(`/sessions/${sessionId}/guests`, {
    method: 'POST',
    body: { displayName },
  });
}

export function markCleaningComplete(tableId: string) {
  return api('/sessions/cleaning-complete', {
    method: 'POST',
    body: { tableId },
  });
}

export function closeSession(sessionId: string) {
  return api(`/sessions/${sessionId}/close`, {
    method: 'POST',
    body: {},
  });
}

export function updateTableStatus(tableId: string, body: UpdateTableStatusInput) {
  return api(`/tables/${tableId}/status`, {
    method: 'PATCH',
    body,
  });
}

export function updateTablePosition(
  tableId: string,
  posX: number,
  posY: number,
) {
  return api<{ id: string; posX: number; posY: number }>(
    `/tables/${tableId}/position`,
    {
      method: 'PATCH',
      body: { posX, posY },
    },
  );
}

