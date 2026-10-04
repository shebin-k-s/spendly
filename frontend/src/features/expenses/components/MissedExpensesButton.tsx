import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCheck } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { useMissedExpenses, useResolveMissed } from '../hooks/useExpenses';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { BulkParseModal, type ParsedItem } from './BulkParseModal';
import { readLegacyMissedState, clearLegacyMissedState } from '../utils/legacyMissedStorage';
import type { MissedExpenseSuggestion, ResolveMissedPayload } from '../types';

// slotKey rides along as an opaque tag so a removal (onRemoveItem below) can
// be written back to the server as resolved — BulkParseModal never looks inside it.
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

function suggestionKey(s: { date: string; categoryId: string; slotKey: string }): string {
  return `${s.date}::${s.categoryId}::${s.slotKey}`;
}

function tagToItem(tag: string | undefined): ResolveMissedPayload['items'][number] | null {
  const [date, categoryId, slotKey] = (tag ?? '').split('::');
  return date && categoryId && slotKey ? { date, categoryId, slotKey } : null;
}

export default function MissedExpensesButton() {
  const missedQuery = useMissedExpenses();
  const { data } = missedQuery;
  useRefetchOnFocus(missedQuery);
  const resolveMissed = useResolveMissed();
  const [open, setOpen] = useState(false);
  // Discards and "mark everything covered" are stored server-side, so every
  // device sees the same list. These keys hide a resolved entry right away,
  // before the refetch that follows the save comes back without it.
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());

  // One-time upload of discards / cursor an older version kept only in this
  // device's localStorage — cleared only once the server has them.
  const legacySyncedRef = useRef(false);
  useEffect(() => {
    if (legacySyncedRef.current) return;
    legacySyncedRef.current = true;
    const legacy = readLegacyMissedState();
    if (!legacy) return;
    resolveMissed.mutate(legacy, { onSuccess: clearLegacyMissedState });
  }, [resolveMissed]);

  const items = useMemo(
    () => (data?.items ?? []).filter((s) => !pendingKeys.has(suggestionKey(s))),
    [data, pendingKeys],
  );

  if (items.length === 0) return null;

  const resolve = (payload: ResolveMissedPayload) => {
    const keys = payload.items.map(suggestionKey);
    setPendingKeys((prev) => new Set([...prev, ...keys]));
    resolveMissed.mutate(payload, {
      onError: (err) => {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
        toast.error(getErrorMessage(err));
      },
    });
  };

  // Individually discarding one entry only ever removes that one entry —
  // it never touches the cursor or any other entry.
  const handleRemoveItem = (item: ParsedItem) => {
    const resolved = tagToItem(item._tag);
    if (resolved) resolve({ items: [resolved] });
  };

  // A save can end up under a different category than what was suggested
  // (e.g. AI-corrected from "Meals" to "Shake") — the habit-coverage check
  // on the backend matches the ORIGINAL suggested category, so without
  // this the exact same "missing Meals" suggestion would keep reappearing
  // even though the user did account for that time slot, just as something
  // else. Resolving it the same way a manual discard does treats "I
  // reviewed and saved this" as resolving the suggestion regardless of
  // what it actually got saved as.
  const handleItemSaved = (item: ParsedItem) => {
    const resolved = tagToItem(item._tag);
    if (resolved) resolve({ items: [resolved] });
  };

  const handleMarkAllCovered = () => {
    // The cursor only ever reaches yesterday-or-earlier (today always stays
    // freshly checked), so it alone won't hide anything dated today —
    // resolve those individually too, the same as removing each row.
    resolve({
      items: items.map((s) => ({ date: s.date, categoryId: s.categoryId, slotKey: s.slotKey })),
      cursorDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    });
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
