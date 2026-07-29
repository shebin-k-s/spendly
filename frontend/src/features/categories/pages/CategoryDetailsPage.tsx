import { useEffect, useState, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Pencil, Tag } from 'lucide-react';
import { format, parseISO, startOfMonth } from 'date-fns';
import { formatINR } from '@/lib/utils';
import { useCategorySpend, usePrefetchCategorySpend } from '@/features/expenses/hooks/useExpenses';
import type { Expense, CategorySpendRange } from '@/features/expenses/types';
import ExpenseCard from '@/features/expenses/components/ExpenseCard';
import EmptyState from '@/components/EmptyState';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { DateTimePicker } from '@/components/DateTimePicker';
import { BottomSheet } from '@/components/ui/BottomSheet';

type Mode = 'year' | 'range';
const YEAR_PICKER_SPAN = 20;

export default function CategoryDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const [mode, setMode] = useState<Mode>('year');
  const [year, setYear] = useState(currentYear);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(todayStr);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  const isRangeValid = rangeStart <= rangeEnd;
  const range: CategorySpendRange = mode === 'year' ? { year } : { start: rangeStart, end: rangeEnd };

  const spendQuery = useCategorySpend(id!, range, mode === 'year' || isRangeValid);
  const { data, isLoading } = spendQuery;
  const freshness = useQueryFreshness(spendQuery);
  useRefetchOnFocus(spendQuery);

  // Warm the cache for the years next to the current one so the ◀/▶ arrows
  // (and picking an adjacent year from the sheet) feel instant.
  const prefetchCategorySpend = usePrefetchCategorySpend();
  useEffect(() => {
    if (mode !== 'year' || !id) return;
    prefetchCategorySpend(id, { year: year - 1 });
    if (year < currentYear) prefetchCategorySpend(id, { year: year + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, year, id]);

  const category = data?.category;
  const expenses = data?.expenses ?? [];

  const groupedByMonth = expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const key = e.date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));
  const maxMonthTotal = data ? Math.max(...data.monthly.map((m) => m.total)) : 0;
  const multiYear = data ? new Set(data.monthly.map((m) => m.year)).size > 1 : false;

  const rangeLabel = mode === 'year'
    ? `Total spent in ${year}`
    : `Total spent · ${format(parseISO(rangeStart), 'd MMM yyyy')} – ${format(parseISO(rangeEnd), 'd MMM yyyy')}`;

  const emptyDescription = mode === 'year'
    ? `Nothing recorded for ${category?.name} in ${year}.`
    : `Nothing recorded for ${category?.name} in this date range.`;

  if (isLoading || !data || !category) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div className="w-10 h-10 rounded-2xl bg-muted animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-5 w-36 bg-muted animate-pulse rounded-lg" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
        <div className="page-content space-y-4">
          <div className="h-32 bg-muted animate-pulse rounded-2xl" />
          <div className="h-4 w-20 bg-muted animate-pulse rounded-lg" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/categories')}
            className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: category.color }}
          >
            {category.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{category.name}</h1>
              <DataFreshnessIndicator
                status={freshness.status}
                isFetching={freshness.isFetching}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Spending overview</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/categories/${id}/edit`, { state: { category } })}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      <div className="page-content space-y-5">
        {/* Mode toggle + range selector + total */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setMode('year')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'year' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              Year
            </button>
            <button
              onClick={() => setMode('range')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'range' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              Custom range
            </button>
          </div>

          {mode === 'year' ? (
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setYearPickerOpen(true)}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg active:bg-secondary transition-colors"
              >
                {year}
              </button>
              <button
                onClick={() => setYear((y) => y + 1)}
                disabled={year >= currentYear}
                className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">From</label>
                <DateTimePicker
                  date={rangeStart}
                  time={null}
                  showTime={false}
                  onChange={(d) => setRangeStart(d)}
                />
              </div>
              <div>
                <label className="form-label">To</label>
                <DateTimePicker
                  date={rangeEnd}
                  time={null}
                  showTime={false}
                  onChange={(d) => setRangeEnd(d)}
                />
              </div>
              {!isRangeValid && (
                <p className="col-span-2 text-xs text-destructive -mt-1.5">
                  End date must be on or after the start date.
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          <p className="text-3xl font-bold mt-1 text-primary">{formatINR(data.total)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.count} expense{data.count === 1 ? '' : 's'}
          </p>
        </div>

        {/* Monthly breakdown */}
        {data.total > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Monthly breakdown
            </p>
            <div className="space-y-2.5">
              {data.monthly
                .filter((m) => m.total > 0)
                .map((m) => {
                  const pct = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;
                  return (
                    <div key={`${m.year}-${m.month}`} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">
                        {format(new Date(m.year, m.month - 1, 1), multiYear ? 'MMM yy' : 'MMM')}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: category.color }}
                        />
                      </div>
                      <span className="text-xs font-medium w-16 text-right shrink-0">
                        {formatINR(m.total)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* History */}
        <div className="space-y-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            History
            {expenses.length > 0 && <span className="ml-1 font-normal">· {expenses.length}</span>}
          </p>

          {expenses.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={`No ${category.name} expenses`}
              description={emptyDescription}
            />
          ) : (
            sortedMonths.map((monthKey) => {
              const monthExpenses = groupedByMonth[monthKey];
              const monthTotal = monthExpenses.reduce(
                (sum, e) => sum + Number(e.amount) - Number(e.cashback || 0),
                0,
              );
              const monthLabel = format(parseISO(`${monthKey}-01`), 'MMMM yyyy');
              const isCollapsed = collapsedMonths.has(monthKey);
              return (
                <div key={monthKey} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between px-4 py-3 active:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                      />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {monthLabel}
                      </span>
                      {isCollapsed && (
                        <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">
                          {monthExpenses.length} transaction{monthExpenses.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatINR(monthTotal)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 pb-3 pt-3 space-y-2 border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
                      {monthExpenses.map((expense) => (
                        <ExpenseCard key={expense.id} expense={expense} showDate />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <BottomSheet
        open={yearPickerOpen}
        onOpenChange={setYearPickerOpen}
        header={
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Jump to Year</Dialog.Title>
            {year !== currentYear && (
              <button
                onClick={() => { setYearPickerOpen(false); startTransition(() => setYear(currentYear)); }}
                className="text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/10 active:opacity-60 transition-opacity"
              >
                Current Year
              </button>
            )}
          </div>
        }
      >
        <div className="px-5 pt-2 pb-6">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: YEAR_PICKER_SPAN + 1 }, (_, i) => currentYear - i).map((y) => (
              <button
                key={y}
                onClick={() => { setYearPickerOpen(false); startTransition(() => setYear(y)); }}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  y === year ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground active:opacity-60'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
