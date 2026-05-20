import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Share2, Sparkles, AlertCircle, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useCreateExpense } from '../hooks/useExpenses';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import { parseShareText } from '../utils/parseShareText';
import { DateTimePicker } from '@/components/DateTimePicker';
import apiClient from '@/lib/apiClient';
import { expensesApi } from '../api/expensesApi';
import type { PaymentMethod } from '../types';
import type { Category } from '@/features/categories/types';

type CategoryOption = Pick<Category, 'id' | 'name' | 'icon'>;

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'cash', 'bank_transfer', 'other'];

type AiStatus = 'idle' | 'loading' | 'done' | 'error';

interface ParsedImage {
  amount: string;
  description: string;
  payment_method: PaymentMethod;
  date: string | null;
  time: string | null;
  category_id: string | null;
  category_name?: string | null;
  note?: string | null;
}

async function readSharedImage(): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('spendly-share');
    const response = await cache.match('/share-image');
    if (!response) return null;
    const blob = await response.blob();
    // Clear from cache after reading so it doesn't persist stale
    await cache.delete('/share-image');
    return blob;
  } catch {
    return null;
  }
}

const AI_TIMEOUT_MS = 20_000;

async function parseImage(blob: Blob): Promise<ParsedImage> {
  const formData = new FormData();
  formData.append('image', blob, 'share.jpg');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const { data } = await apiClient.post<ParsedImage>('/expenses/parse-image', formData, {
      signal: controller.signal,
    });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default function AddExpensePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const createExpense = useCreateExpense();
  const categoriesQuery = useCategoriesQuery();
  const categories = categoriesQuery.data || [];

  const shareRaw = searchParams.get('text') || searchParams.get('title') || '';
  const sharedImage = searchParams.get('shared') === 'image';
  const parsed = useMemo(() => shareRaw ? parseShareText(shareRaw) : null, [shareRaw]);
  const prefill = (location.state as { prefill?: { amount: string; description: string; paymentMethod: PaymentMethod; categoryId: string; note: string } } | null)?.prefill ?? null;

  const now = new Date();
  const [amount, setAmount] = useState(prefill?.amount ?? parsed?.amount ?? '');
  const [cashback, setCashback] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? parsed?.description ?? '');
  const [date, setDate] = useState(parsed?.date ?? format(now, 'yyyy-MM-dd'));
  const [time, setTime] = useState<string | null>(parsed?.time ?? format(now, 'HH:mm'));
  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.paymentMethod ?? parsed?.paymentMethod ?? 'upi');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiError, setAiError] = useState<'timeout' | 'failed' | null>(null);
  const [nlText, setNlText] = useState('');
  const [nlStatus, setNlStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const sharedBlobRef = useRef<Blob | null>(null);
  const hasAttemptedParse = useRef(false);

  const runAiParse = async (blob: Blob) => {
    setAiStatus('loading');
    setAiError(null);
    try {
      const result = await parseImage(blob);
      if (result.amount) setAmount(result.amount);
      if (result.description) setDescription(result.description);
      if (result.payment_method) setPaymentMethod(result.payment_method);
      if (result.date) setDate(result.date);
      if (result.time) setTime(result.time);
      if (result.category_id) setCategoryId(result.category_id);
      if (result.note) setNote(result.note);
      setAiStatus('done');
    } catch (err: unknown) {
      const isAborted = (err as { name?: string })?.name === 'AbortError'
        || (err as { code?: string })?.code === 'ERR_CANCELED';
      setAiError(isAborted ? 'timeout' : 'failed');
      setAiStatus('error');
    }
  };

  useEffect(() => {
    if (!sharedImage || hasAttemptedParse.current) return;
    hasAttemptedParse.current = true;
    void (async () => {
      const blob = await readSharedImage();
      if (!blob) {
        setAiError('failed');
        setAiStatus('error');
        return;
      }
      sharedBlobRef.current = blob;
      await runAiParse(blob);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedImage]);

  const handleNlParse = async () => {
    if (!nlText.trim() || nlStatus === 'loading') return;
    setNlStatus('loading');
    try {
      const result = await expensesApi.parseText(nlText.trim());
      if (typeof result.amount === 'string' && result.amount) setAmount(result.amount);
      if (typeof result.description === 'string' && result.description) setDescription(result.description);
      if (typeof result.payment_method === 'string') setPaymentMethod(result.payment_method as PaymentMethod);
      if (typeof result.date === 'string' && result.date) setDate(result.date);
      if (typeof result.time === 'string' && result.time) setTime(result.time);
      if (typeof result.category_id === 'string' && result.category_id) setCategoryId(result.category_id);
      if (typeof result.note === 'string' && result.note) setNote(result.note);
      if (typeof result.cashback === 'string' && result.cashback) setCashback(result.cashback);
      setNlStatus('done');
    } catch {
      setNlStatus('error');
    }
  };

  const canSubmit = amount.trim() && description.trim() && !createExpense.isPending && aiStatus !== 'loading';

  const handleSubmit = () => {
    if (!canSubmit) return;
    createExpense.mutate(
      {
        amount: parseFloat(amount),
        cashback: cashback ? parseFloat(cashback) : undefined,
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

  const isFromShare = sharedImage || !!parsed;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => isFromShare ? navigate('/expenses') : navigate(-1)}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold flex-1">Add Expense</h1>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
        >
          <Check className="w-4 h-4 text-primary" />
        </button>
      </div>

      <div className="page-content space-y-5">
        {/* AI loading banner */}
        {sharedImage && aiStatus === 'loading' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
            <p className="text-xs font-medium text-primary">Analyzing screenshot with AI...</p>
          </div>
        )}

        {/* AI success banner */}
        {sharedImage && aiStatus === 'done' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-xs font-medium text-primary">Pre-filled from payment screenshot — review and save</p>
          </div>
        )}

        {/* AI error banner */}
        {sharedImage && aiStatus === 'error' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-destructive/8 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs font-medium text-destructive flex-1">
              {aiError === 'timeout' ? 'Analysis timed out' : "Couldn't analyze screenshot"} — fill in manually
            </p>
            {sharedBlobRef.current && (
              <button
                onClick={() => runAiParse(sharedBlobRef.current!)}
                className="flex items-center gap-1 text-xs font-medium text-destructive underline underline-offset-2 flex-shrink-0"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
        )}

        {/* Natural language input */}
        {!sharedImage && !parsed && !prefill && (
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="form-label">Quick parse</label>
                <textarea
                  value={nlText}
                  onChange={(e) => { setNlText(e.target.value); if (nlStatus !== 'idle') setNlStatus('idle'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleNlParse(); } }}
                  placeholder={'Describe your expense — e.g. "Zomato 350 UPI" or "coffee 80 cash"'}
                  rows={2}
                  className="form-input resize-none text-sm"
                />
              </div>
              <button
                onClick={() => void handleNlParse()}
                disabled={!nlText.trim() || nlStatus === 'loading'}
                className="mb-[1px] px-4 h-[46px] rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
              >
                {nlStatus === 'loading'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                Parse
              </button>
            </div>
            {nlStatus === 'done' && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-primary/8 border border-primary/20">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-xs font-medium text-primary">Form filled — review and save</p>
              </div>
            )}
            {nlStatus === 'error' && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-destructive/8 border border-destructive/20">
                <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs font-medium text-destructive">Couldn't parse — try being more specific or fill manually</p>
              </div>
            )}
          </div>
        )}

        {/* Repeat pre-fill banner */}
        {prefill && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-xs font-medium text-primary">Pre-filled from a previous expense — review and save</p>
          </div>
        )}

        {/* Text share pre-fill banner */}
        {parsed && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <Share2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">Pre-filled from shared text</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words line-clamp-2">{shareRaw}</p>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="form-label">Amount (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
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

        {/* Cashback */}
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
          {createExpense.isPending ? 'Saving...' : aiStatus === 'loading' ? 'Analyzing...' : 'Add Expense'}
        </button>
      </div>
    </div>
  );
}
