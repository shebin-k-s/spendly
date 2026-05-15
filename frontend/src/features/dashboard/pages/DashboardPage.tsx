import { monthLabel, prevMonth, formatINR } from '@/lib/utils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';
import MonthNavigator from '@/features/expenses/components/MonthNavigator';
import { useMonthlySummary, useExpensesQuery } from '@/features/expenses/hooks/useExpenses';
import MonthSummaryCard from '../components/MonthSummaryCard';
import CategoryBreakdown from '../components/CategoryBreakdown';
import RecentExpenses from '../components/RecentExpenses';

export default function DashboardPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const dispatch = useAppDispatch();
  const prev = prevMonth(year, month);

  const { data: summary, isLoading: summaryLoading } = useMonthlySummary(year, month);
  const { data: prevSummary } = useMonthlySummary(prev.year, prev.month);
  const { data: expenses = [] } = useExpensesQuery(year, month);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  let dailyDivisor: number;
  let divisorLabel: string;
  if (isCurrentMonth && expenses.length > 0) {
    const firstDay = Math.min(...expenses.map((e) => new Date(e.date).getDate()));
    dailyDivisor = Math.max(1, now.getDate() - firstDay + 1);
    divisorLabel = `${dailyDivisor} day${dailyDivisor !== 1 ? 's' : ''} tracked`;
  } else {
    dailyDivisor = new Date(year, month, 0).getDate();
    divisorLabel = `${dailyDivisor} days`;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Overview</p>
          <h1 className="text-xl font-bold">{monthLabel(year, month)}</h1>
        </div>
        <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
      </div>

      <div className="page-content space-y-4">
        {/* Total spend */}
        <MonthSummaryCard
          total={summary?.total ?? 0}
          count={summary?.count ?? 0}
          prevTotal={prevSummary?.total}
          isLoading={summaryLoading}
        />

        {/* Quick stats */}
        {summary && summary.count > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Daily Average</p>
              <p className="text-xl font-bold">
                {formatINR(Math.round(summary.total / dailyDivisor))}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{divisorLabel}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Avg per Expense</p>
              <p className="text-xl font-bold">
                {formatINR(Math.round(summary.total / summary.count))}
              </p>
            </div>
          </div>
        )}

        {/* Category breakdown */}
        <CategoryBreakdown
          breakdown={summary?.breakdown ?? []}
          total={summary?.total ?? 0}
          isLoading={summaryLoading}
        />

        {/* Recent expenses */}
        <RecentExpenses expenses={expenses} />
      </div>
    </div>
  );
}
