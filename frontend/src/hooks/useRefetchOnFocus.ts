import { useEffect } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

/**
 * Automatically refetch query data when the window regains focus.
 * Useful for PWAs and mobile apps where user may switch tabs/apps frequently.
 */
export function useRefetchOnFocus(query: UseQueryResult<any, unknown>) {
  useEffect(() => {
    const onFocus = () => {
      // Refetch if data is stale
      if (query.isStale) {
        void query.refetch();
      }
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [query]);
}
