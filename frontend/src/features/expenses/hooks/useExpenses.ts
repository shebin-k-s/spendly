import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from '../api/expensesApi';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { monthLabel } from '@/lib/utils';
import type { CreateExpensePayload, UpdateExpensePayload, CategorySpendRange } from '../types';

const EXPENSES_KEY = ['expenses'] as const;
const SUMMARY_KEY = ['expenses', 'summary'] as const;
const ANALYTICS_KEY = ['expenses', 'analytics'] as const;
const CATEGORY_SPEND_KEY = ['expenses', 'by-category'] as const;

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

function categorySpendKey(categoryId: string, range: CategorySpendRange) {
  const rangeKey = 'year' in range ? ['year', range.year] : ['range', range.start, range.end];
  return [...CATEGORY_SPEND_KEY, categoryId, ...rangeKey] as const;
}

export function useCategorySpend(categoryId: string, range: CategorySpendRange, enabled = true) {
  return useQuery({
    queryKey: categorySpendKey(categoryId, range),
    queryFn: () => expensesApi.getCategorySpend(categoryId, range),
    enabled: !!categoryId && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

// Lets the category-yearly page warm the cache for a year before the user
// actually navigates to it (e.g. neighbouring years), so switching feels instant.
export function usePrefetchCategorySpend() {
  const qc = useQueryClient();
  return (categoryId: string, range: CategorySpendRange) => {
    qc.prefetchQuery({
      queryKey: categorySpendKey(categoryId, range),
      queryFn: () => expensesApi.getCategorySpend(categoryId, range),
      staleTime: 30_000,
    });
  };
}

const ANALYSIS_KEY = ['expenses', 'analyze'] as const;

// enabled: false — this must only ever run when the user taps "Analyze"
// (via refetch()), never automatically on mount, since a cache miss on the
// backend means a real Gemini call. React Query's own persisted cache means
// a month analyzed in an earlier session shows up instantly on revisit
// without needing any server-side "peek" endpoint.
export function useMonthAnalysis(year: number, month: number) {
  return useQuery({
    queryKey: [...ANALYSIS_KEY, year, month],
    queryFn: () => expensesApi.analyzeMonth(year, month),
    enabled: false,
    retry: false,
  });
}

// A plain refetch() on useMonthAnalysis would just hit the backend's own
// hash cache and silently hand back the exact same points if nothing about
// the month's numbers changed — which reads as "re-analyze does nothing."
// This bypasses that cache for a genuinely fresh AI pass, then overwrites
// the cached query result so the rest of the UI sees it immediately.
//
// year/month are passed to mutate() rather than captured from the caller's
// render — a single mutation instance is shared across renders, so if they
// switch months while a re-analysis is still in flight, closing over
// whatever year/month were current at call time (via `variables` in the
// callbacks) keeps the result going to the month that was actually
// re-analyzed instead of wherever the user has since navigated to.
export function useReanalyzeMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) => expensesApi.analyzeMonth(year, month, true),
    onSuccess: (data, { year, month }) => {
      qc.setQueryData([...ANALYSIS_KEY, year, month], data);
    },
    // Firing re-analyze for one month, then switching and firing it again
    // for another before the first resolves, used to produce an error toast
    // with no indication of which month it was actually for — prefix it.
    onError: (error, { year, month }) => {
      toast.error(`${monthLabel(year, month)}: ${getErrorMessage(error)}`);
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpensePayload) => expensesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSES_KEY });
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
      toast.success('Expense deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

