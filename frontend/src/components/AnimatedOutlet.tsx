import { useLocation, useOutlet, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { useRef } from 'react';

const NAV_TABS = ['/', '/expenses', '/analytics', '/categories'];

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export default function AnimatedOutlet() {
  const location = useLocation();
  const element = useOutlet();
  const navigate = useNavigate();
  const { isGlobalSwipeEnabled } = useSwipeGesture();
  const isTransitioning = useRef(false);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !isGlobalSwipeEnabled || isTransitioning.current) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const distance = touchStartX.current - touchEndX;
    
    // Swipe left (positive distance) -> Next tab
    if (distance > 50 && currentIndex < NAV_TABS.length - 1) {
      navigateTo(currentIndex + 1);
    } 
    // Swipe right (negative distance) -> Prev tab
    else if (distance < -50 && currentIndex > 0) {
      navigateTo(currentIndex - 1);
    }
    
    touchStartX.current = null;
  };

  const currentIndex = NAV_TABS.findIndex((path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  );

  const navigateTo = (index: number) => {
    if (index >= 0 && index < NAV_TABS.length) {
      isTransitioning.current = true;
      navigate(NAV_TABS[index]);
      
      // Enforce a cool down to prevent rapid page skipping from one continuous trackpad gesture
      setTimeout(() => {
        isTransitioning.current = false;
      }, 500);
    }
  };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onWheel={(e) => {
          if (!isGlobalSwipeEnabled || isTransitioning.current) return;
          // Check if horizontal scroll is dominant
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 25) {
            if (e.deltaX > 0 && currentIndex < NAV_TABS.length - 1) {
              navigateTo(currentIndex + 1); // scrolling right = next page
            } else if (e.deltaX < 0 && currentIndex > 0) {
              navigateTo(currentIndex - 1); // scrolling left = prev page
            }
          }
        }}
        onPanEnd={(e, { offset, velocity }) => {
          if (!isGlobalSwipeEnabled || isTransitioning.current) return;
          // Ignore mouse if we have Wheel support for trackpads now
          if ('pointerType' in e && e.pointerType === 'mouse') return;
          const swipe = swipePower(offset.x, velocity.x);

          if (swipe < -swipeConfidenceThreshold && currentIndex < NAV_TABS.length - 1) {
            navigateTo(currentIndex + 1);
          } else if (swipe > swipeConfidenceThreshold && currentIndex > 0) {
            navigateTo(currentIndex - 1);
          }
        }}
      >
        {element}
      </motion.div>
    </AnimatePresence>
  );
}
