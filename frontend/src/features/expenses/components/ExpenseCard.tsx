import { useState } from 'react';
import { formatINR } from '@/lib/utils';
import { netAmount } from '../utils/expenseUtils';
import { useAppSelector } from '@/store/hooks';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import type { Expense } from '../types';
import { useLongPress } from '@/hooks/useLongPress';
import { useNavigate } from 'react-router-dom';
import { Edit2, RotateCcw, Trash2 } from 'lucide-react';
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

  const longPressProps = useLongPress({
    onLongPress: () => setShowShortcuts(true),
    onClick: () => setOpen(true),
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
      {/*
        The card is a normal div with long-press handlers.
        DropdownMenu.Root is controlled entirely via `open` state.
        A zero-size Trigger sits at the right edge of the card so the
        popup anchors there — but since it has no pointer events and is
        not interactive, tapping the card never opens the menu.
      */}
      <div
        {...longPressProps}
        className={`touch-card px-4 py-3 flex items-center gap-3 transition-colors relative ${showShortcuts ? 'bg-secondary/60 ring-1 ring-inset ring-primary/30' : 'active:bg-secondary/50'}`}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
        >
          {expense.category?.icon || '📦'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{expense.description}</p>
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

        {/* Zero-size anchor for the popup — no pointer events, purely for positioning */}
        <DropdownMenu.Root open={showShortcuts} onOpenChange={setShowShortcuts}>
          <DropdownMenu.Trigger
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 opacity-0 pointer-events-none"
          />
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="bottom"
              align="center"
              sideOffset={4}
              className="z-[200] min-w-[200px] bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative group data-[side=bottom]:origin-top data-[side=top]:origin-bottom"
            >
              {/* Arrow pointing UP — visible when popup is BELOW the card (default) */}
              <div className="absolute -top-[8.5px] left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-card border-l border-t border-border group-data-[side=top]:hidden" />
              {/* Arrow pointing DOWN — visible when popup is ABOVE the card (flipped) */}
              <div className="absolute -bottom-[8.5px] left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-card border-r border-b border-border hidden group-data-[side=top]:block" />

              {/* Context header — always present so the active transaction is clear */}
              <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: expense.category ? expense.category.color : '#475569' }}
                >
                  {expense.category?.icon || '📦'}
                </div>
                <p className="text-xs font-semibold truncate flex-1">{expense.description}</p>
                <span className="text-xs font-bold tabular-nums flex-shrink-0 text-muted-foreground">{formatINR(netAmount(expense))}</span>
              </div>

              {/* Inner wrapper clips the item hover states to rounded corners */}
              <div className="overflow-hidden rounded-b-2xl p-1">
                <DropdownMenu.Item
                  onSelect={handleEdit}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors hover:bg-secondary/60 active:bg-secondary"
                >
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                  Edit Transaction
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onSelect={handleAddAgain}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors hover:bg-secondary/60 active:bg-secondary"
                >
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  Add Again
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-border my-1" />

                <DropdownMenu.Item
                  onSelect={handleDelete}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium text-destructive outline-none cursor-pointer transition-colors hover:bg-destructive/10 active:bg-destructive/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </DropdownMenu.Item>
              </div>
            </DropdownMenu.Content>

          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

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
