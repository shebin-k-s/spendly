import apiClient from '@/lib/apiClient';
import type { CategoryGroup } from '../types';

const URL = '/category-groups';

export const categoryGroupsApi = {
  async getAll(): Promise<CategoryGroup[]> {
    const { data } = await apiClient.get<CategoryGroup[]>(URL);
    return data;
  },

  async create(name: string): Promise<CategoryGroup> {
    const { data } = await apiClient.post<CategoryGroup>(URL, { name });
    return data;
  },

  async update({ id, name }: { id: string; name: string }): Promise<CategoryGroup> {
    const { data } = await apiClient.put<CategoryGroup>(`${URL}/${id}`, { name });
    return data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${URL}/${id}`);
  },
};
