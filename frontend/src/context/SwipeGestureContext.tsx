import { createContext, useContext, useRef, useCallback } from 'react';

interface SwipeGestureContextValue {
  swipeEnabled: React.MutableRefObject<boolean>;
  disableGlobalSwipe: () => void;
  enableGlobalSwipe: () => void;
}

const SwipeGestureContext = createContext<SwipeGestureContextValue>({
  swipeEnabled: { current: true },
  disableGlobalSwipe: () => {},
  enableGlobalSwipe: () => {},
});

export function SwipeGestureProvider({ children }: { children: React.ReactNode }) {
  const swipeEnabled = useRef(true);
  const disableGlobalSwipe = useCallback(() => { swipeEnabled.current = false; }, []);
  const enableGlobalSwipe = useCallback(() => { swipeEnabled.current = true; }, []);

  return (
    <SwipeGestureContext.Provider value={{ swipeEnabled, disableGlobalSwipe, enableGlobalSwipe }}>
      {children}
    </SwipeGestureContext.Provider>
  );
}

export const useSwipeGesture = () => useContext(SwipeGestureContext);
