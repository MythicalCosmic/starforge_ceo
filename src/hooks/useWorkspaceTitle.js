import { useEffect } from 'react';

/**
 * Replace a route-level placeholder once a readable record identity is known.
 * The microtask runs after the shell's route effect, including when a cached
 * record switches between its own full-page sections.
 */
export function useWorkspaceTitle(recordName, workspaceName, routeKey = '') {
  useEffect(() => {
    const readableRecord = String(recordName || '').trim();
    const readableWorkspace = String(workspaceName || '').trim();
    if (!readableRecord || !readableWorkspace) return undefined;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) document.title = `${readableRecord} · ${readableWorkspace} · StarForge EDU`;
    });
    return () => {
      cancelled = true;
    };
  }, [recordName, routeKey, workspaceName]);
}
