import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MessageSquareText, Trash2, ChevronRight, Inbox, ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

  useEffect(() => {
    loadQueue().then(q => { setQueue(q); setLoading(false); });
  }, []);

  const handleDiscard = async (index: number) => {
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
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
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
          <AnimatePresence mode="popLayout" initial={false}>
            {queue.map((item, index) => (
              <motion.div
                key={item.ts}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="bg-card border border-border/60 rounded-[28px] overflow-hidden shadow-sm"
              >
                {/* Receipt image thumbnail with overlay */}
                {item.type === 'image' && item.thumbnail ? (
                  <div className="relative h-40 bg-secondary/50">
                    <img
                      src={item.thumbnail}
                      alt="Receipt"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8">
                      <p className="text-white text-[22px] font-bold leading-none">
                        {item.result.amount ? `₹${item.result.amount}` : '₹—'}
                      </p>
                      <p className="text-white/75 text-xs mt-0.5 truncate">
                        {item.result.description || 'Receipt'}
                      </p>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="text-[10px] text-white/70 bg-black/35 backdrop-blur-sm px-2 py-0.5 rounded-full">
                        {formatDistanceToNow(item.ts, { addSuffix: true })}
                      </span>
                    </div>
                    <div className="absolute top-3 left-3">
                      <div className="w-7 h-7 rounded-xl bg-black/30 backdrop-blur-sm flex items-center justify-center">
                        <ImageIcon className="w-3.5 h-3.5 text-white/80" />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="p-4">
                  {/* Header row for text shares (no thumbnail) */}
                  {!(item.type === 'image' && item.thumbnail) && (
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
                  )}

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

                  {/* Original message snippet for text shares */}
                  {item.type === 'text' && item.rawText && (
                    <div className="bg-secondary/40 rounded-xl px-3 py-2.5 mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5">
                        Original message
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {item.rawText}
                      </p>
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
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
