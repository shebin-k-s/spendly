import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { merchantRulesApi } from '../api/merchantRulesApi';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { MerchantRulePayload, UpdateMerchantRulePayload } from '../types';

const MERCHANT_RULES_KEY = ['merchant-rules'] as const;

export function useMerchantRulesQuery() {
  return useQuery({
    queryKey: MERCHANT_RULES_KEY,
    queryFn: merchantRulesApi.getAll,
    staleTime: 30_000,
  });
}

export function useCreateMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MerchantRulePayload) => merchantRulesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_RULES_KEY });
      toast.success('Shop added');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useUpdateMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMerchantRulePayload) => merchantRulesApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_RULES_KEY });
      toast.success('Shop updated');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => merchantRulesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_RULES_KEY });
      toast.success('Shop deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
