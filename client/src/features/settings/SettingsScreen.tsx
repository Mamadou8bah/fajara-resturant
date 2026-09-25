'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StaffShell } from '@/components/StaffShell';
import {
  COLOUR_SCHEMES,
  harmoniousFromHue,
  applyAppearance,
} from '@/components/AppearanceApplier';
import { apiUpload } from '@/lib/api';
import { BrandLogo, mediaUrl } from '@/lib/brand';
import {
  Button,
  ErrorBanner,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  ALL_PERMISSIONS,
  OWNER_LOCKED_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  sanitizeRolePermissions,
  useCan,
  Can,
  type Permission,
  type Role,
  type RolePermissionMatrix,
} from '@/lib/rbac';
import { matchesQuery } from '@/lib/search';
import {
  archiveTable,
  changeOwnPassword,
  changeOwnPin,
  createTable,
  exportTableQr,
  fetchSettings,
  fetchTables,
  putSetting,
  rotateTableQr,
  updateTable,
  type DiningTable,
  type QrExport,
  type SettingsMap,
} from './api';
import {
  asObj,
  DEFAULT_APPEARANCE,
  DEFAULT_FINANCE,
  DEFAULT_FLOOR,
  DEFAULT_INVENTORY,
  DEFAULT_MENU,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PAYMENTS,
  DEFAULT_PIN,
  DEFAULT_PROFILE,
  DEFAULT_RECEIPT,
  DEFAULT_SECURITY,
  DEFAULT_SHIFTS,
  DEFAULT_TAX,
  SETTINGS_SECTIONS,
  type AppearanceSettings,
  type FinanceSettings,
  type FloorSettings,
  type InventoryConsumption,
  type MenuSettings,
  type NotificationsSettings,
  type PaymentsConfig,
  type PinLockout,
  type ProfileSettings,
  type ReceiptSettings,
  type SecuritySettings,
  type SettingsSectionKey,
  type ShiftsHoursSettings,
  type TaxSettings,
} from './defaults';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-touch items-center gap-3 text-sm text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 accent-cta"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function SectionSave({
  busy,
  onSave,
  label = 'Save section',
}: {
  busy: boolean;
  onSave: () => void;
  label?: string;
}) {
  return (
    <Button
      className="mt-4"
      busy={busy}
      busyLabel="Saving…"
      onClick={onSave}
    >
      {label}
    </Button>
  );
}

