import { OperationsPage as LegacyOperationsPage } from './backendPages.jsx';

export function OperationsWorkspacePage({ route = 'operations', ...props }) {
  return <LegacyOperationsPage route={route} {...props} />;
}
