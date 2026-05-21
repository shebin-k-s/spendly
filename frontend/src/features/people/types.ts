export type DebtType = 'GIVEN' | 'RETURNED';

export interface DebtTransaction {
  id: string;
  amount: number;
  type: DebtType;
  date: string;
  note?: string;
  personId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  phoneNumber?: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonWithTransactions extends Person {
  transactions: DebtTransaction[];
}

export interface CreatePersonPayload {
  name: string;
  phoneNumber?: string;
}

export interface CreateDebtPayload {
  amount: number;
  type: DebtType;
  date: string;
  note?: string;
}
