'use client';

import { useMemo, useState } from 'react';
import { Button, EmptyState, Panel } from '@/components/ui';
import { formatDisplayDate } from '@/lib/money';
import {
  addDaysIso,
  assignShift,
  createShiftTemplate,
  deleteShiftTemplate,
  applyShiftTemplate,
  copyLastWeek,
  listShiftTemplates,
  removeShift,
  weekDates,
  type Employee,
  type MonthlyShifts,
  type ShiftRow,
  type ShiftTemplate,
  type ShiftType,
  type WeeklyShifts,
} from './api';

type ShiftView = 'week' | 'month';

type CellTarget = {
  employeeId: string;
  employeeName: string;
  date: string;
  shift?: ShiftRow;
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00.000Z');
  return DAY_SHORT[d.getUTCDay()] ?? iso;
}

export function ShiftPlanner({
  employees,
  weekly,
  monthly,
  shiftTypes,
  templates,
  weekStart,
  monthStart,
  shiftView,
  busy,
  onWeekStartChange,
  onMonthStartChange,
  onViewChange,
  onReload,
  onError,
  onBusy,
  onFlash,
  onTemplatesChange,
}: {
  employees: Employee[];
  weekly: WeeklyShifts | null;
  monthly: MonthlyShifts | null;
  shiftTypes: ShiftType[];
  templates: ShiftTemplate[];
  weekStart: string;
  monthStart: string;
  shiftView: ShiftView;
  busy: boolean;
  onWeekStartChange: (v: string) => void;
  onMonthStartChange: (v: string) => void;
  onViewChange: (v: ShiftView) => void;
  onReload: () => Promise<void>;
  onError: (msg: string | null) => void;
  onBusy: (v: boolean) => void;
  onFlash: (msg: string) => void;
  onTemplatesChange: (t: ShiftTemplate[]) => void;
}) {
  const [cell, setCell] = useState<CellTarget | null>(null);
  const [custom, setCustom] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [applyAllWeekday, setApplyAllWeekday] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [mobileStaffId, setMobileStaffId] = useState('');

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  const mobileStaff = useMemo(() => {
    if (!employees.length) return null;
    return (
      employees.find((e) => e.id === mobileStaffId) ?? employees[0] ?? null
    );
  }, [employees, mobileStaffId]);

  const shiftsByEmpDate = useMemo(() => {
    const map = new Map<string, ShiftRow>();
    for (const s of weekly?.shifts ?? []) {
      map.set(`${s.employeeId}:${s.workDate.slice(0, 10)}`, s);
    }
    return map;
  }, [weekly]);

  const flagsByEmpDate = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<WeeklyShifts['cellFlags']>[number]
    >();
    for (const f of weekly?.cellFlags ?? []) {
      map.set(`${f.employeeId}:${f.date}`, f);
    }
    return map;
  }, [weekly]);

  const headersByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of weekly?.dayHeaders ?? []) {
      map.set(h.date, h.labels);
    }
    return map;
  }, [weekly]);

  const monthCells = useMemo(() => {
    if (!monthly) return [];
    const start = new Date(monthly.monthStart + 'T00:00:00.000Z');
    const end = new Date(monthly.monthEnd + 'T00:00:00.000Z');
    const startPad = start.getUTCDay(); // Sun=0
    // Align to Monday-first display to match week grid default
    const pad = (startPad + 6) % 7;
    const cells: Array<{
      date: string | null;
      count: number;
      colors: string[];
      hasGap: boolean;
    }> = [];
    for (let i = 0; i < pad; i++) cells.push({ date: null, count: 0, colors: [], hasGap: false });
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const day = monthly.days.find((x) => x.date === iso);
      const colors = [
        ...new Set(
          (day?.shifts ?? [])
            .map((s) => s.shiftType?.color)
            .filter((c): c is string => Boolean(c)),
        ),
      ].slice(0, 4);
      const waiters = (day?.shifts ?? []).filter((s) => s.employee.role === 'WAITER').length;
      const kitchen = (day?.shifts ?? []).filter((s) => s.employee.role === 'KITCHEN').length;
      cells.push({
        date: iso,
        count: day?.count ?? 0,
        colors,
        hasGap: waiters === 0 || kitchen === 0,
      });
    }
    return cells;
  }, [monthly]);

  async function run(action: () => Promise<unknown>, flash?: string) {
    onBusy(true);
    onError(null);
    try {
      await action();
      if (flash) onFlash(flash);
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      onBusy(false);
    }
  }

  function openCell(emp: Employee, date: string) {
    const shift = shiftsByEmpDate.get(`${emp.id}:${date}`);
    setCell({
      employeeId: emp.id,
      employeeName: emp.fullName,
      date,
      shift,
    });
    setCustom(false);
    setApplyAllWeekday(false);
    if (shift?.shiftTypeId) {
      setSelectedTypeId(shift.shiftTypeId);
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
    } else if (shiftTypes[0]) {
      setSelectedTypeId(shiftTypes[0].id);
      setStartTime(shiftTypes[0].startTime);
      setEndTime(shiftTypes[0].endTime);
    } else {
      setSelectedTypeId('');
      setStartTime(shift?.startTime ?? '09:00');
      setEndTime(shift?.endTime ?? '17:00');
    }
  }

  function pickType(t: ShiftType) {
    setSelectedTypeId(t.id);
    if (!custom) {
      setStartTime(t.startTime);
      setEndTime(t.endTime);
    }
  }

  async function saveCell() {
    if (!cell) return;
    const type = shiftTypes.find((t) => t.id === selectedTypeId);
    const start = custom ? startTime : (type?.startTime ?? startTime);
    const end = custom ? endTime : (type?.endTime ?? endTime);
    const datesToApply = applyAllWeekday
      ? dates.filter(
          (d) =>
            new Date(d + 'T00:00:00.000Z').getUTCDay() ===
            new Date(cell.date + 'T00:00:00.000Z').getUTCDay(),
        )
      : [cell.date];

    await run(async () => {
      for (const date of datesToApply) {
        await assignShift({
          employeeId: cell.employeeId,
          shiftTypeId: selectedTypeId || undefined,
          workDate: date,
          startTime: start,
          endTime: end,
        });
      }
    }, applyAllWeekday ? `Applied to every ${dayLabel(cell.date)}` : 'Shift saved');
    setCell(null);
  }

  async function clearCell() {
    if (!cell?.shift) {
      setCell(null);
      return;
    }
    await run(async () => {
      await removeShift(cell.shift!.id);
    }, 'Marked Off');
    setCell(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="chip-scroll">
          {(
            [
              ['week', 'Week'],
              ['month', 'Month'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                shiftView === id ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
              }`}
              onClick={() => onViewChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {shiftView === 'week' ? (
          <div className="chip-scroll items-center">
            <Button
              variant="outline"
              className="shrink-0"
              disabled={busy}
              onClick={() => onWeekStartChange(addDaysIso(weekStart, -7))}
            >
              ← Prev
            </Button>
            <input
              type="date"
              className="input-field shrink-0"
              value={weekStart}
              onChange={(e) => onWeekStartChange(e.target.value)}
              aria-label="Week start"
            />
            <Button
              variant="outline"
              className="shrink-0"
              disabled={busy}
              onClick={() => onWeekStartChange(addDaysIso(weekStart, 7))}
            >
              Next →
            </Button>
            <Button
              variant="outline"
              className="shrink-0"
              busy={busy}
              busyLabel="Copying…"
              onClick={() =>
                void run(async () => {
                  await copyLastWeek(weekStart);
                }, 'Copied shifts from last week')
              }
            >
              Copy last week
            </Button>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => void onReload()}
            >
              Reload
            </Button>
          </div>
        ) : (
          <div className="chip-scroll items-center">
            <input
              type="month"
              className="input-field shrink-0"
              value={monthStart.slice(0, 7)}
              onChange={(e) => onMonthStartChange(`${e.target.value}-01`)}
              aria-label="Month"
            />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => void onReload()}
            >
              Reload
            </Button>
          </div>
        )}
      </div>

      {shiftTypes.length > 0 ? (
        <div className="chip-scroll">
          {shiftTypes.map((t) => (
            <span
              key={t.id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E0D5C4] bg-white px-2.5 py-1 text-xs font-semibold"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: t.color || '#C0613D' }}
              />
              {t.name} · {t.startTime}–{t.endTime}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No shift types yet — add them in Settings → Shifts & Scheduling.
        </p>
      )}

      {shiftView === 'week' ? (
        <>
          {/* Mobile: pick staff, then day rows */}
          <div className="space-y-3 md:hidden">
            {employees.length === 0 ? (
              <EmptyState title="No active staff to schedule" />
            ) : (
              <>
                <div className="chip-scroll">
                  {employees.map((emp) => {
                    const active =
                      (mobileStaffId || employees[0]?.id) === emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setMobileStaffId(emp.id)}
                        className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                          active
                            ? 'bg-cta text-cream'
                            : 'bg-[#EDE6DA] text-ink'
                        }`}
                      >
                        {emp.fullName.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
                {mobileStaff ? (
                  <ul className="overflow-hidden rounded-2xl border border-[#E0D5C4] bg-white">
                    {dates.map((d) => {
                      const shift = shiftsByEmpDate.get(
                        `${mobileStaff.id}:${d}`,
                      );
                      const flag = flagsByEmpDate.get(
                        `${mobileStaff.id}:${d}`,
                      );
                      const color = shift?.shiftType?.color || '#C0613D';
                      const warnings = [
                        flag?.fatigueDays
                          ? `${flag.fatigueDays} days straight`
                          : null,
                        flag?.outsideHours ? 'Outside hours' : null,
                        flag?.conflict ? 'Conflict' : null,
                      ].filter(Boolean);
                      return (
                        <li key={d} className="border-b border-[#EDE6DA] last:border-0">
                          <button
                            type="button"
                            onClick={() => openCell(mobileStaff, d)}
                            className="flex min-h-[64px] w-full items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99]"
                          >
                            <div className="w-12 shrink-0">
                              <p className="text-sm font-bold">
                                {dayLabel(d)}
                              </p>
                              <p className="text-[11px] text-muted">
                                {d.slice(5)}
                              </p>
                            </div>
                            <div
                              className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${
                                shift ? 'text-cream' : 'bg-[#FAF7F2] text-muted'
                              }`}
                              style={shift ? { background: color } : undefined}
                            >
                              {shift ? (
                                <>
                                  <p className="truncate text-sm font-bold">
                                    {shift.shiftType?.name ?? 'Custom'}
                                  </p>
                                  <p className="truncate text-xs opacity-90">
                                    {shift.startTime}–{shift.endTime}
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm font-semibold">Off · tap to assign</p>
                              )}
                              {warnings.length ? (
                                <p className="mt-0.5 text-[10px] font-bold opacity-95">
                                  {warnings.join(' · ')}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-[#E0D5C4] bg-white md:block">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E0D5C4] bg-[#EDE6DA]/50">
                  <th className="sticky left-0 z-10 bg-[#EDE6DA] px-3 py-2 font-semibold">
                    Staff
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="min-w-[6.5rem] px-2 py-2 text-center">
                      <div className="font-semibold">{dayLabel(d)}</div>
                      <div className="text-[11px] font-normal text-muted">
                        {d.slice(5)}
                      </div>
                      {(headersByDate.get(d) ?? []).map((label) => (
                        <div
                          key={label}
                          className="mt-0.5 text-[10px] font-semibold text-warn"
                        >
                          {label}
                        </div>
                      ))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-[#EDE6DA]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <p className="font-semibold leading-tight">{emp.fullName}</p>
                      <p className="text-[11px] text-muted">{emp.role}</p>
                    </td>
                    {dates.map((d) => {
                      const shift = shiftsByEmpDate.get(`${emp.id}:${d}`);
                      const flag = flagsByEmpDate.get(`${emp.id}:${d}`);
                      const color = shift?.shiftType?.color || '#C0613D';
                      return (
                        <td key={d} className="px-1.5 py-1.5 align-top">
                          <button
                            type="button"
                            onClick={() => openCell(emp, d)}
                            className={`min-h-[3.25rem] w-full rounded-xl border px-1.5 py-1.5 text-left transition hover:border-cta ${
                              shift
                                ? 'border-transparent text-cream'
                                : 'border-dashed border-[#D4C4B0] bg-[#FAF7F2] text-muted'
                            }`}
                            style={
                              shift
                                ? { background: color }
                                : undefined
                            }
                          >
                            {shift ? (
                              <>
                                <p className="truncate text-[11px] font-bold">
                                  {shift.shiftType?.name ?? 'Custom'}
                                </p>
                                <p className="truncate text-[10px] opacity-90">
                                  {shift.startTime}–{shift.endTime}
                                </p>
                              </>
                            ) : (
                              <p className="text-[11px] font-semibold">Off</p>
                            )}
                            {flag?.fatigueDays ? (
                              <p className="mt-0.5 text-[9px] font-bold opacity-95">
                                {flag.fatigueDays} days straight
                              </p>
                            ) : null}
                            {flag?.outsideHours ? (
                              <p className="mt-0.5 text-[9px] font-bold opacity-95">
                                Outside hours
                              </p>
                            ) : null}
                            {flag?.conflict ? (
                              <p className="mt-0.5 text-[9px] font-bold opacity-95">
                                Conflict
                              </p>
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No active staff to schedule" />
              </div>
            ) : null}
          </div>

          <Panel className="hidden md:block">
            <h2 className="mb-3 font-display text-lg font-bold">
              Shift templates
            </h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Save current week as
                <input
                  className="input-field mt-1"
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </label>
              <Button
                busy={busy}
                disabled={!templateName.trim() || !(weekly?.shifts.length)}
                busyLabel="Saving…"
                onClick={() =>
                  void run(async () => {
                    const start = new Date(weekStart + 'T00:00:00.000Z');
                    const entries = (weekly?.shifts ?? []).map((s) => {
                      const work = new Date(s.workDate);
                      const dayOffset = Math.round(
                        (Date.UTC(
                          work.getUTCFullYear(),
                          work.getUTCMonth(),
                          work.getUTCDate(),
                        ) -
                          start.getTime()) /
                          86_400_000,
                      );
                      return {
                        employeeId: s.employeeId,
                        shiftTypeId: s.shiftTypeId,
                        dayOffset,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        notes: s.notes,
                      };
                    });
                    await createShiftTemplate({
                      name: templateName.trim(),
                      payload: { entries },
                    });
                    setTemplateName('');
                    onTemplatesChange(await listShiftTemplates());
                  }, 'Weekly template saved')
                }
              >
                Set weekly template
              </Button>
            </div>
            {templates.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No templates yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#E0D5C4]">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted">
                        {t.payload.entries?.length ?? 0} shifts ·{' '}
                        {formatDisplayDate(t.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="text-xs"
                        busy={busy}
                        busyLabel="Applying…"
                        onClick={() =>
                          void run(async () => {
                            await applyShiftTemplate(t.id, weekStart);
                          }, 'Template applied to this week')
                        }
                      >
                        Apply to this week
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await deleteShiftTemplate(t.id);
                            onTemplatesChange(await listShiftTemplates());
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : (
        <div className="rounded-2xl border border-[#E0D5C4] bg-white p-3">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted sm:text-[11px]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="min-w-0 truncate">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((c, i) =>
              c.date ? (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => {
                    onWeekStartChange(
                      (() => {
                        const d = new Date(c.date + 'T00:00:00.000Z');
                        const day = d.getUTCDay();
                        const diff = day === 0 ? -6 : 1 - day;
                        d.setUTCDate(d.getUTCDate() + diff);
                        return d.toISOString().slice(0, 10);
                      })(),
                    );
                    onViewChange('week');
                  }}
                  className={`min-h-[3.75rem] min-w-0 rounded-xl border p-1 text-left transition hover:border-cta sm:min-h-[4.5rem] sm:p-1.5 ${
                    c.hasGap && c.count > 0
                      ? 'border-warn bg-[#F7EDD4]'
                      : 'border-[#E0D5C4] bg-[#FAF7F2]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold sm:text-xs">
                      {c.date.slice(8)}
                    </span>
                    {c.hasGap ? (
                      <span className="text-[10px] font-bold text-warn">!</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[9px] text-muted sm:mt-1 sm:text-[10px]">
                    {c.count}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-0.5 sm:mt-1">
                    {c.colors.map((col) => (
                      <span
                        key={col}
                        className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2"
                        style={{ background: col }}
                      />
                    ))}
                  </div>
                </button>
              ) : (
                <div key={`pad-${i}`} className="min-h-[3.75rem] sm:min-h-[4.5rem]" />
              ),
            )}
          </div>
          {(monthly?.shifts.length ?? 0) === 0 ? (
            <div className="py-6">
              <EmptyState title="No shifts this month" />
            </div>
          ) : null}
        </div>
      )}

      {cell ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 md:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setCell(null)}
          />
          <div className="safe-pb relative z-10 max-h-[88dvh] w-full max-w-md overflow-auto rounded-t-3xl bg-cream px-4 pt-3 shadow-lg md:rounded-3xl md:p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4C4B0] md:hidden" />
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold">
                  {cell.employeeName}
                </p>
                <p className="text-sm text-muted">
                  {dayLabel(cell.date)} · {formatDisplayDate(cell.date)}
                </p>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold md:hidden"
                onClick={() => setCell(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Shift type
              </p>
              <div className="flex flex-wrap gap-2">
                {shiftTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickType(t)}
                    className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
                      selectedTypeId === t.id && !custom
                        ? 'bg-cta text-cream'
                        : 'bg-[#EDE6DA] text-ink'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustom(true)}
                  className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
                    custom ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
                  }`}
                >
                  Custom hours
                </button>
              </div>
            </div>

            {custom ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-sm">
                  From
                  <input
                    type="time"
                    className="input-field mt-1"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  To
                  <input
                    type="time"
                    className="input-field mt-1"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <label className="mt-3 flex min-h-touch items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={applyAllWeekday}
                onChange={(e) => setApplyAllWeekday(e.target.checked)}
              />
              Apply to all {dayLabel(cell.date)}s this week
            </label>

            <div className="mt-4 flex flex-wrap gap-2 pb-2">
              <Button
                className="flex-1"
                busy={busy}
                busyLabel="Saving…"
                onClick={() => void saveCell()}
              >
                Save
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => void clearCell()}
              >
                Off
              </Button>
              <Button variant="ghost" className="hidden md:inline-flex" onClick={() => setCell(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
