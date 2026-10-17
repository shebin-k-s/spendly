import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentYearMonth } from '@/lib/utils';
import { useLongPress } from '@/hooks/useLongPress';

interface YearNavigatorProps {
  year: number;
  onChange: (year: number) => void;
  // Press and hold the year label.
  onLongPress?: () => void;
}

export default function YearNavigator({ year, onChange, onLongPress }: YearNavigatorProps) {
  const isCurrentYear = year >= currentYearMonth().year;
  const press = useLongPress({ onLongPress: () => onLongPress?.(), delay: 380 });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(year - 1)}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span
        {...press}
        // A scroll or drag that starts here cancels the pointer; that must cancel the hold too.
        onPointerCancel={press.onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        className="text-sm font-semibold min-w-[110px] text-center px-2 py-1 rounded-lg select-none active:bg-secondary transition-colors"
      >
        {year}
      </span>
      <button
        onClick={() => onChange(year + 1)}
        disabled={isCurrentYear}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
