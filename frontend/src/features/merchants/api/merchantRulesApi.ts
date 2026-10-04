import apiClient from '@/lib/apiClient';
import type { MerchantRule, MerchantRulePayload, UpdateMerchantRulePayload } from '../types';

const URL = '/merchant-rules';

export const merchantRulesApi = {
  async getAll(): Promise<MerchantRule[]> {
    const { data } = await apiClient.get<MerchantRule[]>(URL);
    return data;
  },

  async create(payload: MerchantRulePayload): Promise<MerchantRule> {
    const { data } = await apiClient.post<MerchantRule>(URL, payload);
    return data;
  },

  async update({ id, ...payload }: UpdateMerchantRulePayload): Promise<MerchantRule> {
    const { data } = await apiClient.put<MerchantRule>(`${URL}/${id}`, payload);
    return data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${URL}/${id}`);
  },
};
