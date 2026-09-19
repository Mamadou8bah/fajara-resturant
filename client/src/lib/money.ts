export function formatGmd(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return 'D 0.00';
  return `D ${n.toLocaleString('en-GM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** UTC calendar day as YYYY-MM-DD. */
function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Monday-start week (UTC), matching server roster week. */
function startOfUtcWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const daysSinceMon = day === 0 ? 6 : day - 1;
  const mon = new Date(d);
  mon.setUTCDate(mon.getUTCDate() - daysSinceMon);
  return mon;
}

export type DateRangePresetId =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7'
  | 'last_30';

export const DATE_RANGE_PRESETS: {
  id: DateRangePresetId;
  label: string;
}[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_7', label: 'Last 7 days' },
  { id: 'last_30', label: 'Last 30 days' },
];

/** Inclusive from/to ISO dates for dashboard & reports filters. */
export function dateRangeForPreset(
  id: DateRangePresetId,
): { from: string; to: string } {
  const today = utcToday();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  switch (id) {
    case 'today':
      return { from: isoUTC(today), to: isoUTC(today) };
    case 'yesterday': {
      const yd = new Date(today);
      yd.setUTCDate(yd.getUTCDate() - 1);
      return { from: isoUTC(yd), to: isoUTC(yd) };
    }
    case 'this_week': {
      const mon = startOfUtcWeek(today);
      return { from: isoUTC(mon), to: isoUTC(today) };
    }
    case 'last_week': {
      const thisMon = startOfUtcWeek(today);
      const lastMon = new Date(thisMon);
      lastMon.setUTCDate(lastMon.getUTCDate() - 7);
      const lastSun = new Date(thisMon);
      lastSun.setUTCDate(lastSun.getUTCDate() - 1);
      return { from: isoUTC(lastMon), to: isoUTC(lastSun) };
    }
    case 'this_month':
      return {
        from: isoUTC(new Date(Date.UTC(y, m, 1))),
        to: isoUTC(today),
      };
    case 'last_month': {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0));
      return { from: isoUTC(start), to: isoUTC(end) };
    }
    case 'last_7':
      return { from: daysAgoIso(6), to: todayIso() };
    case 'last_30':
      return { from: daysAgoIso(29), to: todayIso() };
  }
}

export function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Display dates as `DD Mon YYYY` (e.g. 15 Sep 2026). */
export function formatDisplayDate(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === '') return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  return `${day} ${mon} ${d.getUTCFullYear()}`;
}

/** Local calendar date as `DD Mon YYYY`. */
export function formatDisplayDateLocal(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === '') return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  return `${day} ${mon} ${d.getFullYear()}`;
}

export function formatDisplayDateTime(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === '') return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatDisplayDateLocal(d)} ${time}`;
}
