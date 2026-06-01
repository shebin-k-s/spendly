import apiClient from '@/lib/apiClient';
import type { Expense, CreateExpensePayload, UpdateExpensePayload, MonthlySummary, MonthlyAnalytic } from '../types';

const URL = '/expenses';

export const expensesApi = {
  async getByMonth(year: number, month: number, categoryId?: string): Promise<Expense[]> {
    const { data } = await apiClient.get<Expense[]>(URL, {
      params: { year, month, ...(categoryId ? { categoryId } : {}) },
    });
    return data;
  },

  async getById(id: string): Promise<Expense> {
    const { data } = await apiClient.get<Expense>(`${URL}/${id}`);
    return data;
  },

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const { data } = await apiClient.get<MonthlySummary>(`${URL}/summary`, {
      params: { year, month },
    });
    return data;
  },

  async getAnalytics(months = 6): Promise<MonthlyAnalytic[]> {
    const { data } = await apiClient.get<MonthlyAnalytic[]>(`${URL}/analytics`, {
      params: { months },
    });
    return data;
  },

  async create(payload: CreateExpensePayload): Promise<Expense> {
    const { data } = await apiClient.post<Expense>(URL, payload);
    return data;
  },

  async update({ id, ...payload }: UpdateExpensePayload): Promise<Expense> {
    const { data } = await apiClient.put<Expense>(`${URL}/${id}`, payload);
    return data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${URL}/${id}`);
  },

  async parseText(text: string): Promise<Record<string, unknown>> {
    const { data } = await apiClient.post(`${URL}/parse-text`, { text });
    return data;
  },

};

