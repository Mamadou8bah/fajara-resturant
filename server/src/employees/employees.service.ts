import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from '../auth/auth.service';
import { ActivityLogService } from '../audit/activity-log.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import {
  paginatedResult,
  paginationArgs,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../shared';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

const SALARY_ROLES: Role[] = ['OWNER', 'MANAGER'];

type EmployeeSafe = Omit<Employee, 'pinHash' | 'passwordHash'> & {
  hasPin: boolean;
  hasPassword: boolean;
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly activity: ActivityLogService,
  ) {}

  /** Only the owner can see/manage OWNER accounts (including themselves). */
  private viewerIsOwner(viewer: AuthUser) {
    return viewer.role === 'OWNER';
  }

  private assertCanViewEmployee(target: Employee, viewer: AuthUser) {
    if (!this.viewerIsOwner(viewer) && target.role === 'OWNER') {
      throw new NotFoundException('Employee not found');
    }
  }

  private assertCanManageEmployee(target: Employee, actor: AuthUser) {
    this.assertCanViewEmployee(target, actor);
  }

  private assertCanAssignRole(role: Role, actor: AuthUser) {
    if (role === 'OWNER' && !this.viewerIsOwner(actor)) {
      throw new ForbiddenException(
        'Only the owner can create or assign the owner role',
      );
    }
  }

  async list(query: ListEmployeesQueryDto, viewer: AuthUser) {
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where: Prisma.EmployeeWhereInput = {};

    if (!query.includeArchived) {
      where.archivedAt = null;
    }
    if (query.activeOnly) {
      where.isActive = true;
    }

    // Managers never see owners; owner sees everyone.
    if (!this.viewerIsOwner(viewer)) {
      if (query.role === 'OWNER') {
        return paginatedResult([], 0, page, pageSize);
      }
      where.role = query.role ?? { not: 'OWNER' };
    } else if (query.role) {
      where.role = query.role;
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { employeeCode: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip,
        take,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginatedResult(
      rows.map((row) => this.toSafe(row, viewer.role)),
      total,
      page,
      pageSize,
    );
  }

  async getById(id: string, viewer: AuthUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanViewEmployee(employee, viewer);
    return this.toSafe(employee, viewer.role);
  }

  async performance(id: string, from: string, to: string, viewer: AuthUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    this.assertCanViewEmployee(employee, viewer);

    const start = new Date(from);
    const end = new Date(to);
    end.setUTCDate(end.getUTCDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: {
        waiterId: id,
        submittedAt: { gte: start, lt: end },
        status: {
          notIn: ['draft', 'cancelled', 'voided'],
        },
      },
      include: {
        items: {
          where: {
            status: {
              notIn: ['cancelled', 'voided', 'draft'],
            },
          },
        },
      },
    });

    const orderCount = orders.length;
    let attributedSales = 0;
    for (const order of orders) {
      for (const item of order.items) {
        const unit = Number(item.priceSnapshot);
        attributedSales += unit * item.quantity;
      }
    }

    const sessionIds = [...new Set(orders.map((o) => o.sessionId))];
    const tipAgg = await this.prisma.transaction.aggregate({
      where: {
        sessionId: { in: sessionIds },
        createdAt: { gte: start, lt: end },
        status: 'completed',
      },
      _sum: { tipAmount: true },
    });
    const tips = Number(tipAgg._sum.tipAmount ?? 0);
    const aov = orderCount ? attributedSales / orderCount : 0;

    return {
      employeeId: id,
      fullName: employee.fullName,
      role: employee.role,
      from,
      to,
      orderCount,
      attributedSales: Math.round(attributedSales * 100) / 100,
      averageOrderValue: Math.round(aov * 100) / 100,
      tips: Math.round(tips * 100) / 100,
    };
  }

  async create(dto: CreateEmployeeDto, actor: AuthUser) {
    this.assertCanAssignRole(dto.role, actor);
    this.assertPasswordRoleRules(dto.role, dto.password);

    const email = dto.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    await this.assertUniqueEmail(email);
    await this.assertUniqueEmployeeCode(dto.employeeCode ?? null);

    if (!dto.pin) {
      throw new BadRequestException(
        'Initial PIN is required — the employee can change it later in Settings',
      );
    }

    const pinHash = await argon2.hash(dto.pin);
    const passwordHash = dto.password ? await argon2.hash(dto.password) : null;

    try {
      const employee = await this.prisma.employee.create({
        data: {
          fullName: dto.fullName.trim(),
          role: dto.role,
          employeeCode: dto.employeeCode?.trim() || null,
          email,
          phone: dto.phone?.trim() || null,
          designation: dto.designation?.trim() || null,
          photoUrl: dto.photoUrl?.trim() || null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          payStructure: dto.payStructure?.trim() || null,
          baseAmount:
            dto.baseAmount === undefined
              ? null
              : new Prisma.Decimal(dto.baseAmount),
          paySchedule: dto.paySchedule?.trim() || null,
          isActive: dto.isActive ?? true,
          pinHash,
          passwordHash,
        },
      });

      await this.activity.record({
        actorId: actor.id,
        actionType: 'employee.create',
        entityType: 'employee',
        entityId: employee.id,
        description: `Created employee ${employee.fullName}`,
        metadata: { role: employee.role },
      });

      return this.toSafe(employee, actor.role);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: AuthUser) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanManageEmployee(existing, actor);

    const nextRole = (dto.role ?? existing.role) as Role;
    if (dto.role !== undefined) {
      this.assertCanAssignRole(dto.role, actor);
    }
    if (dto.password !== undefined) {
      this.assertPasswordRoleRules(nextRole, dto.password);
    }

    if (dto.email !== undefined) {
      // Employees never self-serve email changes; managers may correct login email.
      if (id === actor.id) {
        throw new ForbiddenException(
          'You cannot change your own email — ask a manager or owner',
        );
      }
      const email =
        dto.email === null ? null : dto.email.trim().toLowerCase() || null;
      if (!email) {
        throw new BadRequestException('Email is required');
      }
      await this.assertUniqueEmail(email, id);
    }
    if (dto.employeeCode !== undefined) {
      await this.assertUniqueEmployeeCode(
        dto.employeeCode?.trim() || null,
        id,
      );
    }

    const data: Prisma.EmployeeUpdateInput = {};

    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.employeeCode !== undefined) {
      data.employeeCode = dto.employeeCode?.trim() || null;
    }
    if (dto.email !== undefined) {
      // Validated non-null above; normalize again for the write.
      data.email = String(dto.email).trim().toLowerCase();
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone === null ? null : dto.phone.trim() || null;
    }
    if (dto.designation !== undefined) {
      data.designation =
        dto.designation === null ? null : dto.designation.trim() || null;
    }
    if (dto.photoUrl !== undefined) {
      data.photoUrl =
        dto.photoUrl === null ? null : dto.photoUrl.trim() || null;
    }
    if (dto.startDate !== undefined) {
      data.startDate =
        dto.startDate === null ? null : new Date(dto.startDate);
    }
    if (dto.payStructure !== undefined) {
      data.payStructure =
        dto.payStructure === null ? null : dto.payStructure.trim() || null;
    }
    if (dto.baseAmount !== undefined) {
      data.baseAmount =
        dto.baseAmount === null ? null : new Prisma.Decimal(dto.baseAmount);
    }
    if (dto.paySchedule !== undefined) {
      data.paySchedule =
        dto.paySchedule === null ? null : dto.paySchedule.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.pin !== undefined) data.pinHash = await argon2.hash(dto.pin);
    if (dto.password !== undefined) {
      data.passwordHash = await argon2.hash(dto.password);
    }

    try {
      const employee = await this.prisma.employee.update({
        where: { id },
        data,
      });

      if (dto.isActive === false && existing.isActive) {
        await this.auth.revokeAllForEmployee(id, actor.id);
      }

      await this.activity.record({
        actorId: actor.id,
        actionType: 'employee.update',
        entityType: 'employee',
        entityId: employee.id,
        description: `Updated employee ${employee.fullName}`,
        metadata: { fields: Object.keys(dto) },
      });

      return this.toSafe(employee, actor.role);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async archive(id: string, actor: AuthUser) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanManageEmployee(existing, actor);
    if (existing.archivedAt) {
      return this.toSafe(existing, actor.role);
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        isActive: false,
      },
    });

    await this.auth.revokeAllForEmployee(id, actor.id);

    await this.activity.record({
      actorId: actor.id,
      actionType: 'employee.archive',
      entityType: 'employee',
      entityId: id,
      description: `Archived employee ${employee.fullName}`,
    });

    return this.toSafe(employee, actor.role);
  }

  async deactivate(id: string, actor: AuthUser) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanManageEmployee(existing, actor);

    const employee = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auth.revokeAllForEmployee(id, actor.id);

    await this.activity.record({
      actorId: actor.id,
      actionType: 'employee.deactivate',
      entityType: 'employee',
      entityId: id,
      description: `Deactivated employee ${employee.fullName}`,
    });

    return this.toSafe(employee, actor.role);
  }

  async reactivate(id: string, actor: AuthUser) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Employee not found');
    }
    this.assertCanManageEmployee(existing, actor);

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        isActive: true,
        archivedAt: null,
      },
    });

    await this.activity.record({
      actorId: actor.id,
      actionType: 'employee.reactivate',
      entityType: 'employee',
      entityId: id,
      description: `Reactivated employee ${employee.fullName}`,
    });

    return this.toSafe(employee, actor.role);
  }

  private toSafe(employee: Employee, viewerRole: Role): EmployeeSafe {
    const { pinHash, passwordHash, ...rest } = employee;

    const base: EmployeeSafe = {
      ...rest,
      hasPin: Boolean(pinHash),
      hasPassword: Boolean(passwordHash),
    };

    if (!SALARY_ROLES.includes(viewerRole)) {
      return {
        ...base,
        payStructure: null,
        baseAmount: null,
        paySchedule: null,
      };
    }

    return base;
  }

  private assertPasswordRoleRules(role: Role, password?: string) {
    if (!password) return;
    if (role !== 'OWNER' && role !== 'MANAGER') {
      throw new BadRequestException(
        'Only OWNER and MANAGER accounts may have passwords',
      );
    }
  }

  private async assertUniqueEmail(email: string | null, excludeId?: string) {
    if (!email) return;
    const found = await this.prisma.employee.findFirst({
      where: {
        email,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (found) {
      throw new ConflictException('Email is already in use');
    }
  }

  private async assertUniqueEmployeeCode(
    employeeCode: string | null,
    excludeId?: string,
  ) {
    if (!employeeCode) return;
    const found = await this.prisma.employee.findFirst({
      where: {
        employeeCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (found) {
      throw new ConflictException('Employee code is already in use');
    }
  }

  private rethrowUnique(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Unique constraint violation');
    }
    throw err;
  }
}
