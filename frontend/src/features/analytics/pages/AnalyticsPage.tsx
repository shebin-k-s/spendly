import { currentYearMonth, monthLabel } from '@/lib/utils';
import { useAnalytics, useMonthlySummary } from '@/features/expenses/hooks/useExpenses';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import CategoryPieChart from '../components/CategoryPieChart';
import MonthNavigator from '@/features/expenses/components/MonthNavigator';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';

export default function AnalyticsPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const dispatch = useAppDispatch();

  // Load 12 months for horizontal scrolling comparison
  const { data: analytics = [], isLoading: analyticsLoading } = useAnalytics(12);
  const { data: summary, isLoading: summaryLoading } = useMonthlySummary(year, month);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <h1 className="text-xl font-bold">Analytics</h1>
        </div>
      </div>

      <div className="page-content space-y-4">
        {/* Horizontally scrollable trend line */}
        <MonthlyTrendChart 
          data={analytics} 
          isLoading={analyticsLoading} 
        />

        {/* Per-month deep dive */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month Detail</p>
            <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
          </div>

          {summaryLoading ? (
            <div className="h-6 bg-secondary rounded animate-pulse" />
          ) : summary && summary.count > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Spent</p>
                  <p className="text-sm font-bold mt-0.5">₹{(summary.total - (summary.cashbackTotal ?? 0)).toLocaleString('en-IN')}</p>
                  {(summary.cashbackTotal ?? 0) > 0 && (
                    <p className="text-[10px] text-muted-foreground line-through">₹{summary.total.toLocaleString('en-IN')}</p>
                  )}
                </div>
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Entries</p>
                  <p className="text-sm font-bold mt-0.5">{summary.count}</p>
                </div>
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Categories</p>
                  <p className="text-sm font-bold mt-0.5">{summary.breakdown.length}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No data for {monthLabel(year, month)}</p>
          )}
        </div>

        {/* Category pie chart for selected month */}
        <CategoryPieChart
          breakdown={summary?.breakdown ?? []}
          total={summary?.total ?? 0}
          isLoading={summaryLoading}
        />
      </div>
    </div>
  );
}
