import { useRef } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { CashbackVisibilityIcon } from '@/components/CashbackVisibilityIcon';
import { useToggleCashback } from '@/features/webauthn/hooks/useToggleCashback';

interface MonthSummaryCardProps {
  total: number;
  cashbackTotal?: number;
  count: number;
  prevTotal?: number;
  isLoading?: boolean;
}

export default function MonthSummaryCard({ total, cashbackTotal, count, prevTotal, isLoading }: MonthSummaryCardProps) {
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const { toggle: toggleCashback } = useToggleCashback();
  const diff = prevTotal !== undefined ? total - prevTotal : undefined;
  const isUp = diff !== undefined && diff > 0;
  const isDown = diff !== undefined && diff < 0;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPressStart = () => {
    timerRef.current = setTimeout(() => {
      navigator.vibrate?.(40);
      toggleCashback();
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
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-xs text-muted-foreground mb-2 opacity-50">Total Spent This Month</p>
        <div className="h-9 w-36 bg-secondary animate-pulse rounded my-1" />
        <div className="flex items-center justify-between mt-3">
          <div className="h-3.5 w-20 bg-secondary animate-pulse rounded" />
          <div className="h-3.5 w-28 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">Total Spent This Month</p>
        <CashbackVisibilityIcon showGross={showGross} />
      </div>

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

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground">{count} expense{count !== 1 ? 's' : ''}</p>
        {diff !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-destructive' : isDown ? 'text-success' : 'text-amber-500'}`}>
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : isDown ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            <span>
              {isUp ? `+${formatINR(diff)} vs last month` : isDown ? `−${formatINR(Math.abs(diff))} vs last month` : 'no change vs last month'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
