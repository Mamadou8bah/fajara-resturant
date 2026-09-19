'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterSelect,
  KpiCard,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import {
  DATE_RANGE_PRESETS,
  dateRangeForPreset,
  daysAgoIso,
  formatDisplayDateTime,
  formatGmd,
  todayIso,
  type DateRangePresetId,
} from '@/lib/money';
import {
  ACTIVITY_FILTER_OPTIONS,
  humanizeActivityAction,
  humanizeActivityDescription,
  humanizeRole,
} from '@/lib/humanize';
import { Can, useCan } from '@/lib/rbac';
import { matchesQuery } from '@/lib/search';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import {
  downloadActivityCsv,
  downloadSalesCsv,
  fetchActivity,
  fetchCashierSummary,
  fetchEndOfDay,
  fetchMargins,
  fetchSalesHistory,
  fetchSalesTrend,
  fetchYieldVariance,
  type ActivityItem,
  type CashierSummary,
  type EndOfDayReport,
  type MarginsReport,
  type SalesHistoryItem,
  type SalesTrend,
  type YieldVarianceReport,
} from './api';

type Tab = 'overview' | 'sales' | 'eod' | 'margins' | 'yield' | 'activity';

const CHART = {
  cta: '#C0613D',
  ready: '#2F7D63',
  warn: '#D39A2D',
  ink: '#33271B',
  muted: '#8A7355',
  grid: '#E0D5C4',
  fill: '#F6E4DC',
  cream: '#F3ECE0',
  methods: ['#C0613D', '#2F7D63', '#D39A2D', '#E07A2F', '#5F7186', '#8A7355'],
};

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel = 'Sales',
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
  valueLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#E0D5C4] bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-0.5 text-muted" style={{ color: p.color }}>
          {p.name ?? valueLabel}:{' '}
          <span className="font-semibold text-ink">
            {typeof p.value === 'number' && (p.name === 'Orders' || p.name === 'Qty')
              ? p.value
              : formatGmd(Number(p.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

function PercentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { revenue?: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-xl border border-[#E0D5C4] bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-ink">{label}</p>
      <p className="mt-0.5 text-muted">
        Margin:{' '}
        <span className="font-semibold text-ink">
          {Number(row.value ?? 0).toFixed(1)}%
        </span>
      </p>
      {row.payload?.revenue != null ? (
        <p className="text-muted">
          Revenue:{' '}
          <span className="font-semibold text-ink">
            {formatGmd(row.payload.revenue)}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function ReportsScreen({
  initialTab,
}: {
  initialTab?: Tab;
} = {}) {
  const { can } = useCan();
  const canFullReports = can('reports.view');
  const [tab, setTab] = useState<Tab>(
    initialTab ?? (can('reports.view') ? 'overview' : 'sales'),
  );
  const [from, setFrom] = useState(daysAgoIso(6));
  const [to, setTo] = useState(todayIso());
  const [rangePreset, setRangePresetId] = useState<DateRangePresetId | 'custom'>(
    'last_7',
  );
  const [eodDate, setEodDate] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [salesMine, setSalesMine] = useState(!can('reports.view'));
  const [activityQuery, setActivityQuery] = useState('');
  const [actionType, setActionType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [sales, setSales] = useState<SalesHistoryItem[]>([]);
  const [trend, setTrend] = useState<SalesTrend | null>(null);
  const [eod, setEod] = useState<EndOfDayReport | null>(null);
  const [margins, setMargins] = useState<MarginsReport | null>(null);
  const [cashierSummary, setCashierSummary] = useState<CashierSummary | null>(
    null,
  );
  const [yieldReport, setYieldReport] = useState<YieldVarianceReport | null>(
    null,
  );
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      if (tab === 'overview') {
        if (canFullReports) {
          const [tr, eodToday, m] = await Promise.all([
            fetchSalesTrend(from, to),
            fetchEndOfDay(to),
            fetchMargins(from, to).catch(() => null),
          ]);
          setTrend(tr);
          setEod(eodToday);
          setMargins(m);
          setCashierSummary(null);
        } else {
          const [summary, mineSales] = await Promise.all([
            fetchCashierSummary({ from, to, mine: true }),
            fetchSalesHistory({ from, to, mine: true, pageSize: 12 }),
          ]);
          setCashierSummary(summary);
          setSales(mineSales.items);
          setTrend(null);
          setEod(null);
          setMargins(null);
        }
      } else if (tab === 'sales') {
        const mine = salesMine || !canFullReports;
        const res = await fetchSalesHistory({
          from,
          to,
          search: search || undefined,
          method: paymentMethod || undefined,
          mine,
          pageSize: 50,
        });
        setSales(res.items);
        setCashierSummary(
          await fetchCashierSummary({
            from,
            to,
            mine,
          }),
        );
      } else if (tab === 'eod') {
        setEod(await fetchEndOfDay(eodDate));
      } else if (tab === 'margins') {
        setMargins(await fetchMargins(from, to));
      } else if (tab === 'yield') {
        setYieldReport(await fetchYieldVariance(from, to));
      } else {
        const res = await fetchActivity({
          from,
          to,
          actionType: actionType || undefined,
          pageSize: 80,
        });
        setActivity(res.items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [
    tab,
    from,
    to,
    eodDate,
    search,
    paymentMethod,
    actionType,
    canFullReports,
    salesMine,
  ]);

  const visibleActivity = useMemo(
    () =>
      activity.filter((a) =>
        matchesQuery(
          activityQuery,
          humanizeActivityAction(a.actionType),
          humanizeActivityDescription(a.description),
          a.actionType,
          a.description,
          a.actor?.fullName,
          a.actor?.role ? humanizeRole(a.actor.role) : '',
        ),
      ),
    [activity, activityQuery],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useStaffRealtimeRefresh(() => {
    void load({ quiet: true });
  });

  async function onExport(kind: 'sales' | 'activity') {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'sales') await downloadSalesCsv(from, to);
      else await downloadActivityCsv(from, to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  const salesSeries = useMemo(
    () =>
      (trend?.series ?? []).map((d) => ({
        ...d,
        label: d.date.slice(5),
      })),
    [trend],
  );

  const paymentBars = useMemo(() => {
    const methods = eod?.paymentMethods ?? {};
    const total = Object.values(methods).reduce((s, n) => s + n, 0) || 1;
    return Object.entries(methods)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: Math.round((amount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [eod]);

  const categoryBars = useMemo(
    () =>
      (margins?.categories ?? [])
        .map((c) => ({
          name: c.categoryName ?? 'Uncategorised',
          margin: c.theoreticalMarginPercent,
          revenue: c.revenue,
        }))
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 8),
    [margins],
  );

  const topDishes = useMemo(
    () =>
      [...(margins?.dishes ?? [])]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [margins],
  );

  const weakDishes = useMemo(
    () =>
      [...(margins?.dishes ?? [])]
        .filter((d) => d.qty > 0)
        .sort((a, b) => a.revenue - b.revenue)
        .slice(0, 5),
    [margins],
  );

  const tabs: {
    id: Tab;
    label: string;
    anyOf: ('reports.view' | 'sales_history.view' | 'activity_log.view')[];
  }[] = [
    { id: 'overview', label: 'Overview', anyOf: ['reports.view', 'sales_history.view'] },
    { id: 'sales', label: 'Sales history', anyOf: ['sales_history.view'] },
    { id: 'eod', label: 'End of day', anyOf: ['reports.view'] },
    { id: 'margins', label: 'Margins', anyOf: ['reports.view'] },
    { id: 'yield', label: 'Yield', anyOf: ['reports.view'] },
    { id: 'activity', label: 'Activity', anyOf: ['activity_log.view'] },
  ];

  function applyRangePreset(id: DateRangePresetId) {
    const range = dateRangeForPreset(id);
    setRangePresetId(id);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <StaffShell
      title={
        initialTab === 'sales'
          ? 'Sales'
          : initialTab === 'activity'
            ? 'Activity'
            : 'Reports'
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {tab !== 'eod' ? (
          <>
            <div className="chip-scroll">
              {DATE_RANGE_PRESETS.map((p) => {
                const active = rangePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-cta text-cream'
                        : 'bg-[#EDE6DA] text-ink'
                    }`}
                    onClick={() => applyRangePreset(p.id)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                type="date"
                className="input-field min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none"
                value={from}
                onChange={(e) => {
                  setRangePresetId('custom');
                  setFrom(e.target.value);
                }}
              />
              <input
                type="date"
                className="input-field min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none"
                value={to}
                onChange={(e) => {
                  setRangePresetId('custom');
                  setTo(e.target.value);
                }}
              />
              <Button className="shrink-0" onClick={() => void load()}>
                Apply
              </Button>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="date"
              className="input-field min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none"
              value={eodDate}
              onChange={(e) => setEodDate(e.target.value)}
            />
            <Button className="shrink-0" onClick={() => void load()}>
              Apply
            </Button>
          </div>
        )}
      </div>

      {initialTab !== 'activity' && initialTab !== 'sales' ? (
      <div className="mb-4 chip-scroll">
        {tabs.map((t) => (
          <Can key={t.id} anyOf={t.anyOf}>
            <button
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                tab === t.id ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
              }`}
            >
              {t.label}
            </button>
          </Can>
        ))}
      </div>
      ) : null}

      {initialTab === 'activity' ? (
        <p className="mb-4 text-sm text-muted">
          What the team did — payments, tables, menu changes, and more
        </p>
      ) : null}

      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

      {loading ? (
        <LoadingBlock label="Loading report…" />
      ) : tab === 'overview' ? (
        <Can
          anyOf={['reports.view', 'sales_history.view']}
          fallback={<EmptyState title="No access to reports" />}
        >
          {!canFullReports && cashierSummary ? (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">My payments</h2>
                <p className="text-sm text-muted">
                  Payments you processed from {from} to {to}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="My sales"
                  value={formatGmd(cashierSummary.net)}
                  hint={`${cashierSummary.transactionCount} payments`}
                />
                <KpiCard
                  label="Tips"
                  value={formatGmd(cashierSummary.tips)}
                  hint={`AOV ${formatGmd(cashierSummary.aov)}`}
                />
                <KpiCard
                  label="Discounts"
                  value={formatGmd(cashierSummary.discounts)}
                />
                <KpiCard
                  label="Refunds"
                  value={formatGmd(cashierSummary.refunds)}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    By payment method
                  </h2>
                  {Object.keys(cashierSummary.byMethod).length === 0 ? (
                    <EmptyState title="No payments in range" />
                  ) : (
                    <ul className="space-y-2">
                      {Object.entries(cashierSummary.byMethod).map(
                        ([method, v]) => (
                          <li
                            key={method}
                            className="flex items-center justify-between rounded-xl bg-[#EDE6DA]/70 px-3 py-2.5 text-sm"
                          >
                            <span className="font-semibold">{method}</span>
                            <span className="text-muted">
                              {v.count} · {formatGmd(v.amount)}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Recent tickets
                  </h2>
                  {sales.length === 0 ? (
                    <EmptyState title="No tickets yet" />
                  ) : (
                    <ul className="divide-y divide-[#E0D5C4]">
                      {sales.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center justify-between gap-2 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {row.transactionNumber}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {row.session?.table
                                ? `T${row.session.table.number}`
                                : '—'}{' '}
                              · {formatDisplayDateTime(row.createdAt)}
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold">
                            {formatGmd(row.total)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Sales in range"
                value={formatGmd(trend?.totalSales ?? 0)}
                hint={`${salesSeries.reduce((s, d) => s + d.count, 0)} orders`}
              />
              <KpiCard
                label="Today gross"
                value={formatGmd(eod?.gross ?? 0)}
                hint={`${eod?.orderCount ?? 0} orders today`}
              />
              <KpiCard
                label="Today AOV"
                value={formatGmd(eod?.aov ?? 0)}
                hint="Average order value"
              />
              <KpiCard
                label="Today net"
                value={formatGmd(eod?.net ?? 0)}
                hint={`Tips ${formatGmd(eod?.tips ?? 0)}`}
                tone="up"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-5">
              <Panel className="xl:col-span-3">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl font-bold">Sales trend</h2>
                    <p className="text-sm text-muted">
                      Daily sales from {from} to {to}
                    </p>
                  </div>
                </div>
                {salesSeries.length === 0 ? (
                  <EmptyState title="No sales in this range" />
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={salesSeries}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="reportSalesFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={CHART.cta}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor={CHART.cta}
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke={CHART.grid}
                          vertical={false}
                          strokeDasharray="4 6"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: CHART.muted, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: CHART.muted, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={56}
                          tickFormatter={(v) =>
                            v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)
                          }
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          name="Sales"
                          stroke={CHART.cta}
                          fill="url(#reportSalesFill)"
                          strokeWidth={3}
                          activeDot={{ r: 5, fill: CHART.cta }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              <Panel className="xl:col-span-2">
                <h2 className="mb-1 font-display text-xl font-bold">
                  Payments today
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Share of tender methods for {to}
                </p>
                {paymentBars.length === 0 ? (
                  <EmptyState title="No payments today" />
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={paymentBars}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid
                          stroke={CHART.grid}
                          horizontal={false}
                          strokeDasharray="4 6"
                        />
                        <XAxis
                          type="number"
                          tick={{ fill: CHART.muted, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) =>
                            v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={96}
                          tick={{ fill: CHART.ink, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip valueLabel="Amount" />} />
                        <Bar dataKey="amount" name="Amount" radius={[0, 10, 10, 0]} barSize={18}>
                          {paymentBars.map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART.methods[i % CHART.methods.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <h2 className="mb-1 font-display text-xl font-bold">
                  Margin by category
                </h2>
                <p className="mb-4 text-sm text-muted">
                  Theoretical margin % for the selected range
                </p>
                {categoryBars.length === 0 ? (
                  <EmptyState title="No margin data yet" />
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={categoryBars}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid
                          stroke={CHART.grid}
                          horizontal={false}
                          strokeDasharray="4 6"
                        />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={{ fill: CHART.muted, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          tick={{ fill: CHART.ink, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<PercentTooltip />} />
                        <Bar
                          dataKey="margin"
                          name="Margin %"
                          fill={CHART.ready}
                          radius={[0, 10, 10, 0]}
                          barSize={16}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Best sellers
                  </h2>
                  {topDishes.length === 0 ? (
                    <p className="text-sm text-muted">No dish sales yet</p>
                  ) : (
                    <ul className="space-y-3">
                      {topDishes.map((d, i) => {
                        const max = topDishes[0]?.revenue || 1;
                        return (
                          <li key={d.menuItemId}>
                            <div className="mb-1 flex justify-between gap-2 text-sm">
                              <span className="font-semibold">
                                {i + 1}. {d.name}
                              </span>
                              <span className="text-muted">
                                {formatGmd(d.revenue)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#EDE6DA]">
                              <div
                                className="h-full rounded-full bg-cta"
                                style={{
                                  width: `${Math.max(8, (d.revenue / max) * 100)}%`,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Needs a push
                  </h2>
                  {weakDishes.length === 0 ? (
                    <p className="text-sm text-muted">No dish sales yet</p>
                  ) : (
                    <ul className="space-y-3">
                      {weakDishes.map((d) => {
                        const max = topDishes[0]?.revenue || weakDishes.at(-1)?.revenue || 1;
                        return (
                          <li key={d.menuItemId}>
                            <div className="mb-1 flex justify-between gap-2 text-sm">
                              <span className="font-semibold">{d.name}</span>
                              <span className="text-muted">
                                {d.qty} sold · {formatGmd(d.revenue)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#EDE6DA]">
                              <div
                                className="h-full rounded-full bg-warn"
                                style={{
                                  width: `${Math.max(8, (d.revenue / max) * 100)}%`,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </div>
          )}
        </Can>
      ) : tab === 'sales' ? (
        <Can
          permission="sales_history.view"
          fallback={<EmptyState title="No access to sales history" />}
        >
          {cashierSummary ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={salesMine || !canFullReports ? 'My sales' : 'Sales'}
                value={formatGmd(cashierSummary.net)}
                hint={`${cashierSummary.transactionCount} payments`}
              />
              <KpiCard label="Tips" value={formatGmd(cashierSummary.tips)} />
              <KpiCard
                label="Discounts"
                value={formatGmd(cashierSummary.discounts)}
              />
              <KpiCard
                label="Refunds"
                value={formatGmd(cashierSummary.refunds)}
              />
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {canFullReports ? (
              <div className="flex rounded-full border border-[#D4C4B0] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setSalesMine(true)}
                  className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${
                    salesMine ? 'bg-cta text-cream' : 'text-muted'
                  }`}
                >
                  My payments
                </button>
                <button
                  type="button"
                  onClick={() => setSalesMine(false)}
                  className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${
                    !salesMine ? 'bg-cta text-cream' : 'text-muted'
                  }`}
                >
                  All cashiers
                </button>
              </div>
            ) : null}
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search tickets"
              className="max-w-xs"
              onSubmit={() => void load()}
            />
            <FilterSelect
              value={paymentMethod}
              onChange={setPaymentMethod}
              placeholder="All payment methods"
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Mobile Money', label: 'Mobile Money' },
                { value: 'Card', label: 'Card' },
                { value: 'Afrimoney', label: 'Afrimoney' },
                { value: 'Bank Transfer', label: 'Bank Transfer' },
              ]}
            />
            <Button variant="outline" onClick={() => void load()}>
              Apply
            </Button>
            <Can permission="reports.view">
              <Button disabled={busy} onClick={() => void onExport('sales')}>
                Download CSV
              </Button>
            </Can>
          </div>
          {sales.length === 0 ? (
            <EmptyState title="No sales in range" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E0D5C4] bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[#E0D5C4] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Cashier</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((row) => (
                    <tr key={row.id} className="border-b border-[#EDE6DA]">
                      <td className="px-4 py-3 font-medium">
                        {row.transactionNumber}
                      </td>
                      <td className="px-4 py-3">
                        {row.session?.table
                          ? `T${row.session.table.number}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {(row.payments ?? [])
                          .map((p) => p.method)
                          .join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.cashier?.fullName ?? '—'}
                      </td>
                      <td className="px-4 py-3">{formatGmd(row.total)}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatDisplayDateTime(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Can>
      ) : tab === 'eod' ? (
        <Can
          permission="reports.view"
          fallback={<EmptyState title="No access to EOD" />}
        >
          {!eod ? (
            <EmptyState title="No EOD data" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Gross" value={formatGmd(eod.gross)} />
                <KpiCard label="Net" value={formatGmd(eod.net)} tone="up" />
                <KpiCard label="Orders" value={String(eod.orderCount)} />
                <KpiCard label="AOV" value={formatGmd(eod.aov)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Adjustments
                  </h2>
                  <ul className="space-y-2 text-sm">
                    {(
                      [
                        ['Discounts', eod.discounts],
                        ['Comps', eod.comps],
                        ['Tax', eod.tax],
                        ['Tips', eod.tips],
                        ['Refunds', eod.refunds],
                        ['Voids', eod.voids],
                      ] as const
                    ).map(([label, value]) => (
                      <li key={label} className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-semibold">{formatGmd(value)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Payment methods
                  </h2>
                  {paymentBars.length === 0 ? (
                    <p className="text-sm text-muted">No payments</p>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={paymentBars} layout="vertical">
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={90}
                            tick={{ fontSize: 12, fill: CHART.ink }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<ChartTooltip valueLabel="Amount" />} />
                          <Bar dataKey="amount" radius={[0, 8, 8, 0]} barSize={14}>
                            {paymentBars.map((_, i) => (
                              <Cell
                                key={i}
                                fill={CHART.methods[i % CHART.methods.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Panel>
              </div>
              <Panel>
                <h2 className="mb-3 font-display text-lg font-bold">Tills</h2>
                {eod.tills.length === 0 ? (
                  <p className="text-sm text-muted">No till sessions</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {eod.tills.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-[#EDE6DA] py-2"
                      >
                        <span>{t.cashier?.fullName ?? 'Till'}</span>
                        <span>
                          Variance{' '}
                          {t.variance != null ? formatGmd(t.variance) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </Can>
      ) : tab === 'margins' ? (
        <Can
          permission="reports.view"
          fallback={<EmptyState title="No access to margins" />}
        >
          {!margins || margins.dishes.length === 0 ? (
            <EmptyState title="No margin data" body={margins?.note} />
          ) : (
            <div className="space-y-4">
              {margins.note ? (
                <p className="text-sm text-muted">{margins.note}</p>
              ) : null}
              {categoryBars.length > 0 ? (
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Category margins
                  </h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryBars} layout="vertical">
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fontSize: 11, fill: CHART.muted }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={100}
                          tick={{ fontSize: 12, fill: CHART.ink }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<PercentTooltip />} />
                        <Bar
                          dataKey="margin"
                          fill={CHART.ready}
                          radius={[0, 8, 8, 0]}
                          barSize={14}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              ) : null}
              <div className="overflow-x-auto rounded-2xl border border-[#E0D5C4] bg-white">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-[#E0D5C4] text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Dish</th>
                      <th className="px-4 py-3">Qty</th>
                      <th className="px-4 py-3">Revenue</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margins.dishes.map((d) => (
                      <tr key={d.menuItemId} className="border-b border-[#EDE6DA]">
                        <td className="px-4 py-3 font-medium">{d.name}</td>
                        <td className="px-4 py-3">{d.qty}</td>
                        <td className="px-4 py-3">{formatGmd(d.revenue)}</td>
                        <td className="px-4 py-3">
                          {formatGmd(d.theoreticalCost)}
                          {d.incompleteCost ? (
                            <span className="ml-1 text-xs text-warn">*</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {formatGmd(d.theoreticalMargin)} (
                          {d.theoreticalMarginPercent.toFixed(1)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Can>
      ) : tab === 'yield' ? (
        <Can
          permission="reports.view"
          fallback={<EmptyState title="No access to yield reports" />}
        >
          {!yieldReport || yieldReport.batches.length === 0 ? (
            <EmptyState title="No production batches in range" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Batches"
                  value={String(yieldReport.summary.batchCount)}
                />
                <KpiCard
                  label="Expected"
                  value={String(yieldReport.summary.totalExpected)}
                />
                <KpiCard
                  label="Actual"
                  value={String(yieldReport.summary.totalActual)}
                />
                <KpiCard
                  label="Variance"
                  value={`${yieldReport.summary.totalVariance >= 0 ? '+' : ''}${yieldReport.summary.totalVariance}${
                    yieldReport.summary.totalVariancePercent != null
                      ? ` (${yieldReport.summary.totalVariancePercent}%)`
                      : ''
                  }`}
                />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[#E0D5C4] bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[#E0D5C4] text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Recipe</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Expected</th>
                      <th className="px-4 py-3">Actual</th>
                      <th className="px-4 py-3">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yieldReport.batches.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-[#EDE6DA] last:border-0"
                      >
                        <td className="px-4 py-3 text-muted">
                          {formatDisplayDateTime(b.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {b.recipeName}
                          <span className="mt-0.5 block text-xs font-normal text-muted">
                            {b.outputItemName}
                          </span>
                        </td>
                        <td className="px-4 py-3">{b.batchSizeLabel}</td>
                        <td className="px-4 py-3">
                          {b.expectedYield} {b.unit}
                        </td>
                        <td className="px-4 py-3">
                          {b.actualYield} {b.unit}
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${
                            b.variance < 0
                              ? 'text-cta'
                              : b.variance > 0
                                ? 'text-ready'
                                : ''
                          }`}
                        >
                          {b.variance >= 0 ? '+' : ''}
                          {b.variance}
                          {b.variancePercent != null
                            ? ` (${b.variancePercent}%)`
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Can>
      ) : (
        <Can
          permission="activity_log.view"
          fallback={<EmptyState title="No access to team activity" />}
        >
          <div className="mb-3 flex flex-col gap-2">
            <SearchField
              value={activityQuery}
              onChange={setActivityQuery}
              placeholder="Search what happened…"
              className="min-w-0 w-full sm:max-w-xs"
            />
            <div className="chip-scroll">
              <FilterSelect
                value={actionType}
                onChange={setActionType}
                placeholder="All events"
                options={ACTIVITY_FILTER_OPTIONS}
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => void load()}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={busy}
                onClick={() => void onExport('activity')}
              >
                Download CSV
              </Button>
            </div>
          </div>
          {visibleActivity.length === 0 ? (
            <EmptyState
              title="Nothing to show"
              body="Try a wider date range or clear the filters."
            />
          ) : (
            <ul className="divide-y divide-[#E0D5C4] overflow-hidden rounded-2xl border border-[#E0D5C4] bg-white">
              {visibleActivity.map((a) => (
                <li
                  key={a.id}
                  className="flex min-h-[72px] items-start justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {humanizeActivityAction(a.actionType)}
                    </p>
                    <p className="mt-0.5 text-sm text-ink">
                      {humanizeActivityDescription(a.description)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {a.actor?.fullName ?? 'System'}
                      {a.actor?.role
                        ? ` · ${humanizeRole(a.actor.role)}`
                        : ''}
                    </p>
                  </div>
                  <p className="shrink-0 pt-0.5 text-right text-[11px] text-muted">
                    {formatDisplayDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Can>
      )}
    </StaffShell>
  );
}
