import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpRequest } from '../api/http.js';

function cursorFromLink(link) {
  if (!link || typeof link !== 'string') return null;
  try {
    const parsed = new URL(link, globalThis.location?.origin || 'http://localhost');
    return parsed.searchParams.get('cursor');
  } catch {
    return null;
  }
}

export function normalizeApiCollection(response, requestedPage = 1, pageSize = 25) {
  const payload = response?.data;
  const envelopePagination = response?.pagination;

  let items = [];
  if (Array.isArray(payload)) items = payload;
  else if (Array.isArray(payload?.results)) items = payload.results;
  else if (Array.isArray(payload?.items)) items = payload.items;
  else if (Array.isArray(payload?.rows)) items = payload.rows;
  else if (payload && typeof payload === 'object') items = [payload];

  const total = Number(
    envelopePagination?.total ??
      payload?.count ??
      payload?.total ??
      items.length,
  );
  const page = Number(envelopePagination?.page ?? payload?.page ?? requestedPage ?? 1);
  const effectivePageSize = Number(
    envelopePagination?.page_size ??
      payload?.page_size ??
      pageSize,
  );
  const pages = Number(
    envelopePagination?.pages ??
      payload?.total_pages ??
      (total > 0 && effectivePageSize > 0 ? Math.ceil(total / effectivePageSize) : 1),
  );
  const nextLink = payload?.next;
  const previousLink = payload?.previous;

  return {
    items,
    pagination: {
      total: Number.isFinite(total) ? total : items.length,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(effectivePageSize) && effectivePageSize > 0 ? effectivePageSize : pageSize,
      pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
      hasNext: Boolean(envelopePagination?.has_next ?? nextLink),
      hasPrevious: Boolean(envelopePagination?.has_prev ?? previousLink),
      nextCursor: cursorFromLink(nextLink),
      previousCursor: cursorFromLink(previousLink),
    },
  };
}

function fillPath(template, row) {
  if (!template || !row) return null;
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], row);
    return encodeURIComponent(value == null ? '' : String(value));
  });
}

const initialCollection = {
  items: [],
  pagination: {
    total: 0,
    page: 1,
    pageSize: 25,
    pages: 1,
    hasNext: false,
    hasPrevious: false,
    nextCursor: null,
    previousCursor: null,
  },
  loading: true,
  error: null,
};

export function useApiResource(
  resource,
  {
    search = '',
    page = 1,
    cursor = null,
    pageSize = resource?.pageSize || 25,
  } = {},
) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(initialCollection);

  useEffect(() => {
    const controller = new AbortController();
    const params = { ...(resource.params || {}) };
    if (resource.pagination !== 'none') params.page_size = pageSize;
    if (resource.pagination === 'cursor') {
      if (cursor) params.cursor = cursor;
    } else if (resource.pagination !== 'none') {
      params.page = page;
    }
    if (search && resource.searchParam !== false) {
      params[resource.searchParam || 'search'] = search;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    httpRequest('GET', resource.path, {
      params,
      signal: controller.signal,
      withMeta: true,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        const normalized = normalizeApiCollection(response, page, pageSize);
        setState({ ...normalized, loading: false, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, loading: false, error }));
      });

    return () => controller.abort();
  }, [cursor, page, pageSize, resource, revision, search]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);

  return useMemo(() => ({ ...state, retry }), [retry, state]);
}

export function useApiDetail(
  resource,
  row,
  { page = 1, pageSize = 25, paginated = false } = {},
) {
  const detailPath = useMemo(
    () => fillPath(resource?.detailPath, row),
    [resource?.detailPath, row],
  );
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    requestKey: null,
    data: null,
    pagination: null,
    error: null,
  });
  const requestKey = detailPath
    ? `${detailPath}:${paginated ? `${page}:${pageSize}` : 'single'}:${revision}`
    : null;

  useEffect(() => {
    if (!row || !detailPath) return undefined;

    const controller = new AbortController();

    httpRequest('GET', detailPath, {
      params: paginated ? { page, page_size: pageSize } : undefined,
      signal: controller.signal,
      withMeta: true,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({
          requestKey,
          data: response?.data && typeof response.data === 'object' ? response.data : row,
          pagination: response?.pagination || null,
          error: null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ requestKey, data: row, pagination: null, error });
      });

    return () => controller.abort();
  }, [detailPath, page, pageSize, paginated, requestKey, row]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return useMemo(() => {
    if (!row) return { data: null, pagination: null, loading: false, error: null, retry };
    if (!detailPath) return { data: row, pagination: null, loading: false, error: null, retry };
    const current = state.requestKey === requestKey;
    return {
      data: current ? state.data || row : row,
      pagination: current ? state.pagination : null,
      loading: !current,
      error: current ? state.error : null,
      retry,
    };
  }, [detailPath, requestKey, retry, row, state]);
}
