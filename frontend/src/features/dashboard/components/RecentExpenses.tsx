import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { PAYMENT_METHOD_ICONS, netAmount } from '@/features/expenses/utils/expenseUtils';
import type { Expense } from '@/features/expenses/types';
import { useAppSelector } from '@/store/hooks';

interface RecentExpensesProps {
  expenses: Expense[];
}

export default function RecentExpenses({ expenses }: RecentExpensesProps) {
  const showGross = useAppSelector((state) => state.prefs.showGross);

  if (expenses.length === 0) return null;

  const recent = expenses.slice(0, 5);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent</p>
        <Link to="/expenses" className="text-xs text-primary font-medium flex items-center gap-1">
          See all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-border">
        {recent.map((expense) => (
          <Link
            key={expense.id}
            to={`/expenses/${expense.id}/edit`}
            className="flex items-center gap-3 px-4 py-3 active:bg-secondary/50 transition-colors"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
            >
              {expense.category?.icon || '📦'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{expense.description}</p>
              <p className="text-[10px] text-muted-foreground">{PAYMENT_METHOD_ICONS[expense.paymentMethod]} · {expense.date}</p>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-sm font-semibold">{formatINR(netAmount(expense))}</p>
              {showGross && Number(expense.cashback) > 0 && (
                <p className="text-[10px] text-muted-foreground line-through">{formatINR(Number(expense.amount))}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
