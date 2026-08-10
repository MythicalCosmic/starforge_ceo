import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/http.js';

async function fetchOpenApiSchema({ signal }) {
  const controller = new AbortController();
  // The live contract is intentionally exhaustive and currently exceeds one
  // megabyte. A cold backend worker can need more than 15 seconds to generate
  // it, so keep this below the proxy's 60-second ceiling without failing a
  // valid response prematurely.
  const timer = setTimeout(() => controller.abort(), 45_000);
  const requestSignal = typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, controller.signal].filter(Boolean))
    : controller.signal;
  try {
    const response = await fetch('/api/schema/', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: requestSignal,
    });
    const requestId = response.headers.get('X-Request-ID') || undefined;
    if (!response.ok) throw new ApiError(response.status, 'The management contract could not be loaded.', undefined, requestId);
    const schema = await response.json();
    if (!schema || typeof schema !== 'object' || !schema.paths || !schema.openapi) {
      throw new ApiError(502, 'The management contract is not valid.', undefined, requestId);
    }
    return schema;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError(0, 'The management contract request timed out.');
    throw new ApiError(0, 'The management contract is temporarily unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

export function useOpenApiSchema({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['openapi', 'management-contract'],
    queryFn: fetchOpenApiSchema,
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: (count, error) => count < 1 && (Number(error?.status) === 0 || Number(error?.status) >= 500),
    refetchOnWindowFocus: false,
  });
}
