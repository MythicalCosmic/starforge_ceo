import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { httpRequest } from '../api/http.js';
import { apiQueryKey } from '../api/queryClient.js';

export function collectionRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
}

function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.hasOwn(object, key));
}

function declaredTotal(value, rowCount) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '' || (typeof normalized === 'string' && !/^\d+$/.test(normalized))) return null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric >= rowCount
    ? numeric
    : null;
}

/**
 * Resolve collection coverage without allowing coercion to certify bad data.
 *
 * A completely undeclared total is treated as an unpaginated collection and
 * falls back to the number of returned rows. Once a source declares a total,
 * however, every declared total must be valid and the envelope and embedded
 * values must agree. This keeps `null`, booleans, negative values, truncated
 * values, and contradictory metadata from becoming an apparently exact zero.
 */
export function resolveWorkspaceCoverage(payload, pagination, rows = collectionRows(payload)) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const collectionPayload = Array.isArray(payload) ||
    Array.isArray(payload?.results) ||
    Array.isArray(payload?.items) ||
    Array.isArray(payload?.rows);

  // Detail and aggregate endpoints often expose business metrics named
  // `total` or `count`. Without a collection array those fields describe the
  // record itself, not pagination metadata.
  if (!collectionPayload && !(pagination && typeof pagination === 'object')) {
    return { total: rowCount, totalKnown: true, completeByCount: true };
  }
  const candidates = [];

  const hasPagination = Boolean(pagination && typeof pagination === 'object');
  if (hasPagination) {
    candidates.push(hasOwn(pagination, 'total') ? pagination.total : undefined);
  }

  if (hasOwn(payload, 'count') && payload.count != null) {
    candidates.push(payload.count);
  } else if (hasOwn(payload, 'total')) {
    candidates.push(payload.total);
  } else if (hasOwn(payload, 'count')) {
    // An explicitly null count is a declared but unknown total, not zero.
    candidates.push(payload.count);
  }

  if (!candidates.length) {
    return { total: rowCount, totalKnown: true, completeByCount: true };
  }

  const totals = candidates.map((value) => declaredTotal(value, rowCount));
  if (totals.some((value) => value == null) || new Set(totals).size !== 1) {
    return { total: null, totalKnown: false, completeByCount: false };
  }

  const [total] = totals;
  return {
    total,
    totalKnown: true,
    completeByCount: rowCount >= total,
  };
}

export function visibleWorkspaceEnvelope(response, enabled) {
  if (!enabled) {
    return { payload: null, pagination: null, warnings: [] };
  }
  return {
    payload: response?.data ?? null,
    pagination: response?.pagination ?? null,
    warnings: Array.isArray(response?.warnings) ? response.warnings : [],
  };
}

export function useWorkspaceData(path, params, options = {}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const enabled = options.enabled ?? Boolean(path);
  const query = useQuery({
    queryKey: apiQueryKey(path || 'disabled', params, language),
    enabled,
    staleTime: options.staleTime ?? 45_000,
    gcTime: options.gcTime ?? 10 * 60_000,
    refetchInterval: options.refreshMs || false,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => httpRequest('GET', path, {
      params,
      signal,
      timeout: options.timeout ?? 12_000,
      withMeta: true,
    }),
  });

  // TanStack may retain cached data for a disabled query. Never let a permission
  // or scope downgrade turn that cache into a presentation channel.
  const envelope = useMemo(
    () => visibleWorkspaceEnvelope(query.data, enabled),
    [query.data, enabled],
  );
  const { payload, pagination, warnings } = envelope;
  const rows = useMemo(() => collectionRows(payload), [payload]);
  const coverage = useMemo(
    () => resolveWorkspaceCoverage(payload, pagination, rows),
    [payload, pagination, rows],
  );

  return {
    enabled,
    data: payload,
    rows,
    total: coverage.total,
    totalKnown: coverage.totalKnown,
    pagination,
    warnings,
    loading: enabled && query.fetchStatus !== 'paused' && (query.isPending || query.isFetching),
    pending: enabled && query.isPending,
    paused: enabled && query.fetchStatus === 'paused',
    error: enabled ? query.error || null : null,
    updatedAt: enabled && query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    retry: query.refetch,
    complete: Boolean(
      enabled &&
      query.data &&
      !query.error &&
      query.fetchStatus !== 'paused' &&
      coverage.completeByCount
    ),
  };
}

export function spreadsheetCell(value) {
  if (value == null) return '';
  let text = Array.isArray(value)
    ? value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join('; ')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  // Spreadsheet applications may execute cells beginning with formula
  // characters. Treat exported user-provided text as text, never a formula.
  if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function refreshWorkspaceStates(states) {
  const active = Array.isArray(states)
    ? states.filter((state) => state?.enabled && typeof state.retry === 'function')
    : [];
  return Promise.all(active.map((state) => state.retry()));
}

export function downloadSpreadsheet(filename, columns, rows) {
  const headings = columns.map((column) => spreadsheetCell(column.label)).join(',');
  const body = rows.map((row) => columns
    .map((column) => {
      const value = typeof column.value === 'function'
        ? column.value(row)
        : String(column.key || '').split('.').reduce((current, key) => current?.[key], row);
      return spreadsheetCell(value);
    })
    .join(','));
  const blob = new Blob([`\ufeff${[headings, ...body].join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function workspaceRoute(route) {
  const [path, query = ''] = String(route || '').split('?', 2);
  return {
    segments: path.split('/').filter(Boolean),
    params: new URLSearchParams(query),
  };
}
