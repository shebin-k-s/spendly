import { format } from 'date-fns';
import type { Expense, PaymentMethod } from '../types';
import type { Category } from '@/features/categories/types';

export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function groupByDate(expenses: Expense[]): Record<string, Expense[]> {
  return expenses.reduce<Record<string, Expense[]>>((acc, expense) => {
    const key = expense.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(expense);
    return acc;
  }, {});
}

export function netAmount(expense: Expense): number {
  return Number(expense.amount) - Number(expense.cashback || 0);
}

export function totalAmount(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + netAmount(e), 0);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '💵',
  card: '💳',
  upi: '📲',
  bank_transfer: '🏦',
  other: '💰',
};

