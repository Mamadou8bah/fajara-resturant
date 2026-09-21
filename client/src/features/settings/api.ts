import { api } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';

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
  return staffMutate<SettingRow>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
    scope: 'MUTATION',
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
  return staffMutate<DiningTable>('/tables', { method: 'POST', body, scope: 'MUTATION',
  });
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
  return staffMutate<DiningTable>(`/tables/${id}`, { method: 'PATCH', body, scope: 'MUTATION',
  });
}

export function archiveTable(id: string) {
  return staffMutate(`/tables/${id}`, { method: 'DELETE', scope: 'MUTATION',
  });
}

export function exportTableQr(tableId: string) {
  return api<QrExport>(`/tables/${tableId}/qr/export`);
}

export function rotateTableQr(tableId: string) {
  return staffMutate(`/tables/${tableId}/qr/rotate`, { method: 'POST', scope: 'MUTATION',
  });
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
