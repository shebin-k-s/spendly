import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { categoriesApi } from '../api/categoriesApi';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { CreateCategoryPayload, UpdateCategoryPayload } from '../types';

const CATEGORIES_KEY = ['categories'] as const;

export function useCategoriesQuery() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: categoriesApi.getAll,
    staleTime: 60_000,
  });
}

export function useCategoryById(id: string) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, id],
    queryFn: () => categoriesApi.getById(id),
    staleTime: 60_000,
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCategoryPayload) => categoriesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast.success('Category created');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCategoryPayload) => categoriesApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast.success('Category updated');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: (_, id) => {
      qc.setQueryData(CATEGORIES_KEY, (old: any[]) => old?.filter((c) => c.id !== id) ?? []);
      toast.success('Category deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useSeedCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.seedDefaults,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast.success(data.message);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
