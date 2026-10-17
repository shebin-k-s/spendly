import { useMemo, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Receipt, Filter, X, Search, ChevronDown } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { formatINR, monthLabel, currentYearMonth, cn } from '@/lib/utils';
import { CashbackVisibilityIcon } from '@/components/CashbackVisibilityIcon';
import { useExpensesQuery } from '../hooks/useExpenses';
import { groupByDate, totalAmount } from '../utils/expenseUtils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate, setView } from '@/store/dateSlice';
import { setSearchTerm, toggleCategoryId, setCategoryIds, setFilterOpen, clearFilters, clearCategories } from '@/store/filterSlice';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { useToggleCashback } from '@/features/webauthn/hooks/useToggleCashback';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import ExpenseCard from '../components/ExpenseCard';
import MissedExpensesButton from '../components/MissedExpensesButton';
import ExpenseFilter from '../components/ExpenseFilter';
import ExpenseListSkeleton from '../components/ExpenseListSkeleton';
import MonthNavigator from '../components/MonthNavigator';
import YearNavigator from '../components/YearNavigator';
import EmptyState from '@/components/EmptyState';

// A month's heading in the year view. Tap to hide or show that month's expenses.
function MonthHeading({ label, total, hiddenCount, collapsed, onToggle }: {
  label: string;
  total: number;
  hiddenCount: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="w-full text-left flex items-center justify-between mb-3 pb-2 border-b border-border select-none active:opacity-60 transition-opacity"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', collapsed && '-rotate-90')} />
        <p className="text-sm font-bold">{label}</p>
        {collapsed && (
          <span className="text-[11px] text-muted-foreground truncate">· {hiddenCount} hidden</span>
        )}
      </div>
      <p className="text-sm font-bold text-primary">{formatINR(total)}</p>
    </button>
  );
}

