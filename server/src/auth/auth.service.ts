import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Employee, Prisma, Role as PrismaRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { ActivityLogService } from '../audit/activity-log.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { sha256 } from '../common/utils/ids';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  ROLE_DEFAULT_ROUTE,
  Role,
} from '../shared';
import {
  ApprovalPinDto,
  ChangePasswordDto,
  ChangePinDto,
  PasswordLoginDto,
  PinLoginDto,
} from './dto/auth.dto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const pinLockKey = (employeeId: string) => `pin_lock:${employeeId}`;

type PinLockState = {
  fails: number;
  lockUntil: string | null;
};

type PinLockoutConfig = {
  maxAttempts: number;
  lockMinutes: number;
};

const DEFAULT_PIN_LOCKOUT: PinLockoutConfig = {
  maxAttempts: 3,
  lockMinutes: 5,
};

const EMPLOYEE_PUBLIC_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  designation: true,
  photoUrl: true,
  isActive: true,
  startDate: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityLogService,
  ) {}

  async listActiveEmployeesForPinLogin() {
    return this.prisma.employee.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        pinHash: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        designation: true,
        photoUrl: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async loginWithPin(dto: PinLoginDto, deviceLabel?: string) {
    const email = dto.email.trim().toLowerCase();
    const employee = await this.prisma.employee.findFirst({
      where: {
        email,
        isActive: true,
        archivedAt: null,
      },
    });

    if (!employee?.pinHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertNotPinLocked(employee.id);

    const valid = await argon2.verify(employee.pinHash, dto.pin);
    if (!valid) {
      await this.recordFailedPinAttempt(employee.id);
      await this.activity.record({
        actorId: employee.id,
        actionType: 'auth.pin_login_failed',
        entityType: 'employee',
        entityId: employee.id,
        description: 'Someone tried a wrong PIN',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.clearPinLockState(employee.id);

    const session = await this.createSession(employee, deviceLabel);
    await this.activity.record({
      actorId: employee.id,
      actionType: 'auth.pin_login',
      entityType: 'employee_session',
      entityId: session.sessionId,
      description: `${employee.fullName} signed in with PIN`,
      metadata: { deviceLabel: deviceLabel ?? null },
    });
    return session;
  }

  async loginWithPassword(dto: PasswordLoginDto, deviceLabel?: string) {
    const email = dto.email.trim().toLowerCase();
    const employee = await this.prisma.employee.findFirst({
      where: {
        email,
        isActive: true,
        archivedAt: null,
      },
    });

    if (!employee?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      employee.role !== PrismaRole.OWNER &&
      employee.role !== PrismaRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Password login is restricted to owners and managers',
      );
    }

    const valid = await argon2.verify(employee.passwordHash, dto.password);
    if (!valid) {
      await this.activity.record({
        actorId: employee.id,
        actionType: 'auth.password_login_failed',
        entityType: 'employee',
        entityId: employee.id,
        description: 'Someone tried a wrong password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSession(employee, deviceLabel);
    await this.activity.record({
      actorId: employee.id,
      actionType: 'auth.password_login',
      entityType: 'employee_session',
      entityId: session.sessionId,
      description: `${employee.fullName} signed in with password`,
      metadata: { deviceLabel: deviceLabel ?? null },
    });
    return session;
  }

  async createSession(employee: Employee, deviceLabel?: string) {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const role = employee.role as Role;

    const accessToken = await this.jwt.signAsync(
      {
        sub: employee.id,
        role,
        fullName: employee.fullName,
        sid: sessionId,
      },
      { expiresIn: '12h' },
    );

    await this.prisma.employeeSession.create({
      data: {
        id: sessionId,
        employeeId: employee.id,
        tokenHash: sha256(accessToken),
        deviceLabel: deviceLabel?.trim() || null,
        expiresAt,
      },
    });

    return {
      accessToken,
      expiresAt,
      sessionId,
      employee: this.toPublicEmployee(employee),
      permissions: await this.settings.permissionsForRole(role),
      defaultRoute: ROLE_DEFAULT_ROUTE[role],
    };
  }

  async getMe(user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: user.id,
        isActive: true,
        archivedAt: null,
      },
      select: {
        ...EMPLOYEE_PUBLIC_SELECT,
        passwordHash: true,
        pinHash: true,
      },
    });

    if (!employee) {
      throw new UnauthorizedException('Employee not found or inactive');
    }

    const { passwordHash, pinHash, ...publicFields } = employee;
    const role = employee.role as Role;
    return {
      ...publicFields,
      hasPassword: Boolean(passwordHash),
      hasPin: Boolean(pinHash),
      sessionId: user.sessionId,
      permissions: await this.settings.permissionsForRole(role),
      defaultRoute: ROLE_DEFAULT_ROUTE[role],
    };
  }

  async logout(user: AuthUser) {
    await this.revokeSession(user.sessionId);
    await this.activity.record({
      actorId: user.id,
      actionType: 'auth.logout',
      entityType: 'employee_session',
      entityId: user.sessionId,
      description: `${user.fullName} signed out`,
    });
    return { ok: true };
  }

  async lockSession(sessionId: string, actor?: AuthUser) {
    const session = await this.prisma.employeeSession.findFirst({
      where: { id: sessionId, revokedAt: null },
    });
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    await this.prisma.employeeSession.update({
      where: { id: sessionId },
      data: { lockUntil: new Date() },
    });

    if (actor) {
      await this.activity.record({
        actorId: actor.id,
        actionType: 'auth.lock',
        entityType: 'employee_session',
        entityId: sessionId,
        description: `${actor.fullName} locked the screen`,
      });
    }

    return { ok: true, locked: true };
  }

  async revokeSession(sessionId: string) {
    await this.prisma.employeeSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForEmployee(employeeId: string, actorId?: string) {
    await this.prisma.employeeSession.updateMany({
      where: { employeeId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (actorId) {
      await this.activity.record({
        actorId,
        actionType: 'auth.revoke_sessions',
        entityType: 'employee',
        entityId: employeeId,
        description: 'Signed out of every device',
      });
    }
  }

  async verifyApprovalPin(dto: ApprovalPinDto, actor: AuthUser) {
    const approver = await this.prisma.employee.findFirst({
      where: {
        id: dto.approverEmployeeId,
        isActive: true,
        archivedAt: null,
      },
    });

    if (!approver?.pinHash) {
      throw new UnauthorizedException('Invalid approval PIN');
    }

    if (
      approver.role !== PrismaRole.OWNER &&
      approver.role !== PrismaRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Only owners and managers may approve with PIN',
      );
    }

    await this.assertNotPinLocked(approver.id);

    const valid = await argon2.verify(approver.pinHash, dto.pin);
    if (!valid) {
      await this.recordFailedPinAttempt(approver.id);
      await this.activity.record({
        actorId: actor.id,
        actionType: 'auth.approval_pin_failed',
        entityType: 'employee',
        entityId: approver.id,
        description: 'Manager approval PIN was wrong',
        metadata: { approverId: approver.id },
      });
      throw new UnauthorizedException('Invalid approval PIN');
    }

    await this.clearPinLockState(approver.id);

    await this.activity.record({
      actorId: actor.id,
      actionType: 'auth.approval_pin',
      entityType: 'employee',
      entityId: approver.id,
      description: `${approver.fullName} approved with their PIN`,
      metadata: { approverId: approver.id, requestedBy: actor.id },
    });

    return {
      id: approver.id,
      fullName: approver.fullName,
      role: approver.role,
      designation: approver.designation,
    };
  }

  async changeOwnPin(user: AuthUser, dto: ChangePinDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.id },
    });
    if (!employee || !employee.isActive || employee.archivedAt) {
      throw new UnauthorizedException('Employee not found or inactive');
    }

    if (employee.pinHash) {
      if (!dto.currentPin) {
        throw new BadRequestException('currentPin is required');
      }
      const ok = await argon2.verify(employee.pinHash, dto.currentPin);
      if (!ok) {
        throw new UnauthorizedException('Current PIN is incorrect');
      }
    }

    if (dto.currentPin && dto.currentPin === dto.newPin) {
      throw new BadRequestException('newPin must differ from currentPin');
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { pinHash: await argon2.hash(dto.newPin) },
    });

    await this.activity.record({
      actorId: user.id,
      actionType: 'auth.change_pin',
      entityType: 'employee',
      entityId: user.id,
      description: 'Staff PIN was updated',
    });

    return { ok: true };
  }

  async changeOwnPassword(user: AuthUser, dto: ChangePasswordDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.id },
    });
    if (!employee || !employee.isActive || employee.archivedAt) {
      throw new UnauthorizedException('Employee not found or inactive');
    }

    if (
      employee.role !== PrismaRole.OWNER &&
      employee.role !== PrismaRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Password credentials are only available to owners and managers',
      );
    }

    if (employee.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required');
      }
      const ok = await argon2.verify(
        employee.passwordHash,
        dto.currentPassword,
      );
      if (!ok) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      if (dto.currentPassword === dto.newPassword) {
        throw new BadRequestException(
          'New password must be different from the current password',
        );
      }
    }

    if (dto.newPassword.trim().length < 8) {
      throw new BadRequestException('newPassword must be at least 8 characters');
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });

    await this.activity.record({
      actorId: user.id,
      actionType: 'auth.change_password',
      entityType: 'employee',
      entityId: user.id,
      description: 'Password was updated',
    });

    return { ok: true };
  }

  private toPublicEmployee(employee: Employee) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      role: employee.role,
      designation: employee.designation,
      photoUrl: employee.photoUrl,
      isActive: employee.isActive,
      hasPassword: Boolean(employee.passwordHash),
      hasPin: Boolean(employee.pinHash),
    };
  }

  private async getPinLockoutConfig(): Promise<PinLockoutConfig> {
    const raw = await this.settings.get<Partial<PinLockoutConfig>>(
      'pinLockout',
      DEFAULT_PIN_LOCKOUT,
    );
    return {
      maxAttempts: raw?.maxAttempts ?? DEFAULT_PIN_LOCKOUT.maxAttempts,
      lockMinutes: raw?.lockMinutes ?? DEFAULT_PIN_LOCKOUT.lockMinutes,
    };
  }

  private async getPinLockState(employeeId: string): Promise<PinLockState> {
    const row = await this.prisma.setting.findUnique({
      where: { key: pinLockKey(employeeId) },
    });
    if (!row || typeof row.value !== 'object' || row.value === null) {
      return { fails: 0, lockUntil: null };
    }
    const value = row.value as Record<string, unknown>;
    return {
      fails: typeof value.fails === 'number' ? value.fails : 0,
      lockUntil:
        typeof value.lockUntil === 'string' ? value.lockUntil : null,
    };
  }

  private async savePinLockState(employeeId: string, state: PinLockState) {
    const key = pinLockKey(employeeId);
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: state },
      update: { value: state },
    });
  }

  private async clearPinLockState(employeeId: string) {
    await this.prisma.setting.deleteMany({
      where: { key: pinLockKey(employeeId) },
    });
  }

  private async assertNotPinLocked(employeeId: string) {
    const state = await this.getPinLockState(employeeId);
    if (!state.lockUntil) return;

    const until = new Date(state.lockUntil);
    if (Number.isNaN(until.getTime())) return;

    if (until.getTime() > Date.now()) {
      throw new UnauthorizedException({
        message: 'Too many failed PIN attempts. Try again later.',
        lockUntil: until.toISOString(),
      });
    }

    await this.clearPinLockState(employeeId);
  }

  private async recordFailedPinAttempt(employeeId: string) {
    const config = await this.getPinLockoutConfig();
    const state = await this.getPinLockState(employeeId);
    const fails = state.fails + 1;

    if (fails >= config.maxAttempts) {
      const lockUntil = new Date(
        Date.now() + config.lockMinutes * 60_000,
      ).toISOString();
      await this.savePinLockState(employeeId, { fails, lockUntil });
      return;
    }

    await this.savePinLockState(employeeId, {
      fails,
      lockUntil: null,
    });
  }
}
