import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquareText, Trash2, ChevronRight, Inbox, ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface QueueItem {
  type: 'image' | 'text';
  ts: number;
  rawText?: string;
  thumbnail?: string;
  result: {
    amount: string;
    description: string;
    payment_method: string;
    date: string | null;
    time: string | null;
    category_id: string | null;
    category_name: string | null;
    note: string | null;
    cashback: string | null;
  };
}

async function loadQueue(): Promise<QueueItem[]> {
  if (!('caches' in window)) return [];
  try {
    const cache = await caches.open('spendly-share');
    const res = await cache.match('/share-queue');
    if (!res) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  const cache = await caches.open('spendly-share');
  if (queue.length === 0) {
    await cache.delete('/share-queue');
    navigator.clearAppBadge?.();
  } else {
    await cache.put('/share-queue', new Response(JSON.stringify(queue), {
      headers: { 'Content-Type': 'application/json' },
    }));
    navigator.setAppBadge?.(queue.length);
  }
}

export default function PendingSharesPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [discarding, setDiscarding] = useState<number | null>(null);

  useEffect(() => {
    loadQueue().then(q => { setQueue(q); setLoading(false); });
  }, []);

  const handleDiscard = async (index: number) => {
    const ts = queue[index].ts;
    setDiscarding(ts);
    // Let CSS exit animation play before removing from state
    await new Promise(r => setTimeout(r, 180));
    setDiscarding(null);
    const next = queue.filter((_, i) => i !== index);
    setQueue(next);
    await saveQueue(next);
  };

  const handleReview = (index: number) => {
    const item = queue[index];
    navigate('/expenses/new', {
      state: {
        parsedShare: item.result,
        shareTs: item.ts,
        shareType: item.type,
        thumbnail: item.thumbnail ?? null,
        rawText: item.rawText ?? null,
      },
    });
  };

  return (
    <div className="animate-fade-in max-w-lg mx-auto">
      <div className="page-header !mb-5">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Pending Receipts</h1>
          <p className="text-[11px] text-muted-foreground/60">Review before they're gone</p>
        </div>
        {queue.length > 0 && (
          <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
            {queue.length}
          </span>
        )}
      </div>

      <div className="page-content space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-52 rounded-3xl bg-secondary/50 animate-pulse" />
          ))
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-32 text-center opacity-40">
            <Inbox className="w-9 h-9 text-muted-foreground" />
            <p className="text-sm font-medium">No pending receipts</p>
          </div>
        ) : (
          queue.map((item, index) => (
            <div
              key={item.ts}
              className={cn(
                'bg-card border border-border/60 rounded-[28px] overflow-hidden shadow-sm transition-all duration-[180ms] ease-out',
                discarding === item.ts ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
              )}
            >
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-secondary flex-shrink-0 flex items-center justify-center">
                    {item.type === 'image'
                      ? <ImageIcon className="w-5 h-5 text-muted-foreground/60" />
                      : <MessageSquareText className="w-5 h-5 text-muted-foreground/60" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xl font-bold leading-none">
                          {item.result.amount ? `₹${item.result.amount}` : '₹—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.result.description || 'Expense'}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                        {formatDistanceToNow(item.ts, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Category + payment badges */}
                {(item.result.category_name || item.result.payment_method) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.result.category_name && (
                      <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2.5 py-1 rounded-lg">
                        {item.result.category_name}
                      </span>
                    )}
                    {item.result.payment_method && (
                      <span className="text-[11px] font-bold text-muted-foreground/60 bg-secondary px-2.5 py-1 rounded-lg uppercase tracking-wider">
                        {item.result.payment_method}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDiscard(index)}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-2xl text-destructive text-sm font-semibold hover:bg-destructive/8 active:scale-95 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Discard
                  </button>
                  <button
                    onClick={() => handleReview(index)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] transition-transform shadow-md shadow-primary/20"
                  >
                    Review & Save
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
