import { api } from '@/lib/api';

export type Expense = {
  id: string;
  amount: string | number;
  category: string;
  note: string | null;
  spentAt: string;
  actorId: string;
  createdAt: string;
  actor?: { id: string; fullName: string };
};

export const EXPENSE_CATEGORIES = [
  'Supplies',
  'Utilities',
  'Rent',
  'Transport',
  'Maintenance',
  'Wages',
  'Other',
] as const;

export function fetchExpenses(limit = 100) {
  return api<Expense[]>(`/expenses?limit=${limit}`);
}

export function createExpense(body: {
  amount: number;
  category: string;
  note?: string;
  spentAt: string;
}) {
  return api<Expense>('/expenses', { method: 'POST', body });
}

export function deleteExpense(id: string) {
  return api<{ ok: true }>(`/expenses/${id}`, { method: 'DELETE' });
}
