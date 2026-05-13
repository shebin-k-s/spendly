import { useState, useMemo } from 'react';
import {
  format, parse, isValid,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isToday,
  addMonths, subMonths, subDays,
} from 'date-fns';
import * as Dialog from '@radix-ui/react-dialog';
import { Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEK_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface DateTimePickerProps {
  date: string;
  time: string | null;
  onChange: (date: string, time: string | null) => void;
}

function fmtDisplayDate(dateStr: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'd MMM yyyy') : dateStr;
}

function fmtDisplayTime(h12: number, min: number, p: 'AM' | 'PM'): string {
  return `${h12}:${min.toString().padStart(2, '0')} ${p}`;
}

function parseTimeProp(t: string | null): { h12: number; minute: number; period: 'AM' | 'PM' } {
  const src = t ?? format(new Date(), 'HH:mm');
  const [h, m] = src.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { h12, minute: m, period };
}

function toTime24(h12: number, minute: number, period: 'AM' | 'PM'): string {
  let h24 = h12;
  if (period === 'AM' && h12 === 12) h24 = 0;
  else if (period === 'PM' && h12 !== 12) h24 = h12 + 12;
  return `${h24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function DateTimePicker({ date, time, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const parsedInitial = useMemo(() => {
    const d = parse(date, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : new Date();
  }, [date]);

  const [viewMonth, setViewMonth] = useState<Date>(parsedInitial);
  const [selectedDate, setSelectedDate] = useState<Date>(parsedInitial);
  const [timeEnabled, setTimeEnabled] = useState(!!time);
  const [hour12, setHour12] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const displayLabel = useMemo(() => {
    const datePart = fmtDisplayDate(date);
    if (!time) return datePart;
    const { h12: h, minute: m, period: p } = parseTimeProp(time);
    return `${datePart}, ${fmtDisplayTime(h, m, p)}`;
  }, [date, time]);

  const handleOpen = () => {
    const d = parse(date, 'yyyy-MM-dd', new Date());
    const valid = isValid(d) ? d : new Date();
    setViewMonth(valid);
    setSelectedDate(valid);
    const { h12: h, minute: m, period: p } = parseTimeProp(time);
    setTimeEnabled(!!time);
    setHour12(h);
    setMinute(m);
    setPeriod(p);
    setOpen(true);
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, viewMonth)) setViewMonth(day);
  };

  const handleConfirm = () => {
    onChange(format(selectedDate, 'yyyy-MM-dd'), timeEnabled ? toTime24(hour12, minute, period) : null);
    setOpen(false);
  };

  const setToNow = () => {
    const { h12: h, minute: m, period: p } = parseTimeProp(null);
    setHour12(h);
    setMinute(m);
    setPeriod(p);
    setTimeEnabled(true);
  };

  const adjustHour = (delta: number) =>
    setHour12((h) => { const n = h + delta; return n > 12 ? 1 : n < 1 ? 12 : n; });

  const adjustMinute = (delta: number) =>
    setMinute((m) => { const n = m + delta; return n >= 60 ? 0 : n < 0 ? 55 : n; });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={handleOpen}
          className="form-input flex items-center justify-between text-left gap-2"
        >
          <span>{displayLabel}</span>
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 animate-in fade-in duration-200" />
        <Dialog.Content
          className={cn(
            'fixed bottom-0 inset-x-0 z-50',
            'sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md sm:right-auto',
            'bg-card border-t border-border rounded-t-3xl',
            'px-4 pt-3 pb-6 max-h-[92vh] overflow-y-auto',
            'animate-in slide-in-from-bottom duration-300',
          )}
        >
          <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm">{format(viewMonth, 'MMMM yyyy')}</span>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Week day headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEK_DAYS.map((d) => (
              <span key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrDay = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'h-9 w-full rounded-xl text-sm font-medium transition-colors',
                    !inMonth && 'opacity-20 pointer-events-none',
                    isSelected && 'bg-primary text-primary-foreground',
                    !isSelected && isCurrDay && 'border border-primary text-primary',
                    !isSelected && !isCurrDay && inMonth && 'active:bg-secondary',
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border my-4" />

          {/* Time picker */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Time <span className="opacity-60">(optional)</span>
                </span>
              </div>
              {!timeEnabled ? (
                <button
                  type="button"
                  onClick={setToNow}
                  className="text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/10 active:opacity-60 transition-opacity"
                >
                  Set to now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTimeEnabled(false)}
                  className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-secondary active:opacity-60 transition-opacity"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {timeEnabled && (
              <div className="flex items-center justify-center gap-3">
                {/* Hour column */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustHour(1)}
                    className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <span className="text-3xl font-bold w-14 text-center tabular-nums">
                    {hour12.toString().padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustHour(-1)}
                    className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>

                <span className="text-3xl font-bold text-muted-foreground self-center">:</span>

                {/* Minute column — steps of 5 */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustMinute(5)}
                    className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <span className="text-3xl font-bold w-14 text-center tabular-nums">
                    {minute.toString().padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustMinute(-5)}
                    className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>

                {/* AM / PM toggle */}
                <button
                  type="button"
                  onClick={() => setPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                  className="px-4 py-3 rounded-xl bg-secondary text-sm font-bold active:opacity-60 transition-opacity self-center"
                >
                  {period}
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-5">
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium active:opacity-70 transition-opacity"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:opacity-80 transition-opacity"
            >
              Set Date & Time
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
