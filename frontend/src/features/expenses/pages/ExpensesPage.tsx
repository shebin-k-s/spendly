import { Link } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { currentYearMonth, formatINR } from '@/lib/utils';
import { useExpensesQuery } from '../hooks/useExpenses';
import { groupByDate, totalAmount } from '../utils/expenseUtils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';
import ExpenseCard from '../components/ExpenseCard';
import ExpenseListSkeleton from '../components/ExpenseListSkeleton';
import MonthNavigator from '../components/MonthNavigator';
import EmptyState from '@/components/EmptyState';

export default function ExpensesPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const dispatch = useAppDispatch();

  const { data: expenses = [], isLoading } = useExpensesQuery(year, month);

  const grouped = groupByDate(expenses);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const monthTotal = totalAmount(expenses);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border flex flex-col w-full">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between w-full">
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <h1 className="text-xl font-bold">Expenses</h1>
          </div>
          <Link
            to="/expenses/new"
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center active:opacity-80 transition-opacity"
          >
            <Plus className="w-5 h-5 text-primary-foreground" />
          </Link>
        </div>

        {/* Month navigation + total */}
        <div className="px-4 pb-3 flex items-center justify-between w-full">
          <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
          {!isLoading && expenses.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-base font-bold text-primary">{formatINR(monthTotal)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        {isLoading ? (
          <ExpenseListSkeleton />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses this month"
            description="Tap + to record your first expense."
            action={
              <Link to="/expenses/new" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Expense
              </Link>
            }
          />
        ) : (
          <div className="space-y-5">
            {sortedDates.map((dateStr) => {
              const dayExpenses = grouped[dateStr];
              const dayTotal = totalAmount(dayExpenses);
              const label = format(parseISO(dateStr), 'EEE, MMM d');

              return (
                <div key={dateStr}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-semibold text-muted-foreground">{formatINR(dayTotal)}</p>
                  </div>
                  <div className="space-y-2">
                    {dayExpenses.map((expense) => (
                      <ExpenseCard key={expense.id} expense={expense} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
