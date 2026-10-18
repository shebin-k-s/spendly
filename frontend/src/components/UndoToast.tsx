import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

/**
 * "Something changed, tap to reverse it" notice. Same custom-toast approach as
 * DraftRestoredToast, since Sonner's default action button is a stark
 * black/white block that doesn't match the app in either theme.
 */
export function showUndoToast(title: string, subtitle: string, onUndo: () => void) {
  toast.custom((id) => (
    <div className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-xl">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Undo2 className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight truncate">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          onUndo();
          toast.dismiss(id);
        }}
        className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary active:scale-95 transition-transform"
      >
        Undo
      </button>
    </div>
  ), {
    // The Toaster's global card styling would wrap this in a second card.
    unstyled: true,
    duration: 6000,
    style: { background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
    // Sonner only sizes styled toasts on wider screens — give it the same width.
    className: 'min-[600px]:w-[var(--width)]',
  });
}
