import { useEffect } from 'react';

// A single shared stack + one popstate listener coordinates every overlay, so a
// Back press closes only the top-most one, and an overlay closing via the UI can
// remove its own history entry WITHOUT looking like a Back press to the overlay
// beneath it (which was the "selecting a category closes the whole modal" bug).

let seq = 0;
type Entry = { id: number; onClose: () => void };
const stack: Entry[] = [];
let ignoreNextPop = false;
let installed = false;

function ensureListener() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', () => {
    // A pop we triggered ourselves (UI close cleanup) — consume it, close nothing.
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    // Genuine Back press → close the top-most overlay.
    const top = stack.pop();
    if (top) top.onClose();
  });
}

/**
 * Makes the hardware / browser Back button close an open overlay instead of
 * navigating the page. While `open`, a throwaway history entry is pushed; Back
 * pops it and calls `onClose`. Closing via the UI removes that entry quietly.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    ensureListener();
    const id = ++seq;
    stack.push({ id, onClose });
    window.history.pushState({ ...window.history.state, __overlay: id }, '');
    return () => {
      const idx = stack.findIndex((e) => e.id === id);
      if (idx === -1) return; // already removed by a Back press — nothing to undo
      stack.splice(idx, 1);
      // Remove our pushed entry, flagged so the listener doesn't close anything.
      ignoreNextPop = true;
      window.history.back();
    };
    // onClose is captured at open time on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
