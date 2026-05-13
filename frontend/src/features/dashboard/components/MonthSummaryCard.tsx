import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatINR } from '@/lib/utils';

interface MonthSummaryCardProps {
  total: number;
  count: number;
  prevTotal?: number;
  isLoading?: boolean;
}

export default function MonthSummaryCard({ total, count, prevTotal, isLoading }: MonthSummaryCardProps) {
  const diff = prevTotal !== undefined ? total - prevTotal : undefined;
  const pct = prevTotal && prevTotal > 0 ? ((diff! / prevTotal) * 100).toFixed(1) : undefined;
  const isUp = diff !== undefined && diff > 0;

  if (isLoading) {
    return <div className="h-28 bg-card rounded-2xl animate-pulse border border-border" />;
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted-foreground mb-1">Total Spent This Month</p>
      <p className="text-3xl font-bold text-primary">{formatINR(total)}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted-foreground">{count} expense{count !== 1 ? 's' : ''}</p>
        {pct !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-destructive' : 'text-success'}`}>
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isUp ? '+' : ''}{pct}% vs last month
          </div>
        )}
      </div>
    </div>
  );
}
