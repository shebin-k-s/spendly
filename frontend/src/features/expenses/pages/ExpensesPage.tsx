import { useMemo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Filter, X, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatINR } from '@/lib/utils';
import { useExpensesQuery } from '../hooks/useExpenses';
import { groupByDate, totalAmount } from '../utils/expenseUtils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';
import { setSearchTerm, toggleCategoryId, setFilterOpen, clearFilters, clearCategories } from '@/store/filterSlice';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import ExpenseCard from '../components/ExpenseCard';
import ExpenseFilter from '../components/ExpenseFilter';
import ExpenseListSkeleton from '../components/ExpenseListSkeleton';
import MonthNavigator from '../components/MonthNavigator';
import EmptyState from '@/components/EmptyState';

export default function ExpensesPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const dispatch = useAppDispatch();

  const { data: expenses = [], isLoading } = useExpensesQuery(year, month);
  const { data: categories = [] } = useCategoriesQuery();
  const { isFilterOpen, searchTerm, selectedCategoryIds } = useAppSelector((state) => state.filters);
  const showGross = useAppSelector((state) => state.prefs.showGross);

  const activeFilterCount = (searchTerm ? 1 : 0) + selectedCategoryIds.length;

  // Close filter panel on vertical scroll
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isFilterOpen) return;
    
    // Small grace period so the filter open animation doesn't immediately trigger close
    let armed = false;
    const armTimer = setTimeout(() => { armed = true; }, 350);

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Ignore touches that start inside the filter panel / chip row / radix portal
      if (typeof target.closest === 'function' && (target.closest('[data-no-swipe]') || target.closest('[data-filter-panel]') || target.closest('[data-radix-portal]'))) return;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed || !touchStartRef.current) return;
      const target = e.target as HTMLElement;
      if (typeof target.closest === 'function' && (target.closest('[data-no-swipe]') || target.closest('[data-filter-panel]') || target.closest('[data-radix-portal]'))) return;

      const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
      // When scrolling down the page, finger moves UP, meaning clientY decreases.
      const dy = touchStartRef.current.y - e.touches[0].clientY;

      // Only close on clearly downward scroll (dy > 30px, heavily vertical)
      if (dy > 30 && dy > dx * 1.5) {
        dispatch(setFilterOpen(false));
        touchStartRef.current = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!armed) return;
      const target = e.target as HTMLElement;
      if (typeof target.closest === 'function' && (target.closest('[data-no-swipe]') || target.closest('[data-filter-panel]') || target.closest('[data-radix-portal]'))) return;

      // Only close on clearly downward scroll (e.deltaY > positive threshold)
      if (e.deltaY > 15 && e.deltaY > Math.abs(e.deltaX) * 1.5) {
        dispatch(setFilterOpen(false));
      }
    };

    const onTouchEnd = () => { touchStartRef.current = null; };

    // Use passive capture to ensure we read touches before any preventDefault
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });

    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('wheel', onWheel, true);
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
  const monthNet = totalAmount(filteredExpenses);
  const monthGross = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="animate-fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border flex flex-col w-full">

        {/* Title row */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between w-full">
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <h1 className="text-xl font-bold">Expenses</h1>
          </div>
          <div className="flex items-center gap-2">
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
          <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
          {!isLoading && expenses.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {activeFilterCount > 0 ? 'Filtered' : 'Total'}
              </p>
              <p className="text-base font-bold text-primary">{formatINR(monthNet)}</p>
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
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={expenses.length === 0 ? 'No expenses this month' : 'No matching expenses'}
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
            {sortedDates.map((dateStr) => {
              const dayExpenses = grouped[dateStr];
              const dayNet = totalAmount(dayExpenses);
              const dayGross = dayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
              const label = format(parseISO(dateStr), 'EEE, MMM d');
              return (
                <div key={dateStr}>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