export default function ExpensesPage() {
  const { year, month, view } = useAppSelector((state) => state.date);
  const isYear = view === 'year';
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(() => new Set());
  const toggleMonth = (key: string) =>
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const dispatch = useAppDispatch();

  const expensesQuery = useExpensesQuery(year, isYear ? null : month);
  const { data: expenses = [], isLoading, isSuccess } = expensesQuery;
  const freshness = useQueryFreshness(expensesQuery);
  useRefetchOnFocus(expensesQuery);
  const { data: categories = [] } = useCategoriesQuery();
  const { isFilterOpen, searchTerm, selectedCategoryIds } = useAppSelector((state) => state.filters);
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const { toggle: toggleCashback, verifying: verifyingCashback, prefetchChallenge } = useToggleCashback();

  const activeFilterCount = (searchTerm ? 1 : 0) + selectedCategoryIds.length;

  // Deep links from the AI analysis: ?date=yyyy-MM-dd (a spend spike) or
  // ?category=id&year=Y&month=M (a category mention) — switches to the
  // right month, clears any active filter that might hide the target
  // (applies a category filter instead, for the category case), then
  // scrolls to the day's group once loaded (date case only — a category
  // filter needs no scroll target). Runs once per
  // link (the ref guard), and the params are stripped so they don't
  // re-trigger later.
  const [searchParams, setSearchParams] = useSearchParams();
  const jumpHandledRef = useRef(false);
  useEffect(() => {
    if (jumpHandledRef.current) return;
    const jumpDate = searchParams.get('date');
    const jumpCategoryId = searchParams.get('category');
    if (!jumpDate && !jumpCategoryId) return;

    let targetYear = year;
    let targetMonth = month;
    if (jumpDate) {
      const parsed = parseISO(jumpDate);
      if (!isValid(parsed)) { jumpHandledRef.current = true; return; }
      targetYear = parsed.getFullYear();
      targetMonth = parsed.getMonth() + 1;
    } else {
      const paramYear = parseInt(searchParams.get('year') ?? '', 10);
      const paramMonth = parseInt(searchParams.get('month') ?? '', 10);
      if (paramYear && paramMonth) {
        targetYear = paramYear;
        targetMonth = paramMonth;
      }
    }

    // Clear whatever could hide the target regardless of whether the month
    // needs switching too — previously this only ran on a month mismatch,
    // so an active filter on the CURRENT month's page silently kept the
    // target hidden.
    dispatch(clearFilters());
    dispatch(setFilterOpen(false));
    dispatch(setView('month')); // deep links point at a specific month
    if (jumpCategoryId) dispatch(setCategoryIds([jumpCategoryId]));

    if (targetYear !== year || targetMonth !== month) {
      dispatch(setDate({ year: targetYear, month: targetMonth }));
      return; // wait for the next render with the right month before scrolling
    }
    if (!isSuccess) return; // wait for that month's expenses to load

    jumpHandledRef.current = true;
    setSearchParams({}, { replace: true });
    if (jumpDate) {
      // A single requestAnimationFrame fired too early to be reliable: the
      // route change plays a ~180ms slide transition, and Layout's own
      // useLayoutEffect forces this page's scroll back to 0 as it enters —
      // both can still be in flight one frame later. Wait them out, then
      // keep retrying briefly in case the list itself is still rendering
      // (e.g. right after clearFilters() above changes what's shown).
      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(`date-${jumpDate}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (attempts < 10) {
          attempts += 1;
          setTimeout(tryScroll, 100);
        }
      };
      setTimeout(tryScroll, 250);
    }
  }, [searchParams, year, month, isSuccess, dispatch, setSearchParams]);

  // Long-press the total to toggle the shared "show gross/cashback" preference,
  // same gesture as the dashboard's month summary card.
  const grossPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onGrossPressStart = () => {
    prefetchChallenge(); // kick off before the hold even confirms, overlapping the wait
    grossPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(40);
      toggleCashback();
    }, 600);
  };
  const onGrossPressEnd = () => {
    if (grossPressTimer.current) {
      clearTimeout(grossPressTimer.current);
      grossPressTimer.current = null;
    }
  };

  // Close the filter panel when the list is scrolled. The panel is part of the sticky header,
  // so collapsing it shortens the header and would drag every row up with it, on top of the
  // user's own slow scroll. While it collapses, give back the same amount of scroll position
  // each frame, so the rows stay where they are for as long as there is scroll position to give.
  useEffect(() => {
    if (!isFilterOpen) return;
    const panel = document.querySelector('[data-filter-panel]') as HTMLElement | null;
    const scroller = panel?.closest('[data-location-key]') as HTMLElement | null;
    if (!panel || !scroller) return;

    let armed = false;
    let baseTop = scroller.scrollTop;
    const armTimer = setTimeout(() => { armed = true; baseTop = scroller.scrollTop; }, 350);

    const onScroll = () => {
      if (!armed || scroller.scrollTop - baseTop <= 24) return;
      // Near the top there isn't enough scroll position to give back, so closing now would
      // visibly drag the rows up. Wait until the list has scrolled at least the panel's height.
      if (scroller.scrollTop < panel.getBoundingClientRect().height) return;
      armed = false;
      scroller.removeEventListener('scroll', onScroll);
      scroller.style.overflowAnchor = 'none';
      let prev = panel.getBoundingClientRect().height;
      const start = performance.now();
      const follow = () => {
        const h = panel.getBoundingClientRect().height;
        const delta = prev - h;
        if (delta > 0) scroller.scrollTop = Math.max(0, scroller.scrollTop - delta);
        prev = h;
        if (performance.now() - start < 450) requestAnimationFrame(follow);
        else scroller.style.overflowAnchor = '';
      };
      dispatch(setFilterOpen(false));
      requestAnimationFrame(follow);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearTimeout(armTimer);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [isFilterOpen, dispatch]);

  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  useEffect(() => {
    return () => {
      enableGlobalSwipe();
    };
  }, [enableGlobalSwipe]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((ex) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!ex.description.toLowerCase().includes(q) && !ex.note?.toLowerCase().includes(q)) return false;
      }
      if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes(ex.category?.id ?? '')) return false;
      return true;
    });
  }, [expenses, searchTerm, selectedCategoryIds]);

  const grouped = groupByDate(filteredExpenses);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of filteredExpenses) {
      const key = e.date.slice(0, 7);
      totals[key] = (totals[key] ?? 0) + Number(e.amount) - Number(e.cashback || 0);
    }
    return totals;
  }, [filteredExpenses]);
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of filteredExpenses) counts[e.date.slice(0, 7)] = (counts[e.date.slice(0, 7)] ?? 0) + 1;
    return counts;
  }, [filteredExpenses]);
  // Hold the year to hide every month; if they're all hidden already, show them all.
  const toggleAllMonths = () =>
    setCollapsedMonths((prev) => {
      const keys = Object.keys(monthTotals);
      return keys.length > 0 && keys.every((k) => prev.has(k)) ? new Set() : new Set(keys);
    });
  const monthNet = totalAmount(filteredExpenses);
  const monthGross = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="animate-fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border flex flex-col w-full">

        {/* Title row */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between w-full">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Expenses</h1>
              <DataFreshnessIndicator
                status={freshness.status}
                isFetching={freshness.isFetching}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="inline-flex rounded-lg bg-secondary p-0.5" role="tablist" aria-label="Period">
              {(['month', 'year'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => view !== v && dispatch(setView(v))}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {v === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
            <MissedExpensesButton />
            <button
              onClick={() => dispatch(setFilterOpen(!isFilterOpen))}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                ${isFilterOpen || activeFilterCount > 0
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-transparent text-muted-foreground'}`}
            >
              <Filter className="w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <Link
              to="/expenses/new"
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center active:opacity-80 transition-opacity"
            >
              <Plus className="w-5 h-5 text-primary-foreground" />
            </Link>
          </div>
        </div>

        {/* Month nav + total */}
        <div className="px-4 pb-3 flex items-center justify-between w-full">
          {isYear ? (
            <YearNavigator
              year={year}
              onLongPress={toggleAllMonths}
              onChange={(y) => {
                // Keep the month valid for when you switch back (no future months).
                const now = currentYearMonth();
                dispatch(setDate({ year: y, month: y === now.year ? Math.min(month, now.month) : month }));
              }}
            />
          ) : (
            <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
          )}
          {!isLoading && expenses.length > 0 && (
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-end gap-1">
                {activeFilterCount > 0 ? 'Filtered' : 'Total'}
                <CashbackVisibilityIcon showGross={showGross} loading={verifyingCashback} />
              </div>
              <p
                className="text-base font-bold text-primary select-none"
                onPointerDown={onGrossPressStart}
                onPointerUp={onGrossPressEnd}
                onPointerLeave={onGrossPressEnd}
              >
                {formatINR(monthNet)}
              </p>
              {showGross && monthGross > monthNet && (
                <p className="text-[10px] text-muted-foreground line-through">{formatINR(monthGross)}</p>
              )}
            </div>
          )}
        </div>

        {/* Collapsible filter panel */}
        <ExpenseFilter
          isOpen={isFilterOpen}
          onClose={() => dispatch(setFilterOpen(false))}
          searchTerm={searchTerm}
          onSearchChange={(v) => dispatch(setSearchTerm(v))}
          selectedCategoryIds={selectedCategoryIds}
          onCategoryToggle={(id) => dispatch(toggleCategoryId(id))}
          onClearFilters={() => dispatch(clearFilters())}
          onClearCategories={() => dispatch(clearCategories())}
        />

        {/* Active filter chip row — always visible when filters are on */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: activeFilterCount > 0 ? '64px' : '0', opacity: activeFilterCount > 0 ? 1 : 0 }}
        >
          <div
            data-no-swipe
            className="flex items-center gap-2 overflow-x-auto overscroll-x-contain disable-scrollbars px-4 pt-3 pb-3"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onPointerEnter={disableGlobalSwipe}
            onPointerLeave={enableGlobalSwipe}
            onTouchStart={(e) => {
              e.stopPropagation();
              disableGlobalSwipe();
            }}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              enableGlobalSwipe();
            }}
            onTouchCancel={(e) => {
              e.stopPropagation();
              enableGlobalSwipe();
            }}
          >
            {searchTerm && (
              <span className="flex items-center gap-1.5 flex-shrink-0 bg-secondary border border-border rounded-xl pl-2.5 pr-1 py-1.5 text-xs font-medium">
                <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="max-w-[110px] truncate text-foreground">"{searchTerm}"</span>
                <button
                  onClick={() => dispatch(setSearchTerm(''))}
                  className="ml-0.5 w-5 h-5 rounded-lg bg-muted flex items-center justify-center text-muted-foreground active:opacity-60"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedCategoryIds.map((id) => {
              const cat = categories.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 flex-shrink-0 bg-secondary border border-border rounded-xl pl-1.5 pr-1 py-1.5 text-xs font-medium"
                >
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.icon}
                  </span>
                  <span className="max-w-[90px] truncate text-foreground">{cat.name}</span>
                  <button
                    onClick={() => dispatch(toggleCategoryId(id))}
                    className="ml-0.5 w-5 h-5 rounded-lg bg-muted flex items-center justify-center text-muted-foreground active:opacity-60"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-content">
        {isLoading ? (
          <ExpenseListSkeleton />
        ) : isSuccess && filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={expenses.length === 0 ? `No expenses this ${isYear ? 'year' : 'month'}` : 'No matching expenses'}
            description={
              expenses.length === 0
                ? 'Tap + to record your first expense.'
                : 'Try adjusting your filters.'
            }
            action={
              expenses.length === 0 ? (
                <Link
                  to="/expenses/new"
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Expense
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {sortedDates.map((dateStr, i) => {
              const dayExpenses = grouped[dateStr];
              const monthKey = dateStr.slice(0, 7);
              const startsMonth = isYear && (i === 0 || sortedDates[i - 1].slice(0, 7) !== monthKey);
              const monthHidden = isYear && collapsedMonths.has(monthKey);
              // A hidden month keeps only its heading (carried by its first day).
              if (monthHidden && !startsMonth) return null;
              const dayNet = totalAmount(dayExpenses);
              const dayGross = dayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
              const label = format(parseISO(dateStr), 'EEE, MMM d');
              return (
                <div key={dateStr} id={`date-${dateStr}`} className="scroll-mt-36">
                  {startsMonth && (
                    <MonthHeading
                      label={monthLabel(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)))}
                      total={monthTotals[monthKey] ?? 0}
                      hiddenCount={monthCounts[monthKey] ?? 0}
                      collapsed={monthHidden}
                      onToggle={() => toggleMonth(monthKey)}
                    />
                  )}
                  {!monthHidden && (
                  <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                    <div className="flex flex-col items-end">
                      <p className="text-xs font-semibold text-muted-foreground">{formatINR(dayNet)}</p>
                      {showGross && dayGross > dayNet && (
                        <p className="text-[10px] text-muted-foreground/50 line-through">{formatINR(dayGross)}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dayExpenses.map((expense) => (
                      <ExpenseCard key={expense.id} expense={expense} />
                    ))}
                  </div>
                  </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
