import { TasksPage } from './CollaborationWorkspaces.jsx';
import { OperationsPage as LegacyOperationsPage } from './backendPages.jsx';

export function OperationsWorkspacePage({ route = 'operations', ...props }) {
  const section = String(route).split('?', 1)[0].split('/').filter(Boolean)[1] || 'tasks';
  if (section === 'tasks') return <TasksPage {...props} />;
  return <LegacyOperationsPage route={route} {...props} />;
}
