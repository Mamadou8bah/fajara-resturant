import { api, apiBlob } from '@/lib/api';
import { staffMutate } from '@/lib/staffMutate';
import type { Role } from '@/lib/rbac/permissions';

export type Employee = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  designation: string | null;
  photoUrl: string | null;
  isActive: boolean;
  startDate: string | null;
  payStructure: string | null;
  baseAmount: string | number | null;
  paySchedule: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  hasPin: boolean;
  hasPassword: boolean;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CreateEmployeeInput = {
  fullName: string;
  role: Role;
  email: string;
  employeeCode?: string;
  phone?: string;
  designation?: string;
  pin: string;
  password?: string;
  photoUrl?: string;
  startDate?: string;
  payStructure?: string;
  baseAmount?: number;
  paySchedule?: string;
  isActive?: boolean;
};

export type EmployeePerformance = {
  employeeId: string;
  fullName: string;
  role: string;
  from: string;
  to: string;
  orderCount: number;
  attributedSales: number;
  averageOrderValue: number;
  tips: number;
  checkoutCount: number;
  checkoutSales: number;
  checkoutTips: number;
  voidCount: number;
  series: { date: string; sales: number; orders: number; checkout: number }[];
  insights: { id: string; title: string; detail: string }[];
};

export type ShiftRow = {
  id: string;
  employeeId: string;
  shiftTypeId: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: string;
  employee: {
    id: string;
    fullName: string;
    role: string;
    designation: string | null;
  };
  shiftType: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    color: string | null;
    isActive: boolean;
  } | null;
};

export type WeeklyShifts = {
  weekStart: string;
  weekEnd: string;
  shifts: ShiftRow[];
  coverageWarnings: {
    date: string;
    role: string;
    scheduled: number;
    expected: number;
    message: string;
  }[];
  cellFlags?: Array<{
    employeeId: string;
    date: string;
    fatigueDays?: number;
    outsideHours?: boolean;
    conflict?: string;
  }>;
  dayHeaders?: Array<{ date: string; labels: string[] }>;
  operatingHours?: { openFrom: string; openTo: string };
};

export type ShiftType = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string | null;
  isActive: boolean;
};

export type PayrollRecord = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  amountDue: number | string | null;
  status: string;
  paidAt: string | null;
  method: string | null;
  approvedById: string | null;
  notes: string | null;
  salaryRestricted?: boolean;
  createdAt: string;
  employee: {
    id: string;
    fullName: string;
    role: string;
    employeeCode: string;
    baseAmount?: string | number | null;
    payStructure?: string | null;
    paySchedule?: string | null;
  };
};

export function fetchEmployees(params: {
  page?: number;
  pageSize?: number;
  role?: Role;
  search?: string;
  activeOnly?: boolean;
  includeArchived?: boolean;
} = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.role) q.set('role', params.role);
  if (params.search) q.set('search', params.search);
  if (params.activeOnly != null) q.set('activeOnly', String(params.activeOnly));
  if (params.includeArchived != null)
    q.set('includeArchived', String(params.includeArchived));
  const qs = q.toString();
  return api<Paginated<Employee>>(`/employees${qs ? `?${qs}` : ''}`);
}

export function createEmployee(body: CreateEmployeeInput) {
  return staffMutate<Employee>('/employees', { method: 'POST', body, scope: 'MUTATION',
  });
}

export function updateEmployee(
  id: string,
  body: Partial<CreateEmployeeInput>,
) {
  return staffMutate<Employee>(`/employees/${id}`, { method: 'PATCH', body, scope: 'MUTATION',
  });
}

export function deactivateEmployee(id: string) {
  return staffMutate<Employee>(`/employees/${id}/deactivate`, {
    method: 'POST',
    body: {},
    scope: 'MUTATION',
  });
}

export function archiveEmployee(id: string) {
  return staffMutate<Employee>(`/employees/${id}/archive`, {
    method: 'POST',
    body: {},
    scope: 'MUTATION',
  });
}

export function reactivateEmployee(id: string) {
  return staffMutate<Employee>(`/employees/${id}/reactivate`, {
    method: 'POST',
    body: {},
    scope: 'MUTATION',
  });
}

