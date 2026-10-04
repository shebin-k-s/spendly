import type { Category } from '@/features/categories/types';

export interface MerchantRule {
  id: string;
  name: string;
  aliases: string[];
  category: Category;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantRulePayload {
  name: string;
  aliases: string[];
  categoryId: string;
}

export interface UpdateMerchantRulePayload extends MerchantRulePayload {
  id: string;
}
