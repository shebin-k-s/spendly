import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ArrowLeft, Check, Share2, Sparkles, AlertCircle, Loader2, X, Eye, ArrowUpRight, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useCreateExpense } from '../hooks/useExpenses';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import { parseShareText } from '../utils/parseShareText';
import { DateTimePicker } from '@/components/DateTimePicker';
import apiClient from '@/lib/apiClient';
import { expensesApi } from '../api/expensesApi';
import type { PaymentMethod } from '../types';
import { useSwipeGesture } from '@/context/SwipeGestureContext';


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
  transfer_person?: string | null;
  transfer_direction?: 'sent' | 'received' | null;
  suggested_flow?: 'expense' | 'transfer';
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

interface QueueItem {
  type: 'image' | 'text';
  ts: number;
  result: ParsedImage & { cashback?: string };
  thumbnail?: string;
  rawText?: string;
}

async function peekShareResult(): Promise<QueueItem | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('spendly-share');
    const queueRes = await cache.match('/share-queue');
    if (!queueRes) return null;
    const queue: QueueItem[] = await queueRes.json();
    if (!queue.length) return null;
    // Return last (most recently added) — matches the notification that was just shown
    return queue[queue.length - 1];
  } catch {
    return null;
  }
}

async function removeShareByTs(ts: number): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('spendly-share');
    const res = await cache.match('/share-queue');
    if (!res) return;
    const queue: Array<{ ts: number }> = await res.json();
    const next = queue.filter((item) => item.ts !== ts);
    if (next.length === 0) {
      await cache.delete('/share-queue');
      navigator.clearAppBadge?.();
    } else {
      await cache.put('/share-queue', new Response(JSON.stringify(next), {
        headers: { 'Content-Type': 'application/json' },
      }));
      navigator.setAppBadge?.(next.length);
    }
  } catch { /* ignore */ }
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
  const sharedText = searchParams.get('shared') === 'text';
  const parsed = useMemo(() => shareRaw ? parseShareText(shareRaw) : null, [shareRaw]);
  const prefill = (location.state as { prefill?: { amount: string; description: string; paymentMethod: PaymentMethod; categoryId: string; note: string } } | null)?.prefill ?? null;
  const parsedShare = (location.state as { parsedShare?: Record<string, unknown>; shareTs?: number } | null)?.parsedShare ?? null;
  const forceExpense = (location.state as { forceExpense?: boolean } | null)?.forceExpense ?? false;
  const shareTs = (location.state as { shareTs?: number } | null)?.shareTs ?? (searchParams.get('shareTs') ? parseInt(searchParams.get('shareTs')!, 10) : null);
  const stateThumb = (location.state as { thumbnail?: string } | null)?.thumbnail ?? null;
  const stateRawText = (location.state as { rawText?: string } | null)?.rawText ?? null;
  const stateShareType = (location.state as { shareType?: string } | null)?.shareType ?? null;

  const [resolvedShareTs, setResolvedShareTs] = useState<number | null>(shareTs);
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(stateThumb);
  const [previewRawText, setPreviewRawText] = useState<string | null>(stateRawText);
  const [previewShareType, setPreviewShareType] = useState<string | null>(stateShareType);

  // Load from queue if we have shareTs but no parsedShare (e.g. from notification click)
  useEffect(() => {
    if (shareTs && !parsedShare) {
      const loadFromQueue = async () => {
        try {
          const cache = await caches.open('spendly-share');
          const res = await cache.match('/share-queue');
          if (res) {
            const queue: QueueItem[] = await res.json();
            const item = queue.find((i) => i.ts === shareTs);
            if (item) {
              // Populate form states
              const p = item.result;
              setAmount(p.amount || '');
              setCashback(String(p.cashback || ''));
              setDescription(p.description || '');
              if (p.date) setDate(p.date);
              if (p.time) setTime(p.time);
              setCategoryId(p.category_id || '');
              setPaymentMethod(p.payment_method || 'upi');
              setNote(p.note || '');
              if (item.thumbnail) setPreviewThumbnail(item.thumbnail);
              if (item.rawText) setPreviewRawText(item.rawText);
              setPreviewShareType(item.type);
              if (p.transfer_person) {
                setTransferPerson(p.transfer_person);
                setTransferDirection(p.transfer_direction ?? null);

                if (p.suggested_flow === 'transfer' && !forceExpense) {
                  navigate('/share-to-people', {
                    state: {
                      amount: p.amount,
                      note: p.description,
                      date: p.date || format(new Date(), 'yyyy-MM-dd'),
                      shareTs: item.ts,
                      transfer_person: p.transfer_person,
                      transfer_direction: p.transfer_direction,
                      backRoute: '/',
                    },
                    replace: true,
                  });
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.error('Failed to load prefill from queue:', err);
        }
      };
      loadFromQueue();
    }
  }, [shareTs, parsedShare]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Swipe-to-dismiss logic (Standardized)
  const sheetRef = useRef<HTMLDivElement>(null);
  const handlePointerStartY = useRef<number | null>(null);
  const handleCurrentY = useRef<number>(0);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    handlePointerStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (handlePointerStartY.current === null || !sheetRef.current) return;
    let distance = e.clientY - handlePointerStartY.current;
    if (distance < 0) distance = 0;
    handleCurrentY.current = distance;
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (handlePointerStartY.current === null || !sheetRef.current) return;
    if (handleCurrentY.current > 120) {
      setShowReceiptModal(false);
    } else {
      sheetRef.current.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(0px)';
    }
    handlePointerStartY.current = null;
    handleCurrentY.current = 0;
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    // The scroll container is now the page's motion.div wrapper, not <main>
    const pageScroll = document.querySelector<HTMLElement>('[data-location-key]');
    if (showReceiptModal) {
      if (pageScroll) {
        pageScroll.style.overflow = 'hidden';
        pageScroll.style.overscrollBehavior = 'contain';
      }
    } else {
      if (pageScroll) {
        pageScroll.style.overflow = '';
        pageScroll.style.overscrollBehavior = '';
      }
    }
    return () => {
      if (pageScroll) {
        pageScroll.style.overflow = '';
        pageScroll.style.overscrollBehavior = '';
      }
    };
  }, [showReceiptModal]);

  const ps = parsedShare;
  const now = new Date();
  const [amount, setAmount] = useState(prefill?.amount ?? (ps?.amount as string) ?? parsed?.amount ?? '');
  const [cashback, setCashback] = useState((ps?.cashback as string) ?? '');
  const [description, setDescription] = useState(prefill?.description ?? (ps?.description as string) ?? parsed?.description ?? '');
  const [date, setDate] = useState((ps?.date as string) ?? parsed?.date ?? format(now, 'yyyy-MM-dd'));
  const [time, setTime] = useState<string | null>((ps?.time as string) ?? parsed?.time ?? format(now, 'HH:mm'));
  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? (ps?.category_id as string) ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.paymentMethod ?? (ps?.payment_method as PaymentMethod) ?? parsed?.paymentMethod ?? 'upi');
  const [note, setNote] = useState(prefill?.note ?? (ps?.note as string) ?? '');
  const [aiStatus, setAiStatus] = useState<AiStatus>(parsedShare ? 'done' : 'idle');
  const [transferPerson, setTransferPerson] = useState<string | null>(null);
  const [transferDirection, setTransferDirection] = useState<'sent' | 'received' | null>(null);
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
      if (result.transfer_person) {
        setTransferPerson(result.transfer_person);
        setTransferDirection(result.transfer_direction ?? null);
        
        if (result.suggested_flow === 'transfer') {
           navigate('/share-to-people', {
            state: {
              amount: result.amount,
              note: result.description,
              date: result.date || format(new Date(), 'yyyy-MM-dd'),
              shareTs: resolvedShareTs,
              transfer_person: result.transfer_person,
              transfer_direction: result.transfer_direction,
              backRoute: '/',
            },
            replace: true,
          });
          return;
        }
      }
    } catch (err: unknown) {
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
      // Try fresh image first (app-open share path — SW stored /share-image and redirected).
      // Must check this before the queue so a stale queued item from a previous session
      // never clobbers data from a new share.
      const blob = await readSharedImage();
      if (blob) {
        sharedBlobRef.current = blob;
        await runAiParse(blob);
        return;
      }

      // No fresh image — the SW background-parsed while the app was closed.
      // Find the result in the queue (most recently added item).
      const peeked = await peekShareResult();
      if (peeked) {
        const cachedResult = peeked.result;
        if (cachedResult.amount) setAmount(cachedResult.amount);
        if (cachedResult.description) setDescription(cachedResult.description);
        if (cachedResult.payment_method) setPaymentMethod(cachedResult.payment_method);
        if (cachedResult.date) setDate(cachedResult.date);
        if (cachedResult.time) setTime(cachedResult.time);
        if (cachedResult.category_id) setCategoryId(cachedResult.category_id);
        if (cachedResult.note) setNote(cachedResult.note);
        if (cachedResult.cashback) setCashback(String(cachedResult.cashback));
        setResolvedShareTs(peeked.ts);
        setPreviewThumbnail(peeked.thumbnail ?? null);
        setPreviewRawText(peeked.rawText ?? null);
        setPreviewShareType(peeked.type);
        setAiStatus('done');
        return;
      }

      setAiStatus('error');
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
      // Try fresh text first (app-open share path).
      const text = await readSharedText();
      if (!text) {
        // No fresh text — check if SW background-parsed it.
        const peeked = await peekShareResult();
        if (peeked) {
          const cachedResult = peeked.result;
          if (cachedResult.amount) setAmount(cachedResult.amount);
          if (cachedResult.description) setDescription(cachedResult.description);
          if (cachedResult.payment_method) setPaymentMethod(cachedResult.payment_method);
          if (cachedResult.date) setDate(cachedResult.date);
          if (cachedResult.time) setTime(cachedResult.time);
          if (cachedResult.category_id) setCategoryId(cachedResult.category_id);
          if (cachedResult.note) setNote(cachedResult.note);
          if (cachedResult.cashback) setCashback(String(cachedResult.cashback));
          setResolvedShareTs(peeked.ts);
          setPreviewThumbnail(peeked.thumbnail ?? null);
          setPreviewRawText(peeked.rawText ?? null);
          setPreviewShareType(peeked.type);
          setAiStatus('done');
          return;
        }
        setAiStatus('error');
        return;
      }

      setAiStatus('loading');
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
        if (typeof result.transfer_person === 'string' && result.transfer_person) {
          setTransferPerson(result.transfer_person);
          setTransferDirection((result.transfer_direction as 'sent' | 'received' | null) ?? null);
        }
      } catch {
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
      { onSuccess: async () => { if (resolvedShareTs) { await removeShareByTs(resolvedShareTs); } navigator.clearAppBadge?.(); navigate('/expenses', { replace: true }); } },
    );
  };

  const isFromShare = sharedImage || sharedText || !!parsed || !!parsedShare;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => {
            if (resolvedShareTs) {
              // Came from PendingSharesPage via state → POP back (preserves scroll)
              // Came from notification URL → replace with fresh PendingSharesPage
              parsedShare ? navigate(-1) : navigate('/share-pending', { replace: true });
            } else if (isFromShare) {
              navigate('/expenses', { replace: true });
            } else {
              navigate(-1);
            }
          }}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
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
        {/* Switch to lending flow */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              navigate('/share-to-people', {
                state: {
                  amount,
                  note: description,
                  date,
                  shareTs: resolvedShareTs,
                  transfer_person: transferPerson,
                  transfer_direction: transferDirection,
                  backRoute: '/',
                },
                replace: true,
              });
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold active:scale-95 transition-all border border-border/50 shadow-sm"
          >
            <Users className="w-4 h-4" />
            Switch to Lending
          </button>
        </div>
        {/* Unified Share/Pre-fill context */}
        {(() => {
          if (aiStatus === 'loading') {
            return (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-primary/5 border border-primary/20 animate-pulse">
                <Loader2 className="w-5 h-5 text-primary animate-spin-slow" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-primary">Magic Parse in progress...</p>
                  <p className="text-[10px] text-primary/60 mt-0.5">Organizing your expense details</p>
                </div>
              </div>
            );
          }

          if (aiStatus === 'error') {
            return (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-destructive/5 border border-destructive/20">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-destructive">Magic Parse failed</p>
                  <p className="text-[10px] text-destructive/60 mt-0.5">Please check everything manually</p>
                </div>
                {sharedImage && sharedBlobRef.current && (
                  <button onClick={() => runAiParse(sharedBlobRef.current!)} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[11px] font-bold active:scale-95 transition-all">
                    Retry
                  </button>
                )}
              </div>
            );
          }

          // Combined success/pre-fill state
          const hasPrefill = parsedShare || parsed || prefill || (aiStatus === 'done' && (sharedImage || sharedText));
          if (!hasPrefill) return null;

          let sourceLabel = "Reviewing details";
          if (resolvedShareTs) {
            sourceLabel = "Reviewing pending receipt";
          } else if (prefill) {
            sourceLabel = "Refilling recent expense";
          } else if (ps?.type === 'image' || sharedImage) {
            sourceLabel = "Reviewing shared receipt";
          } else if (ps?.type === 'text' || sharedText || parsed) {
            sourceLabel = "Reviewing shared message";
          }

          return (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-primary/8 border border-primary/20 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-primary tracking-normal">{sourceLabel}</span>
              </div>
              
              <button
                onClick={() => setShowReceiptModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary active:scale-95 transition-all"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-tighter">VIEW</span>
              </button>
            </div>
          );
        })()}

        {/* Natural language input */}
        {!isFromShare && !prefill && !showQuickParse && (
          <button
            onClick={() => setShowQuickParse(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-primary/8 border border-primary/20 hover:bg-primary/15 active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Use AI Quick Parse</span>
          </button>
        )}

        {showQuickParse && (
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

      {/* Image — Immersive lightbox with pinch-to-zoom */}
      {showReceiptModal && previewShareType === 'image' && previewThumbnail && (
        <div
          className="fixed inset-0 z-50 flex flex-col animate-in fade-in duration-500"
          onClick={() => setShowReceiptModal(false)}
        >
          <div className="absolute inset-0 bg-black/90 backdrop-blur-3xl" />

          <div className="relative flex flex-col h-full">
            {/* Immersive Header */}
            <div className="px-6 pt-14 pb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-primary/80 uppercase tracking-[0.2em] mb-1">Receipt Preview</p>
                <h2 className="text-xl font-bold text-white tracking-tight">Inspect Document</h2>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:scale-90 border border-white/5"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={5}
                centerOnInit
                centerZoomedOut
              >
                <TransformComponent
                  wrapperStyle={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <img
                    src={previewThumbnail}
                    alt="Receipt"
                    className="max-w-[85vw] max-h-[60vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TransformComponent>
              </TransformWrapper>
            </div>

            <div className="px-10 pb-16 text-center">
              <p className="text-[13px] font-medium text-white/30 italic">Pinch to zoom · drag to pan</p>
            </div>
          </div>
        </div>
      )}


      {/* Text — Elegant Bottom Sheet with Swipe-to-Dismiss */}
      <Dialog.Root open={showReceiptModal && previewShareType === 'text'} onOpenChange={setShowReceiptModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" />
          <Dialog.Content
            ref={sheetRef}
            className="fixed bottom-0 inset-x-0 w-full z-50 bg-card rounded-t-[40px] max-h-[85vh] flex flex-col border-t border-white/5 animate-in slide-in-from-bottom duration-500 cubic-bezier(0.16, 1, 0.3, 1) overscroll-contain sheet-exit"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              className="pt-4 pb-2 w-full flex justify-center cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
            >
              <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full pointer-events-none" />
            </div>

            <div className="flex items-center justify-between px-7 py-4 flex-shrink-0 touch-none">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Shared Message</p>
                <p className="text-lg font-bold">Source Content</p>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            
            <div className="overflow-y-auto px-7 pb-16 overscroll-contain overscroll-y-contain">
              <div className="bg-secondary/30 rounded-[32px] p-6 border border-border/40 relative">
                <div className="absolute top-4 left-4 opacity-5">
                  <Share2 className="w-12 h-12" />
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap selection:bg-primary/30">
                  {previewRawText}
                </p>
              </div>
              <div className="mt-6 flex items-center gap-3 px-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-[11px] font-medium text-muted-foreground italic">Original text shared from outside app</p>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
