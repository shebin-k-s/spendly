import type { KeyboardEvent } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement;

// Enter on the last/standalone field: close the keyboard.
export function blurOnEnter(e: KeyboardEvent<Field>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.currentTarget.blur();
}

// Enter on a field that has another one after it: hop to it directly.
// enterKeyHint="next" only changes the key's label — it doesn't move focus
// on its own. Moving focus without blurring first keeps the keyboard up.
export function focusNextOnEnter(e: KeyboardEvent<Field>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const current = e.currentTarget;
  const root = current.closest('[role="dialog"], form, main') ?? document;
  const fields = Array.from(
    root.querySelectorAll<Field>(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]), textarea:not([disabled])',
    ),
  );
  const next = fields[fields.indexOf(current) + 1];
  if (next) next.focus();
  else current.blur();
}