export function SettingsScreen() {
  const { user, logout, refreshMe } = useAuth();
  const { can } = useCan();
  const canManage = can('roles.manage');
  const canConfigure = canManage || user?.role === 'MANAGER';
  const canTables = can('tables.manage');
  const isOwner = user?.role === 'OWNER';
  const [permRole, setPermRole] = useState<Role>('WAITER');
  const [roleMatrix, setRoleMatrix] = useState<RolePermissionMatrix>(() =>
    sanitizeRolePermissions(ROLE_PERMISSIONS),
  );

  const sections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((s) => {
        if (s.ownerOnly) return isOwner;
        if (s.rolesManage) return canConfigure;
        if (s.tablesManage) return canTables;
        return true;
      }),
    [canConfigure, canTables, isOwner],
  );

  const [section, setSection] = useState<SettingsSectionKey>(
    canConfigure || canTables ? 'profile' : 'account',
  );
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const [identity, setIdentity] = useState({
    restaurantName: 'Fajara Restaurant Services',
    currency: 'GMD',
    timezone: 'Africa/Banjul',
  });
  const [profile, setProfile] = useState<ProfileSettings>(DEFAULT_PROFILE);
  const [appearance, setAppearance] =
    useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [tax, setTax] = useState<TaxSettings>(DEFAULT_TAX);
  const [finance, setFinance] = useState<FinanceSettings>(DEFAULT_FINANCE);
  const [payments, setPayments] = useState<PaymentsConfig>(DEFAULT_PAYMENTS);
  const [newMethod, setNewMethod] = useState('');
  const [notifications, setNotifications] =
    useState<NotificationsSettings>(DEFAULT_NOTIFICATIONS);
  const [menuSettings, setMenuSettings] =
    useState<MenuSettings>(DEFAULT_MENU);
  const [receipt, setReceipt] = useState<ReceiptSettings>(DEFAULT_RECEIPT);
  const [security, setSecurity] = useState<SecuritySettings>(DEFAULT_SECURITY);
  const [shiftsHours, setShiftsHours] =
    useState<ShiftsHoursSettings>(DEFAULT_SHIFTS);
  const [shiftTypes, setShiftTypes] = useState<
    Array<{
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      color: string | null;
      isActive: boolean;
    }>
  >([]);
  const [shiftTypeDraft, setShiftTypeDraft] = useState({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    color: '#C0613D',
  });
  const [pinLockout, setPinLockout] = useState<PinLockout>(DEFAULT_PIN);
  const [inventory, setInventory] =
    useState<InventoryConsumption>(DEFAULT_INVENTORY);
  const [floor, setFloor] = useState<FloorSettings>(DEFAULT_FLOOR);
  const [kitchenNoLock, setKitchenNoLock] = useState(true);
  const [inactivityLockMinutes, setInactivityLockMinutes] = useState(10);
  const [tillVariance, setTillVariance] = useState(50);
  const [guestRetentionDays, setGuestRetentionDays] = useState(90);
  const [stationsText, setStationsText] = useState('Main Kitchen, Grill, Bar');

  const [tableQuery, setTableQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [qr, setQr] = useState<QrExport | null>(null);
  const [tableDraft, setTableDraft] = useState({
    number: '',
    label: '',
    seats: 4,
  });

  const [pinForm, setPinForm] = useState({
    currentPin: '',
    newPin: '',
    confirm: '',
  });
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirm: '',
  });

  const readOnlyProfileFinance = user?.role === 'MANAGER';

  useEffect(() => {
    if (!sections.some((s) => s.key === section) && sections[0]) {
      setSection(sections[0].key);
    }
  }, [sections, section]);

  const filteredTables = useMemo(
    () =>
      tables.filter((t) =>
        matchesQuery(tableQuery, t.number, t.label, t.status),
      ),
    [tables, tableQuery],
  );

  useEffect(() => {
    if (
      filteredTables.length > 0 &&
      !filteredTables.some((t) => t.id === selectedTable)
    ) {
      setSelectedTable(filteredTables[0].id);
    }
  }, [filteredTables, selectedTable]);

  const hydrate = useCallback((s: SettingsMap) => {
    setSettings(s);
    setIdentity({
      restaurantName: String(s.restaurantName ?? 'Fajara Restaurant Services'),
      currency: String(s.currency ?? 'GMD'),
      timezone: String(s.timezone ?? 'Africa/Banjul'),
    });
    setProfile(asObj(s.profile, DEFAULT_PROFILE));
    setAppearance(asObj(s.appearance, DEFAULT_APPEARANCE));
    setTax(asObj(s.tax, DEFAULT_TAX));
    setFinance(asObj(s.finance, DEFAULT_FINANCE));
    const pc = asObj(s.paymentsConfig, DEFAULT_PAYMENTS);
    if (Array.isArray(s.paymentMethods) && s.paymentMethods.length) {
      const methods = s.paymentMethods as string[];
      const order = [...new Set([...pc.order, ...methods])];
      const enabled = { ...pc.enabled };
      for (const m of methods) enabled[m] = enabled[m] ?? true;
      setPayments({ ...pc, order, enabled });
    } else {
      setPayments(pc);
    }
    setNotifications(asObj(s.notifications, DEFAULT_NOTIFICATIONS));
    setMenuSettings(asObj(s.menuSettings, DEFAULT_MENU));
    setReceipt(asObj(s.receipt, DEFAULT_RECEIPT));
    setSecurity(asObj(s.security, DEFAULT_SECURITY));
    setShiftsHours(asObj(s.shiftsHours, DEFAULT_SHIFTS));
    setPinLockout(asObj(s.pinLockout, DEFAULT_PIN));
    setInventory(asObj(s.inventoryConsumption, DEFAULT_INVENTORY));
    setFloor(asObj(s.floor, DEFAULT_FLOOR));
    setKitchenNoLock(Boolean(s.kitchenNoLock ?? true));
    setInactivityLockMinutes(Number(s.inactivityLockMinutes ?? 10));
    setTillVariance(Number(s.tillVarianceApprovalThreshold ?? 50));
    setGuestRetentionDays(Number(s.guestDisplayNameRetentionDays ?? 90));
    const ks = Array.isArray(s.kdsStations) ? (s.kdsStations as string[]) : [];
    setStationsText(ks.join(', ') || 'Main Kitchen');
    setRoleMatrix(sanitizeRolePermissions(s.rolePermissions ?? ROLE_PERMISSIONS));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, types] = await Promise.all([
        fetchSettings().catch(() => null),
        canTables
          ? fetchTables().catch(() => [] as DiningTable[])
          : Promise.resolve([] as DiningTable[]),
        canConfigure
          ? import('@/features/employees/api')
              .then((m) => m.listShiftTypes(true))
              .catch(() => [])
          : Promise.resolve([]),
      ]);
      if (s) hydrate(s);
      setTables(t.filter((x) => !x.archivedAt));
      setShiftTypes(types);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [canTables, canConfigure, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveKeys(entries: [string, unknown][], label: string) {
    if (!canManage && !entries.every(([k]) => k.startsWith('_'))) {
      /* account uses auth endpoints */
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      for (const [key, value] of entries) {
        await putSetting(key, value);
      }
      setSaved(`${label} saved`);
      await load();
      if (entries.some(([key]) => key === 'profile' || key === 'restaurantName')) {
        window.dispatchEvent(new Event('fajara:brand-changed'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateTable() {
    if (!tableDraft.number.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTable({
        number: tableDraft.number.trim(),
        label: tableDraft.label.trim() || undefined,
        seats: Number(tableDraft.seats) || 4,
      });
      setTableDraft({ number: '', label: '', seats: 4 });
      setSaved('Table created');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create table failed');
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveTable(id: string) {
    if (!window.confirm('Archive this table?')) return;
    setBusy(true);
    setError(null);
    try {
      await archiveTable(id);
      setSaved('Table archived');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  }

  async function onExportQr() {
    if (!selectedTable) return;
    setBusy(true);
    setError(null);
    try {
      setQr(await exportTableQr(selectedTable));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'QR export failed');
    } finally {
      setBusy(false);
    }
  }

  async function onChangePin() {
    if (pinForm.newPin.length !== 4 || pinForm.newPin !== pinForm.confirm) {
      setError('New PIN must be 4 digits and match confirmation');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeOwnPin({
        currentPin: pinForm.currentPin || undefined,
        newPin: pinForm.newPin,
      });
      setPinForm({ currentPin: '', newPin: '', confirm: '' });
      setSaved('PIN updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    if (
      pwForm.newPassword.length < 8 ||
      pwForm.newPassword !== pwForm.confirm
    ) {
      setError('Password must be 8+ characters and match confirmation');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeOwnPassword({
        currentPassword: pwForm.currentPassword || undefined,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setSaved('Password updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password update failed');
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(role: Role, permission: Permission, on: boolean) {
    if (
      role === 'OWNER' &&
      OWNER_LOCKED_PERMISSIONS.includes(permission) &&
      !on
    ) {
      return;
    }
    if (permission === 'credentials.own' && !on) return;
    setRoleMatrix((matrix) => {
      const current = new Set(matrix[role]);
      if (on) current.add(permission);
      else current.delete(permission);
      if (role === 'OWNER') {
        for (const locked of OWNER_LOCKED_PERMISSIONS) current.add(locked);
      }
      current.add('credentials.own');
      return { ...matrix, [role]: ALL_PERMISSIONS.filter((p) => current.has(p)) };
    });
  }

  async function saveRolePermissions() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const cleaned = sanitizeRolePermissions(roleMatrix);
      await putSetting('rolePermissions', cleaned);
      setRoleMatrix(cleaned);
      setSaved('Permissions saved — staff see changes on next refresh');
      await refreshMe();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffShell
      title="Settings"
    >
      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}
      {saved ? (
        <p className="mb-3 text-sm font-medium text-ready">{saved}</p>
      ) : null}

      {loading ? (
        <LoadingBlock label="Loading settings…" />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <nav className="chip-scroll -mx-3 bg-cream px-3 py-2 md:static md:mx-0 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:bg-transparent md:px-0 md:py-0">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSection(s.key);
                  setSaved(null);
                }}
                className={`min-h-touch shrink-0 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition md:w-full ${
                  section === s.key
                    ? 'bg-cta text-cream'
                    : 'bg-[#EDE6DA] text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-4">
            {section === 'profile' && canConfigure ? (
                <Panel>
                  <h2 className="mb-1 font-display text-lg font-bold">
                    Restaurant Profile
                  </h2>
                  <p className="mb-4 text-sm text-muted">
                    Brand identity shown in staff and guest headers, login, and
                    receipts.
                    {readOnlyProfileFinance
                      ? ' Manager view is read-only.'
                      : ''}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Restaurant name">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={identity.restaurantName}
                        onChange={(e) =>
                          setIdentity((s) => ({
                            ...s,
                            restaurantName: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Trading name">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.tradingName}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            tradingName: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.address}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            address: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Phone">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Website">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.website}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            website: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <p className="text-sm font-medium text-ink">Logo</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Upload a square PNG or JPG (max 5MB). Used as the installed
                        app icon, and shown in staff and guest headers, login, and
                        on receipts when enabled.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[#E0D5C4] bg-white">
                          <BrandLogo
                            src={mediaUrl(profile.logoUrl)}
                            alt="Restaurant logo"
                            className="h-full w-full object-contain p-1"
                            fallback={
                              <span className="font-display text-3xl font-bold text-cta">
                                F
                              </span>
                            }
                          />
                        </div>
                        {!readOnlyProfileFinance ? (
                          <div className="flex flex-wrap gap-2">
                            <label className="btn-primary cursor-pointer">
                              {busy ? 'Uploading…' : 'Upload logo'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                disabled={busy}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  void (async () => {
                                    setBusy(true);
                                    setError(null);
                                    try {
                                      const res = await apiUpload<{
                                        url: string;
                                      }>('/uploads/image', file);
                                      setProfile((p) => ({
                                        ...p,
                                        logoUrl: res.url,
                                      }));
                                      setSaved(
                                        'Logo uploaded — save profile to keep it',
                                      );
                                    } catch (err) {
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : 'Logo upload failed',
                                      );
                                    } finally {
                                      setBusy(false);
                                    }
                                  })();
                                }}
                              />
                            </label>
                            {profile.logoUrl ? (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  setProfile((p) => ({ ...p, logoUrl: '' }))
                                }
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Field label="Currency code">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={identity.currency}
                        onChange={(e) =>
                          setIdentity((s) => ({
                            ...s,
                            currency: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Currency symbol">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.currencySymbol}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            currencySymbol: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Currency name">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={profile.currencyName}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            currencyName: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Timezone">
                      <input
                        className="input-field"
                        disabled={readOnlyProfileFinance}
                        value={identity.timezone}
                        onChange={(e) =>
                          setIdentity((s) => ({
                            ...s,
                            timezone: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  {!readOnlyProfileFinance ? (
                    <SectionSave
                      busy={busy}
                      onSave={() =>
                        void saveKeys(
                          [
                            ['restaurantName', identity.restaurantName],
                            ['currency', identity.currency],
                            ['timezone', identity.timezone],
                            ['profile', profile],
                          ],
                          'Profile',
                        )
                      }
                    />
                  ) : null}
                </Panel>
            ) : null}

            {section === 'appearance' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Appearance
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Applies instantly on this device — save to keep for everyone.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Theme">
                    <select
                      className="input-field"
                      value={appearance.theme}
                      onChange={(e) => {
                        const next = { ...appearance, theme: e.target.value };
                        setAppearance(next);
                        applyAppearance(next);
                      }}
                    >
                      <option value="warmLight">Warm light</option>
                      <option value="warmDark">Warm dark</option>
                      <option value="highContrast">High contrast</option>
                    </select>
                  </Field>
                  <Field label="Colour scheme" className="sm:col-span-2">
                    <p className="mb-3 text-xs text-muted">
                      Accent and sidebar stay in the same colour family — clashing
                      contrasts are blocked.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {COLOUR_SCHEMES.map((s) => {
                        const active = appearance.accent === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            title={s.label}
                            aria-label={s.label}
                            onClick={() => {
                              const next = {
                                ...appearance,
                                accent: s.id,
                                accentColor: s.accent,
                                sidebarColor: s.sidebar,
                              };
                              setAppearance(next);
                              applyAppearance(next);
                            }}
                            className={`flex h-12 overflow-hidden rounded-2xl border-2 transition ${
                              active
                                ? 'scale-105 border-ink'
                                : 'border-transparent'
                            }`}
                          >
                            <span
                              className="h-full w-7"
                              style={{ background: s.sidebar }}
                            />
                            <span
                              className="h-full w-7"
                              style={{ background: s.accent }}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium sm:max-w-xs">
                        Custom hue
                        <span
                          className="block h-2 w-full rounded-full"
                          style={{
                            background:
                              'linear-gradient(90deg,#c0613d,#c4922e,#2f7d63,#5f7186,#7a4a8a,#c0613d)',
                          }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={359}
                          value={appearance.customHue ?? 18}
                          className="w-full accent-[var(--cta)]"
                          onChange={(e) => {
                            const hue = Number(e.target.value);
                            const pair = harmoniousFromHue(hue);
                            const next = {
                              ...appearance,
                              accent: 'custom',
                              customHue: hue,
                              accentColor: pair.accent,
                              sidebarColor: pair.sidebar,
                            };
                            setAppearance(next);
                            applyAppearance(next);
                          }}
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-11 w-11 rounded-xl border border-[#E0D5C4]"
                          style={{
                            background: appearance.sidebarColor || '#3d2418',
                          }}
                          title="Sidebar"
                        />
                        <span
                          className="h-11 w-11 rounded-xl border border-[#E0D5C4]"
                          style={{
                            background: appearance.accentColor || '#c0613d',
                          }}
                          title="Accent"
                        />
                      </div>
                    </div>
                  </Field>
                  <Field label="Font size">
                    <select
                      className="input-field"
                      value={appearance.fontSize}
                      onChange={(e) => {
                        const next = {
                          ...appearance,
                          fontSize: e.target.value,
                        };
                        setAppearance(next);
                        applyAppearance(next);
                      }}
                    >
                      <option value="small">Small</option>
                      <option value="default">Default</option>
                      <option value="large">Large</option>
                      <option value="xl">Extra large</option>
                    </select>
                  </Field>
                  <Toggle
                    label={
                      appearance.kitchenHiVis
                        ? 'Kitchen high-visibility — On (extra-large KDS text)'
                        : 'Kitchen high-visibility — Off (standard)'
                    }
                    checked={appearance.kitchenHiVis}
                    onChange={(v) => {
                      const next = { ...appearance, kitchenHiVis: v };
                      setAppearance(next);
                      applyAppearance(next);
                    }}
                  />
                </div>
                <Field label="Kitchen stations (comma-separated)" className="mt-3">
                  <input
                    className="input-field"
                    value={stationsText}
                    onChange={(e) => setStationsText(e.target.value)}
                  />
                </Field>
                <SectionSave
                  busy={busy}
                  label="Save for all staff"
                  onSave={() => {
                    applyAppearance(appearance);
                    void saveKeys(
                      [
                        ['appearance', appearance],
                        [
                          'kdsStations',
                          stationsText
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        ],
                      ],
                      'Appearance',
                    );
                  }}
                />
              </Panel>
            ) : null}

            {section === 'finance' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Finance Settings
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Tax, discounts, tips, and till variance.
                  {readOnlyProfileFinance ? ' Manager view is read-only.' : ''}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Toggle
                    label="Tax inclusive"
                    checked={tax.inclusive}
                    disabled={readOnlyProfileFinance}
                    onChange={(v) => setTax((t) => ({ ...t, inclusive: v }))}
                  />
                  <Field label="Tax rate %">
                    <input
                      type="number"
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={tax.ratePercent}
                      onChange={(e) =>
                        setTax((t) => ({
                          ...t,
                          ratePercent: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Tax label">
                    <input
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={tax.label}
                      onChange={(e) =>
                        setTax((t) => ({ ...t, label: e.target.value }))
                      }
                    />
                  </Field>
                  <Toggle
                    label="Allow discounts"
                    checked={finance.allowDiscounts}
                    disabled={readOnlyProfileFinance}
                    onChange={(v) =>
                      setFinance((f) => ({ ...f, allowDiscounts: v }))
                    }
                  />
                  <Field label="Max discount %">
                    <input
                      type="number"
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={finance.maxDiscountPct}
                      onChange={(e) =>
                        setFinance((f) => ({
                          ...f,
                          maxDiscountPct: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Max discount amount (GMD)">
                    <input
                      type="number"
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={finance.maxDiscountAmt}
                      onChange={(e) =>
                        setFinance((f) => ({
                          ...f,
                          maxDiscountAmt: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Toggle
                    label="Tips enabled"
                    checked={finance.tipsEnabled}
                    disabled={readOnlyProfileFinance}
                    onChange={(v) =>
                      setFinance((f) => ({ ...f, tipsEnabled: v }))
                    }
                  />
                  <Field label="Tip options (%)" className="sm:col-span-2">
                    <input
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={finance.tipOptions.join(', ')}
                      onChange={(e) =>
                        setFinance((f) => ({
                          ...f,
                          tipOptions: e.target.value
                            .split(',')
                            .map((x) => Number(x.trim()))
                            .filter((n) => !Number.isNaN(n) && n > 0),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Till variance approval (GMD)">
                    <input
                      type="number"
                      className="input-field"
                      disabled={readOnlyProfileFinance}
                      value={tillVariance}
                      onChange={(e) => setTillVariance(Number(e.target.value))}
                    />
                  </Field>
                </div>
                {!readOnlyProfileFinance ? (
                  <SectionSave
                    busy={busy}
                    onSave={() =>
                      void saveKeys(
                        [
                          ['tax', tax],
                          ['finance', finance],
                          [
                            'standardDiscountCapPercent',
                            finance.maxDiscountPct,
                          ],
                          ['tillVarianceApprovalThreshold', tillVariance],
                        ],
                        'Finance',
                      )
                    }
                  />
                ) : null}
              </Panel>
            ) : null}

            {section === 'payments' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Payment Methods
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Enable methods shown at checkout. Order is top to bottom.
                </p>
                <ul className="space-y-2">
                  {payments.order.map((method) => (
                    <li
                      key={method}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E0D5C4] bg-white px-3 py-3"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{
                          background: payments.colors[method] ?? '#c0613d',
                        }}
                      />
                      <span className="min-w-[8rem] flex-1 font-semibold">
                        {method}
                      </span>
                      <Toggle
                        label="Enabled"
                        checked={Boolean(payments.enabled[method])}
                        onChange={(v) =>
                          setPayments((p) => ({
                            ...p,
                            enabled: { ...p.enabled, [method]: v },
                          }))
                        }
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-muted">
                        Colour
                        <input
                          type="color"
                          className="h-10 w-12 cursor-pointer rounded-lg border border-[#E0D5C4] bg-white p-1"
                          value={payments.colors[method] ?? '#c0613d'}
                          onChange={(e) =>
                            setPayments((p) => ({
                              ...p,
                              colors: {
                                ...p.colors,
                                [method]: e.target.value,
                              },
                            }))
                          }
                          aria-label={`${method} colour`}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="input-field max-w-xs"
                    placeholder="Add custom method"
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={busy || !newMethod.trim()}
                    onClick={() => {
                      const name = newMethod.trim();
                      if (!name || payments.order.includes(name)) return;
                      setPayments((p) => ({
                        order: [...p.order, name],
                        enabled: { ...p.enabled, [name]: true },
                        colors: { ...p.colors, [name]: '#5f7186' },
                      }));
                      setNewMethod('');
                    }}
                  >
                    Add method
                  </Button>
                </div>
                <SectionSave
                  busy={busy}
                  onSave={() => {
                    const enabledMethods = payments.order.filter(
                      (m) => payments.enabled[m],
                    );
                    void saveKeys(
                      [
                        ['paymentsConfig', payments],
                        ['paymentMethods', enabledMethods],
                      ],
                      'Payment methods',
                    );
                  }}
                />
              </Panel>
            ) : null}

            {section === 'notifications' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Notifications
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Escalation timers and which events alert staff devices.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Amber after (seconds)">
                    <input
                      type="number"
                      className="input-field"
                      value={notifications.amberAfter}
                      onChange={(e) =>
                        setNotifications((n) => ({
                          ...n,
                          amberAfter: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Red after (seconds)">
                    <input
                      type="number"
                      className="input-field"
                      value={notifications.redAfter}
                      onChange={(e) =>
                        setNotifications((n) => ({
                          ...n,
                          redAfter: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Table waiting (minutes)">
                    <input
                      type="number"
                      className="input-field"
                      value={notifications.tableWaitingMins}
                      onChange={(e) =>
                        setNotifications((n) => ({
                          ...n,
                          tableWaitingMins: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Pay-date reminder (days before)">
                    <input
                      type="number"
                      className="input-field"
                      value={notifications.payDateDays}
                      onChange={(e) =>
                        setNotifications((n) => ({
                          ...n,
                          payDateDays: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Sound style">
                    <select
                      className="input-field"
                      value={notifications.soundStyle}
                      onChange={(e) =>
                        setNotifications((n) => ({
                          ...n,
                          soundStyle: e.target.value,
                        }))
                      }
                    >
                      <option>Chime</option>
                      <option>Bell</option>
                      <option>Soft</option>
                      <option>Off</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['onQrOrder', 'QR guest orders'],
                      ['onBellTap', 'Call waiter'],
                      ['onOrderReady', 'Order ready'],
                      ['onTableWaiting', 'Table waiting too long'],
                      ['onLowStock', 'Low stock'],
                      ['onPayDate', 'Payroll pay-date reminder'],
                      ['soundOn', 'Play sound'],
                    ] as const
                  ).map(([key, label]) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={Boolean(notifications[key])}
                      onChange={(v) =>
                        setNotifications((n) => ({ ...n, [key]: v }))
                      }
                    />
                  ))}
                </div>
                <SectionSave
                  busy={busy}
                  onSave={() =>
                    void saveKeys(
                      [
                        ['notifications', notifications],
                        [
                          'escalationMinutes',
                          Math.max(
                            1,
                            Math.round(notifications.redAfter / 60),
                          ),
                        ],
                        [
                          'notificationEscalation',
                          {
                            callWaiterMinutes: notifications.tableWaitingMins,
                            amberSeconds: notifications.amberAfter,
                            redSeconds: notifications.redAfter,
                          },
                        ],
                      ],
                      'Notifications',
                    )
                  }
                />
              </Panel>
            ) : null}

            {section === 'menu' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Menu Settings
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Guest menu behaviour. Item content is managed on the Menu
                  screen.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Sold-out items">
                    <select
                      className="input-field"
                      value={menuSettings.soldOutMode}
                      onChange={(e) =>
                        setMenuSettings((m) => ({
                          ...m,
                          soldOutMode: e.target.value,
                        }))
                      }
                    >
                      <option value="show">Show as sold out</option>
                      <option value="hide">Hide from guest menu</option>
                    </select>
                  </Field>
                  <Field label="Specials position">
                    <select
                      className="input-field"
                      value={menuSettings.specialsPosition}
                      onChange={(e) =>
                        setMenuSettings((m) => ({
                          ...m,
                          specialsPosition: e.target.value,
                        }))
                      }
                    >
                      <option value="above">Above categories</option>
                      <option value="below">Below categories</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['showAllergens', 'Show allergens'],
                      ['showIngredients', 'Show ingredients'],
                      ['showPrepTime', 'Show prep time'],
                      ['modifiersAlways', 'Always show modifiers'],
                      ['requireNotesConfirm', 'Confirm guest notes'],
                      ['autoClearChef', 'Auto-clear expired chef special'],
                      ['showTodayOnlyBadge', 'Show “today only” badge'],
                    ] as const
                  ).map(([key, label]) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={Boolean(menuSettings[key])}
                      onChange={(v) =>
                        setMenuSettings((m) => ({ ...m, [key]: v }))
                      }
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-[#E0D5C4] pt-4">
                  <p className="text-sm font-semibold">Inventory consumption</p>
                  <Toggle
                    label="Consume from production batches"
                    checked={inventory.batchAtProduction}
                    onChange={(v) =>
                      setInventory((i) => ({ ...i, batchAtProduction: v }))
                    }
                  />
                  <Toggle
                    label="Direct deduct at kitchen prepare"
                    checked={inventory.directAtKitchenPrepare}
                    onChange={(v) =>
                      setInventory((i) => ({
                        ...i,
                        directAtKitchenPrepare: v,
                      }))
                    }
                  />
                </div>
                <SectionSave
                  busy={busy}
                  onSave={() =>
                    void saveKeys(
                      [
                        ['menuSettings', menuSettings],
                        ['inventoryConsumption', inventory],
                      ],
                      'Menu settings',
                    )
                  }
                />
              </Panel>
            ) : null}

            {section === 'shifts' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Shifts & Scheduling
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Operating hours, coverage minimums, and shift types. Day-to-day
                  rosters live under Shifts. Shifts scheduled outside these hours
                  are flagged on the weekly grid.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Opens">
                    <input
                      type="time"
                      className="input-field"
                      value={shiftsHours.openFrom}
                      onChange={(e) =>
                        setShiftsHours((s) => ({
                          ...s,
                          openFrom: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Closes">
                    <input
                      type="time"
                      className="input-field"
                      value={shiftsHours.openTo}
                      onChange={(e) =>
                        setShiftsHours((s) => ({
                          ...s,
                          openTo: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="First day of week">
                    <select
                      className="input-field"
                      value={shiftsHours.firstDayOfWeek}
                      onChange={(e) =>
                        setShiftsHours((s) => ({
                          ...s,
                          firstDayOfWeek: e.target.value,
                        }))
                      }
                    >
                      {[
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Minimum waiters per day">
                    <input
                      type="number"
                      className="input-field"
                      value={shiftsHours.minWaitersPerDay}
                      onChange={(e) =>
                        setShiftsHours((s) => ({
                          ...s,
                          minWaitersPerDay: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                </div>
                <SectionSave
                  busy={busy}
                  onSave={() =>
                    void saveKeys(
                      [
                        ['shiftsHours', shiftsHours],
                        ['minWaitersPerDay', shiftsHours.minWaitersPerDay],
                      ],
                      'Shifts settings',
                    )
                  }
                />

                <div className="mt-8 border-t border-[#E0D5C4] pt-6">
                  <h3 className="mb-1 font-display text-base font-bold">
                    Shift types
                  </h3>
                  <p className="mb-3 text-sm text-muted">
                    Used on the weekly roster grid (Morning, Dinner, custom…).
                  </p>
                  <ul className="mb-4 space-y-2">
                    {shiftTypes.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E0D5C4] bg-white px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ background: t.color || '#C0613D' }}
                          />
                          <span className="font-semibold">{t.name}</span>
                          <span className="text-muted">
                            {t.startTime}–{t.endTime}
                            {!t.isActive ? ' · inactive' : ''}
                          </span>
                        </div>
                        {t.isActive ? (
                          <Button
                            variant="outline"
                            className="text-xs"
                            busy={busy}
                            busyLabel="Deactivating…"
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                try {
                                  const { updateShiftType } =
                                    await import('@/features/employees/api');
                                  await updateShiftType(t.id, {
                                    isActive: false,
                                  });
                                  setShiftTypes(
                                    await (
                                      await import('@/features/employees/api')
                                    ).listShiftTypes(true),
                                  );
                                  setSaved(`Deactivated ${t.name}`);
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })()
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="text-xs"
                            busy={busy}
                            busyLabel="Reactivating…"
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                try {
                                  const { updateShiftType, listShiftTypes } =
                                    await import('@/features/employees/api');
                                  await updateShiftType(t.id, {
                                    isActive: true,
                                  });
                                  setShiftTypes(await listShiftTypes(true));
                                  setSaved(`Reactivated ${t.name}`);
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })()
                            }
                          >
                            Reactivate
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <input
                      className="input-field sm:col-span-2"
                      placeholder="Type name"
                      value={shiftTypeDraft.name}
                      onChange={(e) =>
                        setShiftTypeDraft((d) => ({
                          ...d,
                          name: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="time"
                      className="input-field"
                      value={shiftTypeDraft.startTime}
                      onChange={(e) =>
                        setShiftTypeDraft((d) => ({
                          ...d,
                          startTime: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="time"
                      className="input-field"
                      value={shiftTypeDraft.endTime}
                      onChange={(e) =>
                        setShiftTypeDraft((d) => ({
                          ...d,
                          endTime: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="color"
                      className="input-field h-11 p-1"
                      value={shiftTypeDraft.color}
                      onChange={(e) =>
                        setShiftTypeDraft((d) => ({
                          ...d,
                          color: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    className="mt-3"
                    busy={busy}
                    disabled={!shiftTypeDraft.name.trim()}
                    busyLabel="Creating…"
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          const { createShiftType, listShiftTypes } =
                            await import('@/features/employees/api');
                          await createShiftType({
                            name: shiftTypeDraft.name.trim(),
                            startTime: shiftTypeDraft.startTime,
                            endTime: shiftTypeDraft.endTime,
                            color: shiftTypeDraft.color,
                          });
                          setShiftTypes(await listShiftTypes(true));
                          setShiftTypeDraft({
                            name: '',
                            startTime: '09:00',
                            endTime: '17:00',
                            color: '#C0613D',
                          });
                          setSaved('Shift type added');
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'Create failed',
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  >
                    Add custom shift type
                  </Button>
                </div>
              </Panel>
            ) : null}

            {section === 'tables' && canTables ? (
              <>
                <Panel>
                  <h2 className="mb-1 font-display text-lg font-bold">
                    Floor workflow
                  </h2>
                  <p className="mb-4 text-sm text-muted">
                    Control what happens after a visit is paid or cleared.
                  </p>
                  <Toggle
                    label={
                      floor.requireCleaningAfterClose
                        ? 'Require cleaning before next guests — On'
                        : 'Require cleaning before next guests — Off'
                    }
                    checked={floor.requireCleaningAfterClose}
                    onChange={(v) =>
                      setFloor((f) => ({
                        ...f,
                        requireCleaningAfterClose: v,
                      }))
                    }
                  />
                  <p className="mt-2 text-xs text-muted">
                    Off: table goes Free as soon as the visit ends — ready for
                    the next party. On: staff must tap Clear table (cleaned)
                    first. You can still mark a table for cleaning when clearing
                    if needed.
                  </p>
                  <SectionSave
                    busy={busy}
                    label="Save floor settings"
                    onSave={() => {
                      void saveKeys([['floor', floor]], 'Floor settings');
                    }}
                  />
                </Panel>
                <Panel>
                  <h2 className="mb-1 font-display text-lg font-bold">
                    Tables
                  </h2>
                  <p className="mb-4 text-sm text-muted">
                    Add, edit, and archive dining tables.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Number">
                      <input
                        className="input-field"
                        value={tableDraft.number}
                        onChange={(e) =>
                          setTableDraft((d) => ({
                            ...d,
                            number: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Label">
                      <input
                        className="input-field"
                        value={tableDraft.label}
                        onChange={(e) =>
                          setTableDraft((d) => ({
                            ...d,
                            label: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Seats">
                      <input
                        type="number"
                        className="input-field"
                        value={tableDraft.seats}
                        onChange={(e) =>
                          setTableDraft((d) => ({
                            ...d,
                            seats: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        busy={busy}
                        busyLabel="Creating…"
                        onClick={() => void onCreateTable()}
                      >
                        Add table
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <SearchField
                      value={tableQuery}
                      onChange={setTableQuery}
                      placeholder="Search tables…"
                    />
                  </div>
                  <ul className="mt-3 divide-y divide-[#E0D5C4]">
                    {filteredTables.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <div>
                          <p className="font-semibold">
                            Table {t.number}
                            {t.label ? ` · ${t.label}` : ''}
                          </p>
                          <p className="text-xs text-muted">
                            {t.seats} seats · {t.status}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              const seats = window.prompt(
                                'Seats',
                                String(t.seats),
                              );
                              if (!seats) return;
                              void (async () => {
                                setBusy(true);
                                try {
                                  await updateTable(t.id, {
                                    seats: Number(seats),
                                  });
                                  await load();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            Edit seats
                          </Button>
                          <Button
                            variant="danger"
                            busy={busy}
                            busyLabel="Archiving…"
                            onClick={() => void onArchiveTable(t.id)}
                          >
                            Archive
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Table QR export
                  </h2>
                  <select
                    className="input-field"
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                  >
                    {filteredTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.number}
                        {t.label ? ` · ${t.label}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      busy={busy}
                      disabled={!selectedTable}
                      busyLabel="Exporting…"
                      onClick={() => void onExportQr()}
                    >
                      Export QR
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !selectedTable}
                      onClick={() =>
                        void (async () => {
                          if (!selectedTable) return;
                          setBusy(true);
                          try {
                            await rotateTableQr(selectedTable);
                            setQr(await exportTableQr(selectedTable));
                            setSaved(
                              'QR token rotated (printed stickers keep working in production)',
                            );
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Rotate failed',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Rotate & export
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Production stickers use a stable table link. Rotating the internal
                    token does not require reprinting. Staging exports may still show
                    the demo /m/… token URL.
                  </p>
                  {qr ? (
                    <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qr.imageDataUrl}
                        alt={`QR for table ${qr.tableNumber}`}
                        className="h-48 w-48 rounded-xl border border-[#E0D5C4] bg-white p-2"
                      />
                      <div className="text-sm">
                        <p className="font-semibold">{qr.printLabel}</p>
                        <p className="mt-1 break-all text-muted">{qr.url}</p>
                        {qr.stableUrl && qr.stableUrl !== qr.url ? (
                          <p className="mt-1 break-all text-xs text-muted">
                            Stable: {qr.stableUrl}
                          </p>
                        ) : null}
                        <a
                          className="mt-3 inline-block text-cta underline"
                          href={qr.imageDataUrl}
                          download={`fajara-table-${qr.tableNumber}.png`}
                        >
                          Download PNG
                        </a>
                      </div>
                    </div>
                  ) : null}
                </Panel>
              </>
            ) : null}

            {section === 'permissions' &&
            (isOwner || user?.role === 'MANAGER') ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Roles & Permissions
                </h2>
                <p className="mb-4 text-sm text-muted">
                  {isOwner
                    ? 'Choose what each job role is allowed to do. Owner rights stay locked.'
                    : 'Choose what Waiter, Kitchen, and Cashier roles can do. Owner and Manager rights are set by the Owner.'}
                </p>
                <div className="chip-scroll mb-4">
                  {(
                    (isOwner
                      ? (['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'] as Role[])
                      : (['WAITER', 'KITCHEN', 'CASHIER'] as Role[])
                    ).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setPermRole(role)}
                        className={`min-h-touch shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
                          permRole === role
                            ? 'bg-cta text-cream'
                            : 'bg-[#EDE6DA] text-ink'
                        }`}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    ))
                  )}
                </div>
                <p className="mb-3 text-sm font-semibold text-ink">
                  What can a {ROLE_LABELS[permRole]} do?
                </p>
                <ul className="space-y-2">
                  {ALL_PERMISSIONS.map((permission) => {
                    const roleLocked =
                      permRole === 'OWNER' ||
                      (permRole === 'MANAGER' && !isOwner);
                    const alwaysOn =
                      (permRole === 'OWNER' &&
                        OWNER_LOCKED_PERMISSIONS.includes(permission)) ||
                      permission === 'credentials.own';
                    const on = roleMatrix[permRole].includes(permission);
                    return (
                      <li
                        key={permission}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E0D5C4] bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">
                            {PERMISSION_LABELS[permission]}
                          </p>
                          {roleLocked || alwaysOn ? (
                            <p className="text-xs text-muted">
                              {roleLocked
                                ? 'Only the Owner can change this role'
                                : 'Always on for safety'}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={roleLocked || alwaysOn || busy}
                          onClick={() =>
                            togglePermission(permRole, permission, !on)
                          }
                          className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                            on ? 'bg-cta' : 'bg-[#C9B8A0]'
                          } disabled:opacity-60`}
                        >
                          <span
                            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                              on ? 'left-7' : 'left-1'
                            }`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    busy={busy}
                    busyLabel="Saving…"
                    onClick={() => void saveRolePermissions()}
                  >
                    Save permissions
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setRoleMatrix((m) =>
                        sanitizeRolePermissions({
                          ...m,
                          [permRole]: [...ROLE_PERMISSIONS[permRole]],
                        }),
                      )
                    }
                  >
                    Reset {ROLE_LABELS[permRole]} to default
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Tip: after saving, ask staff to refresh or sign in again so
                  their menu updates.
                </p>
              </Panel>
            ) : null}

            {section === 'receipt' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Receipt & Printing
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Receipt content for checkout. Thermal printer hardware is
                  Phase 2 — name/width are stored for later.
                </p>
                <Field label="Footer message">
                  <textarea
                    className="input-field min-h-[88px]"
                    value={receipt.footerMessage}
                    onChange={(e) =>
                      setReceipt((r) => ({
                        ...r,
                        footerMessage: e.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['showLogo', 'Show logo'],
                      ['showOrderId', 'Show order ID'],
                      ['showTable', 'Show table'],
                      ['showWaiter', 'Show waiter'],
                      ['showDateTime', 'Show date/time'],
                      ['showItemMods', 'Show modifiers'],
                      ['showTaxBreakdown', 'Show tax breakdown'],
                      ['showTips', 'Show tips'],
                      ['showPaymentMethod', 'Show payment method'],
                      ['showThankYou', 'Show thank-you line'],
                      ['autoPrint', 'Auto-print (when printer available)'],
                      ['printKitchenCopy', 'Print kitchen copy'],
                    ] as const
                  ).map(([key, label]) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={Boolean(receipt[key])}
                      onChange={(v) =>
                        setReceipt((r) => ({ ...r, [key]: v }))
                      }
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Printer name (Phase 2)">
                    <input
                      className="input-field"
                      value={receipt.printerName}
                      onChange={(e) =>
                        setReceipt((r) => ({
                          ...r,
                          printerName: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Receipt width">
                    <select
                      className="input-field"
                      value={receipt.width}
                      onChange={(e) =>
                        setReceipt((r) => ({ ...r, width: e.target.value }))
                      }
                    >
                      <option value="58mm">58mm</option>
                      <option value="80mm">80mm</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-5 rounded-2xl border border-[#E0D5C4] bg-[#F7F1E8] p-4 font-mono text-xs">
                  <p className="mb-2 text-center text-sm font-bold not-italic">
                    Live preview
                  </p>
                  {receipt.showLogo ? (
                    <div className="mb-2 flex flex-col items-center gap-1">
                      <BrandLogo
                        src={mediaUrl(profile.logoUrl)}
                        alt={identity.restaurantName || 'Restaurant logo'}
                        className="h-12 w-auto max-w-[120px] object-contain"
                      />
                      <p className="text-center font-display text-lg font-bold">
                        {identity.restaurantName || 'Fajara'}
                      </p>
                    </div>
                  ) : null}
                  {receipt.showDateTime ? (
                    <p className="text-center text-muted">
                      {new Date().toLocaleString()}
                    </p>
                  ) : null}
                  {receipt.showOrderId ? (
                    <p className="mt-2">Order #TX-1042</p>
                  ) : null}
                  {receipt.showTable ? <p>Table 12</p> : null}
                  {receipt.showWaiter ? <p>Waiter: Awa</p> : null}
                  <div className="my-2 border-t border-dashed border-[#C9B8A0] pt-2">
                    <p>Benachin ×1 ………… D250</p>
                    {receipt.showItemMods ? (
                      <p className="text-muted"> + Extra fish</p>
                    ) : null}
                    <p>Domoda ×1 ………… D180</p>
                  </div>
                  {receipt.showTaxBreakdown ? (
                    <p>VAT ……………… D43</p>
                  ) : null}
                  {receipt.showTips ? <p>Tip ……………… D40</p> : null}
                  <p className="font-bold">Total ………… D513</p>
                  {receipt.showPaymentMethod ? (
                    <p className="mt-1">Paid · Afrimoney</p>
                  ) : null}
                  {receipt.showThankYou || receipt.footerMessage ? (
                    <p className="mt-3 text-center">
                      {receipt.footerMessage || 'Thank you!'}
                    </p>
                  ) : null}
                  <p className="mt-2 text-center text-muted">
                    Width {receipt.width}
                    {receipt.printerName
                      ? ` · ${receipt.printerName}`
                      : ''}
                  </p>
                </div>
                <SectionSave
                  busy={busy}
                  onSave={() =>
                    void saveKeys(
                      [
                        ['receipt', receipt],
                        ['receiptFooter', receipt.footerMessage],
                      ],
                      'Receipt settings',
                    )
                  }
                />
              </Panel>
            ) : null}

            {section === 'data' && canConfigure ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  Data & Export
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Download CSV exports for accounting. Full backup/restore comes
                  with the cloud version.
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(
                    [
                      ['today', 'Today', 1],
                      ['7d', 'Last 7 days', 7],
                      ['30d', 'This month', 30],
                    ] as const
                  ).map(([id, label, days]) => (
                    <button
                      key={id}
                      type="button"
                      className="rounded-full bg-[#EDE6DA] px-4 py-2 text-sm font-semibold"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - (days - 1));
                        const fmt = (d: Date) => d.toISOString().slice(0, 10);
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            const { downloadSalesCsv, downloadActivityCsv } =
                              await import('@/features/reports/api');
                            await downloadSalesCsv(fmt(start), fmt(end));
                            setSaved(`Sales CSV (${label}) downloaded`);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Export failed',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Export sales · {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    busy={busy}
                    busyLabel="Exporting…"
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          const { downloadActivityCsv } =
                            await import('@/features/reports/api');
                          const end = new Date();
                          const start = new Date();
                          start.setDate(end.getDate() - 6);
                          const fmt = (d: Date) =>
                            d.toISOString().slice(0, 10);
                          await downloadActivityCsv(fmt(start), fmt(end));
                          setSaved('Activity CSV downloaded');
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'Export failed',
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  >
                    Export activity (7 days)
                  </Button>
                  <Can permission="employees.manage">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          try {
                            const { downloadPayrollCsv } =
                              await import('@/features/employees/api');
                            await downloadPayrollCsv();
                            setSaved('Payroll CSV downloaded');
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : 'Export failed',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Export payroll records
                    </Button>
                  </Can>
                  <Link href="/app/reports" className="btn-primary">
                    Open full reports
                  </Link>
                </div>
                <Field
                  label="Guest display-name retention (days)"
                  className="mt-6"
                >
                  <input
                    type="number"
                    className="input-field max-w-xs"
                    value={guestRetentionDays}
                    onChange={(e) =>
                      setGuestRetentionDays(Number(e.target.value))
                    }
                  />
                </Field>
                {canManage ? (
                  <SectionSave
                    busy={busy}
                    label="Save retention"
                    onSave={() =>
                      void saveKeys(
                        [
                          [
                            'guestDisplayNameRetentionDays',
                            guestRetentionDays,
                          ],
                        ],
                        'Retention',
                      )
                    }
                  />
                ) : null}
              </Panel>
            ) : null}

            {section === 'account' ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">
                  My PIN & account
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Signed in as {user?.fullName} ({user?.role}).
                </p>
                <Field label="Login email">
                  <input
                    className="input-field"
                    value={user?.email ?? ''}
                    readOnly
                    disabled
                    title="Email cannot be changed here"
                  />
                  <p className="mt-1 text-xs text-muted">
                    Email is set when your account is created and cannot be
                    changed here.
                    {user?.role === 'OWNER' || user?.role === 'MANAGER'
                      ? ' Update your PIN or password below.'
                      : ' Update your PIN below.'}
                  </p>
                </Field>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Current PIN">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      className="input-field"
                      value={pinForm.currentPin}
                      onChange={(e) =>
                        setPinForm((p) => ({
                          ...p,
                          currentPin: e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 4),
                        }))
                      }
                    />
                  </Field>
                  <Field label="New PIN">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      className="input-field"
                      value={pinForm.newPin}
                      onChange={(e) =>
                        setPinForm((p) => ({
                          ...p,
                          newPin: e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 4),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Confirm new PIN">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      className="input-field"
                      value={pinForm.confirm}
                      onChange={(e) =>
                        setPinForm((p) => ({
                          ...p,
                          confirm: e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 4),
                        }))
                      }
                    />
                  </Field>
                </div>
                <Button
                  className="mt-3"
                  busy={busy}
                  busyLabel="Updating…"
                  onClick={() => void onChangePin()}
                >
                  Update PIN
                </Button>

                {(user?.role === 'OWNER' || user?.role === 'MANAGER') && (
                  <>
                    <div className="mt-6 grid gap-3 border-t border-[#E0D5C4] pt-4 sm:grid-cols-2">
                      <Field label="Current password">
                        <input
                          type="password"
                          className="input-field"
                          value={pwForm.currentPassword}
                          onChange={(e) =>
                            setPwForm((p) => ({
                              ...p,
                              currentPassword: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="New password">
                        <input
                          type="password"
                          className="input-field"
                          value={pwForm.newPassword}
                          onChange={(e) =>
                            setPwForm((p) => ({
                              ...p,
                              newPassword: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Confirm password">
                        <input
                          type="password"
                          className="input-field"
                          value={pwForm.confirm}
                          onChange={(e) =>
                            setPwForm((p) => ({
                              ...p,
                              confirm: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <Button
                      className="mt-3"
                      busy={busy}
                      busyLabel="Updating…"
                      onClick={() => void onChangePassword()}
                    >
                      Update password
                    </Button>
                  </>
                )}

                {canManage ? (
                  <div className="mt-6 space-y-3 border-t border-[#E0D5C4] pt-4">
                    <p className="text-sm font-semibold">System security</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="PIN max attempts">
                        <input
                          type="number"
                          className="input-field"
                          value={pinLockout.maxAttempts}
                          onChange={(e) =>
                            setPinLockout((p) => ({
                              ...p,
                              maxAttempts: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field label="PIN lock minutes">
                        <input
                          type="number"
                          className="input-field"
                          value={pinLockout.lockMinutes}
                          onChange={(e) =>
                            setPinLockout((p) => ({
                              ...p,
                              lockMinutes: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field label="Inactivity lock (minutes)">
                        <input
                          type="number"
                          className="input-field"
                          value={inactivityLockMinutes}
                          onChange={(e) =>
                            setInactivityLockMinutes(Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="Session timeout (minutes)">
                        <input
                          type="number"
                          className="input-field"
                          value={security.sessionTimeout}
                          onChange={(e) =>
                            setSecurity((s) => ({
                              ...s,
                              sessionTimeout: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Toggle
                        label="Kitchen screens skip inactivity lock"
                        checked={kitchenNoLock}
                        onChange={setKitchenNoLock}
                      />
                      <Toggle
                        label="Require PIN for discounts"
                        checked={security.requirePinForDiscount}
                        onChange={(v) =>
                          setSecurity((s) => ({
                            ...s,
                            requirePinForDiscount: v,
                          }))
                        }
                      />
                    </div>
                    <SectionSave
                      busy={busy}
                      label="Save security policy"
                      onSave={() =>
                        void saveKeys(
                          [
                            ['pinLockout', pinLockout],
                            ['inactivityLockMinutes', inactivityLockMinutes],
                            ['kitchenNoLock', kitchenNoLock],
                            ['security', security],
                          ],
                          'Security',
                        )
                      }
                    />
                  </div>
                ) : null}

                <Button
                  variant="outline"
                  className="mt-6"
                  onClick={() => void logout()}
                >
                  Log out
                </Button>
              </Panel>
            ) : null}

            {section === 'about' ? (
              <Panel>
                <h2 className="mb-1 font-display text-lg font-bold">About</h2>
                <p className="mt-2 text-sm text-muted">
                  Fajara Restaurant Services — staff PWA & guest QR menu.
                </p>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>
                    Restaurant:{' '}
                    <strong>
                      {String(
                        settings?.restaurantName ?? identity.restaurantName,
                      )}
                    </strong>
                  </li>
                  <li>
                    Currency: <strong>{identity.currency}</strong>
                  </li>
                  <li>
                    Timezone: <strong>{identity.timezone}</strong>
                  </li>
                  <li>
                    Build: Phase 1
                  </li>
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </StaffShell>
  );
}
