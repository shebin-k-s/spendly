// Per-item memory for an individual "discard" — "I didn't actually do this
// that day." Persisted indefinitely (not reset daily, not tied to the
// cursor in missedCursor.ts): discarding ONE entry must never silently
// affect any other entry, so this exists purely to remember that one exact
// (date, category, time-slot) without touching the cursor. The cursor is
// only ever moved by an explicit "mark everything covered" action or once
// this ledger + real expense data together empty out the list naturally —
// see MissedExpensesButton.tsx. Pruned on write so it can't grow unbounded.
const STORAGE_KEY = 'spendly:missed-dismissed';
const PRUNE_AFTER_DAYS = 35; // a bit past the backend's own 14-day backfill cap, as a safety margin

function suggestionKey(date: string, categoryId: string, slotKey: string): string {
  return `${date}::${categoryId}::${slotKey}`;
}

function readAll(): Record<string, true> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, true>): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PRUNE_AFTER_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned: Record<string, true> = {};
    for (const key of Object.keys(entries)) {
      const date = key.slice(0, 10);
      if (date >= cutoffStr) pruned[key] = true;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // localStorage unavailable (private mode, etc.) — dismissal just won't
    // persist across a reload, which is a harmless degradation.
  }
}

export function isMissedExpenseDismissed(date: string, categoryId: string, slotKey: string): boolean {
  return suggestionKey(date, categoryId, slotKey) in readAll();
}

export function dismissMissedExpense(date: string, categoryId: string, slotKey: string): void {
  const entries = readAll();
  entries[suggestionKey(date, categoryId, slotKey)] = true;
  writeAll(entries);
}
