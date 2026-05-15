import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { currentYearMonth, formatINR } from '@/lib/utils';
import { useExpensesQuery } from '../hooks/useExpenses';
import { groupByDate, totalAmount } from '../utils/expenseUtils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';
import { setSearchTerm, setCategoryId, setFilterOpen, clearFilters } from '@/store/filterSlice';
import ExpenseCard from '../components/ExpenseCard';
import ExpenseFilter from '../components/ExpenseFilter';
import ExpenseListSkeleton from '../components/ExpenseListSkeleton';
import MonthNavigator from '../components/MonthNavigator';
import EmptyState from '@/components/EmptyState';

export default function ExpensesPage() {
  const { year, month } = useAppSelector((state) => state.date);
  const dispatch = useAppDispatch();

  const { data: expenses = [], isLoading } = useExpensesQuery(year, month);

  const { isFilterOpen, searchTerm, selectedCategoryId } = useAppSelector((state) => state.filters);

  // Automatically close filter menu on scroll
  useEffect(() => {
    if (!isFilterOpen) return;

    let lastScrollY = 0;

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // Do not close if the user is just horizontally scrolling the category row
      if (target.scrollWidth > target.clientWidth && target.scrollHeight === target.clientHeight) {
        return;
      }
      
      // Close filter on vertical content scroll
      dispatch(setFilterOpen(false));
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isFilterOpen, dispatch]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((ex) => {
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        if (
          !ex.description.toLowerCase().includes(query) &&
          !ex.note?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      if (selectedCategoryId && ex.category?.id !== selectedCategoryId) {
        return false;
      }
      return true;
    });
  }, [expenses, searchTerm, selectedCategoryId]);

  const grouped = groupByDate(filteredExpenses);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const monthTotal = totalAmount(filteredExpenses);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border flex flex-col w-full">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between w-full">
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <h1 className="text-xl font-bold">Expenses</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dispatch(setFilterOpen(!isFilterOpen))}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors 
                ${isFilterOpen || searchTerm || selectedCategoryId 
                  ? 'bg-secondary text-secondary-foreground' 
                  : 'bg-transparent text-muted-foreground hover:bg-secondary/50'}`}
            >
              <Filter className="w-5 h-5" />
              {(searchTerm || selectedCategoryId) && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary ring-2 ring-secondary" />
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
        <ExpenseFilter
          isOpen={isFilterOpen}
          onClose={() => dispatch(setFilterOpen(false))}
          searchTerm={searchTerm}
          onSearchChange={(v) => dispatch(setSearchTerm(v))}
          selectedCategoryId={selectedCategoryId}
          onCategoryChange={(v) => dispatch(setCategoryId(v))}
          onClearFilters={() => dispatch(clearFilters())}
        />
      </div>

      <div className="page-content">
        {isLoading ? (
          <ExpenseListSkeleton />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={expenses.length === 0 ? "No expenses this month" : "No matching expenses"}
            description={expenses.length === 0 ? "Tap + to record your first expense." : "Try adjusting your filters to find what you're looking for."}
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
