import { formatINR } from '@/lib/utils';
import type { CategoryBreakdown as Breakdown } from '@/features/expenses/types';

interface CategoryBreakdownProps {
  breakdown: Breakdown[];
  total: number;
  isLoading?: boolean;
}

export default function CategoryBreakdown({ breakdown, total, isLoading }: CategoryBreakdownProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-card rounded-xl animate-pulse border border-border" />
        ))}
      </div>
    );
  }

  if (breakdown.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">By Category</p>
      <div className="space-y-3">
        {breakdown.map((item) => {
          const pct = total > 0 ? (item.total / total) * 100 : 0;
          return (
            <div key={item.categoryId}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">({item.count})</span>
                </div>
                <span className="text-sm font-semibold">{formatINR(item.total)}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
