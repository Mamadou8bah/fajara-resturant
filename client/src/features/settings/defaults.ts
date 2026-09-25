export type ProfileSettings = {
  tradingName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  currencySymbol: string;
  currencyName: string;
  logoUrl: string;
};

export type AppearanceSettings = {
  theme: string;
  accent: string;
  accentColor: string;
  sidebarColor: string;
  customHue: number;
  fontSize: string;
  kitchenHiVis: boolean;
};

export type TaxSettings = {
  inclusive: boolean;
  ratePercent: number;
  label: string;
};

export type FinanceSettings = {
  allowDiscounts: boolean;
  maxDiscountPct: number;
  maxDiscountAmt: number;
  tipsEnabled: boolean;
  tipOptions: number[];
};

export type PaymentsConfig = {
  order: string[];
  enabled: Record<string, boolean>;
  colors: Record<string, string>;
};

export type NotificationsSettings = {
  amberAfter: number;
  redAfter: number;
  onQrOrder: boolean;
  onBellTap: boolean;
  onOrderReady: boolean;
  onTableWaiting: boolean;
  tableWaitingMins: number;
  onLowStock: boolean;
  onPayDate: boolean;
  payDateDays: number;
  soundOn: boolean;
  soundStyle: string;
};

export type MenuSettings = {
  soldOutMode: string;
  showAllergens: boolean;
  showIngredients: boolean;
  showPrepTime: boolean;
  modifiersAlways: boolean;
  requireNotesConfirm: boolean;
  autoClearChef: boolean;
  showTodayOnlyBadge: boolean;
  specialsPosition: string;
};

export type ReceiptSettings = {
  showLogo: boolean;
  showOrderId: boolean;
  showTable: boolean;
  showWaiter: boolean;
  showDateTime: boolean;
  showItemMods: boolean;
  showTaxBreakdown: boolean;
  showTips: boolean;
  showPaymentMethod: boolean;
  footerMessage: string;
  showThankYou: boolean;
  printerName: string;
  autoPrint: boolean;
  printKitchenCopy: boolean;
  width: string;
};

export type SecuritySettings = {
  sessionTimeout: number;
  requirePinForDiscount: boolean;
};

export type ShiftsHoursSettings = {
  openFrom: string;
  openTo: string;
  firstDayOfWeek: string;
  minWaitersPerDay: number;
};

export type PinLockout = {
  maxAttempts: number;
  lockMinutes: number;
};

export type InventoryConsumption = {
  batchAtProduction: boolean;
  directAtKitchenPrepare: boolean;
  packagedAt: string;
};

export const DEFAULT_PROFILE: ProfileSettings = {
  tradingName: 'Fajara Restaurant Services',
  address: 'Tujereng Road, Senegambia, The Gambia',
  phone: '+220 700 0000',
  email: 'hello@fajara.gm',
  website: '',
  currencySymbol: 'D',
  currencyName: 'Gambian Dalasi',
  logoUrl: '',
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'warmLight',
  accent: 'terracotta',
  accentColor: '#c0613d',
  sidebarColor: '#3d2418',
  customHue: 18,
  fontSize: 'default',
  kitchenHiVis: false,
};

export const DEFAULT_TAX: TaxSettings = {
  inclusive: false,
  ratePercent: 10,
  label: 'VAT',
};

export const DEFAULT_FINANCE: FinanceSettings = {
  allowDiscounts: true,
  maxDiscountPct: 10,
  maxDiscountAmt: 200,
  tipsEnabled: true,
  tipOptions: [5, 10, 15],
};

export const DEFAULT_PAYMENTS: PaymentsConfig = {
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
};

export const DEFAULT_NOTIFICATIONS: NotificationsSettings = {
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
};

export const DEFAULT_MENU: MenuSettings = {
  soldOutMode: 'show',
  showAllergens: true,
  showIngredients: false,
  showPrepTime: false,
  modifiersAlways: true,
  requireNotesConfirm: false,
  autoClearChef: true,
  showTodayOnlyBadge: true,
  specialsPosition: 'above',
};

export const DEFAULT_RECEIPT: ReceiptSettings = {
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
};

export const DEFAULT_SECURITY: SecuritySettings = {
  sessionTimeout: 30,
  requirePinForDiscount: true,
};

export const DEFAULT_SHIFTS: ShiftsHoursSettings = {
  openFrom: '07:00',
  openTo: '23:00',
  firstDayOfWeek: 'Monday',
  minWaitersPerDay: 2,
};

export const DEFAULT_PIN: PinLockout = {
  maxAttempts: 3,
  lockMinutes: 5,
};

export const DEFAULT_INVENTORY: InventoryConsumption = {
  batchAtProduction: true,
  directAtKitchenPrepare: true,
  packagedAt: 'prepare',
};

export type FloorSettings = {
  /** When true, closed/settled tables must be cleaned before Free. */
  requireCleaningAfterClose: boolean;
};

export const DEFAULT_FLOOR: FloorSettings = {
  requireCleaningAfterClose: false,
};

export function asObj<T extends object>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback };
  return { ...fallback, ...(raw as T) };
}

export type SettingsSectionKey =
  | 'profile'
  | 'appearance'
  | 'finance'
  | 'payments'
  | 'notifications'
  | 'menu'
  | 'shifts'
  | 'tables'
  | 'permissions'
  | 'receipt'
  | 'data'
  | 'account'
  | 'about';

export type SettingsSection = {
  key: SettingsSectionKey;
  label: string;
  ownerOnly?: boolean;
  rolesManage?: boolean;
  tablesManage?: boolean;
  /** Visible to any signed-in staff (PIN / about). */
  always?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'profile', label: 'Restaurant Profile', rolesManage: true },
  { key: 'appearance', label: 'Appearance', rolesManage: true },
  { key: 'finance', label: 'Finance Settings', rolesManage: true },
  { key: 'payments', label: 'Payment Methods', rolesManage: true },
  { key: 'notifications', label: 'Notifications', rolesManage: true },
  { key: 'menu', label: 'Menu Settings', rolesManage: true },
  { key: 'shifts', label: 'Shifts & Scheduling', rolesManage: true },
  { key: 'tables', label: 'Tables & QR', tablesManage: true },
  { key: 'permissions', label: 'Roles & Permissions', rolesManage: true },
  { key: 'receipt', label: 'Receipt & Printing', rolesManage: true },
  { key: 'data', label: 'Data & Export', rolesManage: true },
  { key: 'account', label: 'My PIN & account', always: true },
  { key: 'about', label: 'About', always: true },
];
