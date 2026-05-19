import { useState } from 'react';
import { formatINR } from '@/lib/utils';
import { PAYMENT_METHOD_ICONS, netAmount } from '../utils/expenseUtils';
import { useAppSelector } from '@/store/hooks';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import type { Expense } from '../types';

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

interface ExpenseCardProps {
  expense: Expense;
}

export default function ExpenseCard({ expense }: ExpenseCardProps) {
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="touch-card px-4 py-3 flex items-center gap-3"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
        >
          {expense.category?.icon || '📦'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{expense.description}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">{expense.category?.name || 'Uncategorized'}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{PAYMENT_METHOD_ICONS[expense.paymentMethod]}</span>
            {expense.time && (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{fmtTime(expense.time)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="font-semibold text-sm">{formatINR(netAmount(expense))}</span>
          {showGross && Number(expense.cashback) > 0 && (
            <span className="text-[10px] text-muted-foreground line-through">{formatINR(Number(expense.amount))}</span>
          )}
        </div>
      </div>

      <ExpenseDetailSheet expense={expense} open={open} onOpenChange={setOpen} />
    </>
  );
}
