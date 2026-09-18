import { useState, useRef, useLayoutEffect } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { LayoutDashboard, Receipt, Users, Tag, BarChart3, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedOutlet from './AnimatedOutlet';
import { useSwipeGesture } from '@/context/SwipeGestureContext';

const NAV_TABS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/categories', icon: Tag, label: 'Categories' },
];

// A DOM-proximity check (closest('[data-no-swipe]')) isn't reliable here:
// a sheet's nested sub-sheets (Select Category/Contact) render through a
// Radix Portal, so their actual DOM output isn't nested under whatever
// wrapper got tagged data-no-swipe — it's a sibling appended elsewhere in
// the document. Kept as a defensive fallback, but the real signal is the
// shared swipeEnabled flag every sheet already flips off while open
// (for AnimatedOutlet's tab-swipe gesture) — checking that instead makes
// this a blanket "no pull-to-refresh while any sheet is open" rule,
// regardless of where in the viewport the touch happens to land.
function isInNoSwipeZone(target: EventTarget | null): boolean {
  return !!(target instanceof Element && target.closest('[data-no-swipe]'));
}

// How far the indicator can visually travel, and how much resistance builds
// up along the way — an exponential ease so early movement tracks the
// finger closely and it progressively stiffens, like a native rubber-band
// overscroll, instead of a rigid 1:1 drag that just stops dead at a cap.
const PULL_MAX = 100;
const PULL_THRESHOLD = 72; // fraction of PULL_MAX to trigger a refresh on release
const applyPullResistance = (raw: number) => PULL_MAX * (1 - Math.exp(-raw / PULL_MAX));

export default function Layout() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Gates the CSS transition: off while actively dragging (so the indicator
  // tracks the finger immediately, frame by frame, instead of animating
  // toward a target it's already past by the time each frame catches up),
  // on for the release snap-back/settle — that mismatch was the "rigid"/
  // laggy feel.
  const [isDragging, setIsDragging] = useState(false);
  const { swipeEnabled } = useSwipeGesture();
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Tracks the active page's scroll container (the motion.div inside AnimatedOutlet)
  const currentScrollEl = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navType = useNavigationType();
  const scrollPositions = useRef<Record<string, number>>({});
  const prevKey = useRef(location.key);

  useLayoutEffect(() => {
    // Save scroll of the page we're leaving, identified by its data-location-key attribute
    const exitingEl = mainRef.current?.querySelector<HTMLElement>(`[data-location-key="${prevKey.current}"]`);
    scrollPositions.current[prevKey.current] = exitingEl?.scrollTop ?? 0;
    prevKey.current = location.key;

    const main = mainRef.current;
    if (!main) return;

    const enteringEl = main.querySelector<HTMLElement>(`[data-location-key="${location.key}"]`);
    currentScrollEl.current = enteringEl;

    if (navType === 'POP') {
      const saved = scrollPositions.current[location.key] ?? 0;

      if (!enteringEl || saved <= 0) {
        if (enteringEl) enteringEl.scrollTop = 0;
        return;
      }

      // useLayoutEffect fires before paint — scroll is set before the page is visible.
      // For async content (Cache API), MutationObserver fires while the entering page
      // is still fading in (opacity 0→1 over 180ms), so the jump is never seen.
      if (enteringEl.scrollHeight - enteringEl.clientHeight >= saved) {
        enteringEl.scrollTop = saved;
      } else {
        enteringEl.scrollTop = 0;
        const observer = new MutationObserver(() => {
          if (enteringEl.scrollHeight - enteringEl.clientHeight >= saved) {
            enteringEl.scrollTop = saved;
            observer.disconnect();
          }
        });
        observer.observe(main, { childList: true, subtree: true });
        const timeout = setTimeout(() => observer.disconnect(), 1500);
        return () => { observer.disconnect(); clearTimeout(timeout); };
      }
    } else {
      if (enteringEl) enteringEl.scrollTop = 0;
    }
  }, [location.key, navType]);

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!swipeEnabled.current || isInNoSwipeZone(e.target)) return;
    const scrollEl = currentScrollEl.current ?? mainRef.current;
    if (scrollEl && scrollEl.scrollTop <= 1) {
      if (e.touches[0].clientY < 150) {
        startY.current = e.touches[0].clientY;
        startX.current = e.touches[0].clientX;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (startY.current === null || startX.current === null) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const distanceY = currentY - startY.current;
    const distanceX = currentX - startX.current;

    if (distanceY > 0 && distanceY > Math.abs(distanceX) * 1.5) {
      if (!isDragging) setIsDragging(true);
      setPullDistance(applyPullResistance(distanceY));
    } else if (Math.abs(distanceX) > 30) {
      startY.current = null;
      startX.current = null;
      setIsDragging(false);
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (pullDistance > PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      window.location.reload();
    }
    setPullDistance(0);
    startY.current = null;
    startX.current = null;
  };

  // 0 → 1 as the pull approaches the release threshold — drives the badge's
  // scale/color and the icon's rotation, capped so it settles rather than
  // spinning past what release actually does.
  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD);
  // No transition while a finger is actively dragging — the value already
  // updates every touchmove frame, so animating toward each new target too
  // just makes it perpetually lag behind. Only the release (snap back, or
  // settle into the spinning height) eases.
  const pullTransition = isDragging ? 'none' : 'all 320ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div className="h-full flex flex-col bg-background sm:max-w-md sm:mx-auto sm:border-x sm:border-border sm:shadow-2xl relative overflow-hidden">
      {/* Pull To Refresh Indicator */}
      <div
        className="absolute left-0 right-0 top-0 flex justify-center items-center overflow-hidden z-0 bg-background"
        style={{ height: pullDistance > 0 ? pullDistance : isRefreshing ? 60 : 0, transition: pullTransition }}
      >
        <div
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center border shadow-sm',
            isRefreshing || pullProgress >= 1
              ? 'bg-primary/10 border-primary/20'
              : 'bg-card border-border',
          )}
          style={{
            transition: pullTransition,
            transform: `scale(${isRefreshing ? 1 : 0.6 + pullProgress * 0.4})`,
            opacity: isRefreshing ? 1 : 0.5 + pullProgress * 0.5,
          }}
        >
          <Loader2
            className={cn(
              'w-4 h-4',
              isRefreshing || pullProgress >= 1 ? 'text-primary' : 'text-muted-foreground',
              isRefreshing ? 'animate-spin' : '',
            )}
            style={isRefreshing ? undefined : { transform: `rotate(${pullProgress * 180}deg)`, transition: pullTransition }}
          />
        </div>
      </div>

      <main
        ref={mainRef}
        className="flex-1 overflow-hidden relative z-10 bg-background"
        style={{ transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`, transition: pullTransition }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatedOutlet />
      </main>

      {/* Bottom navigation */}
      <nav className="shrink-0 bg-background border-t border-border safe-bottom relative z-50">
        <div className="grid grid-cols-5 max-w-full">
          {NAV_TABS.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-3 px-2 text-[10px] font-medium transition-colors relative',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-5 h-5 relative z-10 transition-transform duration-300', isActive && 'scale-110 drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]')} />
                  <span className="relative z-10">{label}</span>
                  {isActive && (
                    <div className="absolute inset-0 bg-primary/10 rounded-xl m-1 z-0 animate-in fade-in zoom-in duration-300" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
        {typeof __BUILD_TIME__ !== 'undefined' && (
          <p className="absolute bottom-1 right-2 text-[7px] font-mono text-muted-foreground/20 pointer-events-none select-none">
            {new Date(__BUILD_TIME__).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </nav>
    </div>
  );
}
