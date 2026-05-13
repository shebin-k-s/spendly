import apiClient from '@/lib/apiClient';
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '../types';

const URL = '/categories';

export const categoriesApi = {
  async getAll(): Promise<Category[]> {
    const { data } = await apiClient.get<Category[]>(URL);
    return data;
  },

  async create(payload: CreateCategoryPayload): Promise<Category> {
    const { data } = await apiClient.post<Category>(URL, payload);
    return data;
  },

  async update({ id, ...payload }: UpdateCategoryPayload): Promise<Category> {
    const { data } = await apiClient.put<Category>(`${URL}/${id}`, payload);
    return data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${URL}/${id}`);
  },

  async seedDefaults(): Promise<{ message: string; count: number }> {
    const { data } = await apiClient.post(`${URL}/seed`);
    return data;
  },
};
