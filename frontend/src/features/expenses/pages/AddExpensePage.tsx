import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Share2, Sparkles, AlertCircle, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
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
import { useSwipeGesture } from '@/context/SwipeGestureContext';

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
  cashback?: string | number | null;
  shareType?: 'image' | 'text';
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

async function popShareResult(): Promise<(ParsedImage & { cashback?: string }) | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('spendly-share');
    const queueRes = await cache.match('/share-queue');
    if (!queueRes) return null;
    const queue: Array<{ type: string; result: ParsedImage & { cashback?: string }; ts: number }> = await queueRes.json();
    if (!queue.length) return null;
    const item = queue.shift()!;
    if (queue.length > 0) {
      await cache.put('/share-queue', new Response(JSON.stringify(queue), {
        headers: { 'Content-Type': 'application/json' },
      }));
      navigator.setAppBadge?.(queue.length);
    } else {
      await cache.delete('/share-queue');
      navigator.clearAppBadge?.();
    }
    return item.result;
  } catch {
    return null;
  }
}

async function readSharedText(): Promise<string | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('spendly-share');
    const response = await cache.match('/share-text');
    if (!response) return null;
    const text = await response.text();
    await cache.delete('/share-text');
    return text;
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
  const sharedText  = searchParams.get('shared') === 'text';
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
  const [showQuickParse, setShowQuickParse] = useState(false);
  const sharedBlobRef = useRef<Blob | null>(null);
  const hasAttemptedParse = useRef(false);
  const hasAttemptedTextParse = useRef(false);

  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  useEffect(() => {
    disableGlobalSwipe();
    return () => enableGlobalSwipe();
  }, [disableGlobalSwipe, enableGlobalSwipe]);

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
      if (result.cashback) setCashback(String(result.cashback));
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
    
    // Signal the Service Worker that we are handling the share in the foreground,
    // so it can skip showing a background notification.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'APP_TAKEN_OVER_SHARE' });
    }

    void (async () => {
      // First, check if there's already a cached result from the SW (background parse)
      const cachedResult = await popShareResult();
      if (cachedResult) {
        console.log('[App] Using cached AI result from Service Worker');
        if (cachedResult.amount) setAmount(cachedResult.amount);
        if (cachedResult.description) setDescription(cachedResult.description);
        if (cachedResult.payment_method) setPaymentMethod(cachedResult.payment_method);
        if (cachedResult.date) setDate(cachedResult.date);
        if (cachedResult.time) setTime(cachedResult.time);
        if (cachedResult.category_id) setCategoryId(cachedResult.category_id);
        if (cachedResult.note) setNote(cachedResult.note);
        if (cachedResult.cashback) setCashback(String(cachedResult.cashback));
        setAiStatus('done');
        return;
      }

      // If no cached result, proceed with normal parse
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

  useEffect(() => {
    if (!sharedText || hasAttemptedTextParse.current) return;
    hasAttemptedTextParse.current = true;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'APP_TAKEN_OVER_SHARE' });
    }

    void (async () => {
      const cachedResult = await popShareResult();
      if (cachedResult) {
        if (cachedResult.amount) setAmount(cachedResult.amount);
        if (cachedResult.description) setDescription(cachedResult.description);
        if (cachedResult.payment_method) setPaymentMethod(cachedResult.payment_method);
        if (cachedResult.date) setDate(cachedResult.date);
        if (cachedResult.time) setTime(cachedResult.time);
        if (cachedResult.category_id) setCategoryId(cachedResult.category_id);
        if (cachedResult.note) setNote(cachedResult.note);
        if (cachedResult.cashback) setCashback(String(cachedResult.cashback));
        setAiStatus('done');
        return;
      }

      const text = await readSharedText();
      if (!text) { setAiError('failed'); setAiStatus('error'); return; }

      setAiStatus('loading');
      setAiError(null);
      try {
        const result = await expensesApi.parseText(text);
        setAmount(typeof result.amount === 'string' ? result.amount : '');
        setDescription(typeof result.description === 'string' ? result.description : '');
        setPaymentMethod((typeof result.payment_method === 'string' ? result.payment_method : 'upi') as PaymentMethod);
        setDate(typeof result.date === 'string' && result.date ? result.date : format(new Date(), 'yyyy-MM-dd'));
        setTime(typeof result.time === 'string' && result.time ? result.time : format(new Date(), 'HH:mm'));
        setCategoryId(typeof result.category_id === 'string' ? result.category_id : '');
        setNote(typeof result.note === 'string' ? result.note : '');
        setCashback(typeof result.cashback === 'string' ? result.cashback : '');
        setAiStatus('done');
      } catch {
        setAiError('failed');
        setAiStatus('error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedText]);

  const handleNlParse = async () => {
    if (!nlText.trim() || nlStatus === 'loading') return;
    setNlStatus('loading');
    try {
      const result = await expensesApi.parseText(nlText.trim());
      setAmount(typeof result.amount === 'string' ? result.amount : '');
      setDescription(typeof result.description === 'string' ? result.description : '');
      setPaymentMethod((typeof result.payment_method === 'string' ? result.payment_method : 'upi') as PaymentMethod);
      setDate(typeof result.date === 'string' && result.date ? result.date : format(new Date(), 'yyyy-MM-dd'));
      setTime(typeof result.time === 'string' && result.time ? result.time : format(new Date(), 'HH:mm'));
      setCategoryId(typeof result.category_id === 'string' ? result.category_id : '');
      setNote(typeof result.note === 'string' ? result.note : '');
      setCashback(typeof result.cashback === 'string' ? result.cashback : '');
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
      { onSuccess: () => { navigator.clearAppBadge?.(); navigate('/expenses'); } },
    );
  };

  const isFromShare = sharedImage || sharedText || !!parsed;

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
        {(sharedImage || sharedText) && aiStatus === 'loading' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
            <p className="text-xs font-medium text-primary">
              {sharedImage ? 'Analyzing screenshot with AI…' : 'Parsing message with AI…'}
            </p>
          </div>
        )}

        {/* AI success banner */}
        {(sharedImage || sharedText) && aiStatus === 'done' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-xs font-medium text-primary">
              {sharedImage ? 'Pre-filled from payment screenshot' : 'Pre-filled from shared message'} — review and save
            </p>
          </div>
        )}

        {/* AI error banner */}
        {(sharedImage || sharedText) && aiStatus === 'error' && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-destructive/8 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs font-medium text-destructive flex-1">
              {aiError === 'timeout' ? 'Analysis timed out' : "Couldn't analyze"} — fill in manually
            </p>
            {sharedImage && sharedBlobRef.current && (
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
        {!sharedImage && !sharedText && !parsed && !prefill && !showQuickParse && (
          <button
            onClick={() => setShowQuickParse(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20 hover:bg-primary/15 active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Use AI Quick Parse</span>
          </button>
        )}

        {!sharedImage && !sharedText && !parsed && !prefill && showQuickParse && (
          <div className="p-3.5 rounded-3xl mb-[30px] bg-primary/5 border border-primary/10 space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">AI Quick Parse</span>
              </div>
              <button
                onClick={() => setShowQuickParse(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <textarea
              value={nlText}
              onChange={(e) => { setNlText(e.target.value); if (nlStatus !== 'idle') setNlStatus('idle'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleNlParse(); } }}
              placeholder='e.g. "Zomato 350 UPI" or "coffee 80 cash"'
              rows={2}
              className="form-input resize-none text-sm bg-background/60"
            />
            
            <button
              onClick={() => void handleNlParse()}
              disabled={!nlText.trim() || nlStatus === 'loading'}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              {nlStatus === 'loading'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              Parse Expense
            </button>
            {nlStatus === 'done' && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-xs font-medium text-primary">Form filled — review and save</p>
              </div>
            )}
            {nlStatus === 'error' && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <p className="text-[11px] font-medium text-destructive">Couldn't parse — try being more specific or fill manually</p>
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
