import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { LayoutDashboard, Receipt, Tag, BarChart3, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedOutlet from './AnimatedOutlet';

const NAV_TABS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/categories', icon: Tag, label: 'Categories' },
];

export default function Layout() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navType = useNavigationType();
  const scrollPositions = useRef<Record<string, number>>({});
  const prevKey = useRef(location.key);

  useEffect(() => {
    // Save scroll position of the page we're leaving
    scrollPositions.current[prevKey.current] = mainRef.current?.scrollTop ?? 0;
    prevKey.current = location.key;

    if (navType === 'POP') {
      // Back navigation — restore where the user was
      const saved = scrollPositions.current[location.key] ?? 0;
      if (mainRef.current) mainRef.current.scrollTop = saved;
    } else {
      // Forward navigation — always start at top
      if (mainRef.current) mainRef.current.scrollTop = 0;
    }
  }, [location.key, navType]);

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (mainRef.current && mainRef.current.scrollTop <= 1) { // 1px tolerance
      // MUST start swipe from the top area of the screen (top 150px)
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
    
    // Only pull down if vertical distance dominates horizontal
    if (distanceY > 0 && distanceY > Math.abs(distanceX) * 1.5) {
      if (distanceY < 250) {
        setPullDistance(distanceY);
      } else {
        setPullDistance(250);
      }
    } else if (Math.abs(distanceX) > 30) {
      // Horizontal swipe detected; abort pull-to-refresh
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
        className="flex-1 overflow-y-auto overflow-x-hidden relative disable-scrollbars z-10 transition-transform duration-200 bg-background"
        style={{ transform: `translateY(${isRefreshing ? 60 : pullDistance}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatedOutlet />
      </main>

      {/* Bottom navigation */}
      <nav className="shrink-0 bg-background border-t border-border safe-bottom relative z-50">
        <div className="grid grid-cols-4 max-w-full">
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
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-0.5 bg-background/80 backdrop-blur-sm border border-border border-b-0 rounded-t-lg pointer-events-none">
            <p className="text-[8px] font-mono whitespace-nowrap text-muted-foreground/40 leading-none">
              Build: {new Date(__BUILD_TIME__).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </nav>
    </div>
  );
}
