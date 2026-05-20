import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { useExpenseById, useUpdateExpense, useDeleteExpense } from '../hooks/useExpenses';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import type { PaymentMethod } from '../types';
import { useSwipeGesture } from '@/context/SwipeGestureContext';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'cash', 'bank_transfer', 'other'];

export default function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: expense, isLoading } = useExpenseById(id!);
  const { data: categories = [] } = useCategoriesQuery();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [amount, setAmount] = useState('');
  const [cashback, setCashback] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [note, setNote] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  useEffect(() => {
    disableGlobalSwipe();
    return () => enableGlobalSwipe();
  }, [disableGlobalSwipe, enableGlobalSwipe]);

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setCashback(expense.cashback ? String(expense.cashback) : '');
      setDescription(expense.description);
      setDate(expense.date);
      setTime(expense.time ?? null);
      setCategoryId(expense.category?.id || '');
      setPaymentMethod(expense.paymentMethod);
      setNote(expense.note || '');
    }
  }, [expense]);

  const canSubmit = amount.trim() && description.trim() && !updateExpense.isPending;

  const handleUpdate = () => {
    if (!canSubmit) return;
    updateExpense.mutate(
      {
        id: id!,
        amount: parseFloat(amount),
        cashback: cashback ? parseFloat(cashback) : 0,
        description: description.trim(),
        date,
        time: time || undefined,
        paymentMethod,
        note: note.trim() || undefined,
        categoryId: categoryId || undefined,
      },
      { onSuccess: () => navigate('/expenses') },
    );
  };

  const handleDelete = () => setShowDeleteModal(true);
  const executeDelete = () => deleteExpense.mutate(id!, { onSuccess: () => navigate('/expenses') });

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold flex-1">Edit Expense</h1>
        </div>
        <div className="page-content space-y-5 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 bg-secondary/80 animate-pulse rounded" />
              <div className="h-12 bg-card border border-border rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold flex-1">Edit Expense</h1>
        <button
          onClick={handleUpdate}
          disabled={!canSubmit}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
        >
          <Check className="w-4 h-4 text-primary" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteExpense.isPending}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>
      </div>

      <div className="page-content space-y-5">
        <div>
          <label className="form-label">Amount (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className="form-input text-2xl font-bold"
          />
        </div>

        <div>
          <label className="form-label">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" />
        </div>

        <div>
          <label className="form-label">
            Cashback (₹) <span className="text-muted-foreground font-normal">— Optional</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={cashback}
            onChange={(e) => setCashback(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.00"
            className="form-input"
          />
          {cashback && parseFloat(cashback) > 0 && amount && parseFloat(amount) > 0 && (
            <p className="text-xs text-emerald-500 mt-1.5">
              Net: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(parseFloat(amount) - parseFloat(cashback))}
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Date & Time</label>
          <DateTimePicker
            date={date || new Date().toISOString().slice(0, 10)}
            time={time}
            onChange={(d, t) => { setDate(d); setTime(t); }}
          />
        </div>

        <div>
          <label className="form-label">Category</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setCategoryId('')}
              className={`py-2.5 rounded-xl text-xs font-medium transition-colors
                ${!categoryId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
            >
              None
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 justify-center
                  ${categoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
              >
                <span>{cat.icon}</span>
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2.5 rounded-xl text-xs font-medium transition-colors
                  ${paymentMethod === method ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Note (Optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="form-input resize-none" />
        </div>

        <button onClick={handleUpdate} disabled={!canSubmit} className="btn-primary">
          {updateExpense.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={executeDelete}
      />
    </div>
  );
}
