import * as Dialog from '@radix-ui/react-dialog';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'Delete',
  cancelText = 'Cancel',
}: ConfirmModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[60] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] p-4 focus:outline-none">
          <div className="bg-card border border-border shadow-2xl rounded-3xl overflow-hidden p-5 animate-in fade-in zoom-in duration-200">
            <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="text-sm text-muted-foreground mt-2 mb-6">
                {description}
              </Dialog.Description>
            )}
            
            <div className="flex gap-3 w-full mt-6">
              <button
                type="button"
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
                onClick={() => onOpenChange(false)}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
