import { createContext, useContext, useMemo } from 'react';

// Backend endpoints apply the authenticated membership scope. This context is
// presentation-only: it never broadens a request or treats a client-side branch
// selector as authorization.
const ScopeContext = createContext(null);

export function ScopeProvider({ role, defaultBranch, defaultBranchName, children }) {
  const manager = role === 'manager';
  const initialId = manager ? defaultBranch ?? 'membership' : 'all';
  const branchId = initialId;

  const options = useMemo(
    () =>
      manager
        ? [{ id: initialId, name: defaultBranchName || 'Assigned leadership scope' }]
        : [{ id: 'all', name: '__ALL__' }],
    [defaultBranchName, initialId, manager],
  );

  const current = options.find((option) => String(option.id) === String(branchId)) || options[0];

  const value = useMemo(
    () => ({
      branchId: current?.id,
      options,
    }),
    [current, options],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) throw new Error('useScope must be used within ScopeProvider');
  return context;
}
