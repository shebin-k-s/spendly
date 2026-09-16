import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Sparkles, Loader2 } from 'lucide-react';
import { currentYearMonth, monthLabel } from '@/lib/utils';
import { useAnalytics, useMonthlySummary, useMonthAnalysis, useReanalyzeMonth } from '@/features/expenses/hooks/useExpenses';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import CategoryPieChart from '../components/CategoryPieChart';
import MonthNavigator from '@/features/expenses/components/MonthNavigator';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';

export default function AnalyticsPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const dispatch = useAppDispatch();

  // Load 12 months for horizontal scrolling comparison
  const analyticsQuery = useAnalytics(12);
  const { data: analytics = [], isLoading: analyticsLoading } = analyticsQuery;
  const analyticsFreshness = useQueryFreshness(analyticsQuery);
  useRefetchOnFocus(analyticsQuery);

  const summaryQuery = useMonthlySummary(year, month);
  const { data: summary, isLoading: summaryLoading } = summaryQuery;
  const summaryFreshness = useQueryFreshness(summaryQuery);
  useRefetchOnFocus(summaryQuery);

  // Query key includes year/month, so switching months naturally shows that
  // month's own cached result (if this session — or a persisted past one —
  // already fetched it) with no manual reset needed.
  const analysis = useMonthAnalysis(year, month);
  // Errors persist on the cached query (retry: false, gcTime: 7 days), so a
  // failure from an earlier attempt is still sitting there next time this
  // month is visited. Only toast when the error actually just changed —
  // never for one already attached to the query on mount.
  const seenAnalysisError = useRef(analysis.error);
  useEffect(() => {
    if (analysis.error && analysis.error !== seenAnalysisError.current) {
      toast.error(getErrorMessage(analysis.error));
    }
    seenAnalysisError.current = analysis.error;
  }, [analysis.error]);

  const reanalyze = useReanalyzeMonth();
  // reanalyze is one shared mutation instance — if it's mid-flight for a
  // month the user has since navigated away from, its `variables` (the
  // month it was actually called with) still points at that other month,
  // so only show "Re-analyzing…" here when it's actually this month's.
  const isReanalyzingThisMonth = reanalyze.isPending
    && reanalyze.variables?.year === year
    && reanalyze.variables?.month === month;

  const generatedAtTime = analysis.data?.generatedAt ? new Date(analysis.data.generatedAt).getTime() : NaN;
  const lastAnalyzedLabel = Number.isNaN(generatedAtTime)
    ? null
    : formatDistanceToNow(generatedAtTime, { addSuffix: true });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Analytics</h1>
            <DataFreshnessIndicator
              status={analyticsFreshness.status}
              isFetching={analyticsFreshness.isFetching}
            />
          </div>
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
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center gap-2">
                  <div className="h-3 w-12 bg-secondary rounded animate-pulse" />
                  <div className="h-5 w-16 bg-secondary rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : summary && summary.count > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Spent</p>
                  <p className="text-sm font-bold mt-0.5">₹{(summary.total - (summary.cashbackTotal ?? 0)).toLocaleString('en-IN')}</p>
                  {showGross && (summary.cashbackTotal ?? 0) > 0 && (
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

        {/* AI summary — its own card, same as every other section here,
            instead of tacked onto the end of Month Detail's stat grid. */}
        {summary && summary.count > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Summary</p>
            </div>

            {analysis.data ? (
              <div className="space-y-2">
                <ul className="space-y-2.5">
                  {analysis.data.points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0 mt-1.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-1">
                  {/* generatedAt is missing on results persisted by an older
                      app version (localStorage cache predates this field) —
                      guard against Invalid Date rather than let date-fns throw
                      and blank the whole page (no error boundary above this). */}
                  <p className="text-[11px] text-muted-foreground">
                    {lastAnalyzedLabel ? `Last analyzed ${lastAnalyzedLabel}` : ''}
                  </p>
                  {/* Explicit re-ask — always forces a fresh AI pass (bypassing
                      the backend's hash cache) rather than silently handing
                      back the same points when nothing about the numbers
                      changed, which used to read as "re-analyze does nothing." */}
                  <button
                    type="button"
                    onClick={() => reanalyze.mutate({ year, month })}
                    disabled={isReanalyzingThisMonth}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                  >
                    {isReanalyzingThisMonth ? 'Re-analyzing…' : 'Re-analyze'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => analysis.refetch()}
                disabled={analysis.isFetching}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary/30 transition-colors disabled:opacity-60"
              >
                {analysis.isFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {analysis.isFetching ? 'Analyzing…' : 'Analyze this month'}
              </button>
            )}
          </div>
        )}

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
