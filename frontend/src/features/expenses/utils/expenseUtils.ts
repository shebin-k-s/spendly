import { format } from 'date-fns';
import type { Expense, PaymentMethod, SmartFilterCriteria } from '../types';
import type { Category } from '@/features/categories/types';

export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function groupByDate(expenses: Expense[]): Record<string, Expense[]> {
  return expenses.reduce<Record<string, Expense[]>>((acc, expense) => {
    const key = expense.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(expense);
    return acc;
  }, {});
}

export function netAmount(expense: Expense): number {
  return Number(expense.amount) - Number(expense.cashback || 0);
}

export function totalAmount(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + netAmount(e), 0);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '💵',
  card: '💳',
  upi: '📲',
  bank_transfer: '🏦',
  other: '💰',
};

export function parseQueryLocally(query: string, categories: Category[]): SmartFilterCriteria {
  const lower = query.toLowerCase().trim();
  const criteria: SmartFilterCriteria = { query };

  // Amount: between X and Y
  const betweenMatch = lower.match(/between\s+₹?\s*(\d+(?:\.\d+)?)\s+and\s+₹?\s*(\d+(?:\.\d+)?)/);
  if (betweenMatch) {
    criteria.minAmount = parseFloat(betweenMatch[1]);
    criteria.maxAmount = parseFloat(betweenMatch[2]);
  } else {
    const minMatch = lower.match(/(?:above|over|greater than|more than|>=?)\s*₹?\s*(\d+(?:\.\d+)?)/);
    if (minMatch) criteria.minAmount = parseFloat(minMatch[1]);
    const maxMatch = lower.match(/(?:below|under|less than|<=?)\s*₹?\s*(\d+(?:\.\d+)?)/);
    if (maxMatch) criteria.maxAmount = parseFloat(maxMatch[1]);
  }

  // Payment method
  if (/\b(upi|gpay|phonepe|phonepay|paytm)\b/.test(lower)) criteria.paymentMethod = 'upi';
  else if (/\bcash\b/.test(lower)) criteria.paymentMethod = 'cash';
  else if (/\bcard\b/.test(lower)) criteria.paymentMethod = 'card';
  else if (/\b(bank.?transfer|neft|imps)\b/.test(lower)) criteria.paymentMethod = 'bank_transfer';

  // Category name matching
  const matchedCats = categories.filter(c => lower.includes(c.name.toLowerCase()));
  if (matchedCats.length) criteria.categoryIds = matchedCats.map(c => c.id);

  // Build remaining text as searchTerm
  let remaining = query;
  if (betweenMatch) remaining = remaining.replace(betweenMatch[0], '');
  remaining = remaining
    .replace(/(?:above|over|greater than|more than|>=?)\s*₹?\s*\d+(?:\.\d+)?/gi, '')
    .replace(/(?:below|under|less than|<=?)\s*₹?\s*\d+(?:\.\d+)?/gi, '')
    .replace(/\b(upi|gpay|phonepe|phonepay|paytm|cash|card|bank.?transfer|neft|imps)\b/gi, '');
  matchedCats.forEach(c => {
    remaining = remaining.replace(new RegExp(`\\b${c.name}\\b`, 'gi'), '');
  });
  remaining = remaining.replace(/\s+/g, ' ').trim();
  if (remaining) criteria.searchTerm = remaining;

  return criteria;
}
