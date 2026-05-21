import apiClient from '@/lib/apiClient';
import type { 
  Person, 
  PersonWithTransactions, 
  CreatePersonPayload, 
  CreateDebtPayload,
  DebtTransaction
} from '../types';

const URL = '/people';

export const peopleApi = {
  async getAll(): Promise<Person[]> {
    const { data } = await apiClient.get<Person[]>(URL);
    return data;
  },

  async getById(id: string): Promise<PersonWithTransactions> {
    const { data } = await apiClient.get<PersonWithTransactions>(`${URL}/${id}`);
    return data;
  },

  async createPerson(payload: CreatePersonPayload): Promise<Person> {
    const { data } = await apiClient.post<Person>(URL, payload);
    return data;
  },

  async updatePerson(id: string, payload: Partial<CreatePersonPayload>): Promise<Person> {
    const { data } = await apiClient.patch<Person>(`${URL}/${id}`, payload);
    return data;
  },

  async deletePerson(id: string): Promise<void> {
    await apiClient.delete(`${URL}/${id}`);
  },

  async addTransaction(personId: string, payload: CreateDebtPayload): Promise<DebtTransaction> {
    const { data } = await apiClient.post<DebtTransaction>(`${URL}/${personId}/transactions`, payload);
    return data;
  },

  async deleteTransaction(transactionId: string): Promise<void> {
    await apiClient.delete(`${URL}/transactions/${transactionId}`);
  },
};
