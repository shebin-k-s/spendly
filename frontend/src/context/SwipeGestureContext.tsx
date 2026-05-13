import { createContext, useContext, useState, useCallback } from 'react';

interface SwipeGestureContextValue {
  isGlobalSwipeEnabled: boolean;
  disableGlobalSwipe: () => void;
  enableGlobalSwipe: () => void;
}

const SwipeGestureContext = createContext<SwipeGestureContextValue>({
  isGlobalSwipeEnabled: true,
  disableGlobalSwipe: () => {},
  enableGlobalSwipe: () => {},
});

export function SwipeGestureProvider({ children }: { children: React.ReactNode }) {
  const [isGlobalSwipeEnabled, setEnabled] = useState(true);

  const disableGlobalSwipe = useCallback(() => setEnabled(false), []);
  const enableGlobalSwipe = useCallback(() => setEnabled(true), []);

  return (
    <SwipeGestureContext.Provider value={{ isGlobalSwipeEnabled, disableGlobalSwipe, enableGlobalSwipe }}>
      {children}
    </SwipeGestureContext.Provider>
  );
}

export const useSwipeGesture = () => useContext(SwipeGestureContext);
