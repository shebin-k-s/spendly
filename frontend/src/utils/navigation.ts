import type { NavigateFunction } from 'react-router-dom';

// After deleting from Edit, going back one step lands on the item's Details
// page — which no longer exists. Edit is only reachable from Details, so skip
// both and return to the list; fall back to the list route if there's no
// history to go back through (e.g. the page was opened directly).
export function leaveDeletedItem(navigate: NavigateFunction, listPath: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx >= 2) navigate(-2);
  else navigate(listPath, { replace: true });
}
