import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, httpRequest } from '../api/http.js';
import { apiQueryKey } from '../api/queryClient.js';

const NOOP_RETRY = () => Promise.resolve();

function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.hasOwn(object, key));
}

function safeInteger(value, { minimum = 0 } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '' || (typeof normalized === 'string' && !/^\d+$/.test(normalized))) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function collectionTotal(payload, pagination, items, { singletonObject, unpaginated }) {
  if (singletonObject) return { total: 1, totalKnown: true };

  const candidates = [];
  if (!unpaginated && pagination && typeof pagination === 'object') {
    candidates.push(hasOwn(pagination, 'total') ? pagination.total : undefined);
  }
  if (!unpaginated && hasOwn(payload, 'count')) candidates.push(payload.count);
  else if (!unpaginated && hasOwn(payload, 'total')) candidates.push(payload.total);

  if (!candidates.length) return { total: items.length, totalKnown: true };
  const totals = candidates.map((value) => safeInteger(value));
  if (
    totals.some((value) => value == null || value < items.length) ||
    new Set(totals).size !== 1
  ) return { total: null, totalKnown: false };
  return { total: totals[0], totalKnown: true };
}

function cursorFromLink(link) {
  if (!link || typeof link !== 'string') return null;
  try {
    const parsed = new URL(link, globalThis.location?.origin || 'http://localhost');
    return parsed.searchParams.get('cursor');
  } catch {
    return null;
  }
}

export function normalizeApiCollection(
  response,
  requestedPage = 1,
  pageSize = 25,
  { unpaginated = false } = {},
) {
  const payload = response?.data;
  const envelopePagination = response?.pagination;

  let items = [];
  let singletonObject = false;
  if (Array.isArray(payload)) items = payload;
  else if (Array.isArray(payload?.results)) items = payload.results;
  else if (Array.isArray(payload?.items)) items = payload.items;
  else if (Array.isArray(payload?.rows)) items = payload.rows;
  else if (payload && typeof payload === 'object') {
    items = [payload];
    singletonObject = true;
  }

  const coverage = collectionTotal(payload, envelopePagination, items, {
    singletonObject,
    unpaginated,
  });
  const requestedPageNumber = safeInteger(requestedPage, { minimum: 1 }) ?? 1;
  const page = safeInteger(envelopePagination?.page ?? payload?.page, { minimum: 1 })
    ?? requestedPageNumber;
  const effectivePageSize = safeInteger(
    envelopePagination?.page_size ??
      payload?.page_size ??
      pageSize,
    { minimum: 1 },
  ) ?? 25;
  const declaredPages = safeInteger(
    envelopePagination?.pages ?? payload?.total_pages,
    { minimum: 1 },
  );
  const derivedPages = coverage.totalKnown && coverage.total > 0
    ? Math.ceil(coverage.total / effectivePageSize)
    : 1;
  const pages = declaredPages != null && declaredPages >= page
    ? declaredPages
    : Math.max(page, derivedPages);
  const nextLink = payload?.next;
  const previousLink = payload?.previous;
  const explicitHasNext = typeof envelopePagination?.has_next === 'boolean'
    ? envelopePagination.has_next
    : null;
  const explicitHasPrevious = typeof envelopePagination?.has_prev === 'boolean'
    ? envelopePagination.has_prev
    : null;

  return {
    items,
    warnings: Array.isArray(response?.warnings) ? response.warnings : [],
    pagination: {
      total: coverage.total,
      totalKnown: coverage.totalKnown,
      page,
      pageSize: effectivePageSize,
      pages,
      hasNext: explicitHasNext ?? Boolean(nextLink || page < pages),
      hasPrevious: explicitHasPrevious ?? Boolean(previousLink || page > 1),
      nextCursor: cursorFromLink(nextLink),
      previousCursor: cursorFromLink(previousLink),
    },
  };
}

function fillPath(template, row) {
  if (!template || !row) return null;
  let missing = false;
  const path = template.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], row);
    if (value === undefined || value === null || value === '') {
      missing = true;
      return '';
    }
    return encodeURIComponent(String(value));
  });
  return missing ? null : path;
}

const initialCollection = {
  items: [],
  pagination: {
    total: 0,
    totalKnown: false,
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
  updatedAt: null,
  warnings: [],
};

function collectionParams(resource, { search, page, cursor, pageSize }) {
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
  return params;
}

export function useApiResource(
  resource,
  {
    search = '',
    page = 1,
    cursor = null,
    pageSize = resource?.pageSize || 25,
  } = {},
) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const params = useMemo(
    () => collectionParams(resource, { search, page, cursor, pageSize }),
    [cursor, page, pageSize, resource, search],
  );
  const query = useQuery({
    queryKey: apiQueryKey(resource.path, params, language),
    queryFn: ({ signal }) => httpRequest('GET', resource.path, {
      params,
      signal,
      withMeta: true,
    }),
  });
  const normalized = useMemo(
    () => query.data
      ? normalizeApiCollection(query.data, page, pageSize, {
          unpaginated: resource.pagination === 'none',
        })
      : initialCollection,
    [page, pageSize, query.data, resource.pagination],
  );

  return {
    ...normalized,
    loading: query.fetchStatus !== 'paused' && (query.isPending || query.isFetching),
    paused: query.fetchStatus === 'paused',
    error: query.error || null,
    updatedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    retry: query.refetch,
  };
}

export function useApiDetail(
  resource,
  row,
  { page = 1, pageSize = 25, paginated = false } = {},
) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const detailPath = useMemo(
    () => fillPath(resource?.detailPath, row),
    [resource?.detailPath, row],
  );
  const params = useMemo(
    () => (paginated ? { page, page_size: pageSize } : undefined),
    [page, pageSize, paginated],
  );
  const query = useQuery({
    queryKey: apiQueryKey(detailPath, params, language),
    enabled: Boolean(row && detailPath),
    queryFn: ({ signal }) => httpRequest('GET', detailPath, {
      params,
      signal,
      withMeta: true,
    }),
  });

  if (!row) {
    return { data: null, pagination: null, loading: false, error: null, retry: NOOP_RETRY };
  }
  if (!detailPath) {
    return { data: row, pagination: null, loading: false, error: null, retry: NOOP_RETRY };
  }

  const payload = query.data?.data;
  const mergeListRecord = Array.isArray(resource?.columns);
  const malformedDetail = Boolean(
    mergeListRecord &&
    query.data &&
    (!payload || typeof payload !== 'object' || Array.isArray(payload)),
  );
  const data = mergeListRecord
    ? !malformedDetail && payload
      ? { ...row, ...payload }
      : row
    : query.data
      ? payload
      : null;

  return {
    data,
    pagination: query.data?.pagination || null,
    loading: query.fetchStatus !== 'paused' && (query.isPending || query.isFetching),
    paused: query.fetchStatus === 'paused',
    error: query.error || (malformedDetail
      ? new ApiError(502, 'This record could not be prepared for review.')
      : null),
    retry: query.refetch,
  };
}
