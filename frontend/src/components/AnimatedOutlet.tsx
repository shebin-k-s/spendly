import { useLocation, useOutlet, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { useRef } from 'react';

const NAV_TABS = ['/', '/expenses', '/analytics', '/categories'];

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => Math.abs(offset) * velocity;

function isInNoSwipeZone(target: EventTarget | null): boolean {
  return !!(target instanceof Element && target.closest('[data-no-swipe]'));
}

export default function AnimatedOutlet() {
  const location = useLocation();
  const element = useOutlet();
  const navigate = useNavigate();
  const { swipeEnabled } = useSwipeGesture();
  const isTransitioning = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const panBlocked = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!NAV_TABS.includes(location.pathname) || isInNoSwipeZone(e.target)) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!NAV_TABS.includes(location.pathname) || touchStartX.current === null || touchStartY.current === null || !swipeEnabled.current || isTransitioning.current) return;

    const distanceX = touchStartX.current - e.changedTouches[0].clientX;
    const distanceY = touchStartY.current - e.changedTouches[0].clientY;

    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > 50) {
      if (distanceX > 0 && currentIndex < NAV_TABS.length - 1) navigateTo(currentIndex + 1);
      else if (distanceX < 0 && currentIndex > 0) navigateTo(currentIndex - 1);
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const currentIndex = NAV_TABS.findIndex((path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  );

  const navigateTo = (index: number) => {
    if (index >= 0 && index < NAV_TABS.length) {
      isTransitioning.current = true;
      navigate(NAV_TABS[index]);
      setTimeout(() => { isTransitioning.current = false; }, 500);
    }
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        data-location-key={location.key}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10, position: 'absolute', width: '100%' }}
        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full h-full overflow-y-auto overflow-x-hidden disable-scrollbars"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onWheel={(e) => {
          if (!NAV_TABS.includes(location.pathname) || !swipeEnabled.current || isTransitioning.current) return;
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 25) {
            if (e.deltaX > 0 && currentIndex < NAV_TABS.length - 1) navigateTo(currentIndex + 1);
            else if (e.deltaX < 0 && currentIndex > 0) navigateTo(currentIndex - 1);
          }
        }}
        onPanStart={(e) => {
          panBlocked.current = !NAV_TABS.includes(location.pathname) || isInNoSwipeZone(e.target);
        }}
        onPanEnd={(e, { offset, velocity }) => {
          if (panBlocked.current || !swipeEnabled.current || isTransitioning.current) return;
          if ('pointerType' in e && e.pointerType === 'mouse') return;
          const swipe = swipePower(offset.x, velocity.x);
          if (swipe < -swipeConfidenceThreshold && currentIndex < NAV_TABS.length - 1) navigateTo(currentIndex + 1);
          else if (swipe > swipeConfidenceThreshold && currentIndex > 0) navigateTo(currentIndex - 1);
        }}
      >
        {element}
      </motion.div>
    </AnimatePresence>
  );
}
