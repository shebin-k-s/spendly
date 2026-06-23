import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

export type FreshnessStatus = 'loading' | 'fresh';

interface FreshnessInfo {
  status: FreshnessStatus;
  isFetching: boolean;
}

/**
 * Tracks query freshness with only 2 states: loading or fresh.
 * Minimal performance impact, no unnecessary re-renders.
 */
export function useQueryFreshness(query: UseQueryResult<any, unknown>): FreshnessInfo {
  const [status, setStatus] = useState<FreshnessStatus>('fresh');

  useEffect(() => {
    setStatus(query.isFetching ? 'loading' : 'fresh');
  }, [query.isFetching]);

  return {
    status,
    isFetching: query.isFetching,
  };
}
