import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCheck } from 'lucide-react';
import { useMissedExpenses } from '../hooks/useExpenses';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { BulkParseModal, type ParsedItem } from './BulkParseModal';
import { getMissedCursorDate, advanceMissedCursor, yesterdayStr } from '../utils/missedCursor';
import { isMissedExpenseDismissed, dismissMissedExpense } from '../utils/missedDismissals';
import type { MissedExpenseSuggestion } from '../types';

// slotKey rides along as an opaque tag so a removal (onRemoveItem below) can
// be written back to the dismiss ledger — BulkParseModal never looks inside it.
//
// BulkParseModal's card has no field of its own for "why was this
// suggested" — pre-filling the note covers that context instead of leaving
// it blank, and doubles as a visible reason to look at the (otherwise
// easy-to-miss) note box at all. Prefer the real note from past occasions
// (the actual itemized breakdown, e.g. "Tea ₹20, Biscuit ₹10.") when this
// habit has one; only fall back to the frequency explanation when it doesn't.
function toParsedItem(s: MissedExpenseSuggestion): ParsedItem {
  return {
    amount: String(s.typicalAmount),
    description: s.typicalDescription,
    date: s.date,
    time: s.suggestedTime,
    category_id: s.categoryId,
    category_name: s.categoryName,
    note: s.typicalNote ?? `You usually do this ${s.frequencyPct}% of tracked days.`,
    cashback: null,
    suggested_flow: 'expense',
    transfer_person: null,
    transfer_phone: null,
    transfer_direction: null,
    _tag: `${s.date}::${s.categoryId}::${s.slotKey}`,
  };
}

export default function MissedExpensesButton() {
  const [cursorDate] = useState(() => getMissedCursorDate() ?? undefined);
  const missedQuery = useMissedExpenses(cursorDate);
  const { data } = missedQuery;
  useRefetchOnFocus(missedQuery);
  const [open, setOpen] = useState(false);
  // Dismissal lives in localStorage, not React state — bump this after
  // every discard to force the filter below to re-run.
  const [dismissVersion, setDismissVersion] = useState(0);

  // Individually discarding one entry only ever removes that one entry —
  // it never touches the cursor or any other entry. Saving (via
  // BulkParseModal's own Save All) also only affects the items actually
  // saved, but via real data (the next fetch sees each as covered) rather
  // than this ledger.
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

  const handleRemoveItem = (item: ParsedItem) => {
    const [date, categoryId, slotKey] = (item._tag ?? '').split('::');
    if (date && categoryId && slotKey) dismissMissedExpense(date, categoryId, slotKey);
    setDismissVersion((v) => v + 1);
  };

  // A save can end up under a different category than what was suggested
  // (e.g. AI-corrected from "Meals" to "Shake") — the habit-coverage check
  // on the backend matches the ORIGINAL suggested category, so without
  // this the exact same "missing Meals" suggestion would keep reappearing
  // even though the user did account for that time slot, just as something
  // else. Dismissing it the same way a manual discard already does treats
  // "I reviewed and saved this" as resolving the suggestion regardless of
  // what it actually got saved as.
  const handleItemSaved = (item: ParsedItem) => {
    const [date, categoryId, slotKey] = (item._tag ?? '').split('::');
    if (date && categoryId && slotKey) dismissMissedExpense(date, categoryId, slotKey);
  };

  const handleMarkAllCovered = () => {
    // The cursor only ever reaches yesterday-or-earlier (today always stays
    // freshly checked), so it alone won't hide anything dated today —
    // dismiss those individually too, the same as removing each row.
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

      {/* Remounted fresh each time it opens (rather than staying mounted
          with open toggled) so initialItems — read only once, on mount —
          always seeds from the current list instead of a stale one from
          the last time this was open. draftKey means that's only true when
          there's nothing worth keeping: any in-progress edits are restored
          from localStorage instead of initialItems, so navigating away (this
          only lives on ExpensesPage, so switching tabs unmounts it) or just
          closing and reopening doesn't silently drop unsaved changes. */}
      {open && (
        <BulkParseModal
          open
          onClose={() => setOpen(false)}
          initialItems={items.map(toParsedItem)}
          title="Possibly missed"
          subtitle="Based on your usual habits — review, edit, or remove"
          headerIcon={<AlertCircle className="w-4 h-4 text-primary" />}
          topAction={{
            label: 'Mark everything covered up to now',
            icon: <CheckCheck className="w-3.5 h-3.5" />,
            onClick: handleMarkAllCovered,
          }}
          onRemoveItem={handleRemoveItem}
          onItemSaved={handleItemSaved}
          draftKey="spendly:missed-expenses-draft"
        />
      )}
    </>
  );
}
