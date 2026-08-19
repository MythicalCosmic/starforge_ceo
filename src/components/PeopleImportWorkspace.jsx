import { cloneElement, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from './Icons.jsx';
import {
  ActionButton,
  LinkButton,
  StatusPill,
  WorkspaceHeader,
  WorkspacePagination,
  WorkspaceState,
} from './WorkspacePrimitives.jsx';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessNumber, formatOrganizationDate } from '../lib/formatters.js';
import { userFacingError } from '../lib/userFacingError.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import '../styles/people-import.css';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const IMPORT_EXTENSIONS = ['csv', 'tsv', 'xlsx'];
const ROW_FILTERS = [
  { id: 'all', label: 'All rows' },
  { id: 'invalid', label: 'Needs attention' },
  { id: 'ready', label: 'Ready' },
  { id: 'imported', label: 'Imported' },
  { id: 'excluded', label: 'Excluded' },
];

const STUDENT_STATUSES = ['lead', 'application', 'accepted', 'enrolled', 'active', 'graduated', 'withdrawn'];

function plural(kind) {
  return kind === 'teacher' ? 'teachers' : 'students';
}

function titleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  if (status === 'completed' || status === 'ready' || status === 'imported') return 'success';
  if (status === 'needs_attention' || status === 'failed' || status === 'invalid') return 'danger';
  if (status === 'queued' || status === 'processing') return 'warn';
  return 'neutral';
}

function failureMessage(error, fallback) {
  return readableValidationDetails(error)[0] || userFacingError(error, { fallback });
}

function LoadingCurtain({ kind, fileName }) {
  return (
    <div className="people-import-loading" role="status" aria-live="polite">
      <div>
        <span className="people-import-spinner" aria-hidden="true" />
        <p>Reading {kind} file</p>
        <strong>{fileName}</strong>
        <small>Checking columns and preparing an editable draft…</small>
      </div>
    </div>
  );
}

