import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus, Prisma } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import {
  paginationArgs,
  paginatedResult,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePayrollRecordDto,
  ListPayrollQueryDto,
  MarkPaidDto,
} from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  private assertCanSeeEmployeeRole(role: string, viewer: AuthUser) {
    if (viewer.role !== 'OWNER' && role === 'OWNER') {
      throw new NotFoundException('Employee not found');
    }
  }

  async create(dto: CreatePayrollRecordDto, actor: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee || employee.archivedAt) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanSeeEmployeeRole(employee.role, actor);

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }

    const record = await this.prisma.payrollRecord.create({
      data: {
        employeeId: dto.employeeId,
        periodStart,
        periodEnd,
        amountDue: dto.amountDue,
        notes: dto.notes,
        status: PayrollStatus.DUE,
      },
      include: {
        employee: {
          select: { id: true, fullName: true, role: true, employeeCode: true },
        },
      },
    });

    await this.activity.record({
      actorId: actor.id,
      actionType: 'payroll.create',
      entityType: 'payroll_record',
      entityId: record.id,
      description: `Created payroll period for ${employee.fullName}`,
    });

    return record;
  }

  async markPaid(id: string, dto: MarkPaidDto, approver: AuthUser) {
    const existing = await this.prisma.payrollRecord.findUnique({
      where: { id },
      include: { employee: { select: { fullName: true, role: true } } },
    });
    if (!existing) throw new NotFoundException('Payroll record not found');
    this.assertCanSeeEmployeeRole(existing.employee.role, approver);
    if (existing.status === PayrollStatus.PAID) {
      throw new BadRequestException('Payroll record already paid');
    }
    if (existing.status === PayrollStatus.CANCELLED) {
      throw new BadRequestException('Payroll record is cancelled');
    }

    const record = await this.prisma.payrollRecord.update({
      where: { id },
      data: {
        status: PayrollStatus.PAID,
        method: dto.method,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        approvedById: approver.id,
        notes: dto.notes ?? existing.notes,
      },
      include: {
        employee: {
          select: { id: true, fullName: true, role: true, employeeCode: true },
        },
      },
    });

    await this.activity.record({
      actorId: approver.id,
      actionType: 'payroll.mark_paid',
      entityType: 'payroll_record',
      entityId: id,
      description: `Marked payroll paid for ${existing.employee.fullName} via ${dto.method}`,
    });

    return record;
  }

  async list(
    query: ListPayrollQueryDto,
    canViewSalary: boolean,
    viewer: AuthUser,
  ) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const where: Prisma.PayrollRecordWhereInput = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status
        ? { status: query.status as PayrollStatus }
        : {}),
      ...(query.periodStart || query.periodEnd
        ? {
            periodStart: {
              ...(query.periodStart
                ? { gte: new Date(query.periodStart) }
                : {}),
              ...(query.periodEnd ? { lte: new Date(query.periodEnd) } : {}),
            },
          }
        : {}),
      ...(viewer.role !== 'OWNER'
        ? { employee: { role: { not: 'OWNER' } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.payrollRecord.findMany({
        where,
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              role: true,
              employeeCode: true,
              ...(canViewSalary
                ? {
                    baseAmount: true,
                    payStructure: true,
                    paySchedule: true,
                  }
                : {}),
            },
          },
        },
      }),
      this.prisma.payrollRecord.count({ where }),
    ]);

    const items = rows.map((r) => {
      if (canViewSalary) return r;
      const { amountDue: _amount, notes: _notes, ...rest } = r;
      return {
        ...rest,
        amountDue: null as unknown as typeof r.amountDue,
        notes: null as string | null,
        salaryRestricted: true as const,
      };
    });

    return paginatedResult(items, total, page, pageSize);
  }

  async get(id: string, canViewSalary: boolean, viewer: AuthUser) {
    const record = await this.prisma.payrollRecord.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
            employeeCode: true,
            ...(canViewSalary
              ? {
                  baseAmount: true,
                  payStructure: true,
                  paySchedule: true,
                }
              : {}),
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Payroll record not found');
    this.assertCanSeeEmployeeRole(record.employee.role, viewer);
    if (!canViewSalary) {
      return {
        ...record,
        amountDue: null,
        notes: null,
        salaryRestricted: true,
      };
    }
    return record;
  }
}
