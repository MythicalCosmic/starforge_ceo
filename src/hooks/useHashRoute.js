import { useCallback, useEffect, useState } from 'react';

export function normalizeHashRoute(value, fallback = 'overview') {
  const raw = String(value || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '');
  const [rawPath, rawQuery = ''] = raw.split('?', 2);
  const path = rawPath
    .split('/')
    .filter(Boolean)
    .join('/');
  const safePath = path || String(fallback || 'overview').replace(/^\/+/, '');
  const query = new URLSearchParams(rawQuery).toString();
  return query ? `${safePath}?${query}` : safePath;
}

function routeFromLocation(fallback) {
  const legacyHash = String(window.location.hash || '');
  if (legacyHash.startsWith('#/')) return normalizeHashRoute(legacyHash, fallback);
  return normalizeHashRoute(`${window.location.pathname}${window.location.search}`, fallback);
}

// Small, dependency-free history router for authenticated workspace views.
// It also migrates old #/ bookmarks once, without leaving a duplicate entry in
// browser history.
export function useHashRoute(fallback) {
  const read = () => routeFromLocation(fallback);
  const [active, setActive] = useState(read);

  useEffect(() => {
    if (window.location.hash.startsWith('#/')) {
      const migrated = normalizeHashRoute(window.location.hash, fallback);
      window.history.replaceState(window.history.state, '', `/${migrated}`);
      setActive(migrated);
    }

    const onHistory = () => setActive(read());
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  const navigate = useCallback(
    (target, { replace = false, scroll = true } = {}) => {
      const next = normalizeHashRoute(target, fallback);
      const nextUrl = `/${next}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== nextUrl || window.location.hash) {
        if (replace) window.history.replaceState(window.history.state, '', nextUrl);
        else window.history.pushState(null, '', nextUrl);
      }
      setActive(next);
      if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [fallback],
  );

  return [active, navigate];
}
