import { format } from 'date-fns';

// A single forward-only position — (date, time-bucket) — marking
// "everything at or before this point is resolved." It only ever moves in
// response to an explicit action (adding/discarding a suggestion advances
// it to that suggestion's own position; the "mark everything covered"
// action jumps it to the newest position on screen) — never just from
// opening the list. Must match the backend's bucket order exactly
// (expense.controller.ts's missedCheckBuckets).
export const BUCKET_ORDER = ['morning', 'afternoon', 'evening', 'night'] as const;

export interface MissedCursor {
  date: string;
  bucketKey: string;
}

const STORAGE_KEY = 'spendly:missed-cursor';

export function getMissedCursor(): MissedCursor | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MissedCursor) : null;
  } catch {
    return null;
  }
}

function comparePosition(a: MissedCursor, b: MissedCursor): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return BUCKET_ORDER.indexOf(a.bucketKey as typeof BUCKET_ORDER[number]) - BUCKET_ORDER.indexOf(b.bucketKey as typeof BUCKET_ORDER[number]);
}

// Never moves the cursor backwards, even if called with an older position.
export function advanceMissedCursor(position: MissedCursor): MissedCursor {
  const current = getMissedCursor();
  const next = current && comparePosition(current, position) >= 0 ? current : position;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — cursor just won't persist across a reload.
  }
  return next;
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
