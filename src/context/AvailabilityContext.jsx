import { createContext, useContext, useMemo } from 'react';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { effectiveCapabilities, hasCapability } from '../lib/permissions.js';
import { normalizeAppStatuses, resolveAppAvailability } from '../lib/appAvailability.js';

const AvailabilityContext = createContext({
  known: false,
  checking: false,
  error: null,
  retry: () => Promise.resolve(),
  resolve: (apps) => resolveAppAvailability(apps, null),
});

export function AvailabilityProvider({ user, children }) {
  const capabilities = effectiveCapabilities(user);
  const canRead = capabilities === null || hasCapability(capabilities, 'system:read');
  const state = useWorkspaceData(
    '/api/v1/org/system/apps/',
    undefined,
    {
      enabled: canRead,
      staleTime: 15_000,
      refreshMs: 60_000,
      timeout: 8_000,
    },
  );
  const rows = useMemo(() => (Array.isArray(state.data?.apps) ? state.data.apps : []), [state.data]);
  const statusMap = useMemo(() => normalizeAppStatuses(rows), [rows]);
  const known = canRead && Boolean(state.data) && !state.error;
  const checking = canRead && state.pending && !state.data;
  const value = useMemo(() => ({
    known,
    checking,
    error: state.error,
    retry: state.retry,
    statuses: statusMap,
    resolve: (apps) => resolveAppAvailability(apps, statusMap, { known, checking }),
  }), [checking, known, state.error, state.retry, statusMap]);

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAvailability() {
  return useContext(AvailabilityContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppAvailability(apps) {
  const availability = useAvailability();
  return useMemo(() => ({
    ...availability.resolve(apps),
    retry: availability.retry,
    error: availability.error,
  }), [apps, availability]);
}
