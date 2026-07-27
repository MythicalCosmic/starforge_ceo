import { useCallback, useEffect, useState } from 'react';

// Minimal hash router. Keeps the active route in `location.hash` so the URL is
// shareable and the back button works, without pulling in a routing dependency.
export function useHashRoute(fallback) {
  const read = () => location.hash.replace(/^#/, '') || fallback;
  const [active, setActive] = useState(read);

  useEffect(() => {
    const onHash = () => setActive(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  const navigate = useCallback((id) => {
    if (location.hash.replace(/^#/, '') !== id) location.hash = id;
    else setActive(id);
    window.scrollTo({ top: 0 });
  }, []);

  return [active, navigate];
}
