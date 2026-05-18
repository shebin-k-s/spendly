import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearFilters, toggleCategoryId, setFilterOpen } from '@/store/filterSlice';
import { formatINR } from '@/lib/utils';
import type { CategoryBreakdown as Breakdown } from '@/features/expenses/types';

interface CategoryBreakdownProps {
  breakdown: Breakdown[];
  total: number;
  isLoading?: boolean;
}

export default function CategoryBreakdown({ breakdown, total, isLoading }: CategoryBreakdownProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);

  const handleCategoryClick = (categoryId: string) => {
    dispatch(clearFilters());
    dispatch(toggleCategoryId(categoryId));
    dispatch(setFilterOpen(true));
    navigate('/expenses');
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide opacity-50">By Category</p>
        <div className="space-y-3 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center p-2 -mx-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-secondary animate-pulse" />
                <div className="w-24 h-4 rounded bg-secondary animate-pulse" />
              </div>
              <div className="w-16 h-4 rounded bg-secondary animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (breakdown.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">By Category</p>
      <div className="space-y-3">
        {breakdown.map((item) => {
          const net = item.total - (item.cashbackTotal ?? 0);
          const pct = total > 0 ? Math.max(0, (net / total) * 100) : 0;
          return (
            <button
              key={item.categoryId}
              onClick={() => handleCategoryClick(item.categoryId)}
              className="block w-full text-left hover:bg-secondary/30 p-2 -mx-2 rounded-xl transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">({item.count})</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold">{formatINR(net)}</span>
                  {showGross && (item.cashbackTotal ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground line-through">{formatINR(item.total)}</span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
