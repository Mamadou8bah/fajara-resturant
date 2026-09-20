'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterSelect,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import { formatDisplayDate, formatGmd, todayIso, daysAgoIso } from '@/lib/money';
import { useAuth } from '@/lib/auth';
import { Can, useCan } from '@/lib/rbac';
import type { Role } from '@/lib/rbac/permissions';
import { ShiftPlanner } from './ShiftPlanner';
import { EmployeePerformancePanels } from './EmployeePerformancePanels';
import {
  archiveEmployee,
  createEmployee,
  createPayroll,
  deactivateEmployee,
  fetchEmployeePerformance,
  fetchEmployees,
  fetchMonthlyShifts,
  fetchPayroll,
  fetchWeeklyShifts,
  listShiftTemplates,
  listShiftTypes,
  markPayrollPaid,
  monthStartIso,
  reactivateEmployee,
  updateEmployee,
  weekStartMonday,
  type Employee,
  type EmployeePerformance,
  type MonthlyShifts,
  type PayrollRecord,
  type ShiftTemplate,
  type ShiftType,
  type WeeklyShifts,
} from './api';

type Tab = 'staff' | 'shifts' | 'payroll' | 'performance';
type ShiftView = 'week' | 'month';
type ProfileTab = 'performance' | 'pay';

const ALL_ROLES: Role[] = ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'];
const PAY_METHODS = ['Cash', 'Bank transfer', 'Wave', 'Other'];

