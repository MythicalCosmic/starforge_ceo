import { ManagementActions } from '../components/ManagementActions.jsx';
import { ManagementReads } from '../components/ManagementReads.jsx';
import { Icons } from '../components/Icons.jsx';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { effectiveCapabilities } from '../lib/permissions.js';

export function CapabilitiesPage({ user }) {
  useWorkspaceTitle('Management actions', 'Control center');
  return (
    <div className="ma-page">
      <header className="ma-page-head">
        <span>{Icons.settings}</span>
        <div>
          <span>Control center</span>
          <h1>Management actions</h1>
          <p>Create records, update operations, make decisions, and run every service action authorized for this exact account. High-impact changes require an extra confirmation and every request is still scope-checked by the service.</p>
        </div>
      </header>
      <ManagementActions
        capabilities={effectiveCapabilities(user)}
        readOnly={user?.read_only_session === true}
        showAll
        title="All authorized actions"
      />
      <ManagementReads capabilities={effectiveCapabilities(user)} />
    </div>
  );
}
