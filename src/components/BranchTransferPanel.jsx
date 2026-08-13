import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { userFacingError } from '../lib/userFacingError.js';
import { Icons } from './Icons.jsx';
import '../styles/transfers-v1.css';

const IMPACT_COPY = Object.freeze({
  student: {
    title: 'Move this student to another branch',
    description: 'Their account access moves with them. Any current group in the old branch is closed unless that whole group has already moved.',
    confirmation: 'I reviewed the current enrollment and understand the branch change.',
  },
  teacher: {
    title: 'Move this teacher to another branch',
    description: 'Their branch access moves immediately. Source-branch teaching assignments are cleared and future scheduled lessons are cancelled so no cross-branch access remains.',
    confirmation: 'I reviewed the teaching assignments and future schedule impact.',
  },
  staff: {
    title: 'Move branch responsibilities',
    description: 'Every active staff responsibility in the selected source branch moves to the destination branch. Responsibilities in other branches stay unchanged.',
    confirmation: 'I reviewed the responsibilities that will move.',
  },
  cohort: {
    title: 'Move this whole group to another branch',
    description: 'Active students move with the group. Rooms and teaching assignments are cleared, and future scheduled lessons are cancelled so the destination can be set up safely.',
    confirmation: 'I reviewed the students, teaching team, room, and schedule impact.',
  },
});

function numericId(value) {
  return /^\d+$/.test(String(value || '')) ? Number(value) : null;
}

export function BranchTransferPanel({
  kind,
  subjectId,
  subjectName,
  currentBranchId,
  currentBranchName,
  sourceBranches = [],
  allowDepartment = false,
  onTransferred,
}) {
  const copy = IMPACT_COPY[kind] || IMPACT_COPY.student;
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' });
  const normalizedSources = useMemo(() => {
    const seen = new Set();
    const rows = sourceBranches.length
      ? sourceBranches
      : currentBranchId
        ? [{ id: currentBranchId, name: currentBranchName || `Branch ${currentBranchId}` }]
        : [];
    return rows.filter((row) => {
      const id = numericId(row.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [currentBranchId, currentBranchName, sourceBranches]);
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState(String(normalizedSources[0]?.id || ''));
  const [target, setTarget] = useState('');
  const [department, setDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const departments = useWorkspaceData(
    '/api/v1/org/departments/',
    { page_size: 100, branch: target || undefined, is_active: true, ordering: 'name' },
    { enabled: allowDepartment && Boolean(target) },
  );
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => httpRequest('POST', '/api/v1/org/transfers/', {
      body: {
        subject_kind: kind,
        subject: kind === 'student' ? undefined : Number(subjectId),
        student: kind === 'student' ? Number(subjectId) : undefined,
        from_branch: kind === 'staff' ? Number(source) : undefined,
        to_branch: Number(target),
        to_department: allowDepartment && department ? Number(department) : undefined,
        reason: reason.trim(),
        confirm_impacts: confirmed,
      },
    }),
    onSuccess: (transfer) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      const destination = branches.rows.find((row) => String(row.id) === String(target));
      setFeedback(`${subjectName || 'The record'} moved to ${destination?.name || 'the selected branch'}.`);
      toast.success(`${subjectName || 'The record'} was moved successfully.`, { title: 'Branch transfer complete' });
      onTransferred?.(transfer, { targetBranchId: Number(target), targetBranchName: destination?.name });
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'The branch transfer could not be completed.' });
      setFeedback(message);
      toast.danger(message, { title: 'Branch transfer not completed' });
    },
  });
  const selectedSource = source || String(normalizedSources[0]?.id || '');
  const ready = Boolean(
    numericId(subjectId)
      && numericId(selectedSource)
      && numericId(target)
      && selectedSource !== target
      && reason.trim()
      && confirmed,
  );

  return <section className={`sf-transfer-panel${expanded ? ' is-open' : ''}`}>
    <header>
      <span className="sf-transfer-icon" aria-hidden="true">{Icons.globe}</span>
      <div><span>Branch movement</span><h3>{copy.title}</h3><p>{copy.description}</p></div>
      <button type="button" className="sf-transfer-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Close transfer' : 'Plan transfer'}</button>
    </header>
    {expanded ? <form onSubmit={(event) => { event.preventDefault(); setFeedback(''); mutation.mutate(); }}>
      <div className="sf-transfer-grid">
        <label><span>Current branch</span><select required value={selectedSource} disabled={kind !== 'staff' || normalizedSources.length < 2} onChange={(event) => { setSource(event.target.value); if (event.target.value === target) setTarget(''); }}><option value="">Choose current branch</option>{normalizedSources.map((row) => <option key={row.id} value={row.id}>{row.name || `Branch ${row.id}`}</option>)}</select></label>
        <label><span>Destination branch</span><select required value={target} onChange={(event) => { setTarget(event.target.value); setDepartment(''); }}><option value="">Choose destination</option>{branches.rows.filter((row) => row.is_active !== false && String(row.id) !== selectedSource).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {allowDepartment ? <label><span>Destination department <small>optional</small></span><select value={department} disabled={!target || departments.pending} onChange={(event) => setDepartment(event.target.value)}><option value="">Branch-wide / assign later</option>{departments.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label> : null}
        <label className="is-wide"><span>Reason for transfer</span><input required maxLength="64" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Brief operational reason for the audit history" /></label>
      </div>
      <label className="sf-transfer-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Confirm transfer impact</strong><small>{copy.confirmation}</small></span></label>
      {feedback ? <p className={mutation.isError ? 'is-error' : 'is-success'} role={mutation.isError ? 'alert' : 'status'}>{feedback}</p> : null}
      <footer><span>This action is recorded permanently with the operator, source, destination, and reason.</span><button type="submit" disabled={!ready || mutation.isPending}>{mutation.isPending ? 'Moving…' : 'Confirm branch transfer'}</button></footer>
    </form> : null}
  </section>;
}
