import { useEffect, useRef } from 'react';

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

// Removes an overlay's pushed history entry after it closes via the UI.
function removeEntry(entry: Entry, hrefAtOpen: string) {
  const idx = stack.findIndex((e) => e.id === entry.id);
  if (idx === -1) return; // already removed by a Back press — nothing to undo
  stack.splice(idx, 1);
  // If the app navigated away (URL changed), that navigation already replaced/
  // consumed our entry — calling back() here would undo the navigation.
  if (window.location.href !== hrefAtOpen) return;
  // Same page → remove our pushed entry, flagged so the listener closes nothing.
  ignoreNextPop = true;
  window.history.back();
}

/**
 * Makes the hardware / browser Back button close an open overlay instead of
 * navigating the page. While `open`, a throwaway history entry is pushed; Back
 * pops it and calls `onClose`. Closing via the UI removes that entry quietly.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // React StrictMode (dev only) mounts → unmounts → remounts on first render.
  // Removing the entry immediately there fires an async history.back() that
  // lands AFTER the remount's pushState, leaving the overlay's entry "forward"
  // of the current one — so the eventual close's back() leaves the page
  // entirely. Deferring removal one tick lets a remount reclaim the entry
  // that's still in history instead.
  const pendingRemovalRef = useRef<{ entry: Entry; hrefAtOpen: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (!open) return;
    ensureListener();

    let entry: Entry;
    let hrefAtOpen: string;
    const pending = pendingRemovalRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      pendingRemovalRef.current = null;
      ({ entry, hrefAtOpen } = pending);
    } else {
      entry = { id: ++seq, onClose };
      hrefAtOpen = window.location.href;
      stack.push(entry);
      window.history.pushState({ ...window.history.state, __overlay: entry.id }, '');
    }

    return () => {
      const timer = setTimeout(() => {
        pendingRemovalRef.current = null;
        removeEntry(entry, hrefAtOpen);
      }, 0);
      pendingRemovalRef.current = { entry, hrefAtOpen, timer };
    };
    // onClose is captured at open time on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
