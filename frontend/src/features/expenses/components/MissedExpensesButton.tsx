import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Plus, X, CheckCheck } from 'lucide-react';
import { useMissedExpenses } from '../hooks/useExpenses';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { getMissedCursor, advanceMissedCursor, todayStr, BUCKET_ORDER } from '../utils/missedCursor';
import { isMissedExpenseDismissed, dismissMissedExpense } from '../utils/missedDismissals';
import type { MissedExpenseSuggestion } from '../types';

export default function MissedExpensesButton() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => getMissedCursor());
  const missedQuery = useMissedExpenses(cursor?.date, cursor?.bucketKey);
  const { data } = missedQuery;
  const freshness = useQueryFreshness(missedQuery);
  useRefetchOnFocus(missedQuery);
  const [open, setOpen] = useState(false);
  // Dismissal lives in localStorage, not React state — bump this after
  // every discard to force the filter below to re-run.
  const [dismissVersion, setDismissVersion] = useState(0);

  // Individually discarding one entry only ever removes that one entry —
  // it never touches the cursor or any other entry. Adding one also only
  // affects that one entry, but via real data (the next fetch sees it as
  // covered) rather than this ledger.
  const items = useMemo(
    () => (data?.items ?? []).filter((s) => !isMissedExpenseDismissed(s.date, s.categoryId, s.bucketKey)),
    [data, dismissVersion],
  );

  // The cursor only ever moves for two reasons: the user explicitly presses
  // "mark everything covered" (below), or — here — the list empties out
  // naturally because every entry that was actually shown got individually
  // resolved. Advancing it at that point loses nothing (there's nothing
  // left pending) and just lets old dismissals get pruned instead of
  // piling up forever.
  useEffect(() => {
    if ((data?.items.length ?? 0) > 0 && items.length === 0) {
      setCursor(advanceMissedCursor({ date: todayStr(), bucketKey: BUCKET_ORDER[BUCKET_ORDER.length - 1] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, data]);

  if (items.length === 0) return null;

  const handleDiscard = (s: MissedExpenseSuggestion) => {
    dismissMissedExpense(s.date, s.categoryId, s.bucketKey);
    setDismissVersion((v) => v + 1);
  };

  const handleAdd = (s: MissedExpenseSuggestion) => {
    setOpen(false);
    navigate('/expenses/new', {
      state: {
        prefill: {
          amount: String(s.typicalAmount),
          description: s.typicalDescription,
          categoryId: s.categoryId,
          note: '',
          date: s.date,
          time: s.suggestedTime,
        },
      },
    });
  };

  const handleMarkAllCovered = () => {
    setCursor(advanceMissedCursor({ date: todayStr(), bucketKey: BUCKET_ORDER[BUCKET_ORDER.length - 1] }));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground bg-transparent transition-colors"
        aria-label="Possibly missed expenses"
      >
        <AlertCircle className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
          {items.length}
        </span>
      </button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        header={(
          <div className="flex items-center gap-2">
            <Dialog.Title className="text-base font-semibold">Possibly missed</Dialog.Title>
            <DataFreshnessIndicator status={freshness.status} isFetching={freshness.isFetching} />
          </div>
        )}
      >
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Based on your usual habits, these look like they might be missing. Nothing here is lost by just looking — an entry only goes away once you Add or discard it.
          </p>
          <button
            type="button"
            onClick={handleMarkAllCovered}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-secondary/30 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark everything covered up to now
          </button>
          {items.map((s) => (
            <div key={`${s.date}::${s.categoryId}::${s.bucketKey}`} className="bg-secondary/50 rounded-xl p-3 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">{s.categoryIcon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.typicalDescription}</p>
                <p className="text-xs text-muted-foreground">
                  {s.dayLabel} · {s.categoryName} · usually in the {s.bucketLabel} · ~₹{s.typicalAmount.toLocaleString('en-IN')} · {s.frequencyPct}% of days
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleDiscard(s)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                  aria-label="Not done that day"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAdd(s)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  aria-label="Add expense"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
