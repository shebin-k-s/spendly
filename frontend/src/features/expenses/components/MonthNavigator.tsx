import { useState, startTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, prevMonth, nextMonth, currentYearMonth } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface MonthNavigatorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

const YEAR_PICKER_SPAN = 20;
const MONTHS = Array.from({ length: 12 }, (_, i) => i);

export default function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  const current = currentYearMonth();
  const isCurrentMonth = year === current.year && month === current.month;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerView, setPickerView] = useState<'year' | 'month'>('year');
  const [pickerYear, setPickerYear] = useState(year);

  const handlePrev = () => {
    const { year: y, month: m } = prevMonth(year, month);
    onChange(y, m);
  };

  const handleNext = () => {
    if (isCurrentMonth) return;
    const { year: y, month: m } = nextMonth(year, month);
    onChange(y, m);
  };

  const openPicker = () => {
    setPickerYear(year);
    setPickerView('year');
    setPickerOpen(true);
  };

  const selectYear = (y: number) => {
    setPickerYear(y);
    setPickerView('month');
  };

  // Close the sheet as an urgent update so its slide-down animation plays
  // smoothly, and defer the (expensive — swaps the whole expense list) onChange
  // as a low-priority transition so it doesn't compete with that animation.
  const selectMonth = (monthIndex: number) => {
    setPickerOpen(false);
    startTransition(() => onChange(pickerYear, monthIndex + 1));
  };

  const jumpToCurrent = () => {
    setPickerOpen(false);
    startTransition(() => onChange(current.year, current.month));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrev}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={openPicker}
        className="text-sm font-semibold min-w-[110px] text-center px-2 py-1 rounded-lg active:bg-secondary transition-colors"
      >
        {monthLabel(year, month)}
      </button>

      <button
        onClick={handleNext}
        disabled={isCurrentMonth}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <BottomSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        header={
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">
              {pickerView === 'year' ? 'Jump to Year' : String(pickerYear)}
            </Dialog.Title>
            {!isCurrentMonth && (
              <button
                onClick={jumpToCurrent}
                className="text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/10 active:opacity-60 transition-opacity"
              >
                Current Month
              </button>
            )}
          </div>
        }
      >
        <div className="px-5 pt-2 pb-6">
          {pickerView === 'month' && (
            <button
              onClick={() => setPickerView('year')}
              className="flex items-center gap-1 text-xs text-muted-foreground mb-3 px-1 active:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back to years
            </button>
          )}

          {pickerView === 'year' ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: YEAR_PICKER_SPAN + 1 }, (_, i) => current.year - i).map((y) => (
                <button
                  key={y}
                  onClick={() => selectYear(y)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    y === year ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground active:opacity-60'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((monthIndex) => {
                const isFuture = pickerYear === current.year && monthIndex + 1 > current.month;
                const isSelected = pickerYear === year && monthIndex + 1 === month;
                return (
                  <button
                    key={monthIndex}
                    onClick={() => selectMonth(monthIndex)}
                    disabled={isFuture}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-30 ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground active:opacity-60'
                    }`}
                  >
                    {monthLabel(pickerYear, monthIndex + 1).split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
