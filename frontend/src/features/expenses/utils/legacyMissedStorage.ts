import type { ResolveMissedPayload } from '../types';

// Missed-expense discards and the "covered up to" cursor used to live only in
// this device's localStorage, so resolving them on one device left every
// other device showing the full list. They're stored server-side now — this
// reads whatever an older version left behind on this device so it can be
// uploaded once, then cleared.
const DISMISSED_KEY = 'spendly:missed-dismissed';
const CURSOR_KEY = 'spendly:missed-cursor-date';

export function readLegacyMissedState(): ResolveMissedPayload | null {
  try {
    const rawDismissed = localStorage.getItem(DISMISSED_KEY);
    const cursorDate = localStorage.getItem(CURSOR_KEY);
    if (!rawDismissed && !cursorDate) return null;

    const keys = rawDismissed ? Object.keys(JSON.parse(rawDismissed) as Record<string, true>) : [];
    const items = keys
      .map((key) => key.split('::'))
      .filter((parts) => parts.length === 3 && parts.every(Boolean))
      .map(([date, categoryId, slotKey]) => ({ date, categoryId, slotKey }));

    return { items, ...(cursorDate ? { cursorDate } : {}) };
  } catch {
    return null;
  }
}

export function clearLegacyMissedState(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(CURSOR_KEY);
  } catch {
    // localStorage unavailable — nothing to clear.
  }
}
