import { useRef } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { toggleShowGross } from '@/store/prefsSlice';

interface MonthSummaryCardProps {
  total: number;
  cashbackTotal?: number;
  count: number;
  prevTotal?: number;
  isLoading?: boolean;
}

export default function MonthSummaryCard({ total, cashbackTotal, count, prevTotal, isLoading }: MonthSummaryCardProps) {
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const diff = prevTotal !== undefined ? total - prevTotal : undefined;
  const pct = prevTotal && prevTotal > 0 ? ((diff! / prevTotal) * 100).toFixed(1) : undefined;
  const isUp = diff !== undefined && diff > 0;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPressStart = () => {
    timerRef.current = setTimeout(() => {
      dispatch(toggleShowGross());
      navigator.vibrate?.(40);
    }, 600);
  };

  const onPressEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  if (isLoading) {
    return <div className="h-28 bg-card rounded-2xl animate-pulse border border-border" />;
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted-foreground mb-1">Total Spent This Month</p>
      <p
        className="text-3xl font-bold text-primary select-none"
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerLeave={onPressEnd}
      >
        {formatINR(total)}
      </p>
      {showGross && cashbackTotal !== undefined && cashbackTotal > 0 && (
        <p className="text-sm text-muted-foreground line-through">{formatINR(total + cashbackTotal)}</p>
      )}
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
