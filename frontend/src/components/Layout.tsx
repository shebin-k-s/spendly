import { useState, useRef, useLayoutEffect } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { LayoutDashboard, Receipt, Users, Tag, BarChart3, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedOutlet from './AnimatedOutlet';

const NAV_TABS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/categories', icon: Tag, label: 'Categories' },
];

export default function Layout() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      if (distanceY < 250) {
        setPullDistance(distanceY);
      } else {
        setPullDistance(250);
      }
    } else if (Math.abs(distanceX) > 30) {
      startY.current = null;
      startX.current = null;
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 160 && !isRefreshing) {
      setIsRefreshing(true);
      window.location.reload();
    }
    setPullDistance(0);
    startY.current = null;
    startX.current = null;
  };

  return (
    <div className="h-full flex flex-col bg-background sm:max-w-md sm:mx-auto sm:border-x sm:border-border sm:shadow-2xl relative overflow-hidden">
      {/* Pull To Refresh Indicator */}
      <div
        className="absolute left-0 right-0 top-0 flex justify-center items-center overflow-hidden transition-all duration-300 z-0 bg-background"
        style={{ height: pullDistance > 0 ? pullDistance : isRefreshing ? 60 : 0 }}
      >
        <Loader2 className={`w-6 h-6 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>

      <main
        ref={mainRef}
        className="flex-1 overflow-hidden relative z-10 transition-transform duration-200 bg-background"
        style={{ transform: `translateY(${isRefreshing ? 60 : pullDistance}px)` }}
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
