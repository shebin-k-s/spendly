import apiClient from '@/lib/apiClient';
import type { Expense, CreateExpensePayload, UpdateExpensePayload, MonthlySummary, MonthlyAnalytic, CategorySpend, CategorySpendRange, SpendKind, MonthAnalysis, MissedExpensesResult, ResolveMissedPayload } from '../types';

const URL = '/expenses';

export const expensesApi = {
  // month === null → every expense of the year.
  async getByMonth(year: number, month: number | null, categoryId?: string): Promise<Expense[]> {
    const { data } = await apiClient.get<Expense[]>(URL, {
      params: {
        year,
        ...(month === null ? { scope: 'year' } : { month }),
        ...(categoryId ? { categoryId } : {}),
      },
    });
    return data;
  },

  async getById(id: string): Promise<Expense> {
    const { data } = await apiClient.get<Expense>(`${URL}/${id}`);
    return data;
  },

  // month = null asks for the whole year.
  async getMonthlySummary(year: number, month: number | null): Promise<MonthlySummary> {
    const { data } = await apiClient.get<MonthlySummary>(`${URL}/summary`, {
      params: month === null ? { year, period: 'year' } : { year, month },
    });
    return data;
  },

  async getAnalytics(months = 6): Promise<MonthlyAnalytic[]> {
    const { data } = await apiClient.get<MonthlyAnalytic[]>(`${URL}/analytics`, {
      params: { months },
    });
    return data;
  },

  async analyzeMonth(year: number, month: number, force = false): Promise<MonthAnalysis> {
    const { data } = await apiClient.get<MonthAnalysis>(`${URL}/analyze`, {
      params: { year, month, ...(force ? { force: 'true' } : {}) },
    });
    return data;
  },

  // Quiet refresh of a summary that already exists: null means the month was never analyzed (nothing to refresh).
  async refreshMonthAnalysis(year: number, month: number): Promise<MonthAnalysis | null> {
    const { data, status } = await apiClient.get<MonthAnalysis>(`${URL}/analyze`, {
      params: { year, month, auto: 'true' },
    });
    return status === 204 || !data ? null : data;
  },

  async getMissed(): Promise<MissedExpensesResult> {
    const { data } = await apiClient.get<MissedExpensesResult>(`${URL}/missed`);
    return data;
  },

  async resolveMissed(payload: ResolveMissedPayload): Promise<{ cursorDate: string | null }> {
    const { data } = await apiClient.post<{ cursorDate: string | null }>(`${URL}/missed/resolve`, payload);
    return data;
  },

  async getCategorySpend(id: string, range: CategorySpendRange, kind: SpendKind = 'category'): Promise<CategorySpend> {
    const { data } = await apiClient.get<CategorySpend>(`${URL}/by-category`, {
      params: { [kind === 'group' ? 'groupId' : 'categoryId']: id, ...range },
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

  async parseBulkText(text: string): Promise<{ items: Record<string, unknown>[] }> {
    const { data } = await apiClient.post(`${URL}/parse-bulk-text`, { text });
    return data;
  },

  // Voice note → one line per transaction (the speaker says "next" between them).
  // A sleeping server (Render free tier) can take a minute to wake: wait long
  // enough, and retry a couple of times on timeouts / gateway errors rather than
  // making the user say it all again.
  async transcribeAudio(wav: Blob): Promise<{ lines: string[] }> {
    const attempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const formData = new FormData();
        formData.append('audio', wav, 'speech.wav');
        const { data } = await apiClient.post<{ lines: string[] }>(`${URL}/transcribe`, formData, { timeout: 90_000 });
        return data;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        const transient = status === undefined || status === 502 || status === 503 || status === 504;
        if (!transient || attempt >= attempts) throw err;
        await new Promise((r) => setTimeout(r, 3_000 * attempt));
      }
    }
  },

  // Fire-and-forget request that wakes a sleeping backend while the user is still speaking.
  wakeServer() {
    try {
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api/v1';
      void fetch(`${new globalThis.URL(base).origin}/health`, { mode: 'no-cors' }).catch(() => {});
    } catch { /* ignore */ }
  },

  async reviseExpense(
    current: { amount: string | null; description: string | null; date: string | null; time: string | null; category_id: string | null; note: string | null; cashback: string | null },
    instruction: string,
  ): Promise<Record<string, unknown>> {
    const { data } = await apiClient.post(`${URL}/revise`, { current, instruction });
    return data;
  },

};

