'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Fired so staff screens can refetch after realtime events (sound lives in StaffShell). */
export const STAFF_DATA_EVENT = 'fajara:staff-data';

export function notifyStaffDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STAFF_DATA_EVENT));
}

export function onStaffDataChanged(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const listener = () => handler();
  window.addEventListener(STAFF_DATA_EVENT, listener);
  return () => window.removeEventListener(STAFF_DATA_EVENT, listener);
}

export function getSocket(): Socket {
  if (socket) return socket;
  const url =
    process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, '') ||
    'http://localhost:4000/realtime';
  socket = io(url, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function connectSocket(token?: string | null) {
  const s = getSocket();
  if (token) s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

/** Join (or re-join after reconnect) the rooms a staff user needs. */
export function joinStaffRooms(
  s: Socket,
  user: { id: string; role: string; permissions?: string[] },
) {
  s.emit('join', { room: 'waiters' });
  s.emit('join', { room: 'floor' });
  s.emit('join', { room: `employee:${user.id}` });
  if (user.role === 'OWNER' || user.role === 'MANAGER') {
    s.emit('join', { room: 'managers' });
  }
  // Kitchen / grill need KDS tickets even when not looking at the kitchen page.
  if (
    user.role === 'KITCHEN' ||
    user.permissions?.includes('orders.kitchen')
  ) {
    s.emit('join', { room: 'kds' });
  }
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
