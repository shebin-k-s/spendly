import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as Dialog from '@radix-ui/react-dialog';
import { formatINR } from '@/lib/utils';
import { netAmount } from '../utils/expenseUtils';
import { useAppSelector } from '@/store/hooks';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import type { Expense } from '../types';

interface Props {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function ExpenseDetailSheet({ expense, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

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
    if (distance < 0) distance = 0;
    handleCurrentY.current = distance;
    modalRef.current.style.transition = 'none';
    modalRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (handlePointerStartY.current === null || !modalRef.current) return;
    if (handleCurrentY.current > 120) {
      onOpenChange(false);
    } else {
      modalRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      modalRef.current.style.transform = 'translateY(0px)';
    }
    handlePointerStartY.current = null;
    handleCurrentY.current = 0;
  };

  const net = netAmount(expense);
  const hasCashback = Number(expense.cashback) > 0;

  const handleEdit = () => {
    onOpenChange(false);
    navigate(`/expenses/${expense.id}/edit`, { state: { expense } });
  };

  const handleAddAgain = () => {
    onOpenChange(false);
    navigate('/expenses/new', {
      state: {
        prefill: {
          amount: String(expense.amount),
          description: expense.description,
          categoryId: expense.category?.id ?? '',
          note: expense.note ?? '',
        },
      },
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-500 ease-in-out" />
          <Dialog.Content
            ref={modalRef}
            data-no-swipe
            onPointerEnter={disableGlobalSwipe}
            onPointerLeave={enableGlobalSwipe}
            className="fixed bottom-0 inset-x-0 w-full sm:max-w-md sm:mx-auto z-50 bg-card border-t border-border rounded-t-3xl max-h-[85vh] flex flex-col duration-500 ease-in-out data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sheet-exit"
          >
            {/* Drag handle */}
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              className="pt-2 pb-3 w-full flex justify-center cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
            >
              <div className="w-10 h-1 bg-border rounded-full pointer-events-none" />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* Header */}
              <div className="flex items-center gap-3 px-5 pb-5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor: expense.category?.color ?? '#475569' }}
                >
                  {expense.category?.icon ?? '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base truncate">{expense.description}</p>
                  <p className="text-sm text-muted-foreground">{expense.category?.name ?? 'Uncategorized'}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <p className="text-xl font-bold">{formatINR(net)}</p>
                  {showGross && hasCashback && (
                    <span className="text-xs text-muted-foreground line-through">{formatINR(Number(expense.amount))}</span>
                  )}
                </div>
              </div>

              {/* Detail rows */}
              <div className="border-t border-border">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="text-sm font-medium">
                    {format(parseISO(expense.date), 'dd MMM yyyy')}
                    {expense.time && (
                      <span className="text-muted-foreground font-normal"> · {fmtTime(expense.time)}</span>
                    )}
                  </span>
                </div>

                {hasCashback && (
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <span className="text-sm text-muted-foreground">Cashback</span>
                    <span className="text-sm font-medium text-success">+{formatINR(Number(expense.cashback))}</span>
                  </div>
                )}

                {expense.note && (
                  <div className="px-5 py-3.5 border-b border-border">
                    <p className="text-sm text-muted-foreground mb-1">Note</p>
                    <p className="text-sm">{expense.note}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pt-5 pb-8 flex gap-3">
                <button
                  onClick={handleAddAgain}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-secondary-foreground text-sm font-semibold active:opacity-70 transition-opacity select-none outline-none"
                >
                  <RotateCcw className="w-4 h-4" />
                  Add again
                </button>
                <button
                  onClick={handleEdit}
                  className="flex-1 btn-primary select-none outline-none"
                >
                  Edit
                </button>
              </div>

            </div>
          </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
  );
}
