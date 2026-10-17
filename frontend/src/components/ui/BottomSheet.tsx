import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { useBackToClose } from '@/hooks/useBackToClose';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  header?: React.ReactNode;
  maxHeight?: string;
  // Keep the sheet where it opened instead of riding the keyboard. The page
  // shrinks when the keyboard shows (and briefly flickers when focus moves
  // between inputs), so a bottom-anchored sheet visibly drops and rises again.
  // Pinned sheets get a fixed height and the keyboard just covers their lower part.
  pinned?: boolean;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  header,
  maxHeight = '85vh',
  pinned = false,
}: BottomSheetProps) {
  const [openHeight, setOpenHeight] = useState(0);
  useLayoutEffect(() => {
    if (open && pinned) setOpenHeight(window.innerHeight);
  }, [open, pinned]);
  const pin = pinned && openHeight > 0;
  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();
  // Tied to open, not proximity — this also gates pull-to-refresh (which
  // checks the same flag), so it needs to be reliably off the instant the
  // sheet is open, not dependent on a pointerenter having already fired.
  useEffect(() => {
    if (!open) return;
    disableGlobalSwipe();
    return () => enableGlobalSwipe();
  }, [open, disableGlobalSwipe, enableGlobalSwipe]);
  useBackToClose(open, () => onOpenChange(false));
  const modalRef = useRef<HTMLDivElement>(null);
  const handlePointerStartY = useRef<number | null>(null);
  const handleCurrentY = useRef<number>(0);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    handlePointerStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (handlePointerStartY.current === null || !modalRef.current) return;
    let distance = e.clientY - handlePointerStartY.current;
    if (distance < 0) distance = 0;
    handleCurrentY.current = distance;
    modalRef.current.style.transition = 'none';
    modalRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (handlePointerStartY.current === null || !modalRef.current) return;
    if (handleCurrentY.current > 120) {
      onOpenChange(false);
    } else {
      modalRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      modalRef.current.style.transform = 'translateY(0px)';
    }
    handlePointerStartY.current = null;
    handleCurrentY.current = 0;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-no-swipe className="fixed inset-0 bg-black/70 z-50 animate-in fade-in duration-300" />
        <Dialog.Content
          ref={modalRef}
          data-no-swipe
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            // transition-none: duration-500 would otherwise also animate max-height, so every
            // keyboard-driven viewport resize made the sheet visibly slide to its new size.
            "fixed bottom-0 inset-x-0 w-full sm:max-w-md sm:mx-auto z-50 bg-card border-t border-border rounded-t-3xl flex flex-col animate-in slide-in-from-bottom duration-500 ease-in-out transition-none sheet-exit",
          )}
          // The viewport resizes when the keyboard opens (interactive-widget=resizes-content),
          // but vh doesn't — clamp to dvh so the sheet always fits above the keyboard.
          style={pin
            ? {
                height: `${Math.round(openHeight * 0.8)}px`,
                maxHeight: 'none',
                // 100dvh tracks the shrinking viewport, so this offset cancels it out
                // and the sheet stays at its opening position.
                bottom: `calc(100dvh - ${openHeight}px)`,
              }
            : { maxHeight: `min(${maxHeight}, calc(100dvh - 16px))` }}
        >
          {/* Drag handle */}
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            className="pt-2 pb-3 w-full flex justify-center cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
          >
            <div className="w-10 h-1 bg-border rounded-full pointer-events-none" />
          </div>

          {(header || title) && (
            <div className="px-5 pt-2 pb-3 border-b border-border flex-shrink-0">
              {header || (
                <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain disable-scrollbars custom-scrollbar">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
