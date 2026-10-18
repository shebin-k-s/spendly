import { toast } from 'sonner';
import { Check, Loader2, Undo2 } from 'lucide-react';

type Status = 'saving' | 'saved';

// One shared slot: a new toast replaces the previous one instead of stacking under it.
export const UNDO_TOAST_ID = 'undo-toast';
let latest = 0;

export interface UndoToastHandle {
  saved: () => void;
  failed: () => void;
}

/**
 * "Something changed, tap to reverse it" notice, with a live save state: it opens as "Saving…"
 * and flips to "Saved" when the server confirms. Same custom-toast approach as
 * DraftRestoredToast, since Sonner's default action button is a stark
 * black/white block that doesn't match the app in either theme.
 * Undo stays disabled until the save lands, so the two requests can't overtake each other.
 */
export function showUndoToast(title: string, subtitle: string, onUndo: () => void): UndoToastHandle {
  const id = UNDO_TOAST_ID;
  const mine = ++latest;

  const render = (status: Status) =>
    toast.custom((tid) => (
      <div className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-xl">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status === 'saved' ? 'bg-success/15' : 'bg-primary/10'}`}>
          {status === 'saving'
            ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
            : <Check className="w-4 h-4 text-success" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {status === 'saving' ? 'Saving… ' : 'Saved · '}{subtitle}
          </p>
        </div>
        <button
          type="button"
          disabled={status === 'saving'}
          onClick={() => {
            onUndo();
            toast.dismiss(tid);
          }}
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary active:scale-95 transition-transform disabled:opacity-40"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
      </div>
    ), {
      id,
      // The Toaster's global card styling would wrap this in a second card.
      unstyled: true,
      duration: 6000,
      style: { background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
      // Sonner only sizes styled toasts on wider screens — give it the same width.
      className: 'min-[600px]:w-[var(--width)]',
    });

  render('saving');
  // A slower, older save must not repaint over a newer toast.
  return {
    saved: () => { if (mine === latest) render('saved'); },
    failed: () => { if (mine === latest) toast.dismiss(id); },
  };
}
