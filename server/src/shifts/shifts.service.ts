import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  AssignShiftDto,
  CopyLastWeekDto,
  CreateShiftTemplateDto,
  CreateShiftTypeDto,
  UpdateShiftTemplateDto,
  UpdateShiftTypeDto,
} from './dto/shifts.dto';

const DEFAULT_MIN_WAITERS = 2;

function startOfDayUtc(isoDate: string): Date {
  const d = new Date(isoDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly settings: SettingsService,
  ) {}

  // --- Shift types ---

  createType(dto: CreateShiftTypeDto) {
    return this.prisma.shiftType.create({ data: dto });
  }

  updateType(id: string, dto: UpdateShiftTypeDto) {
    return this.prisma.shiftType.update({ where: { id }, data: dto });
  }

  listTypes(activeOnly = true) {
    return this.prisma.shiftType.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { startTime: 'asc' },
    });
  }

  // --- Assignments ---

  async assign(dto: AssignShiftDto, actor: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee || !employee.isActive || employee.archivedAt) {
      throw new NotFoundException('Employee not found');
    }
    if (actor.role !== 'OWNER' && employee.role === 'OWNER') {
      throw new ForbiddenException(
        'Only the owner can assign shifts to the owner',
      );
    }

    const workDate = startOfDayUtc(dto.workDate);

    // One cell = one shift (prototype roster grid).
    await this.prisma.employeeShift.deleteMany({
      where: { employeeId: dto.employeeId, workDate },
    });

    const shift = await this.prisma.employeeShift.create({
      data: {
        employeeId: dto.employeeId,
        shiftTypeId: dto.shiftTypeId,
        workDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
      },
      include: {
        employee: {
          select: { id: true, fullName: true, role: true, designation: true },
        },
        shiftType: true,
      },
    });

    await this.activity.record({
      actorId: actor.id,
      actionType: 'shift.assign',
      entityType: 'employee_shift',
      entityId: shift.id,
      description: `Assigned shift to ${employee.fullName} on ${dto.workDate}`,
    });

    return shift;
  }

  async removeShift(id: string, actorId: string) {
    const existing = await this.prisma.employeeShift.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Shift not found');
    await this.prisma.employeeShift.delete({ where: { id } });
    await this.activity.record({
      actorId,
      actionType: 'shift.remove',
      entityType: 'employee_shift',
      entityId: id,
      description: `Removed shift ${id}`,
    });
    return { ok: true };
  }

  async weekly(weekStartIso: string, viewer?: AuthUser) {
    const weekStart = startOfDayUtc(weekStartIso);
    const weekEnd = addDays(weekStart, 7);
    const lookbackStart = addDays(weekStart, -14);
    const hideOwners = viewer && viewer.role !== 'OWNER';

    const [shifts, lookback, hours] = await Promise.all([
      this.prisma.employeeShift.findMany({
        where: {
          workDate: { gte: weekStart, lt: weekEnd },
          ...(hideOwners ? { employee: { role: { not: 'OWNER' } } } : {}),
        },
        orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
        include: {
          employee: {
            select: { id: true, fullName: true, role: true, designation: true },
          },
          shiftType: true,
        },
      }),
      this.prisma.employeeShift.findMany({
        where: {
          workDate: { gte: lookbackStart, lt: weekEnd },
          ...(hideOwners ? { employee: { role: { not: 'OWNER' } } } : {}),
        },
        select: {
          employeeId: true,
          workDate: true,
          startTime: true,
          endTime: true,
        },
      }),
      this.settings.get<{ openFrom?: string; openTo?: string }>(
        'shiftsHours',
        { openFrom: '09:00', openTo: '23:00' },
      ),
    ]);

    const openFrom = hours?.openFrom ?? '09:00';
    const openTo = hours?.openTo ?? '23:00';
    const coverage = await this.coverageWarnings(weekStart, weekEnd, shifts);
    const cellFlags = this.buildCellFlags(shifts, lookback, openFrom, openTo);
    const dayHeaders = this.buildDayHeaders(weekStart, coverage);

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: addDays(weekStart, 6).toISOString().slice(0, 10),
      shifts,
      coverageWarnings: coverage,
      cellFlags,
      dayHeaders,
      operatingHours: { openFrom, openTo },
    };
  }

  async monthly(monthIso: string, viewer?: AuthUser) {
    const d = new Date(monthIso);
    const monthStart = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
    );
    const hideOwners = viewer && viewer.role !== 'OWNER';

    const shifts = await this.prisma.employeeShift.findMany({
      where: {
        workDate: { gte: monthStart, lt: monthEnd },
        ...(hideOwners ? { employee: { role: { not: 'OWNER' } } } : {}),
      },
      orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
      include: {
        employee: {
          select: { id: true, fullName: true, role: true, designation: true },
        },
        shiftType: true,
      },
    });

    const byDate = new Map<string, typeof shifts>();
    for (const s of shifts) {
      const key = s.workDate.toISOString().slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push(s);
      byDate.set(key, list);
    }

    return {
      month: monthStart.toISOString().slice(0, 7),
      monthStart: monthStart.toISOString().slice(0, 10),
      monthEnd: addDays(monthEnd, -1).toISOString().slice(0, 10),
      shifts,
      days: [...byDate.entries()].map(([date, dayShifts]) => ({
        date,
        count: dayShifts.length,
        shifts: dayShifts,
      })),
    };
  }

  async copyLastWeek(dto: CopyLastWeekDto, actorId: string) {
    const targetStart = startOfDayUtc(dto.targetWeekStart);
    const sourceStart = addDays(targetStart, -7);
    const sourceEnd = targetStart;
    const targetEnd = addDays(targetStart, 7);

    const source = await this.prisma.employeeShift.findMany({
      where: { workDate: { gte: sourceStart, lt: sourceEnd } },
    });
    if (source.length === 0) {
      throw new BadRequestException('No shifts found in the previous week');
    }

    const existing = await this.prisma.employeeShift.count({
      where: { workDate: { gte: targetStart, lt: targetEnd } },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'Target week already has shifts; clear them before copying',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const s of source) {
        const offsetDays = Math.round(
          (s.workDate.getTime() - sourceStart.getTime()) / 86_400_000,
        );
        rows.push(
          await tx.employeeShift.create({
            data: {
              employeeId: s.employeeId,
              shiftTypeId: s.shiftTypeId,
              workDate: addDays(targetStart, offsetDays),
              startTime: s.startTime,
              endTime: s.endTime,
              notes: s.notes,
            },
          }),
        );
      }
      return rows;
    });

    await this.activity.record({
      actorId,
      actionType: 'shift.copy_week',
      entityType: 'employee_shift',
      entityId: null,
      description: `Copied ${created.length} shifts to week of ${dto.targetWeekStart}`,
    });

    return { copied: created.length };
  }

  // --- Templates ---

  createTemplate(dto: CreateShiftTemplateDto) {
    return this.prisma.shiftTemplate.create({
      data: {
        name: dto.name,
        payload: dto.payload as Prisma.InputJsonValue,
      },
    });
  }

  updateTemplate(id: string, dto: UpdateShiftTemplateDto) {
    return this.prisma.shiftTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        payload:
          dto.payload === undefined
            ? undefined
            : (dto.payload as Prisma.InputJsonValue),
      },
    });
  }

  listTemplates() {
    return this.prisma.shiftTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  async deleteTemplate(id: string) {
    await this.prisma.shiftTemplate.delete({ where: { id } });
    return { ok: true };
  }

  async applyTemplate(
    templateId: string,
    targetWeekStart: string,
    actorId: string,
  ) {
    const template = await this.prisma.shiftTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Template not found');

    const payload = template.payload as {
      entries?: Array<{
        employeeId: string;
        shiftTypeId?: string | null;
        dayOffset: number;
        startTime: string;
        endTime: string;
        notes?: string | null;
      }>;
    };
    const entries = payload.entries ?? [];
    if (entries.length === 0) {
      throw new BadRequestException('Template has no shift entries');
    }

    const targetStart = startOfDayUtc(targetWeekStart);
    const targetEnd = addDays(targetStart, 7);
    const existing = await this.prisma.employeeShift.count({
      where: { workDate: { gte: targetStart, lt: targetEnd } },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'Target week already has shifts; clear them before applying a template',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const e of entries) {
        rows.push(
          await tx.employeeShift.create({
            data: {
              employeeId: e.employeeId,
              shiftTypeId: e.shiftTypeId || null,
              workDate: addDays(targetStart, e.dayOffset),
              startTime: e.startTime,
              endTime: e.endTime,
              notes: e.notes ?? null,
            },
          }),
        );
      }
      return rows;
    });

    await this.activity.record({
      actorId,
      actionType: 'shift.apply_template',
      entityType: 'shift_template',
      entityId: templateId,
      description: `Applied template ${template.name} (${created.length} shifts) to week of ${targetWeekStart}`,
    });

    return { applied: created.length };
  }

  private async coverageWarnings(
    weekStart: Date,
    weekEnd: Date,
    shifts: Array<{
      workDate: Date;
      employee: { role: string };
    }>,
  ) {
    const minWaiters =
      (await this.settings.get<number>('minWaitersPerDay', DEFAULT_MIN_WAITERS)) ??
      DEFAULT_MIN_WAITERS;
    const expectedByRole =
      (await this.settings.get<Record<string, number>>('shiftCoverageMinimums', {
        WAITER: minWaiters,
        KITCHEN: 1,
      })) ?? { WAITER: minWaiters, KITCHEN: 1 };

    const warnings: Array<{
      date: string;
      role: string;
      scheduled: number;
      expected: number;
      message: string;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      if (day >= weekEnd) break;
      const key = day.toISOString().slice(0, 10);
      const dayShifts = shifts.filter(
        (s) => s.workDate.toISOString().slice(0, 10) === key,
      );

      for (const [role, expected] of Object.entries(expectedByRole)) {
        const scheduled = dayShifts.filter((s) => s.employee.role === role)
          .length;
        if (scheduled < expected) {
          const label =
            role === 'WAITER'
              ? 'No waiters'
              : role === 'KITCHEN'
                ? 'No kitchen staff'
                : `${role} short`;
          warnings.push({
            date: key,
            role,
            scheduled,
            expected,
            message:
              scheduled === 0
                ? `${label} on ${key}`
                : `${role}: ${scheduled}/${expected} scheduled on ${key}`,
          });
        }
      }
    }

    return warnings;
  }

  private buildDayHeaders(
    weekStart: Date,
    coverage: Array<{ date: string; role: string; scheduled: number }>,
  ) {
    const headers: Array<{ date: string; labels: string[] }> = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i).toISOString().slice(0, 10);
      const labels: string[] = [];
      const dayWarns = coverage.filter((c) => c.date === date);
      if (dayWarns.some((c) => c.role === 'WAITER' && c.scheduled === 0)) {
        labels.push('No waiters');
      }
      if (dayWarns.some((c) => c.role === 'KITCHEN' && c.scheduled === 0)) {
        labels.push('No kitchen staff');
      }
      headers.push({ date, labels });
    }
    return headers;
  }

  private buildCellFlags(
    weekShifts: Array<{
      employeeId: string;
      workDate: Date;
      startTime: string;
      endTime: string;
    }>,
    lookback: Array<{
      employeeId: string;
      workDate: Date;
      startTime: string;
      endTime: string;
    }>,
    openFrom: string,
    openTo: string,
  ) {
    const workDaysByEmp = new Map<string, Set<string>>();
    for (const s of lookback) {
      const key = s.workDate.toISOString().slice(0, 10);
      const set = workDaysByEmp.get(s.employeeId) ?? new Set<string>();
      set.add(key);
      workDaysByEmp.set(s.employeeId, set);
    }

    const flags: Array<{
      employeeId: string;
      date: string;
      fatigueDays?: number;
      outsideHours?: boolean;
      conflict?: string;
    }> = [];

    for (const s of weekShifts) {
      const date = s.workDate.toISOString().slice(0, 10);
      const flag: (typeof flags)[number] = { employeeId: s.employeeId, date };

      if (s.endTime <= s.startTime) {
        flag.conflict = 'Shift conflict — end time is before start';
      }

      if (this.isOutsideHours(s.startTime, s.endTime, openFrom, openTo)) {
        flag.outsideHours = true;
      }

      const days = workDaysByEmp.get(s.employeeId) ?? new Set();
      let streak = 0;
      let cursor = startOfDayUtc(date);
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor = addDays(cursor, -1);
      }
      if (streak >= 6) {
        flag.fatigueDays = streak;
      }

      if (flag.fatigueDays || flag.outsideHours || flag.conflict) {
        flags.push(flag);
      }
    }

    return flags;
  }

  private isOutsideHours(
    start: string,
    end: string,
    openFrom: string,
    openTo: string,
  ) {
    // Simple same-day window. Overnight venues (openTo < openFrom) treat
    // anything before openFrom and after openTo as inside if spanning midnight.
    if (openTo > openFrom) {
      return start < openFrom || end > openTo;
    }
    // Overnight: outside if fully inside the closed daytime gap.
    return end <= openFrom && start >= openTo;
  }
}
