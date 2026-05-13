import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, prevMonth, nextMonth, currentYearMonth } from '@/lib/utils';

interface MonthNavigatorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export default function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  const current = currentYearMonth();
  const isCurrentMonth = year === current.year && month === current.month;

  const handlePrev = () => {
    const { year: y, month: m } = prevMonth(year, month);
    onChange(y, m);
  };

  const handleNext = () => {
    if (isCurrentMonth) return;
    const { year: y, month: m } = nextMonth(year, month);
    onChange(y, m);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrev}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-sm font-semibold min-w-[110px] text-center">
        {monthLabel(year, month)}
      </span>

      <button
        onClick={handleNext}
        disabled={isCurrentMonth}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
