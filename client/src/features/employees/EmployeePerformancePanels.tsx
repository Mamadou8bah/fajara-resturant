'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Panel } from '@/components/ui';
import { formatGmd } from '@/lib/money';
import type { EmployeePerformance } from './api';

const CHART = {
  cta: '#C0613D',
  ready: '#2F7D63',
  muted: '#8A7355',
  grid: '#E0D5C4',
};

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#E0D5C4] bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-0.5 text-muted" style={{ color: p.color }}>
          {p.name}:{' '}
          <span className="font-semibold text-ink">
            {p.name === 'Orders'
              ? p.value
              : formatGmd(Number(p.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

export function EmployeePerformancePanels({
  perf,
}: {
  perf: EmployeePerformance;
}) {
  const series = perf.series ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <p className="text-xs uppercase text-muted">Orders</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {perf.orderCount}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Floor sales</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatGmd(perf.attributedSales)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">AOV</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatGmd(perf.averageOrderValue)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Session tips</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatGmd(perf.tips)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Checkouts</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {perf.checkoutCount ?? 0}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Checkout sales</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatGmd(perf.checkoutSales ?? 0)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Checkout tips</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatGmd(perf.checkoutTips ?? 0)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase text-muted">Voids</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {perf.voidCount ?? 0}
          </p>
        </Panel>
      </div>

      {(perf.insights?.length ?? 0) > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {perf.insights.map((ins) => (
            <Panel key={ins.id} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {ins.title}
              </p>
              <p className="mt-1 text-sm text-ink">{ins.detail}</p>
            </Panel>
          ))}
        </div>
      ) : null}

      {series.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-4">
            <h3 className="font-display text-lg font-bold">Daily sales</h3>
            <p className="text-xs text-muted">Floor vs checkout by day</p>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CHART.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d) => String(d).slice(5)}
                  />
                  <YAxis
                    tick={{ fill: CHART.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<Tip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Floor"
                    stroke={CHART.cta}
                    fill={CHART.cta}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="checkout"
                    name="Checkout"
                    stroke={CHART.ready}
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-4">
            <h3 className="font-display text-lg font-bold">Orders per day</h3>
            <p className="text-xs text-muted">Waiter-submitted order volume</p>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CHART.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d) => String(d).slice(5)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: CHART.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip content={<Tip />} />
                  <Bar
                    dataKey="orders"
                    name="Orders"
                    fill={CHART.cta}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
