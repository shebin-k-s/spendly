import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FreshnessStatus } from '@/hooks/useQueryFreshness';

interface DataFreshnessIndicatorProps {
  status: FreshnessStatus;
  isFetching: boolean;
}

/**
 * Minimal dot badge showing data loading/fresh status.
 * - 🟢 Green = Fresh/Loaded
 * - ⏳ Amber Spinning = Loading
 */
export function DataFreshnessIndicator({
  status,
  isFetching,
}: DataFreshnessIndicatorProps) {
  const bgColor = isFetching ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="group relative inline-block">
      <div className={cn('w-2 h-2 rounded-full', bgColor, isFetching && 'animate-pulse')} />

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-background border border-border rounded-lg text-xs text-muted-foreground whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
        {isFetching ? 'Updating...' : 'Fresh'}
      </div>
    </div>
  );
}
