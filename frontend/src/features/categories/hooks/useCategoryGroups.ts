import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { categoryGroupsApi } from '../api/categoryGroupsApi';
import { getErrorMessage } from '@/utils/getErrorMessage';

const GROUPS_KEY = ['category-groups'] as const;
const CATEGORIES_KEY = ['categories'] as const;

export function useCategoryGroupsQuery() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: categoryGroupsApi.getAll,
    staleTime: 60_000,
  });
}

export function useCreateCategoryGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => categoryGroupsApi.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      toast.success('Group added');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// Renaming or deleting a group rewrites the groupName on its categories too.
export function useUpdateCategoryGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; name: string }) => categoryGroupsApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast.success('Group renamed');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteCategoryGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryGroupsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast.success('Group deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
