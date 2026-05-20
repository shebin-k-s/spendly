import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ImageIcon, MessageSquareText, Trash2, ChevronRight, Inbox, Sparkles, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface QueueItem {
  type: 'image' | 'text';
  ts: number;
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
      state: { parsedShare: item.result, shareTs: item.ts },
      replace: true,
    });
  };

  return (
    <div className="animate-fade-in max-w-lg mx-auto">
      <div className="page-header !mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Pending Receipts</h1>
          <p className="text-[11px] text-muted-foreground/60">Manage your shared items</p>
        </div>
        {queue.length > 0 && (
          <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/10">
            {queue.length}
          </span>
        )}
      </div>

      <div className="page-content space-y-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-28 rounded-3xl bg-secondary/50 animate-pulse" />
          ))
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-32 text-center opacity-50">
            <Inbox className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">No pending receipts</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {queue.map((item, index) => (
                <motion.div
                  key={item.ts}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-card border border-border/60 rounded-[28px] p-5 shadow-sm overflow-hidden"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center flex-shrink-0">
                      {item.type === 'image'
                        ? <ImageIcon className="w-5 h-5 text-muted-foreground/70" />
                        : <MessageSquareText className="w-5 h-5 text-muted-foreground/70" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold">
                            {item.result.amount ? `₹${item.result.amount}` : '₹—'}
                          </h3>
                          <p className="text-xs font-medium text-muted-foreground truncate -mt-0.5">
                            {item.result.description || 'Magic Receipt'}
                          </p>
                        </div>
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap bg-secondary/50 px-2 py-0.5 rounded-full">
                          {formatDistanceToNow(item.ts, { addSuffix: true })}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {item.result.category_name && (
                          <span className="text-[10px] font-semibold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                            {item.result.category_name}
                          </span>
                        )}
                        {item.result.payment_method && (
                          <span className="text-[10px] font-bold text-muted-foreground/60 bg-secondary/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {item.result.payment_method}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2.5 mt-5">
                    <button
                      onClick={() => handleDiscard(index)}
                      className="px-4 py-2 rounded-xl text-destructive text-[11px] font-bold hover:bg-destructive/5 transition-colors active:scale-95"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => handleReview(index)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-transform active:scale-[0.98] shadow-lg shadow-primary/10"
                    >
                      Review & Save
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
