import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useCreateExpense } from '../hooks/useExpenses';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import { DateTimePicker } from '@/components/DateTimePicker';
import type { PaymentMethod } from '../types';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'cash', 'bank_transfer', 'other'];

export default function AddExpensePage() {
  const navigate = useNavigate();
  const createExpense = useCreateExpense();
  const { data: categories = [] } = useCategoriesQuery();

  const now = new Date();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(now, 'yyyy-MM-dd'));
  const [time, setTime] = useState<string | null>(format(now, 'HH:mm'));
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [note, setNote] = useState('');

  const canSubmit = amount.trim() && description.trim() && !createExpense.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createExpense.mutate(
      {
        amount: parseFloat(amount),
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold">Add Expense</h1>
      </div>

      <div className="page-content space-y-5">
        {/* Amount */}
        <div>
          <label className="form-label">Amount (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="form-input text-2xl font-bold"
          />
        </div>

        {/* Description */}
        <div>
          <label className="form-label">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you spend on?"
            className="form-input"
          />
        </div>

        {/* Date & Time */}
        <div>
          <label className="form-label">Date & Time</label>
          <DateTimePicker
            date={date}
            time={time}
            onChange={(d, t) => { setDate(d); setTime(t); }}
          />
        </div>

        {/* Category */}
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

        {/* Payment method */}
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

        {/* Note */}
        <div>
          <label className="form-label">Note (Optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any additional details..."
            rows={2}
            className="form-input resize-none"
          />
        </div>

        <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
          {createExpense.isPending ? 'Saving...' : 'Add Expense'}
        </button>
      </div>
    </div>
  );
}
