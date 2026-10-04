import { toast } from 'sonner';
import { History } from 'lucide-react';

/**
 * "We brought back what you were typing" notice, shared by the Add Expense
 * and Bulk Add drafts. A custom toast rather than a plain one with `action`,
 * since Sonner's default action button is a stark black/white block that
 * doesn't match the app's styling in either theme.
 */
export function showDraftRestoredToast(onDiscard: () => void) {
  toast.custom((id) => (
    <div className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-xl">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <History className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Draft restored</p>
        <p className="text-xs text-muted-foreground mt-0.5">From your last session</p>
      </div>
      <button
        type="button"
        onClick={() => {
          onDiscard();
          toast.dismiss(id);
        }}
        className="shrink-0 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive active:scale-95 transition-transform"
      >
        Discard
      </button>
    </div>
  ), {
    // The Toaster's global card styling would wrap this in a second card.
    unstyled: true,
    style: { background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
    // Sonner only sizes styled toasts on wider screens, so an unstyled one
    // shrinks to its content and sits left of center — give it the same width.
    // (Below 600px Sonner already stretches every toast edge to edge.)
    className: 'min-[600px]:w-[var(--width)]',
  });
}
