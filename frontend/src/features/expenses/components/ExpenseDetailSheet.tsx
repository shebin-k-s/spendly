import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as Dialog from '@radix-ui/react-dialog';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { formatINR } from '@/lib/utils';
import { useDeleteExpense } from '../hooks/useExpenses';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ICONS, netAmount } from '../utils/expenseUtils';
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
  const deleteExpense = useDeleteExpense();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
    navigate(`/expenses/${expense.id}/edit`);
  };

  const executeDelete = () => {
    deleteExpense.mutate(expense.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <>
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

              {/* Hero — icon + description + amount centered */}
              <div className="flex flex-col items-center px-4 pt-2 pb-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                  style={{ backgroundColor: expense.category?.color ?? '#475569' }}
                >
                  {expense.category?.icon ?? '📦'}
                </div>
                <p className="text-lg font-bold text-center">{expense.description}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{expense.category?.name ?? 'Uncategorized'}</p>
                <p className="text-4xl font-bold text-primary mt-4">{formatINR(net)}</p>
                {showGross && hasCashback && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground line-through">{formatINR(Number(expense.amount))}</span>
                    <span className="px-2 py-0.5 rounded-full bg-success/15 text-success/90 text-[11px] font-medium">
                      saved {formatINR(Number(expense.cashback))}
                    </span>
                  </div>
                )}
              </div>

              {/* Detail rows */}
              <div className="px-4 pb-4">
                <div className="bg-secondary/50 rounded-2xl divide-y divide-border">

                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm text-muted-foreground">Date</span>
                    <span className="text-sm font-medium">
                      {format(parseISO(expense.date), 'dd MMM yyyy')}
                      {expense.time && (
                        <span className="text-muted-foreground font-normal"> · {fmtTime(expense.time)}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm text-muted-foreground">Payment</span>
                    <span className="text-sm font-medium">
                      {PAYMENT_METHOD_ICONS[expense.paymentMethod]} {PAYMENT_METHOD_LABELS[expense.paymentMethod]}
                    </span>
                  </div>

                  {hasCashback && (
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-sm text-muted-foreground">Cashback</span>
                      <span className="text-sm font-medium text-success">+{formatINR(Number(expense.cashback))}</span>
                    </div>
                  )}

                </div>
              </div>

              {/* Note */}
              {expense.note && (
                <div className="px-4 pb-4">
                  <div className="bg-secondary/50 rounded-2xl px-4 py-3.5">
                    <p className="text-xs text-muted-foreground mb-1">Note</p>
                    <p className="text-sm">{expense.note}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="px-4 pb-8 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={deleteExpense.isPending}
                  className="py-3.5 rounded-2xl bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={handleEdit}
                  className="py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              </div>

            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={executeDelete}
      />
    </>
  );
}
