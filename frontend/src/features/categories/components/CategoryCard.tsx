import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../types';

const DRAG_DELAY = 250;
const MOVE_TOLERANCE = 8;

export interface CategoryDragHandlers {
  onDragStart: (category: Category, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, cancelled: boolean) => void;
}

interface CategoryCardProps {
  category: Category;
  // Only passed while the page is in move mode; without it the card is a plain link.
  drag?: CategoryDragHandlers;
  dragging?: boolean;
}

export default function CategoryCard({ category, drag, dragging }: CategoryCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const handlers = useRef(drag);
  handlers.current = drag;
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const moveMode = !!drag;
  const swallowClick = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !moveMode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;
    let startX = 0;
    let startY = 0;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      clear();
      timer = setTimeout(() => {
        active = true;
        navigator.vibrate?.(30);
        handlers.current?.onDragStart(categoryRef.current, startX, startY);
      }, DRAG_DELAY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (active) {
        e.preventDefault(); // stops the page scrolling while dragging
        handlers.current?.onDragMove(t.clientX, t.clientY);
      } else if (Math.hypot(t.clientX - startX, t.clientY - startY) > MOVE_TOLERANCE) {
        clear(); // the user is scrolling, not holding
      }
    };

    const finish = (e: TouchEvent, cancelled: boolean) => {
      clear();
      if (!active) return;
      active = false;
      e.preventDefault();
      const t = e.changedTouches[0];
      handlers.current?.onDragEnd(t.clientX, t.clientY, cancelled);
    };
    const onTouchEnd = (e: TouchEvent) => finish(e, false);
    const onTouchCancel = (e: TouchEvent) => finish(e, true);

    // Mouse (laptop): press and move to drag, no hold needed; move mode is already the safety lock.
    // Listeners live on the document so a fast drag isn't lost.
    const onMouseMove = (e: MouseEvent) => {
      if (active) {
        handlers.current?.onDragMove(e.clientX, e.clientY);
      } else if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE) {
        active = true;
        handlers.current?.onDragStart(categoryRef.current, e.clientX, e.clientY);
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      clear();
      if (!active) return;
      active = false;
      swallowClick.current = true;
      handlers.current?.onDragEnd(e.clientX, e.clientY, false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      clear();
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    const onDragStartNative = (e: Event) => e.preventDefault(); // no browser link-drag ghost

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('dragstart', onDragStartNative);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchCancel, { passive: false });
    return () => {
      clear();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dragstart', onDragStartNative);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [moveMode]);

  return (
    <Link
      ref={ref}
      to={`/categories/${category.id}`}
      state={{ category }}
      data-no-swipe={moveMode ? '' : undefined}
      // In move mode a tap must not open the category, only a drag does something.
      onClick={(e) => { if (moveMode || swallowClick.current) { swallowClick.current = false; e.preventDefault(); } }}
      onContextMenu={(e) => { if (moveMode) e.preventDefault(); }}
      style={moveMode ? { WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
      className={`flex flex-col items-center gap-1.5 text-center active:opacity-60 transition-opacity ${dragging ? 'opacity-30' : ''}`}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 icon-badge"
        style={{ backgroundColor: category.color }}
      >
        {category.icon}
      </div>
      <span className="text-[11px] font-medium leading-tight line-clamp-2 break-words w-full">{category.name}</span>
    </Link>
  );
}
