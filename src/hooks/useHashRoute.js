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

// Small, dependency-free router for authenticated workspace views. Nested
// paths make records bookmarkable and preserve browser Back/Forward behavior.
export function useHashRoute(fallback) {
  const read = () => normalizeHashRoute(location.hash, fallback);
  const [active, setActive] = useState(read);

  useEffect(() => {
    const onHash = () => setActive(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  const navigate = useCallback(
    (target, { replace = false, scroll = true } = {}) => {
      const next = normalizeHashRoute(target, fallback);
      const nextHash = `#/${next}`;
      if (location.hash !== nextHash) {
        if (replace) history.replaceState(null, '', nextHash);
        else location.hash = `/${next}`;
      }
      setActive(next);
      if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [fallback],
  );

  return [active, navigate];
}