export function fetchEmployeePerformance(
  id: string,
  from: string,
  to: string,
) {
  return api<EmployeePerformance>(
    `/employees/${id}/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function fetchWeeklyShifts(weekStart: string) {
  return api<WeeklyShifts>(
    `/shifts/weekly?weekStart=${encodeURIComponent(weekStart)}`,
  );
}

export function assignShift(body: {
  employeeId: string;
  shiftTypeId?: string;
  workDate: string;
  startTime: string;
  endTime: string;
  notes?: string;
}) {
  return staffMutate('/shifts/assign', { method: 'POST', body, scope: 'MUTATION',
  });
}

export function copyLastWeek(targetWeekStart: string) {
  return staffMutate('/shifts/copy-last-week', {
    method: 'POST',
    body: { targetWeekStart },
    scope: 'MUTATION',
  });
}

export function removeShift(id: string) {
  return staffMutate(`/shifts/${id}`, { method: 'DELETE', scope: 'MUTATION',
  });
}

export function fetchPayroll(params: {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
} = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.employeeId) q.set('employeeId', params.employeeId);
  if (params.status) q.set('status', params.status);
  if (params.periodStart) q.set('periodStart', params.periodStart);
  if (params.periodEnd) q.set('periodEnd', params.periodEnd);
  const qs = q.toString();
  return api<Paginated<PayrollRecord>>(`/payroll${qs ? `?${qs}` : ''}`);
}

export function createPayroll(body: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  amountDue: number;
  notes?: string;
}) {
  return staffMutate<PayrollRecord>('/payroll', { method: 'POST', body, scope: 'MUTATION',
  });
}

export function markPayrollPaid(
  id: string,
  body: { method: string; paidAt?: string; notes?: string },
) {
  return staffMutate<PayrollRecord>(`/payroll/${id}/mark-paid`, {
    method: 'POST',
    body,
    scope: 'MUTATION',
  });
}

export async function downloadPayrollCsv(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  const blob = await apiBlob(`/reports/export/payroll${qs ? `?${qs}` : ''}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payroll.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function weekStartMonday(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

export function monthStartIso(d = new Date()): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export type MonthlyShifts = {
  month: string;
  monthStart: string;
  monthEnd: string;
  shifts: ShiftRow[];
  days: { date: string; count: number; shifts: ShiftRow[] }[];
};

export type ShiftTemplate = {
  id: string;
  name: string;
  payload: {
    entries?: Array<{
      employeeId: string;
      shiftTypeId?: string | null;
      dayOffset: number;
      startTime: string;
      endTime: string;
      notes?: string | null;
    }>;
  };
  createdAt: string;
};

export function fetchMonthlyShifts(month: string) {
  return api<MonthlyShifts>(
    `/shifts/monthly?month=${encodeURIComponent(month)}`,
  );
}

export function listShiftTemplates() {
  return api<ShiftTemplate[]>('/shifts/templates');
}

export function createShiftTemplate(body: {
  name: string;
  payload: ShiftTemplate['payload'];
}) {
  return staffMutate<ShiftTemplate>('/shifts/templates', { method: 'POST', body, scope: 'MUTATION',
  });
}

export function deleteShiftTemplate(id: string) {
  return staffMutate(`/shifts/templates/${id}`, { method: 'DELETE', scope: 'MUTATION',
  });
}

export function applyShiftTemplate(templateId: string, targetWeekStart: string) {
  return staffMutate('/shifts/templates/apply', {
    method: 'POST',
    body: { templateId, targetWeekStart },
    scope: 'MUTATION',
  });
}

export function listShiftTypes(includeInactive = false) {
  const q = includeInactive ? '?includeInactive=true' : '';
  return api<ShiftType[]>(`/shifts/types${q}`);
}

export function createShiftType(body: {
  name: string;
  startTime: string;
  endTime: string;
  color?: string;
}) {
  return staffMutate<ShiftType>('/shifts/types', { method: 'POST', body, scope: 'MUTATION',
  });
}

export function updateShiftType(
  id: string,
  body: Partial<{
    name: string;
    startTime: string;
    endTime: string;
    color: string | null;
    isActive: boolean;
  }>,
) {
  return staffMutate<ShiftType>(`/shifts/types/${id}`, { method: 'PATCH', body, scope: 'MUTATION',
  });
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}
