import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Trash2, CheckCheck, Plus } from 'lucide-react';
import { useMissedExpenses } from '../hooks/useExpenses';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { getMissedCursorDate, advanceMissedCursor, yesterdayStr } from '../utils/missedCursor';
import { isMissedExpenseDismissed, dismissMissedExpense } from '../utils/missedDismissals';
import type { MissedExpenseSuggestion } from '../types';

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

// Same grouping shape as the Expenses list itself — one header per date,
// its items nested underneath, in the order they already arrive (backend
// sorts oldest-first).
function groupByDate(items: MissedExpenseSuggestion[]): { date: string; dayLabel: string; items: MissedExpenseSuggestion[] }[] {
  const groups: { date: string; dayLabel: string; items: MissedExpenseSuggestion[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, dayLabel: item.dayLabel, items: [item] });
  }
  return groups;
}

export default function MissedExpensesButton() {
  const navigate = useNavigate();
  const [cursorDate] = useState(() => getMissedCursorDate() ?? undefined);
  const missedQuery = useMissedExpenses(cursorDate);
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
    () => (data?.items ?? []).filter((s) => !isMissedExpenseDismissed(s.date, s.categoryId, s.slotKey)),
    [data, dismissVersion],
  );

  // The cursor only ever moves for two reasons: the user explicitly presses
  // "mark everything covered" (below), or — here — the list empties out
  // naturally because every entry that was actually shown got individually
  // resolved. It only ever targets yesterday-or-earlier (never today —
  // today always gets a fresh check against real data every time), so
  // advancing it here is pure backlog cleanup: nothing currently pending is
  // affected (everything shown already got individually resolved to reach
  // this point), it just lets old dismissals get pruned instead of piling
  // up forever.
  useEffect(() => {
    if ((data?.items.length ?? 0) > 0 && items.length === 0) {
      advanceMissedCursor(yesterdayStr());
    }
  }, [items.length, data]);

  if (items.length === 0) return null;

  const handleDiscard = (s: MissedExpenseSuggestion) => {
    dismissMissedExpense(s.date, s.categoryId, s.slotKey);
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
    // The cursor only ever reaches yesterday-or-earlier (today always stays
    // freshly checked), so it alone won't hide anything dated today —
    // dismiss those individually too, the same as pressing ✕ on each.
    for (const s of items) dismissMissedExpense(s.date, s.categoryId, s.slotKey);
    setDismissVersion((v) => v + 1);
    advanceMissedCursor(yesterdayStr());
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
        <div className="px-4 pb-4 space-y-5">
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

          {groupByDate(items).map((group) => (
            <div key={group.date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.dayLabel}</p>
              <div className="space-y-3">
                {group.items.map((s) => (
                  <div key={`${s.date}::${s.categoryId}::${s.slotKey}`} className="rounded-2xl border border-border bg-card p-3.5 space-y-3.5">
                    {/* Header: icon, description/category, discard */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-base shrink-0">
                        <span>{s.categoryIcon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">
                          {s.categoryName}
                        </label>
                        <p className="text-sm font-semibold truncate">{s.typicalDescription}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDiscard(s)}
                        className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center active:scale-90 transition-all shrink-0"
                        aria-label="Not done that day"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>

                    {/* Amount / usual time */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount (₹)</label>
                        <div className="w-full bg-secondary/50 rounded-xl px-3 py-2 text-sm font-bold">
                          {s.typicalAmount.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Usually around</label>
                        <div className="w-full bg-secondary/50 rounded-xl px-3 py-2 text-sm font-bold">
                          {fmtTime(s.suggestedTime)}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">{s.frequencyPct}% of tracked days</p>

                    <button
                      type="button"
                      onClick={() => handleAdd(s)}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Add expense
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
