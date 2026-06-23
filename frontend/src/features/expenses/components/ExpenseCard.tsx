import { useState } from 'react';
import { formatINR, cn } from '@/lib/utils';
import { netAmount } from '../utils/expenseUtils';
import { useAppSelector } from '@/store/hooks';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import type { Expense } from '../types';
import { useLongPress } from '@/hooks/useLongPress';
import { useNavigate } from 'react-router-dom';
import { Edit2, RotateCcw, Trash2, MoreVertical } from 'lucide-react';
import { useDeleteExpense } from '../hooks/useExpenses';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

interface ExpenseCardProps {
  expense: Expense;
}

export default function ExpenseCard({ expense }: ExpenseCardProps) {
  const navigate = useNavigate();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [open, setOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const deleteExpense = useDeleteExpense();

  const handleLongPress = () => {
    setShowShortcuts(true);
  };

  const handleClick = () => {
    setOpen(true);
  };

  const longPressProps = useLongPress({
    onLongPress: handleLongPress,
    onClick: handleClick,
  });

  const handleEdit = () => {
    setShowShortcuts(false);
    navigate(`/expenses/${expense.id}/edit`, { state: { expense } });
  };

  const handleAddAgain = () => {
    setShowShortcuts(false);
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

  const handleDelete = () => {
    setShowShortcuts(false);
    setShowDeleteModal(true);
  };

  const executeDelete = () => {
    deleteExpense.mutate(expense.id, {
      onSuccess: () => setShowDeleteModal(false),
    });
  };

  return (
    <>
      <DropdownMenu.Root open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DropdownMenu.Trigger asChild>
          <div
            {...longPressProps}
            className="touch-card px-4 py-3 flex items-center gap-3 active:bg-secondary/50 transition-colors"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
            >
              {expense.category?.icon || '📦'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{expense.description}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{expense.category?.name || 'Uncategorized'}</span>
                {expense.time && (
                  <>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{fmtTime(expense.time)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="font-semibold text-sm">{formatINR(netAmount(expense))}</span>
              {showGross && Number(expense.cashback) > 0 && (
                <span className="text-[10px] text-muted-foreground line-through">{formatINR(Number(expense.amount))}</span>
              )}
            </div>
          </div>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={-40}
            className="z-[100] min-w-[180px] bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in duration-200"
          >
            <DropdownMenu.Item
              onClick={handleEdit}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-colors hover:bg-white/5 active:bg-white/10"
            >
              <Edit2 className="w-4 h-4 text-muted-foreground" />
              Edit Transaction
            </DropdownMenu.Item>

            <DropdownMenu.Item
              onClick={handleAddAgain}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-colors hover:bg-white/5 active:bg-white/10"
            >
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              Add Again
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="h-px bg-white/10 my-1" />

            <DropdownMenu.Item
              onClick={handleDelete}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 active:bg-destructive/20"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ExpenseDetailSheet expense={expense} open={open} onOpenChange={setOpen} />

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={executeDelete}
        isLoading={deleteExpense.isPending}
      />
    </>
  );
}

