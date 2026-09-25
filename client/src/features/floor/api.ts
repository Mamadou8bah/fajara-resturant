import { api } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';

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
  pendingSync?: boolean;
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
  pendingSync?: boolean;
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
  return staffMutate('/sessions', {
    method: 'POST',
    body,
    scope: 'SESSION',
    label: 'Open table',
    optimisticResult: {
      id: `pending-session-${body.tableId}`,
      tableId: body.tableId,
      status: 'OPEN',
      pendingSync: true,
      openedAt: new Date().toISOString(),
    },
  });
}

export function moveSession(sessionId: string, toTableId: string) {
  return staffMutate(`/sessions/${sessionId}/move`, {
    method: 'POST',
    body: { toTableId },
    scope: 'SESSION',
    label: 'Move table',
  });
}

export function addGuest(sessionId: string, displayName?: string) {
  return staffMutate(`/sessions/${sessionId}/guests`, {
    method: 'POST',
    body: { displayName },
    scope: 'SESSION',
    label: 'Add guest',
  });
}

export function removeGuest(sessionId: string, guestId: string) {
  return staffMutate(`/sessions/${sessionId}/guests/${guestId}/leave`, {
    method: 'POST',
    body: {},
    scope: 'SESSION',
    label: 'Guest left',
  });
}

export function markCleaningComplete(tableId: string) {
  return staffMutate('/sessions/cleaning-complete', {
    method: 'POST',
    body: { tableId },
    scope: 'SESSION',
    label: 'Cleaning complete',
    optimisticResult: { ok: true, pendingSync: true, tableId },
  });
}

export function closeSession(
  sessionId: string,
  opts?: { needsCleaning?: boolean },
) {
  return staffMutate(`/sessions/${sessionId}/close`, {
    method: 'POST',
    body: {
      ...(opts?.needsCleaning === true ? { needsCleaning: true } : {}),
    },
    scope: 'SESSION',
    label: 'Close session',
  });
}

export function updateTableStatus(tableId: string, body: UpdateTableStatusInput) {
  return staffMutate(`/tables/${tableId}/status`, {
    method: 'PATCH',
    body,
    scope: 'SESSION',
    label: 'Update table status',
    optimisticResult: { id: tableId, ...body, pendingSync: true },
  });
}

export function updateTablePosition(
  tableId: string,
  posX: number,
  posY: number,
) {
  return staffMutate<{ id: string; posX: number; posY: number }>(
    `/tables/${tableId}/position`,
    {
      method: 'PATCH',
      body: { posX, posY },
      scope: 'SESSION',
      label: 'Move table tile',
      optimisticResult: { id: tableId, posX, posY },
    },
  );
}

