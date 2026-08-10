import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useOptionalToast } from '../context/ToastContext.jsx';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { humanizeIdentifier } from '../lib/openApiOperations.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import { userFacingError } from '../lib/userFacingError.js';
import { Icons } from './Icons.jsx';

const PROTECTED = new Set(['auth', 'users', 'org']);

function statusLabel(value) {
  const labels = { up: 'Available', degraded: 'Limited', disabled: 'Turned off', unavailable: 'Unavailable' };
  return labels[value] || 'Unknown';
}

export function SystemAvailabilityPanel({ canWrite = false }) {
  const state = useWorkspaceData('/api/v1/org/system/apps/', undefined, { staleTime: 15_000, refreshMs: 30_000 });
  const rows = Array.isArray(state.data?.apps) ? state.data.apps : [];
  const toast = useOptionalToast();
  const update = useMutation({
    mutationFn: (disabled) => httpRequest('PATCH', '/api/v1/org/system/apps/', { body: { disabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      void state.retry?.();
      toast.success('Application availability was updated.', { title: 'Workspace control saved' });
    },
    onError: (error) => toast.danger(readableValidationDetails(error)[0] || userFacingError(error, { fallback: 'Application availability could not be updated.' }), { title: 'No availability changes were made' }),
  });
  const toggle = (row) => {
    const disabling = row.status !== 'disabled';
    const prompt = disabling
      ? `Turn off ${humanizeIdentifier(row.app)} for the organization? Its pages and API actions will close until it is restored.`
      : `Restore ${humanizeIdentifier(row.app)} for the organization?`;
    if (!window.confirm(prompt)) return;
    const disabled = new Set(rows.filter((item) => item.status === 'disabled').map((item) => item.app));
    if (disabling) disabled.add(row.app); else disabled.delete(row.app);
    update.mutate([...disabled].sort());
  };
  if (state.pending && !state.data) return <div className="sf-system-loading" role="status"><span>{Icons.settings}</span><strong>Checking application availability…</strong></div>;
  if (state.error && !state.data) return <div className="sf-system-error" role="alert"><span>{Icons.flag}</span><div><strong>Application controls could not be loaded</strong><p>{userFacingError(state.error, { fallback: 'Try again while the organization service is available.' })}</p></div><button type="button" onClick={() => state.retry()}>Try again</button></div>;
  return (
    <section className="sf-system-panel" aria-labelledby="system-availability-title">
      <header><div><span>Fault isolation</span><h2 id="system-availability-title">Workspace availability</h2><p>Turn individual applications on or off without interrupting the rest of the center. Dependent areas show a formal unavailable state instead of exposing transport errors.</p></div><span>{rows.length} applications</span></header>
      {update.error ? <div className="sf-system-error is-inline" role="alert">{readableValidationDetails(update.error)[0] || userFacingError(update.error)}</div> : null}
      <div className="sf-system-grid">
        {rows.map((row) => {
          const protectedApp = PROTECTED.has(row.app);
          return <article className={`is-${row.status || 'unknown'}`} key={row.app}><span className="sf-system-app-icon">{row.status === 'up' ? Icons.check : row.status === 'degraded' ? Icons.flag : Icons.shield}</span><div><strong>{humanizeIdentifier(row.app)}</strong><small>{row.warnings?.[0] || (protectedApp ? 'Foundational service · always protected' : row.status === 'disabled' ? 'Disabled by organization control' : row.status === 'unavailable' ? 'A required dependency is unavailable' : row.status === 'degraded' ? 'A supporting service is limited' : 'Operating normally')}</small></div><span className="sf-system-status"><i />{statusLabel(row.status)}</span>{canWrite && !protectedApp ? <button type="button" disabled={update.isPending} onClick={() => toggle(row)}>{row.status === 'disabled' ? 'Restore' : 'Turn off'}</button> : null}</article>;
        })}
      </div>
      {!canWrite ? <div className="sf-system-note">Availability controls require the organization-wide system management grant. This view remains observational for the current account.</div> : null}
    </section>
  );
}

