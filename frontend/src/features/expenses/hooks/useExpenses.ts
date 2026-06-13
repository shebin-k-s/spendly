import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from '../api/expensesApi';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { CreateExpensePayload, UpdateExpensePayload } from '../types';

const EXPENSES_KEY = ['expenses'] as const;
const SUMMARY_KEY = ['expenses', 'summary'] as const;
const ANALYTICS_KEY = ['expenses', 'analytics'] as const;

export function useExpensesQuery(year: number, month: number, categoryId?: string) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, year, month, categoryId],
    queryFn: () => expensesApi.getByMonth(year, month, categoryId),
    staleTime: 30_000,
  });
}

export function useExpenseById(id: string, enabled = true) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, id],
    queryFn: () => expensesApi.getById(id),
    enabled: !!id && enabled,
    staleTime: 30_000,
  });
}

export function useMonthlySummary(year: number, month: number) {
  return useQuery({
    queryKey: [...SUMMARY_KEY, year, month],
    queryFn: () => expensesApi.getMonthlySummary(year, month),
    staleTime: 30_000,
  });
}

export function useAnalytics(months = 6) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, months],
    queryFn: () => expensesApi.getAnalytics(months),
    staleTime: 60_000,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpensePayload) => expensesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSES_KEY });
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS_KEY });
      toast.success('Expense added');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateExpensePayload) => expensesApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSES_KEY });
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS_KEY });
      toast.success('Expense updated');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSES_KEY });
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS_KEY });
      toast.success('Expense deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

