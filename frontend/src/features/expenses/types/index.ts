import type { Category } from '@/features/categories/types';

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'other';

export interface Expense {
  id: string;
  amount: number;
  cashback?: number;
  description: string;
  date: string;
  time?: string | null;
  note?: string;
  paymentMethod: PaymentMethod;
  category?: Category;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpensePayload {
  amount: number;
  cashback?: number;
  description: string;
  date: string;
  time?: string | null;
  note?: string;
  paymentMethod: PaymentMethod;
  categoryId?: string;
}

export interface UpdateExpensePayload extends Partial<CreateExpensePayload> {
  id: string;
}

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  cashbackTotal: number;
  count: number;
}

export interface MonthlySummary {
  year: number;
  month: number;
  total: number;
  cashbackTotal: number;
  count: number;
  breakdown: CategoryBreakdown[];
}

export interface MonthlyAnalytic {
  year: number;
  month: number;
  total: number;
  cashbackTotal?: number;
  count: number;
}

