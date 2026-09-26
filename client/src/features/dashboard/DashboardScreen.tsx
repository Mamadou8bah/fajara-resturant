'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  KpiCard,
  LoadingBlock,
  Panel,
} from '@/components/ui';
import {
  DATE_RANGE_PRESETS,
  dateRangeForPreset,
  formatGmd,
  todayIso,
  type DateRangePresetId,
} from '@/lib/money';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import {
  fetchDashboard,
  fetchSalesTrend,
  type DashboardData,
  type SalesTrend,
} from './api';

export function DashboardScreen() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [preset, setPreset] = useState<DateRangePresetId | 'custom'>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [trend, setTrend] = useState<SalesTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(f = from, t = to, opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const [d, tr] = await Promise.all([
        fetchDashboard(f, t),
        fetchSalesTrend(f, t),
      ]);
      setData(d);
      setTrend(tr);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }

  function applyPreset(id: DateRangePresetId) {
    const range = dateRangeForPreset(id);
    setPreset(id);
    setFrom(range.from);
    setTo(range.to);
    void load(range.from, range.to);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useStaffRealtimeRefresh(() => {
    void load(from, to, { quiet: true });
  });

  const hourChart = useMemo(
    () =>
      (data?.salesByHour ?? []).map((h) => ({
        label: `${String(h.hour).padStart(2, '0')}:00`,
        sales: h.sales,
        orders: h.count,
      })),
    [data],
  );

  const topDishesChart = useMemo(
    () =>
      (data?.topDishes ?? []).slice(0, 5).map((d) => ({
        name: d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name,
        fullName: d.name,
        qty: d.qty,
      })),
    [data],
  );

  const pipelineTotal = useMemo(
    () =>
      Object.values(data?.pipeline ?? {}).reduce((s, n) => s + n, 0) || 1,
    [data],
  );

  return (
    <StaffShell title="Dashboard">
      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

      <div className="mb-4 chip-scroll items-center gap-2">
        {DATE_RANGE_PRESETS.map((p) => {
          const active = preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-cta text-cream'
                  : 'bg-[#EDE6DA] text-ink active:scale-[0.98]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <input
          type="date"
          className="input-field h-10 min-h-0 min-w-0 w-[9.5rem] shrink-0 text-sm sm:w-[10.5rem]"
          value={from}
          onChange={(e) => {
            setPreset('custom');
            setFrom(e.target.value);
          }}
        />
        <input
          type="date"
          className="input-field h-10 min-h-0 min-w-0 w-[9.5rem] shrink-0 text-sm sm:w-[10.5rem]"
          value={to}
          onChange={(e) => {
            setPreset('custom');
            setTo(e.target.value);
          }}
        />
        <Button
          className="h-10 min-h-0 shrink-0 px-4"
          onClick={() => load(from, to)}
        >
          Apply
        </Button>
      </div>

      {loading || !data ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total revenue"
              value={formatGmd(data.sales)}
              hint={`${data.orderCount} settled tickets`}
              tone="up"
            />
            <KpiCard
              label="Orders"
              value={String(data.orderCount)}
              hint={`${data.openOrders} open in pipeline`}
            />
            <KpiCard
              label="Occupancy"
              value={`${data.occupancy.occupancyPercent}%`}
              hint={`${data.occupancy.occupied}/${data.occupancy.totalTables} tables`}
              tone="warn"
            />
            <KpiCard
              label="Avg ticket"
              value={formatGmd(data.aov)}
              hint={`Open sessions ${data.openSessions}`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">
                  Revenue by hour
                </h2>
                <p className="text-xs text-muted">
                  Trend total {formatGmd(trend?.totalSales ?? 0)}
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourChart}>
                    <CartesianGrid stroke="#E0D5C4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#C0613D"
                      fill="#F6E4DC"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                Order pipeline
              </h2>
              <ul className="space-y-3">
                {Object.entries(data.pipeline).length === 0 ? (
                  <li className="text-sm text-muted">No open orders</li>
                ) : (
                  Object.entries(data.pipeline).map(([status, count]) => (
                    <li key={status}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="capitalize text-ink">{status}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#E8DFD0]">
                        <div
                          className="h-full rounded-full bg-cta"
                          style={{
                            width: `${Math.round((count / pipelineTotal) * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                Top dishes
              </h2>
              {topDishesChart.length === 0 ? (
                <EmptyState title="No sales yet" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topDishesChart}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#E0D5C4" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={96}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => [value, 'Qty']}
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { fullName?: string } | undefined)
                            ?.fullName ?? ''
                        }
                      />
                      <Bar
                        dataKey="qty"
                        name="Qty"
                        fill="#C0613D"
                        radius={[0, 8, 8, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-lg font-bold">
                Specials & stock
              </h2>
              <div className="space-y-3">
                {data.specials.slice(0, 3).map((s) => (
                  <div key={s.id} className="text-sm">
                    <p className="font-semibold">
                      {s.menuItem?.name ?? 'Special'}
                    </p>
                    <p className="text-xs text-muted">
                      {s.type}
                      {s.quantityRemaining != null
                        ? ` · ${s.quantityRemaining} left`
                        : ''}
                    </p>
                  </div>
                ))}
                {data.lowStock.slice(0, 3).map((i) => (
                  <div key={i.id} className="text-sm text-cta">
                    Low: {i.name} ({i.currentStock} {i.baseUnit})
                  </div>
                ))}
                {data.specials.length === 0 && data.lowStock.length === 0 ? (
                  <p className="text-sm text-muted">All clear</p>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-bold">
                  Payroll this month
                </h2>
                <Link
                  href="/app/employees"
                  className="text-xs font-semibold text-cta"
                >
                  Resolve in Employees →
                </Link>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[#EDE6DA] p-3">
                  <p className="text-xs text-muted">Outstanding</p>
                  <p className="font-display text-xl font-bold">
                    {formatGmd(data.payrollSummary.amountDue)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#EDE6DA] p-3">
                  <p className="text-xs text-muted">Staff unpaid</p>
                  <p className="font-display text-xl font-bold">
                    {data.payrollSummary.openCount}
                  </p>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">Today&apos;s roster</h3>
                <Link
                  href="/app/shifts"
                  className="text-xs font-semibold text-cta"
                >
                  View full schedule →
                </Link>
              </div>
              <ul className="max-h-48 space-y-2 overflow-auto text-sm">
                {data.roster.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate font-medium">
                      {r.employee.fullName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {r.startTime}–{r.endTime}
                    </span>
                  </li>
                ))}
                {data.roster.length === 0 ? (
                  <li className="text-muted">No shifts this week</li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
