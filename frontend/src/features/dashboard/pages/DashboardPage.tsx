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
  const showGross = useAppSelector((state) => state.prefs.showGross);
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
          total={(summary?.total ?? 0) - (summary?.cashbackTotal ?? 0)}
          cashbackTotal={summary?.cashbackTotal}
          count={summary?.count ?? 0}
          prevTotal={prevSummary ? prevSummary.total - (prevSummary.cashbackTotal ?? 0) : undefined}
          isLoading={summaryLoading}
        />

        {/* Quick stats */}
        {summary && summary.count > 0 && (() => {
          const grossTotal = summary.total;
          const netTotal = summary.total - (summary.cashbackTotal ?? 0);
          const hasCashback = showGross && (summary.cashbackTotal ?? 0) > 0;

          const daysInMonth = new Date(year, month, 0).getDate();
          const remainingDays = daysInMonth - now.getDate();
          const dailyAvg = netTotal / dailyDivisor;
          const projectedTotal = Math.round(netTotal + dailyAvg * remainingDays);
          const dailyAvgGross = grossTotal / dailyDivisor;
          const projectedGross = Math.round(grossTotal + dailyAvgGross * remainingDays);

          // Peak week: split month into 4 buckets (days 1-7, 8-14, 15-21, 22+)
          const weekTotals = [0, 0, 0, 0];
          for (const e of expenses) {
            const day = new Date(e.date).getDate();
            const idx = Math.min(Math.floor((day - 1) / 7), 3);
            weekTotals[idx] += e.amount - (e.cashback ?? 0);
          }
          const peakWeekIdx = weekTotals.indexOf(Math.max(...weekTotals));
          const peakWeekAmount = weekTotals[peakWeekIdx];
          const peakWeekLabel = ['Week 1', 'Week 2', 'Week 3', 'Week 4'][peakWeekIdx];

          return (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Daily Average</p>
                <p className="text-xl font-bold">{formatINR(Math.round(netTotal / dailyDivisor))}</p>
                {hasCashback && (
                  <p className="text-xs text-muted-foreground line-through">{formatINR(Math.round(grossTotal / dailyDivisor))}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{divisorLabel}</p>
              </div>

              {isCurrentMonth ? (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Projected</p>
                  <p className="text-xl font-bold">{formatINR(projectedTotal)}</p>
                  {hasCashback && (
                    <p className="text-xs text-muted-foreground line-through">{formatINR(projectedGross)}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">expected spend this month</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Peak Week</p>
                  <p className="text-xl font-bold">{formatINR(Math.round(peakWeekAmount))}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{peakWeekLabel} · most spent</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Category breakdown */}
        <CategoryBreakdown
          breakdown={summary?.breakdown ?? []}
          total={(summary?.total ?? 0) - (summary?.cashbackTotal ?? 0)}
          isLoading={summaryLoading}
        />

        {/* Recent expenses */}
        <RecentExpenses expenses={expenses} />
      </div>
    </div>
  );
}