export function EmployeesScreen({
  initialTab,
}: {
  initialTab?: Tab;
} = {}) {
  const { user } = useAuth();
  const { can } = useCan();
  const canSalary = can('employees.manage');
  const isOwner = user?.role === 'OWNER';
  const roles = isOwner
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r !== 'OWNER');
  const [tab, setTab] = useState<Tab>(initialTab ?? 'staff');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inactive, setInactive] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('performance');
  const [payConfirm, setPayConfirm] = useState<PayrollRecord | null>(null);
  const [payMethod, setPayMethod] = useState('Cash');
  const [form, setForm] = useState({
    fullName: '',
    role: 'WAITER' as Role,
    email: '',
    employeeCode: '',
    pin: '',
    designation: '',
    payStructure: '',
    baseAmount: '',
    paySchedule: '',
  });

  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [weekly, setWeekly] = useState<WeeklyShifts | null>(null);
  const [shiftView, setShiftView] = useState<ShiftView>('week');
  const [monthStart, setMonthStart] = useState(monthStartIso());
  const [monthly, setMonthly] = useState<MonthlyShifts | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Employee | null>(null);
  const [profilePayroll, setProfilePayroll] = useState<PayrollRecord[]>([]);

  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [payForm, setPayForm] = useState({
    employeeId: '',
    periodStart: daysAgoIso(13),
    periodEnd: todayIso(),
    amountDue: '',
    notes: '',
  });

  const [perfId, setPerfId] = useState('');
  const [perfFrom, setPerfFrom] = useState(daysAgoIso(29));
  const [perfTo, setPerfTo] = useState(todayIso());
  const [perf, setPerf] = useState<EmployeePerformance | null>(null);

  const loadStaff = useCallback(async () => {
    const [activeRes, inactiveRes] = await Promise.all([
      fetchEmployees({
        pageSize: 100,
        search: search || undefined,
        role: roleFilter || undefined,
        activeOnly: true,
      }),
      fetchEmployees({
        pageSize: 100,
        search: search || undefined,
        role: roleFilter || undefined,
        activeOnly: false,
        includeArchived: true,
      }).catch(() => ({ items: [] as Employee[] })),
    ]);
    setEmployees(activeRes.items);
    setInactive(
      inactiveRes.items.filter((e) => !e.isActive || e.archivedAt),
    );
    if (!payForm.employeeId && activeRes.items[0]) {
      setPayForm((s) => ({ ...s, employeeId: activeRes.items[0].id }));
    }
    if (!perfId && activeRes.items[0]) setPerfId(activeRes.items[0].id);
  }, [search, roleFilter, payForm.employeeId, perfId]);

  const loadShifts = useCallback(async () => {
    const [w, t, types] = await Promise.all([
      fetchWeeklyShifts(weekStart),
      listShiftTemplates().catch(() => [] as ShiftTemplate[]),
      listShiftTypes().catch(() => [] as ShiftType[]),
    ]);
    setWeekly(w);
    setTemplates(t);
    setShiftTypes(types);
    if (shiftView === 'month') {
      setMonthly(await fetchMonthlyShifts(monthStart));
    }
  }, [weekStart, monthStart, shiftView]);

  const loadPayroll = useCallback(async () => {
    const res = await fetchPayroll({ pageSize: 50 });
    setPayroll(res.items);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'staff' || tab === 'performance') await loadStaff();
      if (tab === 'shifts') {
        await loadStaff();
        await loadShifts();
      }
      if (tab === 'payroll') {
        await loadStaff();
        await loadPayroll();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, loadStaff, loadShifts, loadPayroll]);

  useEffect(() => {
    void load();
  }, [load]);


  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const email = form.email.trim();
      if (!email) {
        throw new Error('Email is required for login');
      }
      const base = {
        fullName: form.fullName.trim(),
        role: form.role,
        email,
        employeeCode: form.employeeCode || undefined,
        designation: form.designation || undefined,
        ...(canSalary
          ? {
              payStructure: form.payStructure || undefined,
              baseAmount: form.baseAmount
                ? Number(form.baseAmount)
                : undefined,
              paySchedule: form.paySchedule || undefined,
            }
          : {}),
      };
      if (editing) {
        await updateEmployee(editing.id, {
          ...base,
          ...(form.pin ? { pin: form.pin } : {}),
        });
        setFlash('Employee updated');
        setEditing(null);
      } else {
        if (!form.pin || form.pin.length !== 4) {
          throw new Error(
            'Set an initial 4-digit PIN — they can change it later',
          );
        }
        await createEmployee({ ...base, pin: form.pin });
        setFlash('Employee added');
        setShowCreate(false);
      }
      setForm({
        fullName: '',
        role: 'WAITER',
        email: '',
        employeeCode: '',
        pin: '',
        designation: '',
        payStructure: '',
        baseAmount: '',
        paySchedule: '',
      });
    });
  }

  async function onLoadPerf() {
    if (!perfId) return;
    setBusy(true);
    setError(null);
    try {
      setPerf(await fetchEmployeePerformance(perfId, perfFrom, perfTo));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load performance');
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string; anyOf?: ('employees.manage' | 'shifts.manage')[] }[] = [
    { id: 'staff', label: 'Staff', anyOf: ['employees.manage'] },
    { id: 'shifts', label: 'Shifts', anyOf: ['shifts.manage'] },
    { id: 'payroll', label: 'Payroll', anyOf: ['employees.manage'] },
    { id: 'performance', label: 'Performance', anyOf: ['employees.manage'] },
  ];

  return (
    <StaffShell
      title={
        initialTab === 'shifts'
          ? 'Shifts'
          : tab === 'shifts'
            ? 'Shifts'
            : 'Employees'
      }
    >
      {initialTab !== 'shifts' ? (
      <div className="mb-4 chip-scroll">
        {tabs.map((t) => (
          <Can key={t.id} anyOf={t.anyOf} fallback={null}>
            <button
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                tab === t.id ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
              }`}
            >
              {t.label}
            </button>
          </Can>
        ))}
      </div>
      ) : (
        <p className="mb-4 text-sm text-muted">
          Tap a day to assign or clear a shift
        </p>
      )}

      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}
      {flash ? (
        <div className="mb-3 rounded-xl bg-[#E4F0EB] px-3 py-2 text-sm font-semibold text-ready">
          {flash}
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock label="Loading…" />
      ) : tab === 'staff' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search staff"
              className="max-w-xs"
              onSubmit={() => void load()}
            />
            <FilterSelect
              value={roleFilter}
              onChange={(v) => setRoleFilter(v as Role | '')}
              placeholder="All roles"
              options={roles.map((r) => ({ value: r, label: r }))}
            />
            <Button variant="outline" onClick={() => void load()}>
              Apply
            </Button>
            <Can permission="employees.manage">
              <Button
                onClick={() => {
                  setEditing(null);
                  setForm({
                    fullName: '',
                    role: 'WAITER',
                    email: '',
                    employeeCode: '',
                    pin: '',
                    designation: '',
                    payStructure: '',
                    baseAmount: '',
                    paySchedule: '',
                  });
                  setShowCreate((v) => !v);
                }}
              >
                {showCreate ? 'Cancel' : 'Add employee'}
              </Button>
            </Can>
          </div>

          {showCreate || editing ? (
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                {editing ? 'Edit employee' : 'Add an employee'}
              </h2>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={onCreate}>
                <label className="text-sm">
                  Full name
                  <input
                    required
                    className="input-field mt-1"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Role
                  <select
                    className="input-field mt-1"
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        role: e.target.value as Role,
                      }))
                    }
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  Login email
                  <input
                    required
                    type="email"
                    autoComplete="off"
                    className="input-field mt-1"
                    placeholder="name@fajara.gm"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                  <span className="mt-1 block text-xs text-muted">
                    {editing
                      ? 'Managers can correct login email. Staff cannot change it in Settings.'
                      : 'Used to sign in. Staff change PIN/password in Settings — not email.'}
                  </span>
                </label>
                <label className="text-sm">
                  Code
                  <input
                    className="input-field mt-1"
                    value={form.employeeCode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, employeeCode: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm">
                  {editing ? 'New PIN (optional)' : 'Initial PIN (4 digits)'}
                  <input
                    required={!editing}
                    className="input-field mt-1"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Designation
                  <input
                    className="input-field mt-1"
                    value={form.designation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, designation: e.target.value }))
                    }
                  />
                </label>
                <Can permission="employees.manage">
                  <label className="text-sm">
                    Pay structure
                    <input
                      className="input-field mt-1"
                      value={form.payStructure}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          payStructure: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Base amount (GMD)
                    <input
                      className="input-field mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.baseAmount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, baseAmount: e.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Pay schedule
                    <input
                      className="input-field mt-1"
                      value={form.paySchedule}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          paySchedule: e.target.value,
                        }))
                      }
                    />
                  </label>
                </Can>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    busy={busy}
                    busyLabel={editing ? 'Saving…' : 'Creating…'}
                  >
                    {editing ? 'Save changes' : 'Create'}
                  </Button>
                  {editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditing(null);
                        setForm({
                          fullName: '',
                          role: 'WAITER',
                          email: '',
                          employeeCode: '',
                          pin: '',
                          designation: '',
                          payStructure: '',
                          baseAmount: '',
                          paySchedule: '',
                        });
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>
          ) : null}

          {employees.length === 0 ? (
            <EmptyState title="No employees" body="Add staff to get started." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {employees.map((emp) => (
                <Panel key={emp.id} className="!mt-0 flex flex-col gap-3">
                  <div>
                    <p className="font-display text-lg font-bold">
                      {emp.fullName}
                    </p>
                    <p className="text-sm text-muted">
                      {emp.role}
                      {emp.designation ? ` · ${emp.designation}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {emp.email ? `${emp.email} · ` : ''}
                      Code {emp.employeeCode}
                      {canSalary && emp.baseAmount != null
                        ? ` · ${formatGmd(emp.baseAmount)}`
                        : ''}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelected(emp);
                        setPerfId(emp.id);
                        setProfileTab('performance');
                        setTab('staff');
                        void (async () => {
                          try {
                            setPerf(
                              await fetchEmployeePerformance(
                                emp.id,
                                perfFrom,
                                perfTo,
                              ),
                            );
                          } catch {
                            setPerf(null);
                          }
                        })();
                      }}
                    >
                      View
                    </Button>
                    <Can permission="employees.manage">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(emp);
                          setForm({
                            fullName: emp.fullName,
                            role: emp.role,
                            email: emp.email ?? '',
                            employeeCode: emp.employeeCode,
                            pin: '',
                            designation: emp.designation ?? '',
                            payStructure: emp.payStructure ?? '',
                            baseAmount:
                              emp.baseAmount != null
                                ? String(emp.baseAmount)
                                : '',
                            paySchedule: emp.paySchedule ?? '',
                          });
                          setShowCreate(false);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirmDeactivate(emp)}
                      >
                        Deactivate
                      </Button>
                    </Can>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {inactive.length > 0 ? (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold">Inactive</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {inactive.map((emp) => (
                  <Panel key={emp.id} className="!mt-0 flex flex-col gap-3 opacity-90">
                    <div>
                      <p className="font-semibold">{emp.fullName}</p>
                      <p className="text-xs text-muted">
                        {emp.role}
                        {emp.archivedAt ? ' · archived' : ' · inactive'}
                      </p>
                    </div>
                    <Can permission="employees.manage">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          busy={busy}
                          busyLabel="Reactivating…"
                          onClick={() =>
                            void run(async () => {
                              await reactivateEmployee(emp.id);
                              setFlash(`${emp.fullName} reactivated`);
                            })
                          }
                        >
                          Reactivate
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirmRemove(emp)}
                        >
                          Remove…
                        </Button>
                      </div>
                    </Can>
                  </Panel>
                ))}
              </div>
            </div>
          ) : null}

          {selected ? (
            <Panel>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold">
                    {selected.fullName}
                  </p>
                  <p className="text-sm text-muted">
                    {selected.role}
                    {selected.designation ? ` · ${selected.designation}` : ''}
                    {selected.email ? ` · ${selected.email}` : ''}
                    {selected.phone ? ` · ${selected.phone}` : ''}
                  </p>
                  {selected.startDate ? (
                    <p className="mt-1 text-xs text-muted">
                      Started {formatDisplayDate(selected.startDate)}
                    </p>
                  ) : null}
                </div>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    profileTab === 'performance'
                      ? 'bg-cta text-cream'
                      : 'bg-[#EDE6DA] text-ink'
                  }`}
                  onClick={() => setProfileTab('performance')}
                >
                  Performance
                </button>
                {canSalary ? (
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                      profileTab === 'pay'
                        ? 'bg-cta text-cream'
                        : 'bg-[#EDE6DA] text-ink'
                    }`}
                    onClick={() => {
                      setProfileTab('pay');
                      void (async () => {
                        try {
                          const res = await fetchPayroll({
                            employeeId: selected.id,
                            pageSize: 50,
                          });
                          setProfilePayroll(res.items);
                          setPayForm((s) => ({
                            ...s,
                            employeeId: selected.id,
                          }));
                        } catch {
                          setProfilePayroll([]);
                        }
                      })();
                    }}
                  >
                    Salary & Pay
                  </button>
                ) : null}
              </div>
              {profileTab === 'performance' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="date"
                      className="input-field"
                      value={perfFrom}
                      onChange={(e) => setPerfFrom(e.target.value)}
                    />
                    <input
                      type="date"
                      className="input-field"
                      value={perfTo}
                      onChange={(e) => setPerfTo(e.target.value)}
                    />
                    <Button
                      busy={busy}
                      busyLabel="Loading…"
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          try {
                            setPerf(
                              await fetchEmployeePerformance(
                                selected.id,
                                perfFrom,
                                perfTo,
                              ),
                            );
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Failed to load performance',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Refresh
                    </Button>
                  </div>
                  {perf ? (
                    <EmployeePerformancePanels perf={perf} />
                  ) : (
                    <p className="text-sm text-muted">
                      Load a range to see performance.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-[#EDE6DA] p-3">
                      <p className="text-xs text-muted">Base pay</p>
                      <p className="font-display text-xl font-bold">
                        {selected.baseAmount != null
                          ? formatGmd(selected.baseAmount)
                          : '—'}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {selected.payStructure ?? 'Structure not set'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#EDE6DA] p-3">
                      <p className="text-xs text-muted">Pay schedule</p>
                      <p className="font-display text-lg font-bold">
                        {selected.paySchedule ?? '—'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#EDE6DA] p-3">
                      <p className="text-xs text-muted">Open / due</p>
                      <p className="font-display text-xl font-bold">
                        {
                          profilePayroll.filter((p) => p.status === 'DUE')
                            .length
                        }
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#EDE6DA] p-3">
                      <p className="text-xs text-muted">Outstanding</p>
                      <p className="font-display text-xl font-bold">
                        {formatGmd(
                          profilePayroll
                            .filter((p) => p.status === 'DUE')
                            .reduce(
                              (sum, p) =>
                                sum +
                                (p.amountDue == null
                                  ? 0
                                  : Number(p.amountDue)),
                              0,
                            ),
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Pay history</h3>
                      <Button
                        variant="outline"
                        className="text-xs"
                        busy={busy}
                        busyLabel="Loading…"
                        onClick={() =>
                          void (async () => {
                            setBusy(true);
                            try {
                              const res = await fetchPayroll({
                                employeeId: selected.id,
                                pageSize: 50,
                              });
                              setProfilePayroll(res.items);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : 'Failed to load payroll',
                              );
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      >
                        Refresh
                      </Button>
                    </div>
                    {profilePayroll.length === 0 ? (
                      <p className="text-muted">
                        No payroll records yet. Create one below or in the
                        Payroll tab.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {profilePayroll.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E0D5C4] bg-white px-3 py-2"
                          >
                            <div>
                              <p className="font-semibold">
                                {p.periodStart.slice(0, 10)} →{' '}
                                {p.periodEnd.slice(0, 10)}
                              </p>
                              <p className="text-xs text-muted">
                                {p.status}
                                {p.method ? ` · ${p.method}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold">
                                {p.amountDue == null
                                  ? '—'
                                  : formatGmd(p.amountDue)}
                              </p>
                              {p.status === 'DUE' ? (
                                <Button
                                  className="text-xs"
                                  disabled={busy}
                                  onClick={() => {
                                    setPayConfirm(p);
                                    setPayMethod('Cash');
                                  }}
                                >
                                  Mark as paid
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#E0D5C4] bg-white p-3">
                    <p className="mb-2 font-semibold">New payroll record</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input
                        type="date"
                        className="input-field"
                        value={payForm.periodStart}
                        onChange={(e) =>
                          setPayForm((s) => ({
                            ...s,
                            periodStart: e.target.value,
                            employeeId: selected.id,
                          }))
                        }
                      />
                      <input
                        type="date"
                        className="input-field"
                        value={payForm.periodEnd}
                        onChange={(e) =>
                          setPayForm((s) => ({
                            ...s,
                            periodEnd: e.target.value,
                            employeeId: selected.id,
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input-field"
                        placeholder="Amount due"
                        value={payForm.amountDue}
                        onChange={(e) =>
                          setPayForm((s) => ({
                            ...s,
                            amountDue: e.target.value,
                            employeeId: selected.id,
                          }))
                        }
                      />
                      <Button
                        busy={busy}
                        disabled={!payForm.amountDue}
                        busyLabel="Creating…"
                        onClick={() =>
                          void run(async () => {
                            await createPayroll({
                              employeeId: selected.id,
                              periodStart: payForm.periodStart,
                              periodEnd: payForm.periodEnd,
                              amountDue: Number(payForm.amountDue),
                            });
                            setPayForm((s) => ({
                              ...s,
                              amountDue: '',
                              employeeId: selected.id,
                            }));
                            const res = await fetchPayroll({
                              employeeId: selected.id,
                              pageSize: 50,
                            });
                            setProfilePayroll(res.items);
                            setFlash('Payroll record created');
                          })
                        }
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ) : null}
        </div>
      ) : tab === 'shifts' ? (
        <Can
          permission="shifts.manage"
          fallback={<EmptyState title="No access to shifts" />}
        >
          <ShiftPlanner
            employees={employees}
            weekly={weekly}
            monthly={monthly}
            shiftTypes={shiftTypes}
            templates={templates}
            weekStart={weekStart}
            monthStart={monthStart}
            shiftView={shiftView}
            busy={busy}
            onWeekStartChange={setWeekStart}
            onMonthStartChange={setMonthStart}
            onViewChange={setShiftView}
            onReload={async () => {
              await loadShifts();
            }}
            onError={setError}
            onBusy={setBusy}
            onFlash={setFlash}
            onTemplatesChange={setTemplates}
          />
        </Can>
      ) : tab === 'payroll' ? (
        <Can
          permission="employees.manage"
          fallback={<EmptyState title="Payroll is restricted" />}
        >
          <div className="space-y-4">
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                New payroll record
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <select
                  className="input-field"
                  value={payForm.employeeId}
                  onChange={(e) =>
                    setPayForm((s) => ({ ...s, employeeId: e.target.value }))
                  }
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="input-field"
                  value={payForm.periodStart}
                  onChange={(e) =>
                    setPayForm((s) => ({ ...s, periodStart: e.target.value }))
                  }
                />
                <input
                  type="date"
                  className="input-field"
                  value={payForm.periodEnd}
                  onChange={(e) =>
                    setPayForm((s) => ({ ...s, periodEnd: e.target.value }))
                  }
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-field"
                  placeholder="Amount due"
                  value={payForm.amountDue}
                  onChange={(e) =>
                    setPayForm((s) => ({ ...s, amountDue: e.target.value }))
                  }
                />
                <Button
                  busy={busy}
                  disabled={!payForm.amountDue}
                  busyLabel="Creating…"
                  onClick={() =>
                    void run(async () => {
                      await createPayroll({
                        employeeId: payForm.employeeId,
                        periodStart: payForm.periodStart,
                        periodEnd: payForm.periodEnd,
                        amountDue: Number(payForm.amountDue),
                        notes: payForm.notes || undefined,
                      });
                      setPayForm((s) => ({ ...s, amountDue: '', notes: '' }));
                    })
                  }
                >
                  Create
                </Button>
              </div>
            </Panel>

            {payroll.length === 0 ? (
              <EmptyState title="No payroll records" />
            ) : (
              <div className="space-y-2">
                {payroll.map((p) => (
                  <Panel key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{p.employee.fullName}</p>
                      <p className="text-xs text-muted">
                        {p.periodStart.slice(0, 10)} → {p.periodEnd.slice(0, 10)}{' '}
                        · {p.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-display text-lg font-bold">
                        {p.salaryRestricted || p.amountDue == null
                          ? 'Restricted'
                          : formatGmd(p.amountDue)}
                      </p>
                      {p.status === 'DUE' ? (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setPayConfirm(p);
                            setPayMethod('Cash');
                          }}
                        >
                          Mark as paid
                        </Button>
                      ) : null}
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </div>
        </Can>
      ) : (
        <Can
          permission="employees.manage"
          fallback={<EmptyState title="Performance is restricted" />}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <select
                className="input-field max-w-xs"
                value={perfId}
                onChange={(e) => setPerfId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="input-field"
                value={perfFrom}
                onChange={(e) => setPerfFrom(e.target.value)}
              />
              <input
                type="date"
                className="input-field"
                value={perfTo}
                onChange={(e) => setPerfTo(e.target.value)}
              />
              <Button busy={busy} busyLabel="Loading…" onClick={() => void onLoadPerf()}>
                Load
              </Button>
            </div>
            {!perf ? (
              <EmptyState
                title="Select a staff member"
                body="Choose dates and load attributed sales."
              />
            ) : (
              <EmployeePerformancePanels perf={perf} />
            )}
          </div>
        </Can>
      )}

      {payConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 md:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setPayConfirm(null)}
          />
          <div className="safe-pb relative z-10 w-full max-w-md rounded-t-3xl bg-cream p-4 shadow-lg md:rounded-3xl">
            <p className="font-display text-lg font-bold">Confirm payment</p>
            <p className="mt-1 text-sm text-muted">
              Mark {payConfirm.employee.fullName} as paid for{' '}
              {payConfirm.periodStart.slice(0, 10)} →{' '}
              {payConfirm.periodEnd.slice(0, 10)}
              {payConfirm.amountDue != null
                ? ` · ${formatGmd(payConfirm.amountDue)}`
                : ''}
            </p>
            <label className="mt-4 block text-sm font-semibold">
              Payment method
              <select
                className="input-field mt-1"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPayConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                busy={busy}
                busyLabel="Paying…"
                onClick={() =>
                  void run(async () => {
                    await markPayrollPaid(payConfirm.id, {
                      method: payMethod,
                    });
                    setFlash(
                      `Salary marked paid · ${payConfirm.employee.fullName}`,
                    );
                    if (selected?.id === payConfirm.employeeId) {
                      const res = await fetchPayroll({
                        employeeId: payConfirm.employeeId,
                        pageSize: 50,
                      });
                      setProfilePayroll(res.items);
                    }
                    setPayConfirm(null);
                  })
                }
              >
                Confirm payment
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeactivate ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 md:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setConfirmDeactivate(null)}
          />
          <div className="safe-pb relative z-10 w-full max-w-md rounded-t-3xl bg-cream p-4 shadow-lg md:rounded-3xl">
            <p className="font-display text-lg font-bold">
              Deactivate {confirmDeactivate.fullName}?
            </p>
            <p className="mt-1 text-sm text-muted">
              They will lose access until reactivated.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDeactivate(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                busy={busy}
                busyLabel="Deactivating…"
                onClick={() =>
                  void run(async () => {
                    await deactivateEmployee(confirmDeactivate.id);
                    setFlash('Employee deactivated');
                    if (selected?.id === confirmDeactivate.id) {
                      setSelected(null);
                    }
                    setConfirmDeactivate(null);
                  })
                }
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRemove ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 md:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setConfirmRemove(null)}
          />
          <div className="safe-pb relative z-10 w-full max-w-md rounded-t-3xl bg-cream p-4 shadow-lg md:rounded-3xl">
            <p className="font-display text-lg font-bold">
              Permanently remove {confirmRemove.fullName}?
            </p>
            <p className="mt-1 text-sm text-muted">
              Archives the employee record. This cannot be undone from the
              roster.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmRemove(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                busy={busy}
                busyLabel="Removing…"
                onClick={() =>
                  void run(async () => {
                    await archiveEmployee(confirmRemove.id);
                    setFlash('Employee removed permanently');
                    setConfirmRemove(null);
                  })
                }
              >
                Remove permanently
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </StaffShell>
  );
}
