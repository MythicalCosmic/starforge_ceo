export const DIRECTORY_PAGE_SIZE = 24;

function positiveSafeInteger(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '' || (typeof normalized === 'string' && !/^\d+$/.test(normalized))) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function readDirectoryPage(params) {
  const raw = params?.get?.('page') || '';
  if (!/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function directoryPageCount(state, pageSize = DIRECTORY_PAGE_SIZE) {
  const declared = positiveSafeInteger(state?.pagination?.pages ?? state?.data?.total_pages);
  if (declared != null) return declared;
  const total = positiveSafeInteger(state?.total);
  const safePageSize = positiveSafeInteger(pageSize) ?? DIRECTORY_PAGE_SIZE;
  return total != null
    ? Math.max(1, Math.ceil(total / safePageSize))
    : 1;
}

export function directoryRoute(base, filters = {}, page = 1) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([name, value]) => {
    if (name !== 'page' && value !== '' && value !== null && value !== undefined) {
      params.set(name, String(value));
    }
  });
  const resolvedPage = positiveSafeInteger(page);
  if (resolvedPage != null && resolvedPage > 1) params.set('page', String(resolvedPage));
  return params.size ? `${base}?${params}` : base;
}
