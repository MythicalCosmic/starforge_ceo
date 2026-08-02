const FOCUSED_WORKSPACE_TITLE_OWNERS = new Set([
  'account',
  'branches',
  'exams',
  'finance',
  'groups',
  'students',
  'teachers',
]);

/**
 * Focused workspaces resolve readable record names asynchronously and own the
 * final document title. The legacy management catalog must not overwrite that
 * title after a cached navigation has already rendered the focused page.
 */
export function ownsFocusedWorkspaceTitle(routeId) {
  return FOCUSED_WORKSPACE_TITLE_OWNERS.has(String(routeId || ''));
}

export function shouldResolveLazyManagementTitle(routeId, hasNestedRoute, hasRecordDetail = false) {
  return Boolean(hasNestedRoute)
    && !hasRecordDetail
    && !['overview', 'settings'].includes(routeId)
    && !ownsFocusedWorkspaceTitle(routeId);
}
