import { useRef } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
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
      const next = !showGross;
      dispatch(toggleShowGross());
      navigator.vibrate?.(40);
      toast(next ? 'Cashback view on' : 'Cashback view off', { duration: 1500 });
    }, 600);
  };

  const onPressEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col">
        <p className="text-xs text-muted-foreground mb-1 opacity-50">Total Spent This Month</p>
        <div className="h-9 w-32 bg-secondary animate-pulse rounded my-1" />
        <div className="flex items-center justify-between mt-2">
          <div className="h-4 w-20 bg-secondary animate-pulse rounded" />
          <div className="h-4 w-24 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
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
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground line-through">{formatINR(total + cashbackTotal)}</span>
          <span className="px-2 py-0.5 rounded-full bg-success/15 text-success/90 text-[11px] font-medium">
            saved {formatINR(cashbackTotal)}
          </span>
        </div>
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
