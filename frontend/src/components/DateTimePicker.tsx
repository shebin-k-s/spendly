import { useState, useMemo, useEffect, useRef } from 'react';
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
import { useSwipeGesture } from '@/context/SwipeGestureContext';

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

function ScrollableNumberColumn({ value, onAdjust, step = 1 }: { value: number; onAdjust: (delta: number) => void; step?: number }) {
  const [touchY, setTouchY] = useState<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setTouchY(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (touchY === null) return;
    const currentY = e.clientY;
    const diff = touchY - currentY;
    
    // Swipe distance threshold
    if (Math.abs(diff) > 12) {
      onAdjust(diff > 0 ? step : -step);
      setTouchY(currentY); // Reset to allow continuous swiping
    }
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    setTouchY(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.deltaY !== 0) {
      onAdjust(e.deltaY > 0 ? -step : step);
    }
  };

  return (
    <div
      className="flex flex-col items-center gap-2 touch-none select-none py-1 cursor-ns-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <button
        type="button"
        onClick={() => onAdjust(step)}
        className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronUp className="w-5 h-5" />
      </button>
      <span className="text-3xl font-bold w-14 text-center tabular-nums pointer-events-none">
        {value.toString().padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={() => onAdjust(-step)}
        className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
      >
        <ChevronDown className="w-5 h-5" />
      </button>
    </div>
  );
}

export function DateTimePicker({ date, time, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  useEffect(() => {
    if (open) disableGlobalSwipe();
    else enableGlobalSwipe();
    
    return () => enableGlobalSwipe();
  }, [open, disableGlobalSwipe, enableGlobalSwipe]);

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

  const calendarTouchStartX = useRef<number | null>(null);
  const calendarTouchStartY = useRef<number | null>(null);
  const wheelCooldown = useRef(false);

  const handleCalendarPointerDown = (e: React.PointerEvent) => {
    calendarTouchStartX.current = e.clientX;
    calendarTouchStartY.current = e.clientY;
    // Do NOT call setPointerCapture here — it would swallow click events on day buttons
  };

  const handleCalendarPointerMove = (e: React.PointerEvent) => {
    if (calendarTouchStartX.current === null || calendarTouchStartY.current === null) return;

    const deltaX = calendarTouchStartX.current - e.clientX;
    const deltaY = calendarTouchStartY.current - e.clientY;

    // Only trigger month switch on clearly horizontal swipe
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
      if (deltaX > 0) {
        setViewMonth((m) => addMonths(m, 1));
      } else {
        setViewMonth((m) => subMonths(m, 1));
      }
      calendarTouchStartX.current = null;
      calendarTouchStartY.current = null;
    }
  };

  const handleCalendarPointerUp = () => {
    calendarTouchStartX.current = null;
    calendarTouchStartY.current = null;
  };

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

  const modalRef = useRef<HTMLDivElement>(null);
  const handlePointerStartY = useRef<number | null>(null);
  const handleCurrentY = useRef<number>(0);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    handlePointerStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (handlePointerStartY.current === null || !modalRef.current) return;
    
    let distance = e.clientY - handlePointerStartY.current;
    if (distance < 0) distance = 0; // Don't pull above top boundary
    
    handleCurrentY.current = distance;
    modalRef.current.style.transition = 'none';
    modalRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (handlePointerStartY.current === null || !modalRef.current) return;

    if (handleCurrentY.current > 120) {
      // Do not clear transform—allow CSS to natively interpolate from current finger drop location
      setOpen(false); // Close threshold reached
    } else {
      // Snap back if threshold not reached
      modalRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      modalRef.current.style.transform = 'translateY(0px)';
    }
    
    handlePointerStartY.current = null;
    handleCurrentY.current = 0;
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
    setMinute((m) => { const n = m + delta; return n >= 60 ? 0 : n < 0 ? 59 : n; });

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
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-500 ease-in-out" />
        <Dialog.Content
          ref={modalRef}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className={cn(
            'fixed bottom-0 z-50 w-full',
            'inset-x-0 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md sm:right-auto',
            'bg-card border-t border-border rounded-t-3xl',
            'px-4 pt-1 pb-6 max-h-[92vh] overflow-y-auto',
            'duration-500 ease-in-out',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
            'sheet-exit'
          )}
        >
          {/* Extended Drag Handle Hitbox */}
          <div 
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            className="pt-2 pb-3 mb-2 w-full flex justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          >
            <div className="w-10 h-1 bg-border rounded-full pointer-events-none" />
          </div>

          {/* Swipeable Calendar Container */}
          <div 
            onPointerDown={handleCalendarPointerDown}
            onPointerMove={handleCalendarPointerMove}
            onPointerUp={handleCalendarPointerUp}
            onWheel={(e) => {
              e.stopPropagation();
              if (wheelCooldown.current) return;
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 10) {
                wheelCooldown.current = true;
                if (e.deltaX > 0) setViewMonth((m) => addMonths(m, 1));
                else setViewMonth((m) => subMonths(m, 1));
                setTimeout(() => { wheelCooldown.current = false; }, 400);
              }
            }}
            className="touch-pan-y relative"
          >
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
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 w-full animate-fade-in">
                {/* Left empty container to push center visually */}
                <div />

                {/* Center layout */}
                <div className="flex items-center justify-center gap-2">
                  {/* Hour column */}
                  <ScrollableNumberColumn value={hour12} onAdjust={adjustHour} step={1} />

                  <span className="text-3xl font-bold text-muted-foreground self-center pb-1">:</span>

                  {/* Minute column — steps of 1 */}
                  <ScrollableNumberColumn value={minute} onAdjust={adjustMinute} step={1} />
                </div>

                {/* Right side AM/PM toggle */}
                <div className="flex justify-end pr-1">
                  <button
                    type="button"
                    onClick={() => setPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                    className="px-4 py-4 rounded-xl bg-secondary text-sm font-bold active:opacity-60 transition-opacity"
                  >
                    {period}
                  </button>
                </div>
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
