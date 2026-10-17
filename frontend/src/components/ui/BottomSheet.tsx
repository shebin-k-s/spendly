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

interface VirtualKeyboardLike extends EventTarget {
  overlaysContent: boolean;
  boundingRect: { height: number };
}

// Chrome's VirtualKeyboard API: with overlaysContent on, the page is NOT resized when
// the keyboard opens — the keyboard just covers it, and we raise the sheet by its height.
// That avoids the page shrinking in steps (keyboard, then its autofill bar), which
// clipped and re-slid the sheet. Returns the keyboard height in px, or null if the
// browser doesn't support it. Decreases are delayed so the keyboard briefly hiding
// while focus moves between inputs doesn't dip the sheet.
function useVirtualKeyboardInset(active: boolean, getSheet: () => HTMLElement | null): number | null {
  const [inset, setInset] = useState<number | null>(null);
  useEffect(() => {
    const vk = (navigator as unknown as { virtualKeyboard?: VirtualKeyboardLike }).virtualKeyboard;
    if (!vk) {
      setInset(null);
      return;
    }
    // On close, leave the last inset in place: the sheet keeps its raised position through
    // its exit animation instead of dropping by the keyboard's height first. It's reset
    // to 0 the next time the sheet opens.
    if (!active) return;
    const previous = vk.overlaysContent;
    vk.overlaysContent = true;
    let current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setInset(0);
    const onChange = () => {
      const h = Math.round(vk.boundingRect.height);
      clearTimeout(timer);
      if (h >= current) {
        current = h;
        setInset(h);
      } else {
        // Only wait if a field in THIS sheet is focused (the keyboard may just be
        // restarting for the next field). If not — e.g. a sheet on top of this one
        // closed and took the keyboard with it — follow the keyboard down right away,
        // otherwise this sheet hangs in the air over an empty gap for the delay.
        const el = document.activeElement;
        const typingHere = !!el && !!getSheet()?.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName);
        if (!typingHere) {
          current = h;
          setInset(h);
          return;
        }
        timer = setTimeout(() => {
          current = h;
          setInset(h);
        }, 300);
      }
    };
    vk.addEventListener('geometrychange', onChange);
    return () => {
      clearTimeout(timer);
      vk.removeEventListener('geometrychange', onChange);
      vk.overlaysContent = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return inset;
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
  const keyboardInset = useVirtualKeyboardInset(open && holdKeyboard, () => modalRef.current);
  // The maxHeight prop is a vh string (e.g. '75vh'); keyboard mode works in px.
  const maxFraction = /^\d+(\.\d+)?vh$/.test(maxHeight) ? parseFloat(maxHeight) / 100 : 0.85;
  const useResizeFallback = holdKeyboard && !('virtualKeyboard' in navigator);
  const [hold, setHold] = useState<{ lift: number; fullHeight: number; avail: number } | null>(null);
  // The page resizes in steps (the keyboard, then its suggestion bar), not frame by
  // frame, and a step can move the sheet's top edge, its bottom edge, or both. So each
  // time, measure where the sheet visibly was, re-apply that as an offset (it stays put
  // for that frame), then ease the offset to zero.
  const [shift, setShift] = useState({ y: 0, anim: false });
  const lastTop = useRef(0);
  const anchorTop = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  useLayoutEffect(() => {
    const anchor = anchorTop.current;
    const el = modalRef.current;
    if (anchor === null || !el) return;
    anchorTop.current = null;
    const current = parseFloat((getComputedStyle(el).translate || '').split(' ')[1] ?? '0') || 0;
    const layoutTop = el.getBoundingClientRect().top - current;
    setShift({ y: anchor - layoutTop, anim: false });
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setShift({ y: 0, anim: true }), 50);
  }, [hold]);
  useLayoutEffect(() => {
    if (!open || !useResizeFallback) {
      setHold(null);
      return;
    }
    const base = window.innerHeight;
    let held = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const track = () => {
      if (modalRef.current) lastTop.current = modalRef.current.getBoundingClientRect().top;
      raf = requestAnimationFrame(track);
    };
    track();
    setHold({ lift: 0, fullHeight: base, avail: base });
    const onResize = () => {
      const kb = Math.max(0, base - window.innerHeight);
      clearTimeout(timer);
      if (kb >= held) {
        anchorTop.current = lastTop.current;
        held = kb;
        setHold({ lift: 0, fullHeight: base, avail: base - held });
      } else {
        // Held in place, so nothing visibly moves.
        setHold({ lift: held - kb, fullHeight: base, avail: base - held });
        timer = setTimeout(() => {
          anchorTop.current = lastTop.current;
          held = Math.max(0, base - window.innerHeight);
          setHold({ lift: 0, fullHeight: base, avail: base - held });
        }, 300);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(settleTimer.current);
      window.removeEventListener('resize', onResize);
    };
  }, [open, useResizeFallback]);
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
          style={keyboardInset !== null
            ? {
                maxHeight: `${Math.round(Math.min(window.innerHeight * maxFraction, window.innerHeight - keyboardInset - 16))}px`,
                bottom: `${keyboardInset}px`,
                // Lets content size itself against the space above the keyboard.
                ['--kb' as string]: `${keyboardInset}px`,
                transition: 'bottom 280ms cubic-bezier(0.22, 1, 0.36, 1), max-height 280ms cubic-bezier(0.22, 1, 0.36, 1)',
              }
            : hold
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
