import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ArrowLeft, Check, Share2, Sparkles, AlertCircle, Loader2, X, Eye, ArrowUpRight, ArrowDownLeft, Users, Receipt, Search, UserPlus, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useCreateExpense } from '../hooks/useExpenses';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { usePeople } from '@/features/people/hooks/usePeople';
import { peopleApi } from '@/features/people/api/peopleApi';
import type { Person } from '@/features/people/types';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import { parseShareText } from '../utils/parseShareText';
import { DateTimePicker } from '@/components/DateTimePicker';
import apiClient from '@/lib/apiClient';
import { expensesApi } from '../api/expensesApi';
import type { PaymentMethod } from '../types';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { cn, formatINR } from '@/lib/utils';
import { toast } from 'sonner';
import { BulkParseModal } from '../components/BulkParseModal';


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

function matchPerson(name: string, phone: string | null, list: Person[]): Person | null {
  const q = name.toLowerCase().trim();
  const qCompact = q.replace(/[\s._-]/g, '');
  const qDigits = q.replace(/\D/g, '');
  if (phone) {
    const pd = phone.replace(/\D/g, '');
    if (pd.length >= 6) {
      const m = list.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '').includes(pd));
      if (m) return m;
    }
  }
  if (qDigits.length >= 6) {
    const m = list.find(p => {
      if (!p.phoneNumber) return false;
      const n = p.phoneNumber.replace(/\D/g, '');
      return (n.length > 10 ? n.slice(-10) : n) === (qDigits.length > 10 ? qDigits.slice(-10) : qDigits);
    });
    if (m) return m;
  }
  const exact = list.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;
  if (qCompact.length > 3) {
    const compact = list.find(p => p.name.toLowerCase().replace(/[\s._-]/g, '') === qCompact);
    if (compact) return compact;
  }
  return null;
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
  const stateFromNlParse = (location.state as { fromNlParse?: boolean } | null)?.fromNlParse ?? false;

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
                setTransferPhone((p as any).transfer_phone ?? null);

                if (p.suggested_flow === 'transfer' && !forceExpense) {
                  navigate('/share-to-people', {
                    state: {
                      amount: p.amount,
                      note: p.description,
                      date: p.date || format(new Date(), 'yyyy-MM-dd'),
                      shareTs: item.ts,
                      transfer_person: p.transfer_person,
                      transfer_phone: (p as any).transfer_phone ?? null,
                      transfer_direction: p.transfer_direction,
                      backRoute: '/',
                    },
                    replace: true,
                  });
                  return;
                }
              }
              setAiStatus('done');
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
  const stateTransferPerson    = (location.state as { transfer_person?: string | null } | null)?.transfer_person ?? null;
  const stateTransferDirection = (location.state as { transfer_direction?: 'sent' | 'received' | null } | null)?.transfer_direction ?? null;
  const stateTransferPhone     = (location.state as { transfer_phone?: string | null } | null)?.transfer_phone ?? null;
  const [transferPerson,    setTransferPerson]    = useState<string | null>((ps?.transfer_person as string) ?? stateTransferPerson ?? null);
  const [transferDirection, setTransferDirection] = useState<'sent' | 'received' | null>((ps?.transfer_direction as 'sent' | 'received' | null) ?? stateTransferDirection ?? null);
  const [transferPhone,     setTransferPhone]     = useState<string | null>((ps?.transfer_phone as string) ?? stateTransferPhone ?? null);
  const [nlText, setNlText] = useState(stateFromNlParse && stateRawText ? stateRawText : '');
  const [nlStatus, setNlStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [showQuickParse, setShowQuickParse] = useState(stateFromNlParse && !!stateRawText);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Lending mode (inline — no navigation)
  const queryClient = useQueryClient();
  const { data: people = [] } = usePeople();
  const [lendingMode, setLendingMode] = useState(false);
  const [lendingType, setLendingType] = useState<'GIVEN' | 'RETURNED'>('GIVEN');
  const [personSearch, setPersonSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');
  const [addingLendingPerson, setAddingLendingPerson] = useState(false);
  const [pinnedPersonId, setPinnedPersonId] = useState<string | null>(null);

  const filteredPeople = useMemo(() =>
    people
      .filter(p => p.name.toLowerCase().includes(personSearch.toLowerCase()))
      .sort((a, b) => (b.id === pinnedPersonId ? 1 : 0) - (a.id === pinnedPersonId ? 1 : 0)),
    [people, personSearch, pinnedPersonId],
  );
  const selectedPerson = people.find(p => p.id === selectedPersonId);

  const addTransaction = useMutation({
    mutationFn: ({ personId, payload }: { personId: string; payload: any }) =>
      peopleApi.addTransaction(personId, payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      if (resolvedShareTs) await removeShareByTs(resolvedShareTs);
      navigator.clearAppBadge?.();
      navigate(`/people/${selectedPersonId}`, { replace: true });
    },
    onError: () => toast.error('Failed to add transaction'),
  });

  // Auto-match person when switching to lending mode
  useEffect(() => {
    if (lendingMode && transferPerson && people.length > 0 && !selectedPersonId) {
      const matched = matchPerson(transferPerson, transferPhone, people);
      if (matched) { setSelectedPersonId(matched.id); setPinnedPersonId(matched.id); }
    }
  }, [lendingMode, people]);

  const handleCreateLendingPerson = async () => {
    if (!newPersonName.trim()) return;
    setAddingLendingPerson(true);
    try {
      const created = await peopleApi.createPerson({
        name: newPersonName.trim(),
        ...(newPersonPhone.trim() ? { phoneNumber: newPersonPhone.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      setSelectedPersonId(created.id);
      setPinnedPersonId(created.id);
      setShowAddPersonForm(false);
      setNewPersonName('');
      setNewPersonPhone('');
      toast.success('Person added');
    } catch {
      toast.error('Failed to add person');
    } finally {
      setAddingLendingPerson(false);
    }
  };

  const handleQuickAddTransferPerson = async () => {
    if (!transferPerson) return;
    setAddingLendingPerson(true);
    try {
      const created = await peopleApi.createPerson({
        name: transferPerson,
        ...(transferPhone ? { phoneNumber: transferPhone } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      setSelectedPersonId(created.id);
      setPinnedPersonId(created.id);
      toast.success('Person added');
    } catch {
      toast.error('Failed to add person');
    } finally {
      setAddingLendingPerson(false);
    }
  };

  const handleLendingSave = () => {
    if (!selectedPersonId || !amount || parseFloat(amount) <= 0 || addTransaction.isPending) return;
    addTransaction.mutate({
      personId: selectedPersonId,
      payload: { amount: parseFloat(amount), type: lendingType, date, note: note.trim() || undefined },
    });
  };

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
      const thumbUrl = URL.createObjectURL(blob);
      setPreviewThumbnail(thumbUrl);
      setPreviewShareType('image');
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
              transfer_phone: (result as any).transfer_phone ?? null,
              transfer_direction: result.transfer_direction,
              backRoute: '/',
              thumbnail: thumbUrl,
              shareType: 'image',
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
        setPreviewRawText(text);
        setPreviewShareType('text');
        setAiStatus('done');
        if (typeof result.transfer_person === 'string' && result.transfer_person) {
          setTransferPerson(result.transfer_person);
          setTransferDirection((result.transfer_direction as 'sent' | 'received' | null) ?? null);
          setTransferPhone((result as any).transfer_phone ?? null);
          if (result.suggested_flow === 'transfer' && !forceExpense) {
            navigate('/share-to-people', {
              state: {
                amount: typeof result.amount === 'string' ? result.amount : '',
                note: typeof result.description === 'string' ? result.description : '',
                date: typeof result.date === 'string' && result.date ? result.date : format(new Date(), 'yyyy-MM-dd'),
                shareTs: resolvedShareTs,
                transfer_person: result.transfer_person,
                transfer_phone: (result as any).transfer_phone ?? null,
                transfer_direction: (result.transfer_direction as 'sent' | 'received' | null) ?? null,
                backRoute: '/',
                rawText: text,
                shareType: 'text',
              },
              replace: true,
            });
            return;
          }
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
      // Update lending direction regardless of whether a person name was detected
      if (result.transfer_direction === 'received') setLendingType('RETURNED');
      else if (result.transfer_direction === 'sent') setLendingType('GIVEN');

      const person = typeof result.transfer_person === 'string' && result.transfer_person ? result.transfer_person : null;
      if (person) {
        setTransferPerson(person);
        setTransferDirection((result.transfer_direction as 'sent' | 'received' | null) ?? null);
        setTransferPhone((result as any).transfer_phone ?? null);
        const matched = matchPerson(person, (result as any).transfer_phone ?? null, people);
        if (matched) { setSelectedPersonId(matched.id); setPinnedPersonId(matched.id); }
      }

      if (result.suggested_flow === 'transfer') {
        setLendingMode(true);
      } else if (result.suggested_flow === 'expense' && lendingMode) {
        setLendingMode(false);
      }

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
      { onSuccess: async () => { if (resolvedShareTs) { await removeShareByTs(resolvedShareTs); } navigator.clearAppBadge?.(); navigate(-1); } },
    );
  };

  const isFromShare = sharedImage || sharedText || !!parsed || !!parsedShare || !!resolvedShareTs;

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
        <h1 className="text-xl font-bold flex-1">{lendingMode ? 'Log to People' : 'Add Expense'}</h1>
        <button
          onClick={lendingMode ? handleLendingSave : handleSubmit}
          disabled={lendingMode ? (!selectedPersonId || !amount || parseFloat(amount || '0') <= 0 || addTransaction.isPending) : !canSubmit}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
        >
          {createExpense.isPending || addTransaction.isPending ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Check className="w-4 h-4 text-primary" />
          )}
        </button>
      </div>

      <div className="page-content space-y-5">
        {/* Flow switcher */}
        <div className="flex bg-secondary rounded-2xl p-1">
          <button
            onClick={() => setLendingMode(false)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all', !lendingMode ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground active:scale-95')}
          >
            <Receipt className="w-3.5 h-3.5" />
            Expense
          </button>
          <button
            onClick={() => setLendingMode(true)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all', lendingMode ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground active:scale-95')}
          >
            <Users className="w-3.5 h-3.5" />
            Lending
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
          const hasPrefill = parsedShare || parsed || prefill || aiStatus === 'done';
          // Switching from lending sets forceExpense+prefill but has no receipt to review — hide the banner
          if (!hasPrefill || (forceExpense && prefill && !previewThumbnail && !previewRawText)) return null;

          let sourceLabel = "Reviewing details";
          if (resolvedShareTs) {
            sourceLabel = "Reviewing pending receipt";
          } else if (ps?.type === 'image' || sharedImage || previewShareType === 'image') {
            sourceLabel = "Reviewing shared receipt";
          } else if (ps?.type === 'text' || sharedText || parsed || previewShareType === 'text') {
            sourceLabel = "Reviewing shared message";
          } else if (prefill && !forceExpense) {
            sourceLabel = "Refilling recent expense";
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

        {/* Natural language input — toggleable */}
        {!isFromShare && !prefill && !showQuickParse && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowQuickParse(true)}
              className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/10 text-primary active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold">AI Quick Parse</span>
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/10 text-primary active:scale-[0.98] transition-all shrink-0"
              title="Add multiple expenses at once"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold">Bulk Add</span>
            </button>
          </div>
        )}
        {!isFromShare && !prefill && showQuickParse && (
          <div className="p-3.5 rounded-3xl bg-primary/5 border border-primary/10 space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">AI Quick Parse</span>
              </div>
              <button onClick={() => setShowQuickParse(false)} className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center active:scale-90 transition-all">
                <X className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>

            <textarea
              value={nlText}
              onChange={(e) => { setNlText(e.target.value); if (nlStatus !== 'idle') setNlStatus('idle'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleNlParse(); } }}
              placeholder='e.g. "Zomato 350 UPI" or "coffee 80 cash"'
              rows={2}
              className="form-input resize-none text-sm bg-background/60"
              autoFocus
            />

            <button
              onClick={() => void handleNlParse()}
              disabled={!nlText.trim() || nlStatus === 'loading'}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              {nlStatus === 'loading'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {lendingMode ? 'Parse' : 'Parse Expense'}
            </button>
            {nlStatus === 'done' && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-xs font-medium text-primary">Form filled — edit or re-parse</p>
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

        {/* Amount — shared between modes */}
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

        {/* ── EXPENSE MODE ── */}
        {!lendingMode && (
          <>
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
              <DateTimePicker date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
            </div>

            {/* Category */}
            <div>
              <label className="form-label">Category</label>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setCategoryId('')} className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${!categoryId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>None</button>
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => setCategoryId(cat.id)} className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 justify-center ${categoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
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
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${paymentMethod === method ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="form-label">Note (Optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any additional details..." rows={2} className="form-input resize-none" />
            </div>

            <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
              {createExpense.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : aiStatus === 'loading' ? 'Analyzing...' : 'Add Expense'}
            </button>
          </>
        )}

        {/* ── LENDING MODE ── */}
        {lendingMode && (
          <>
            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setLendingType('GIVEN')} className={cn('flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm transition-all', lendingType === 'GIVEN' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
                <ArrowUpRight className="w-4 h-4" /> I Gave
              </button>
              <button onClick={() => setLendingType('RETURNED')} className={cn('flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm transition-all', lendingType === 'RETURNED' ? 'bg-success text-success-foreground' : 'bg-secondary text-muted-foreground')}>
                <ArrowDownLeft className="w-4 h-4" /> They Gave
              </button>
            </div>

            {/* Date */}
            <div>
              <label className="form-label">Date</label>
              <DateTimePicker date={date} time={null} onChange={(d) => setDate(d)} />
            </div>

            {/* Person picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Person</p>
                <button onClick={() => { setShowAddPersonForm(f => !f); setNewPersonName(''); setNewPersonPhone(''); }} className="flex items-center gap-1 text-xs font-semibold text-primary active:scale-95 transition-all">
                  {showAddPersonForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {showAddPersonForm ? 'Cancel' : 'Add Person'}
                </button>
              </div>

              {showAddPersonForm && (
                <div className="bg-card border border-primary/20 rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <input value={newPersonName} onChange={e => setNewPersonName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleCreateLendingPerson(); }} placeholder="Name *" autoFocus className="form-input text-sm" />
                  <input value={newPersonPhone} onChange={e => setNewPersonPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleCreateLendingPerson(); }} placeholder="Phone (optional)" inputMode="tel" className="form-input text-sm" />
                  <button onClick={() => void handleCreateLendingPerson()} disabled={!newPersonName.trim() || addingLendingPerson} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {addingLendingPerson ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Add & Select
                  </button>
                </div>
              )}

              {people.length >= 3 && (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input value={personSearch} onChange={e => setPersonSearch(e.target.value)} placeholder="Search..." className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* AI quick-add card — shown when AI detected a name not in the list */}
                {transferPerson && !selectedPersonId && !personSearch && (
                  <button
                    onClick={() => void handleQuickAddTransferPerson()}
                    disabled={addingLendingPerson}
                    className="touch-card w-full flex items-center gap-3 px-4 py-3 text-left border-primary/30 bg-primary/5 disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
                      {addingLendingPerson ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-primary truncate">Add "{transferPerson}"</p>
                      <p className="text-xs text-muted-foreground">Tap to add as new contact</p>
                    </div>
                  </button>
                )}
                {filteredPeople.length === 0 && !(transferPerson && !selectedPersonId && !personSearch) ? (
                  <div className="py-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                    {personSearch ? 'No one matches' : 'No people yet — tap + Add Person'}
                  </div>
                ) : (
                  filteredPeople.map(person => {
                    const isSel = selectedPersonId === person.id;
                    return (
                      <button key={person.id} onClick={() => setSelectedPersonId(isSel ? null : person.id)} className={cn('touch-card w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-300', isSel ? 'border-primary bg-primary/10 shadow-md shadow-primary/5' : 'border-border/50')}>
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-colors', isSel ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
                          {person.name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{person.name}</p>
                          {person.balance !== 0 && (
                            <p className={cn('text-xs', person.balance > 0 ? 'text-primary' : 'text-destructive')}>
                              {person.balance > 0 ? 'Owes you' : 'You owe'} {formatINR(Math.abs(Number(person.balance)))}
                            </p>
                          )}
                        </div>
                        {isSel && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="form-label">Note (Optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What was this for?" className="form-input" />
            </div>

            <button
              onClick={handleLendingSave}
              disabled={!selectedPersonId || !amount || parseFloat(amount || '0') <= 0 || addTransaction.isPending}
              className={cn('w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40', lendingType === 'GIVEN' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground')}
            >
              {addTransaction.isPending ? 'Saving...' : selectedPerson ? `Save for ${selectedPerson.name}` : 'Select a Person'}
            </button>
          </>
        )}
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

      <BulkParseModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onAllSaved={() => { setShowBulkModal(false); navigate(-1); }}
      />
    </div>
  );
}
