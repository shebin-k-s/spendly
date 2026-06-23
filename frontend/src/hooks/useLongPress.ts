import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: React.PointerEvent) => void;
  onClick?: (e: React.PointerEvent) => void;
  delay?: number;
}

export function useLongPress({ onLongPress, onClick, delay = 500 }: UseLongPressOptions) {
  const timeout = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActive = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: React.PointerEvent) => {
    isLongPressActive.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    timeout.current = setTimeout(() => {
      isLongPressActive.current = true;
      if ('vibrate' in navigator) {
        navigator.vibrate(50); // Haptic feedback
      }
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const stop = useCallback((e: React.PointerEvent) => {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    if (!isLongPressActive.current && onClick) {
      onClick(e);
    }
    startPos.current = null;
  }, [onClick]);

  const move = useCallback((e: React.PointerEvent) => {
    if (!startPos.current || isLongPressActive.current) return;
    
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    
    if (dx > 10 || dy > 10) {
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = null;
      }
    }
  }, []);

  const leave = useCallback(() => {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: leave,
    onPointerMove: move,
    style: { 
      userSelect: 'none' as const, 
      WebkitUserSelect: 'none' as const,
      WebkitTouchCallout: 'none' as const 
    },
  };
}
