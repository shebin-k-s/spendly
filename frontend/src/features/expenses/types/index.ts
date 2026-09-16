import type { Category } from '@/features/categories/types';

export interface Expense {
  id: string;
  amount: number;
  cashback?: number;
  description: string;
  date: string;
  time?: string | null;
  note?: string;
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

export interface CategoryMonthlyTotal {
  year: number;
  month: number;
  total: number;
  cashbackTotal: number;
  count: number;
}

export interface CategorySpend {
  category: Category;
  start: string;
  end: string;
  total: number;
  cashbackTotal: number;
  count: number;
  monthly: CategoryMonthlyTotal[];
  expenses: Expense[];
}

export type CategorySpendRange = { year: number } | { start: string; end: string };

export interface SpikeDay {
  date: string;
  dayLabel: string;
  net: number;
  spikeMultiple: number;
  topDescriptions: string[];
}

export interface MonthAnalysis {
  points: string[];
  cached: boolean;
  generatedAt: string;
  spikeDays: SpikeDay[];
}

