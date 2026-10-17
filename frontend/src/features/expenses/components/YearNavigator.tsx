import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentYearMonth } from '@/lib/utils';

interface YearNavigatorProps {
  year: number;
  onChange: (year: number) => void;
}

export default function YearNavigator({ year, onChange }: YearNavigatorProps) {
  const isCurrentYear = year >= currentYearMonth().year;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(year - 1)}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold min-w-[110px] text-center px-2 py-1">{year}</span>
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
