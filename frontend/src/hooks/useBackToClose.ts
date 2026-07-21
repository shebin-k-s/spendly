import { useEffect } from 'react';

// Monotonic id so each opened overlay owns a distinct history entry — lets stacked
// overlays (e.g. a picker on top of a modal) close one at a time, newest first.
let seq = 0;

/**
 * Makes the hardware / browser Back button close an open overlay instead of
 * navigating the page. While `open`, a throwaway history entry is pushed; pressing
 * Back pops it and calls `onClose`. Closing via the UI removes the entry we added
 * so history stays clean.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    const prev = window.history.state;
    if (prev?.__overlay !== id) {
      window.history.pushState({ ...prev, __overlay: id }, '');
    }
    let closedByBack = false;
    const onPop = () => {
      closedByBack = true;
      onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed via the UI (not Back) and our entry is still on top → remove it.
      if (!closedByBack && window.history.state?.__overlay === id) {
        window.history.back();
      }
    };
    // onClose is intentionally excluded — we capture the handler at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
