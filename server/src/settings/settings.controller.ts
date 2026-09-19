import { Body, Controller, ForbiddenException, Get, Param, Put } from '@nestjs/common';
import { Allow } from 'class-validator';
import {
  CurrentUser,
  AuthUser,
  Public,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { SettingsService } from './settings.service';

class UpsertSettingDto {
  @Allow()
  value!: unknown;
}

/** Keys only Owner may change (except rolePermissions — Manager may edit employee roles). */
const OWNER_ONLY_KEYS = new Set([
  'restaurantName',
  'currency',
  'timezone',
  'profile',
  'tax',
  'finance',
  'standardDiscountCapPercent',
  'tillVarianceApprovalThreshold',
  'pinLockout',
  'security',
  'kitchenNoLock',
  'inactivityLockMinutes',
  'guestDisplayNameRetentionDays',
]);

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  async publicSettings(): Promise<Record<string, unknown>> {
    const all = await this.settings.getAll();
    const profile = (all.profile as Record<string, unknown> | undefined) ?? {};
    const finance = (all.finance as Record<string, unknown> | undefined) ?? {};
    const menuSettings =
      (all.menuSettings as Record<string, unknown> | undefined) ?? {};
    return {
      restaurantName: all.restaurantName ?? 'Fajara Restaurant Services',
      currency: all.currency ?? 'GMD',
      timezone: all.timezone ?? 'Africa/Banjul',
      tax: all.tax,
      paymentMethods: all.paymentMethods,
      kdsStations: all.kdsStations,
      profile,
      finance: {
        tipsEnabled: finance.tipsEnabled ?? true,
        tipOptions: finance.tipOptions ?? [5, 10, 15],
        allowDiscounts: finance.allowDiscounts ?? true,
        maxDiscountAmt: finance.maxDiscountAmt ?? 200,
        maxDiscountPct: finance.maxDiscountPct ?? 10,
      },
      menuSettings,
      appearance: all.appearance,
    };
  }

  @Get()
  @RequirePermissions('roles.manage', 'dashboard.view', 'credentials.own')
  getAll() {
    return this.settings.getAll();
  }

  @Put(':key')
  @RequirePermissions('roles.manage', 'dashboard.view')
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== 'OWNER' && OWNER_ONLY_KEYS.has(key)) {
      throw new ForbiddenException('Only the Owner can change this setting');
    }
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (key === 'rolePermissions' && user.role === 'MANAGER') {
      const current = await this.settings.getRolePermissionMatrix();
      const incoming = dto.value as Record<string, unknown>;
      const merged = {
        ...current,
        WAITER: Array.isArray(incoming?.WAITER)
          ? incoming.WAITER
          : current.WAITER,
        KITCHEN: Array.isArray(incoming?.KITCHEN)
          ? incoming.KITCHEN
          : current.KITCHEN,
        CASHIER: Array.isArray(incoming?.CASHIER)
          ? incoming.CASHIER
          : current.CASHIER,
      };
      return this.settings.set(key, merged, user.id);
    }
    return this.settings.set(key, dto.value, user.id);
  }
}
