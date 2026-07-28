import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

export type FreshnessStatus = 'loading' | 'fresh' | 'error';

interface FreshnessInfo {
  status: FreshnessStatus;
  isFetching: boolean;
}

/**
 * Tracks query freshness: loading while fetching, error when the last
 * fetch attempt failed (e.g. offline) even though stale cached data is
 * still being shown, fresh otherwise.
 */
export function useQueryFreshness(query: UseQueryResult<any, unknown>): FreshnessInfo {
  const [status, setStatus] = useState<FreshnessStatus>('fresh');

  useEffect(() => {
    setStatus(query.isFetching ? 'loading' : query.isError ? 'error' : 'fresh');
  }, [query.isFetching, query.isError]);

  return {
    status,
    isFetching: query.isFetching,
  };
}
