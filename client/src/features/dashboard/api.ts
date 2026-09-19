import { api } from '@/lib/api';

export type DashboardData = {
  from: string;
  to: string;
  sales: number;
  aov: number;
  orderCount: number;
  openSessions: number;
  openOrders: number;
  occupancy: {
    totalTables: number;
    occupied: number;
    reserved: number;
    free: number;
    needsCleaning: number;
    occupancyPercent: number;
  };
  pipeline: Record<string, number>;
  topDishes: { name: string; qty: number }[];
  lowStock: {
    id: string;
    name: string;
    currentStock: number;
    lowStockThreshold: number;
    baseUnit: string;
  }[];
  specials: {
    id: string;
    type: string;
    menuItem: { id: string; name: string } | null;
    specialPrice: number | null;
    quantityRemaining: number | null;
  }[];
  roster: {
    id: string;
    date: string;
    employee: { id: string; fullName: string; role: string };
    startTime: string;
    endTime: string;
  }[];
  payrollSummary: { openCount: number; amountDue: number };
  salesByHour: { hour: number; sales: number; count: number }[];
};

export type SalesTrend = {
  from: string;
  to: string;
  totalSales: number;
  series: { date: string; sales: number; count: number; aov: number }[];
};

export function fetchDashboard(from: string, to: string) {
  return api<DashboardData>(
    `/reports/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function fetchSalesTrend(from: string, to: string) {
  return api<SalesTrend>(
    `/reports/sales-trend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}
