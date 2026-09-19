import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ROLE_PERMISSIONS,
  sanitizeRolePermissions,
  type Permission,
  type Role,
  type RolePermissionMatrix,
} from '../shared';

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  restaurantName: 'Fajara Restaurant Services',
  currency: 'GMD',
  timezone: 'Africa/Banjul',
  profile: {
    tradingName: 'Fajara Restaurant Services',
    address: 'Tujereng Road, Senegambia, The Gambia',
    phone: '+220 700 0000',
    email: 'hello@fajara.gm',
    website: '',
    currencySymbol: 'D',
    currencyName: 'Gambian Dalasi',
    logoUrl: '',
  },
  appearance: {
    theme: 'warmLight',
    accent: 'terracotta',
    accentColor: '#c0613d',
    sidebarColor: '#3d2418',
    customHue: 18,
    fontSize: 'default',
    kitchenHiVis: false,
  },
  tax: {
    inclusive: false,
    ratePercent: 10,
    label: 'VAT',
  },
  finance: {
    allowDiscounts: true,
    maxDiscountPct: 10,
    maxDiscountAmt: 200,
    tipsEnabled: true,
    tipOptions: [5, 10, 15],
  },
  pinLockout: {
    maxAttempts: 3,
    lockMinutes: 5,
  },
  tillVarianceApprovalThreshold: 50,
  inventoryConsumption: {
    batchAtProduction: true,
    directAtKitchenPrepare: true,
    packagedAt: 'prepare',
  },
  kdsStations: ['Main Kitchen', 'Grill', 'Bar'],
  paymentMethods: [
    'Cash',
    'Mobile Money',
    'Card',
    'Afrimoney',
    'Bank Transfer',
  ],
  paymentsConfig: {
    order: ['Cash', 'Mobile Money', 'Card', 'Afrimoney', 'Bank Transfer'],
    enabled: {
      Cash: true,
      'Mobile Money': true,
      Card: true,
      Afrimoney: true,
      'Bank Transfer': true,
    },
    colors: {
      Cash: '#c0613d',
      'Mobile Money': '#2f7d63',
      Card: '#d39a2d',
      Afrimoney: '#e07a2f',
      'Bank Transfer': '#5f7186',
    },
  },
  inactivityLockMinutes: 10,
  kitchenNoLock: true,
  standardDiscountCapPercent: 10,
  escalationMinutes: 5,
  notificationEscalation: {
    callWaiterMinutes: 5,
  },
  notifications: {
    amberAfter: 90,
    redAfter: 180,
    onQrOrder: true,
    onBellTap: true,
    onOrderReady: true,
    onTableWaiting: true,
    tableWaitingMins: 15,
    onLowStock: true,
    onPayDate: true,
    payDateDays: 3,
    soundOn: true,
    soundStyle: 'Chime',
  },
  menuSettings: {
    soldOutMode: 'show',
    showAllergens: true,
    showIngredients: false,
    showPrepTime: false,
    modifiersAlways: true,
    requireNotesConfirm: false,
    autoClearChef: true,
    showTodayOnlyBadge: true,
    specialsPosition: 'above',
  },
  receipt: {
    showLogo: true,
    showOrderId: true,
    showTable: true,
    showWaiter: true,
    showDateTime: true,
    showItemMods: true,
    showTaxBreakdown: true,
    showTips: true,
    showPaymentMethod: true,
    footerMessage: 'Thank you for dining with us! Come back soon.',
    showThankYou: true,
    printerName: '',
    autoPrint: false,
    printKitchenCopy: true,
    width: '80mm',
  },
  receiptFooter: 'Thank you for dining with us! Come back soon.',
  security: {
    sessionTimeout: 30,
    requirePinForDiscount: true,
  },
  shiftsHours: {
    openFrom: '07:00',
    openTo: '23:00',
    firstDayOfWeek: 'Monday',
    minWaitersPerDay: 2,
  },
  guestDisplayNameRetentionDays: 90,
  floor: {
    /** When true, closed/settled tables go to NEEDS_CLEANING until marked clean (SES-003). */
    requireCleaningAfterClose: true,
  },
  rolePermissions: ROLE_PERMISSIONS,
};

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await this.prisma.setting.upsert({
          where: { key },
          create: { key, value: value as object },
          update: {},
        });
      }
    } catch {
      /* ignore */
    }
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async get<T = unknown>(key: string, fallback?: T): Promise<T | undefined> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return fallback;
    return row.value as T;
  }

  async set(key: string, value: unknown, updatedBy?: string) {
    const next =
      key === 'rolePermissions' ? sanitizeRolePermissions(value) : value;
    return this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: next as object,
        updatedBy: updatedBy ?? null,
      },
      update: {
        value: next as object,
        updatedBy: updatedBy ?? null,
      },
    });
  }

  async getRolePermissionMatrix(): Promise<RolePermissionMatrix> {
    const raw = await this.get('rolePermissions');
    return sanitizeRolePermissions(raw ?? ROLE_PERMISSIONS);
  }

  async permissionsForRole(role: Role): Promise<Permission[]> {
    const matrix = await this.getRolePermissionMatrix();
    return matrix[role] ?? ROLE_PERMISSIONS[role];
  }
}
