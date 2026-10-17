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
  // Keep the sheet raised through the keyboard's brief hide/show when focus moves
  // between inputs. Android restarts the keyboard on that switch, which resizes the
  // page; a bottom-anchored sheet would visibly drop and rise again.
  holdKeyboard?: boolean;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  header,
  maxHeight = '85vh',
  holdKeyboard = false,
}: BottomSheetProps) {
  // The keyboard height is measured against the page height at open. When the page
  // briefly grows back (keyboard hiding during a field switch) the sheet keeps its
  // raised position and height for a moment, so a quick hide→show is invisible; a real
  // close settles after the delay. Sizes are in measured px, not vh/dvh, so they
  // don't depend on how the browser treats viewport units while the keyboard moves.
  const [hold, setHold] = useState<{ lift: number; fullHeight: number; avail: number } | null>(null);
  // The page resizes in one step (not frame by frame) when the keyboard opens or closes,
  // so the sheet would snap. Offset it back by the jump, then ease that offset to zero.
  const [shift, setShift] = useState({ y: 0, anim: false });
  useLayoutEffect(() => {
    if (!open || !holdKeyboard) {
      setHold(null);
      return;
    }
    const base = window.innerHeight;
    let held = 0;
    let lastKb = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let easeId = 0;
    const ease = (jump: number) => {
      // jump > 0: sheet snapped up by that much, so start `jump` lower; < 0: snapped down.
      // If an earlier ease is still running (the keyboard can report its size in
      // several steps), continue from where the sheet visibly is, not from zero.
      const raw = modalRef.current ? getComputedStyle(modalRef.current).translate : 'none';
      const current = parseFloat(raw.split(' ')[1] ?? '0') || 0;
      const id = ++easeId;
      setShift({ y: current + jump, anim: false });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (id === easeId) setShift({ y: 0, anim: true });
      }));
    };
    const onResize = () => {
      const kb = Math.max(0, base - window.innerHeight);
      clearTimeout(timer);
      if (kb >= held) {
        const jump = kb - lastKb;
        held = kb;
        lastKb = kb;
        setHold({ lift: 0, fullHeight: base, avail: base - held });
        if (jump > 0) ease(jump);
      } else {
        // Sheet is held in place, so its on-screen position (lastKb) doesn't change.
        setHold({ lift: held - kb, fullHeight: base, avail: base - held });
        timer = setTimeout(() => {
          const dropped = held - Math.max(0, base - window.innerHeight);
          held = Math.max(0, base - window.innerHeight);
          lastKb = held;
          setHold({ lift: 0, fullHeight: base, avail: base - held });
          if (dropped > 0) ease(-dropped);
        }, 300);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [open, holdKeyboard]);
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
          style={hold
            ? {
                maxHeight: `${Math.round(Math.min(hold.fullHeight * 0.85, hold.avail - 16))}px`,
                ...(hold.lift > 0 ? { bottom: `${hold.lift}px` } : null),
                // `translate` is separate from `transform`, which the open animation and
                // the drag handle already use.
                translate: `0 ${shift.y}px`,
                transition: shift.anim ? 'translate 300ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
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
