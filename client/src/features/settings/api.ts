import { api } from '@/lib/api';

export type SettingsMap = Record<string, unknown>;

export type SettingRow = {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
};

export type DiningTable = {
  id: string;
  number: string | number;
  label: string | null;
  seats: number;
  status: string;
  archivedAt: string | null;
  sortOrder?: number;
};

export type QrExport = {
  token: string;
  tableId?: string;
  url: string;
  stableUrl?: string;
  path?: string;
  tableNumber: string;
  tableLabel: string | null;
  restaurantName: string;
  mimeType: string;
  imageBase64: string;
  imageDataUrl: string;
  printLabel: string;
};

export function fetchSettings() {
  return api<SettingsMap>('/settings');
}

export function putSetting(key: string, value: unknown) {
  return api<SettingRow>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
  });
}

export function fetchTables(includeArchived = false) {
  const q = includeArchived ? '?includeArchived=true' : '';
  return api<DiningTable[]>(`/tables${q}`);
}

export function createTable(body: {
  number: string;
  label?: string;
  seats: number;
  sortOrder?: number;
}) {
  return api<DiningTable>('/tables', { method: 'POST', body });
}

export function updateTable(
  id: string,
  body: {
    number?: string;
    label?: string | null;
    seats?: number;
    sortOrder?: number;
  },
) {
  return api<DiningTable>(`/tables/${id}`, { method: 'PATCH', body });
}

export function archiveTable(id: string) {
  return api(`/tables/${id}`, { method: 'DELETE' });
}

export function exportTableQr(tableId: string) {
  return api<QrExport>(`/tables/${tableId}/qr/export`);
}

export function rotateTableQr(tableId: string) {
  return api(`/tables/${tableId}/qr/rotate`, { method: 'POST' });
}

export function changeOwnPin(body: { currentPin?: string; newPin: string }) {
  return api('/auth/pin', { method: 'PATCH', body });
}

export function changeOwnPassword(body: {
  currentPassword?: string;
  newPassword: string;
}) {
  return api('/auth/password', { method: 'PATCH', body });
}
