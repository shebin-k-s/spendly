import { format, subDays } from 'date-fns';

// A single forward-only date marking "everything at or before this day is
// resolved." It only ever moves in response to an explicit action — the
// "mark everything covered" button, or the list emptying out on its own
// (see MissedExpensesButton.tsx) — never just from opening the list. Only
// ever targets yesterday-or-earlier, never today (see yesterdayStr below).
const STORAGE_KEY = 'spendly:missed-cursor-date';

export function getMissedCursorDate(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Never moves the cursor backwards, even if called with an older date.
export function advanceMissedCursor(date: string): string {
  const current = getMissedCursorDate();
  const next = current && current >= date ? current : date;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable — cursor just won't persist across a reload.
  }
  return next;
}

// The cursor must never target today — today isn't over yet, and something
// can always change (an expense added, or deleted, revealing a new gap), so
// it always needs a fresh, real check rather than being blocked by a stale
// position. Only full, closed-out days ever get skipped this way.
export function yesterdayStr(): string {
  return format(subDays(new Date(), 1), 'yyyy-MM-dd');
}
