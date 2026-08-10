import { QueryClient } from '@tanstack/react-query';

function normalizedParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
}

export function apiQueryKey(path, params, language = 'en') {
  return [
    'api',
    String(language || 'en').split('-')[0],
    String(path || ''),
    normalizedParams(params),
  ];
}

function retryQuery(failureCount, error) {
  const status = Number(error?.status);
  return status >= 500 && failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 5 * 60_000,
      retry: retryQuery,
      refetchOnReconnect: true,
      // Leadership views expose explicit refresh controls. Refetching every
      // stale register when focus returns from DevTools creates a large burst
      // without improving correctness.
      refetchOnWindowFocus: false,
      structuralSharing: true,
    },
  },
});