export function PeopleImportButton({ kind, onNav, basePath, defaultBranchId, tone = 'soft' }) {
  const inputRef = useRef(null);
  const toast = useToast();
  const [selectedName, setSelectedName] = useState('');
  const mutation = useMutation({
    mutationFn: (file) => {
      const payload = new FormData();
      payload.append('kind', kind);
      payload.append('file', file);
      if (defaultBranchId) payload.append('default_branch', String(defaultBranchId));
      return httpRequest('POST', '/api/v1/people-imports/', { body: payload, timeout: 30_000 });
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The file is ready. Review every row before creating accounts.', { title: 'Import draft prepared' });
      onNav(`${basePath}/imports/${draft.id}`);
    },
    onError: (error) => {
      setSelectedName('');
      toast.danger(failureMessage(error, 'The selected file could not be prepared.'), { title: 'Import not started' });
    },
  });

  const choose = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extension = String(file.name || '').split('.').pop()?.toLowerCase();
    if (!IMPORT_EXTENSIONS.includes(extension)) {
      toast.danger('Choose a CSV, TSV, or XLSX file.', { title: 'Unsupported file' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.danger('Choose a file no larger than 4 MB.', { title: 'File is too large' });
      return;
    }
    setSelectedName(file.name);
    mutation.mutate(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="people-import-file-input"
        type="file"
        accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={choose}
      />
      <ActionButton
        icon={Icons.doc}
        tone={tone}
        disabled={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {mutation.isPending ? 'Preparing…' : 'Import'}
      </ActionButton>
      {mutation.isPending && <LoadingCurtain kind={plural(kind)} fileName={selectedName} />}
    </>
  );
}

export function PeopleImportDrafts({ kind, onNav, basePath }) {
  const drafts = useWorkspaceData('/api/v1/people-imports/', {
    kind,
    status: 'active',
    page_size: 6,
  });
  if (!drafts.pending && !drafts.error && drafts.rows.length === 0) return null;

  return (
    <section className="people-import-drafts" aria-labelledby={`${kind}-import-drafts-title`}>
      <header>
        <span>{cloneElement(Icons.doc, { size: 17 })}</span>
        <div>
          <h2 id={`${kind}-import-drafts-title`}>Import drafts</h2>
          <p>Uploaded files stay here until you review and confirm them.</p>
        </div>
      </header>
      {drafts.pending && !drafts.rows.length ? (
        <div className="people-import-draft-skeleton" role="status">Loading saved drafts…</div>
      ) : drafts.error && !drafts.rows.length ? (
        <div className="people-import-draft-error">
          <span>Saved drafts could not be loaded.</span>
          <ActionButton tone="ghost" onClick={drafts.retry}>Try again</ActionButton>
        </div>
      ) : (
        <div className="people-import-draft-list">
          {drafts.rows.map((draft) => (
            <article key={draft.id}>
              <span className="people-import-file-mark" aria-hidden="true">{cloneElement(Icons.doc, { size: 17 })}</span>
              <div>
                <strong title={draft.source_file_name}>{draft.source_file_name}</strong>
                <small>
                  {formatBusinessNumber(draft.row_count)} rows · Updated {formatOrganizationDate(draft.updated_at)}
                </small>
              </div>
              <StatusPill value={draft.status_label || draft.status} tone={statusTone(draft.status)} />
              <LinkButton to={`${basePath}/imports/${draft.id}`} onNav={onNav}>
                {['queued', 'processing'].includes(draft.status) ? 'View progress' : 'Resume'}
              </LinkButton>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function fieldError(errors, name) {
  const messages = errors?.[name];
  return Array.isArray(messages) ? messages[0] : messages || '';
}

function ImportField({ label, error, wide = false, children }) {
  return (
    <label className={`${wide ? 'is-wide ' : ''}${error ? 'has-error' : ''}`.trim()}>
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}

function PersonFields({ kind, data, errors, branches, departments, cohorts, onChange, disabled }) {
  const branch = String(data.branch || '');
  const branchDepartments = departments.filter((item) => !branch || String(item.branch) === branch);
  const branchCohorts = cohorts.filter((item) => !branch || String(item.branch) === branch);
  const text = (name, label, options = {}) => (
    <ImportField label={label} error={fieldError(errors, name)} wide={options.wide}>
      <input
        type={options.type || 'text'}
        value={Array.isArray(data[name]) ? data[name].join(', ') : data[name] ?? ''}
        maxLength={options.maxLength}
        disabled={disabled}
        placeholder={options.placeholder}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </ImportField>
  );
  return (
    <div className="people-import-form-grid">
      <ImportField label="Branch" error={fieldError(errors, 'branch')}>
        <select
          value={branch}
          disabled={disabled}
          onChange={(event) => onChange('branch', event.target.value, { resetPlacement: true })}
        >
          <option value="">Select branch</option>
          {branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </ImportField>
      {kind === 'teacher' ? (
        <ImportField label="Department" error={fieldError(errors, 'department')}>
          <select value={data.department || ''} disabled={disabled || !branch} onChange={(event) => onChange('department', event.target.value)}>
            <option value="">No department</option>
            {branchDepartments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </ImportField>
      ) : (
        <ImportField label="Group" error={fieldError(errors, 'cohort')}>
          <select value={data.cohort || ''} disabled={disabled || !branch} onChange={(event) => onChange('cohort', event.target.value)}>
            <option value="">No group yet</option>
            {branchCohorts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </ImportField>
      )}
      {text('first_name', 'First name', { maxLength: 150 })}
      {text('last_name', 'Last name', { maxLength: 150 })}
      {text('middle_name', 'Middle name', { maxLength: 150 })}
      {text('username', 'Username', { maxLength: 150 })}
      {text('phone', 'Phone', { maxLength: 32, placeholder: '+998…' })}
      {text('email', 'Email', { type: 'email', maxLength: 254 })}
      {text('birthdate', 'Birthdate', { type: 'date' })}
      <ImportField label="Gender" error={fieldError(errors, 'gender')}>
        <select value={data.gender || ''} disabled={disabled} onChange={(event) => onChange('gender', event.target.value)}>
          <option value="">Not recorded</option>
          <option value="f">Female</option>
          <option value="m">Male</option>
        </select>
      </ImportField>
      {kind === 'student' ? (
        <>
          <ImportField label="Enrollment status" error={fieldError(errors, 'status')}>
            <select value={data.status || 'lead'} disabled={disabled} onChange={(event) => onChange('status', event.target.value)}>
              {STUDENT_STATUSES.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}
            </select>
          </ImportField>
          {text('academic_level', 'Academic level', { maxLength: 64 })}
          {text('location', 'Location', { maxLength: 200 })}
          {text('previous_school', 'Previous school', { maxLength: 200 })}
        </>
      ) : (
        <>
          {text('hire_date', 'Hire date', { type: 'date' })}
          <ImportField label="Teaching arrangement" error={fieldError(errors, 'is_substitute')}>
            <select value={String(Boolean(data.is_substitute))} disabled={disabled} onChange={(event) => onChange('is_substitute', event.target.value === 'true')}>
              <option value="false">Regular teacher</option>
              <option value="true">Substitute teacher</option>
            </select>
          </ImportField>
          {text('subjects', 'Subjects', { wide: true, placeholder: 'English, Literature' })}
          <ImportField label="Qualifications" error={fieldError(errors, 'qualifications')} wide>
            <textarea value={data.qualifications || ''} maxLength="4000" disabled={disabled} onChange={(event) => onChange('qualifications', event.target.value)} />
          </ImportField>
        </>
      )}
    </div>
  );
}

function rowName(row) {
  const data = row.data || {};
  return [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Unnamed person';
}

function RowCard({ row, edit, expanded, kind, branches, departments, cohorts, locked, onExpand, onField, onIncluded }) {
  const data = edit?.data || row.data || {};
  const included = edit?.is_included ?? row.is_included;
  const errors = row.errors || {};
  const errorCount = Object.values(errors).reduce((total, items) => total + (Array.isArray(items) ? items.length : 1), 0);
  const state = !included ? 'excluded' : row.state;
  return (
    <article className={`people-import-row is-${state}${expanded ? ' is-open' : ''}`}>
      <header>
        <label className="people-import-include">
          <input type="checkbox" checked={included} disabled={locked || row.state === 'imported'} onChange={(event) => onIncluded(row, event.target.checked)} />
          <span className="fw-sr">Include row {row.position}</span>
        </label>
        <span className="people-import-avatar" aria-hidden="true">{rowName({ data }).split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>
        <div className="people-import-row-copy">
          <span>Spreadsheet row {row.position}</span>
          <strong>{rowName({ data })}</strong>
          <small>{[data.email, data.phone, data.username].filter(Boolean).join(' · ') || 'Contact details missing'}</small>
        </div>
        <div className="people-import-row-state">
          <StatusPill value={state === 'invalid' ? `${errorCount} ${errorCount === 1 ? 'issue' : 'issues'}` : state} tone={statusTone(state)} />
          {edit && <span className="people-import-unsaved">Unsaved</span>}
        </div>
        <ActionButton tone="ghost" onClick={() => onExpand(row.id)} aria-expanded={expanded}>
          {expanded ? 'Close' : locked || row.state === 'imported' ? 'View' : state === 'invalid' ? 'Review' : 'Edit'}
        </ActionButton>
      </header>
      {expanded && (
        <div className="people-import-row-editor">
          {!included && <div className="people-import-excluded-note">This row is excluded from the import. Re-include it to edit and create the account.</div>}
          {included && errorCount > 0 && (
            <div className="people-import-row-errors" role="alert">
              <strong>Review this row</strong>
              <p>{Object.values(errors).flat().join(' ')}</p>
            </div>
          )}
          <PersonFields
            kind={kind}
            data={data}
            errors={errors}
            branches={branches}
            departments={departments}
            cohorts={cohorts}
            disabled={locked || !included || row.state === 'imported'}
            onChange={(field, value, options) => onField(row, field, value, options)}
          />
          <details className="people-import-source">
            <summary>Show values read from the file</summary>
            <dl>
              {Object.entries(row.source_data || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value || '—')}</dd></div>)}
            </dl>
          </details>
        </div>
      )}
    </article>
  );
}

function ConfirmImportDialog({ draft, pending, onCancel, onConfirm }) {
  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onCancel, pending]);
  return (
    <div className="people-import-confirm-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onCancel();
    }}>
      <section className="people-import-confirm" role="alertdialog" aria-modal="true" aria-labelledby="people-import-confirm-title" aria-describedby="people-import-confirm-body">
        <span className="people-import-confirm-icon" aria-hidden="true">{cloneElement(Icons.flag, { size: 23 })}</span>
        <div>
          <span>Permanent account creation</span>
          <h2 id="people-import-confirm-title">Are you sure?</h2>
          <p id="people-import-confirm-body">
            This will create {formatBusinessNumber(draft.ready_count)} {draft.kind === 'teacher' ? 'teacher' : 'student'} accounts. You cannot undo the whole import from this page.
          </p>
        </div>
        <footer>
          <ActionButton onClick={onCancel} disabled={pending}>Go back</ActionButton>
          <ActionButton autoFocus tone="danger" onClick={onConfirm} disabled={pending}>
            {pending ? 'Starting safely…' : `Yes, create ${formatBusinessNumber(draft.ready_count)} accounts`}
          </ActionButton>
        </footer>
      </section>
    </div>
  );
}

export function PeopleImportReviewPage({ kind, draftId, onNav, branchId, canWrite = true }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [edits, setEdits] = useState({});
  const [confirming, setConfirming] = useState(false);
  const draft = useWorkspaceData(`/api/v1/people-imports/${draftId}/`, undefined, {
    refreshMs: 0,
  });
  const processing = ['queued', 'processing'].includes(draft.data?.status);
  const rows = useWorkspaceData(`/api/v1/people-imports/${draftId}/rows/`, {
    page,
    page_size: 50,
    state: filter,
  }, { refreshMs: 0 });
  const retryDraft = draft.retry;
  const retryRows = rows.retry;
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, ordering: 'name' }, { enabled: kind === 'teacher' });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, is_archived: false, ordering: 'name' }, { enabled: kind === 'student' });
  const dirty = Object.keys(edits).length > 0;
  const returnPath = branchId ? `branches/${branchId}/${plural(kind)}` : `${plural(kind)}/directory`;
  const locked = !canWrite || processing || draft.data?.status === 'completed' || !draft.data?.can_edit;
  const pages = Math.max(1, Number(rows.pagination?.pages) || 1);
  const draftName = draft.data?.source_file_name || `${titleCase(kind)} import`;
  useWorkspaceTitle(draftName, titleCase(plural(kind)), `import-${draftId}`);

  useEffect(() => {
    const protect = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  useEffect(() => {
    if (!processing) return undefined;
    const timer = window.setInterval(() => {
      retryDraft();
      retryRows();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [processing, retryDraft, retryRows]);

  useEffect(() => {
    if (draft.data?.status === 'completed') queryClient.invalidateQueries({ queryKey: ['api'] });
  }, [draft.data?.status]);

  const save = useMutation({
    mutationFn: () => httpRequest('PATCH', `/api/v1/people-imports/${draftId}/`, {
      body: {
        rows: Object.entries(edits).map(([id, value]) => ({ id: Number(id), ...value })),
      },
      timeout: 20_000,
    }),
    onSuccess: () => {
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('Your corrections are saved and the draft has been rechecked.', { title: 'Draft saved' });
    },
    onError: (error) => toast.danger(failureMessage(error, 'The draft changes could not be saved.'), { title: 'Draft not saved' }),
  });
  const confirm = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/people-imports/${draftId}/confirm/`, {
      body: { confirmed: true },
      timeout: 20_000,
    }),
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('Account creation is running in a bounded background job.', { title: 'Import started' });
    },
    onError: (error) => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.danger(failureMessage(error, 'The import could not be started.'), { title: 'Import not started' });
    },
  });

  const updateField = (row, field, value, options = {}) => {
    setEdits((current) => {
      const existing = current[row.id] || { data: { ...row.data }, is_included: row.is_included };
      const data = { ...existing.data, [field]: value };
      if (options.resetPlacement) {
        data[kind === 'teacher' ? 'department' : 'cohort'] = '';
      }
      return { ...current, [row.id]: { ...existing, data } };
    });
  };
  const updateIncluded = (row, isIncluded) => {
    setEdits((current) => {
      const existing = current[row.id] || { data: { ...row.data }, is_included: row.is_included };
      return { ...current, [row.id]: { ...existing, is_included: isIncluded } };
    });
  };
  const chooseFilter = (next) => {
    if (dirty || next === filter) return;
    setFilter(next);
    setPage(1);
    setExpanded(null);
  };

  if (draft.pending && !draft.data) return <div className="fw-page"><WorkspaceState state={draft} /></div>;
  if (draft.error || !draft.data) return <div className="fw-page"><WorkspaceState state={draft} empty={!draft.error} emptyTitle="Import draft not found" emptyBody="It may have been discarded or belongs to another account." /></div>;
  if (draft.data.kind !== kind) {
    return <div className="fw-page"><WorkspaceHeader eyebrow="Import review" title="This draft belongs in another directory" description={`Open it from the ${plural(draft.data.kind)} workspace.`} actions={<LinkButton to={`${plural(draft.data.kind)}/imports/${draftId}`} onNav={onNav}>Open correct workspace</LinkButton>} /></div>;
  }

  const progressTotal = Math.max(1, Number(draft.data.row_count) - Number(draft.data.excluded_count));
  const progress = Math.min(100, (Number(draft.data.imported_count) / progressTotal) * 100);
  const canConfirm = canWrite && draft.data.can_confirm && !dirty && !save.isPending && !processing;
  return (
    <div className="fw-page people-import-page">
      <WorkspaceHeader
        eyebrow={`${titleCase(plural(kind))} · Import review`}
        title={draftName}
        description="Review the mapped records, correct anything the file could not identify, then save this draft or confirm the final account creation."
        actions={<>
          {dirty
            ? <ActionButton disabled title="Save or discard the changed rows before leaving">Back to {plural(kind)}</ActionButton>
            : <LinkButton to={returnPath} onNav={onNav}>Back to {plural(kind)}</LinkButton>}
          <ActionButton onClick={() => save.mutate()} disabled={!dirty || save.isPending || locked}>{save.isPending ? 'Saving…' : 'Save draft'}</ActionButton>
          <ActionButton tone="primary" onClick={() => setConfirming(true)} disabled={!canConfirm}>Confirm import</ActionButton>
        </>}
        status={<div className="people-import-head-status"><StatusPill value={draft.data.status_label || draft.data.status} tone={statusTone(draft.data.status)} /><span>{draft.data.source_sheet ? `Sheet: ${draft.data.source_sheet}` : 'Uploaded file'} · Last saved {formatOrganizationDate(draft.data.updated_at)}</span>{dirty && <strong>Unsaved changes</strong>}</div>}
      />

      {draft.data.error_message && <div className="people-import-system-error" role="alert"><strong>The background import stopped.</strong><span>{draft.data.error_message}</span></div>}
      {draft.data.status === 'completed' && (
        <section className="people-import-complete">
          <span>{cloneElement(Icons.check, { size: 23 })}</span>
          <div><strong>Import complete</strong><p>{formatBusinessNumber(draft.data.imported_count)} accounts were created. The directory is ready.</p></div>
          <LinkButton tone="primary" to={returnPath} onNav={onNav}>Open {plural(kind)}</LinkButton>
        </section>
      )}
      {processing && (
        <section className="people-import-progress" aria-live="polite">
          <div><span className="people-import-spinner" aria-hidden="true" /><strong>{draft.data.status === 'queued' ? 'Waiting for a worker' : 'Creating accounts safely'}</strong><small>{formatBusinessNumber(draft.data.imported_count)} of {formatBusinessNumber(progressTotal)} completed</small></div>
          <progress max="100" value={progress}>{progress}%</progress>
          <p>One background job processes small chunks. You can leave this page; progress is saved.</p>
        </section>
      )}

      <section className="people-import-summary" aria-label="Import summary">
        <article><span>Total rows</span><strong>{formatBusinessNumber(draft.data.row_count)}</strong><small>Read from the file</small></article>
        <article className="is-ready"><span>Ready</span><strong>{formatBusinessNumber(draft.data.ready_count)}</strong><small>Included and valid</small></article>
        <article className={draft.data.error_count ? 'is-danger' : ''}><span>Needs attention</span><strong>{formatBusinessNumber(draft.data.error_count)}</strong><small>{draft.data.error_count ? 'Must be fixed or excluded' : 'No blocking issues'}</small></article>
        <article><span>Excluded</span><strong>{formatBusinessNumber(draft.data.excluded_count)}</strong><small>Will not be created</small></article>
        {draft.data.imported_count > 0 && <article className="is-ready"><span>Imported</span><strong>{formatBusinessNumber(draft.data.imported_count)}</strong><small>Accounts created</small></article>}
      </section>

      <section className="people-import-register">
        <header>
          <div><span>Review register</span><h2>{titleCase(plural(kind))} from this file</h2><p>Expand a row to edit every mapped field. Excluded rows remain in the draft for later review.</p></div>
          <div className="people-import-filter" aria-label="Filter import rows">
            {ROW_FILTERS.map((item) => <button type="button" className={filter === item.id ? 'is-active' : ''} disabled={dirty} onClick={() => chooseFilter(item.id)} key={item.id}>{item.label}</button>)}
          </div>
        </header>
        {dirty && <div className="people-import-dirty-note" role="status"><span>{cloneElement(Icons.flag, { size: 15 })}</span><p>Save this page before changing filters or pages. Only changed rows are sent.</p><ActionButton tone="ghost" onClick={() => setEdits({})} disabled={save.isPending}>Discard changes</ActionButton><ActionButton tone="primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : `Save ${formatBusinessNumber(Object.keys(edits).length)} changed rows`}</ActionButton></div>}
        <WorkspaceState state={rows} empty={!rows.rows.length} emptyTitle="No rows in this view" emptyBody="Choose another status filter to continue reviewing the file.">
          <div className="people-import-rows">
            {rows.rows.map((row) => <RowCard
              key={row.id}
              row={row}
              edit={edits[row.id]}
              expanded={expanded === row.id}
              kind={kind}
              branches={branches.rows}
              departments={departments.rows}
              cohorts={cohorts.rows}
              locked={locked}
              onExpand={(id) => setExpanded((current) => current === id ? null : id)}
              onField={updateField}
              onIncluded={updateIncluded}
            />)}
          </div>
        </WorkspaceState>
        <WorkspacePagination label="import rows" page={page} pages={pages} total={rows.total || 0} loading={rows.loading || dirty} onPage={(next) => { setPage(next); setExpanded(null); }} />
      </section>

      {!processing && draft.data.status !== 'completed' && (
        <footer className="people-import-footer">
          <div><strong>{draft.data.error_count ? 'The draft is not ready yet' : 'Ready for final confirmation'}</strong><span>{draft.data.error_count ? 'Fix or exclude every row marked Needs attention.' : `${formatBusinessNumber(draft.data.ready_count)} accounts will be created.`}</span></div>
          <ActionButton onClick={() => save.mutate()} disabled={!dirty || save.isPending || locked}>{save.isPending ? 'Saving…' : 'Save draft'}</ActionButton>
          <ActionButton tone="danger" onClick={() => setConfirming(true)} disabled={!canConfirm}>Confirm and create accounts</ActionButton>
        </footer>
      )}
      {confirming && <ConfirmImportDialog draft={draft.data} pending={confirm.isPending} onCancel={() => setConfirming(false)} onConfirm={() => confirm.mutate()} />}
    </div>
  );
}
