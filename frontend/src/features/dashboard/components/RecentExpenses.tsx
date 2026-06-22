import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { netAmount } from '@/features/expenses/utils/expenseUtils';
import ExpenseDetailSheet from '@/features/expenses/components/ExpenseDetailSheet';
import type { Expense } from '@/features/expenses/types';
import { useAppSelector } from '@/store/hooks';

interface RecentExpensesProps {
  expenses: Expense[];
}

export default function RecentExpenses({ expenses }: RecentExpensesProps) {
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [selected, setSelected] = useState<Expense | null>(null);

  if (expenses.length === 0) return null;

  const recent = [...expenses]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent</p>
          <Link to="/expenses" className="text-xs text-primary font-medium flex items-center gap-1">
            See all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {recent.map((expense) => (
            <button
              key={expense.id}
              onClick={() => setSelected(expense)}
              className="w-full flex items-center gap-3 px-4 py-3 active:bg-secondary/50 transition-colors text-left"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
              >
                {expense.category?.icon || '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{expense.description}</p>
                <p className="text-[10px] text-muted-foreground">{expense.date}</p>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-sm font-semibold">{formatINR(netAmount(expense))}</p>
                {showGross && Number(expense.cashback) > 0 && (
                  <p className="text-[10px] text-muted-foreground line-through">{formatINR(Number(expense.amount))}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <ExpenseDetailSheet
          expense={selected}
          open={!!selected}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
        />
      )}
    </>
  );
}
