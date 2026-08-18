import { cloneElement, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { CapabilitySummary } from '../components/CapabilitySummary.jsx';
import { BranchTransferPanel } from '../components/BranchTransferPanel.jsx';
import { Icons } from '../components/Icons.jsx';
import { DeferredFilterInput } from '../components/PeopleWorkspacePrimitives.jsx';
import {
  ActionButton,
  CoverageBar,
  DetailGrid,
  DetailSection,
  FilterField,
  FilterPanel,
  LinkButton,
  ProfileHero,
  RouteLink,
  StatusPill,
  WorkspaceHeader,
  WorkspacePagination,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import {
  DIRECTORY_PAGE_SIZE,
  directoryPageCount,
  directoryRoute,
  readDirectoryPage,
} from '../lib/directoryPagination.js';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatGender,
  formatOrganizationDate,
} from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';
import '../styles/workforce-v1.css';

const PAGE_100 = Object.freeze({ page_size: 100 });

function positiveId(value) {
  const normalized = String(value || '');
  return /^[1-9]\d*$/.test(normalized) ? normalized : '';
}

function choice(value, allowed) {
  const normalized = String(value || '');
  return allowed.includes(normalized) ? normalized : '';
}

function text(value, fallback = 'Not recorded') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function organizationLabel(value, fallback = 'Not recorded') {
  return text(value, fallback).replace(/^\[simulation:[^\]]+\]\s*/i, '').trim() || fallback;
}

function membershipScope(membership) {
  return [membership.branch_name, membership.department_name].filter(Boolean).join(' · ') || 'Organization-wide';
}

function responsibilityName(membership) {
  return membership.account_type_name || membership.legacy_role || 'Staff responsibility';
}

function snapshotMoney(value) {
  const raw = value?.amount_minor;
  const minor = typeof raw === 'string' && /^-?\d+$/.test(raw.trim())
    ? Number(raw)
    : typeof raw === 'number'
      ? raw
      : null;
  return Number.isSafeInteger(minor)
    ? formatBusinessMoney(minor / 100, value?.currency || 'UZS')
    : '—';
}

function percentage(value) {
  if (value == null || value === '') return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? `${formatBusinessNumber(numeric * 100, { maximumFractionDigits: 1 })}%`
    : '—';
}

function departmentComparisonRoute(left, right) {
  const params = new URLSearchParams();
  if (positiveId(left)) params.set('left', left);
  if (positiveId(right)) params.set('right', right);
  const query = params.toString();
  return `departments/compare${query ? `?${query}` : ''}`;
}

function staffFilters(params) {
  return {
    q: String(params.get('q') || '').trim().slice(0, 120),
    active: choice(params.get('active'), ['true', 'false']),
    account_type: positiveId(params.get('account_type')),
    ordering: choice(params.get('ordering'), ['last_name', '-last_name', 'first_name', '-first_name', 'username', '-username', 'created_at', '-created_at']),
  };
}

function departmentFilters(params) {
  return {
    q: String(params.get('q') || '').trim().slice(0, 120),
    branch: positiveId(params.get('branch')),
    active: choice(params.get('active'), ['true', 'false']),
    ordering: choice(params.get('ordering'), ['name', '-name', 'created_at', '-created_at']),
  };
}

function WorkforceMetrics({ items }) {
  return <div className="wf-metrics">{items.map((item) => <article key={item.label}><span>{cloneElement(item.icon, { size: 17 })}</span><div><strong>{item.value}</strong><small>{item.label}</small>{item.detail ? <p>{item.detail}</p> : null}</div></article>)}</div>;
}

function StaffDirectory({ route, onNav, user }) {
  useWorkspaceTitle('Staff & HR', 'Directory');
  const routed = workspaceRoute(route);
  const filters = staffFilters(routed.params);
  const page = readDirectoryPage(routed.params);
  const canReadAccess = canUseCapability(user, 'access:read');
  const canCreate = canUseCapability(user, 'users:write') && canUseCapability(user, 'access:write') && canReadAccess;
  const staff = useWorkspaceData('/api/v1/org/staff/', {
    page_size: DIRECTORY_PAGE_SIZE,
    page,
    search: filters.q || undefined,
    is_active: filters.active || undefined,
    account_type: filters.account_type || undefined,
    ordering: filters.ordering || undefined,
  });
  const accountTypes = useWorkspaceData('/api/v1/access/types/', PAGE_100, { enabled: canReadAccess, staleTime: 5 * 60_000 });
  const types = accountTypes.rows.filter((item) => item.account_kind === 'staff');
  const pages = directoryPageCount(staff);
  const correctingPage = !staff.pending && !staff.error && page > pages;
  const activeCount = Object.values(filters).filter(Boolean).length;
  const routeFilter = (key, value, options) => onNav(directoryRoute('staff', { ...filters, [key]: value }), { scroll: false, ...options });

  useEffect(() => {
    if (correctingPage) onNav(directoryRoute('staff', filters, pages), { replace: true, scroll: false });
  }, [correctingPage, filters, onNav, pages]);

  const activeLoaded = staff.rows.filter((item) => item.is_active).length;
  const scopedLoaded = staff.rows.filter((item) => (item.role_memberships || []).some((membership) => membership.department)).length;
  return <div className="fw-page wf-page">
    <WorkspaceHeader
      eyebrow="People operations"
      title="Staff & HR"
      description="Manage non-teaching staff identities, contact records, responsibilities, branch scope, account readiness, and attributable work from one controlled directory."
      actions={canCreate ? <LinkButton to="staff/new" onNav={onNav} icon={Icons.plus} tone="primary">Add staff member</LinkButton> : null}
    />
    <WorkforceMetrics items={[
      { label: 'Staff in this result', value: formatBusinessNumber(staff.total), detail: staff.complete ? 'Complete filtered register' : 'Exact register total', icon: Icons.user },
      { label: 'Active on this page', value: formatBusinessNumber(activeLoaded), detail: 'Loaded records only', icon: Icons.check },
      { label: 'Department-scoped on this page', value: formatBusinessNumber(scopedLoaded), detail: 'Based on visible responsibilities', icon: Icons.globe },
      { label: 'Available staff account types', value: canReadAccess && accountTypes.data ? formatBusinessNumber(types.filter((item) => item.is_active).length) : '—', detail: canReadAccess ? 'Authorization catalogue' : 'Outside current access grant', icon: Icons.shield },
    ]} />
    <FilterPanel
      title="Staff filters"
      activeCount={activeCount}
      primary={<>
        <FilterField label="Search" wide><DeferredFilterInput type="search" value={filters.q} maxLength={120} placeholder="Name, username, phone, or email" onCommit={(value) => routeFilter('q', value, { replace: true })} /></FilterField>
        <FilterField label="Status"><select value={filters.active} onChange={(event) => routeFilter('active', event.target.value)}><option value="">All staff</option><option value="true">Active staff</option><option value="false">Inactive staff</option></select></FilterField>
      </>}
      actions={activeCount ? <ActionButton onClick={() => onNav('staff')}>Clear filters</ActionButton> : null}
    >
      {canReadAccess ? <FilterField label="Responsibility"><select value={filters.account_type} onChange={(event) => routeFilter('account_type', event.target.value)}><option value="">All account types</option>{types.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_active ? '' : ' · inactive type'}</option>)}</select></FilterField> : null}
      <FilterField label="Sort"><select value={filters.ordering} onChange={(event) => routeFilter('ordering', event.target.value)}><option value="">Last name</option><option value="first_name">First name</option><option value="username">Username</option><option value="-created_at">Newest accounts</option><option value="created_at">Oldest accounts</option></select></FilterField>
    </FilterPanel>
    <CoverageBar state={correctingPage ? { ...staff, pending: true, rows: [] } : staff} label="staff accounts" filtered={activeCount > 0} pageLimited={pages > 1} />
    <WorkspaceState state={correctingPage ? { ...staff, pending: true, rows: [] } : staff} empty={!staff.rows.length} emptyTitle="No staff accounts match this view" emptyBody="Adjust the search or status filters, or add a new staff account if your responsibility allows it.">
      <WorkspaceTable
        label="Staff directory"
        rows={staff.rows}
        onOpen={(row) => onNav(`staff/${row.id}`)}
        rowLabel="full_name"
        columns={[
          { key: 'full_name', label: 'Staff member', render: (row) => <span className="wf-person-cell"><strong>{text(row.full_name, 'Unnamed staff member')}</strong><small>@{text(row.username, 'no username')}</small></span> },
          { key: 'role_memberships', label: 'Responsibilities', render: (row) => <span className="wf-chip-list">{(row.role_memberships || []).length ? row.role_memberships.map((membership) => <span key={membership.id}>{responsibilityName(membership)}</span>) : <em>No active responsibility</em>}</span> },
          { key: 'scope', label: 'Scope', render: (row) => <span className="wf-scope-list">{(row.role_memberships || []).length ? row.role_memberships.map((membership) => <small key={membership.id}>{membershipScope(membership)}</small>) : '—'}</span> },
          { key: 'contact', label: 'Contact', render: (row) => <span className="wf-person-cell"><strong>{text(row.phone, 'No phone')}</strong><small>{text(row.email, 'No email')}</small></span> },
          { key: 'is_active', label: 'Account', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> },
          { key: 'updated_at', label: 'Updated', render: (row) => formatOrganizationDate(row.updated_at) || '—' },
        ]}
      />
    </WorkspaceState>
    {!correctingPage ? <WorkspacePagination label="staff accounts" page={page} pages={pages} total={staff.total} loading={staff.loading} onPage={(next) => onNav(directoryRoute('staff', filters, next), { scroll: false })} /> : null}
  </div>;
}

function StaffEditor({ id, onNav }) {
  const editing = Boolean(id);
  const record = useWorkspaceData(editing ? `/api/v1/org/staff/${id}/` : null, undefined, { enabled: editing });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' });
  const accountTypes = useWorkspaceData('/api/v1/access/types/', { page_size: 100, ordering: 'name' }, { staleTime: 5 * 60_000 });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();
  const source = form || record.data || {
    username: '', first_name: '', last_name: '', middle_name: '', phone: '', email: '', birthdate: '', gender: '',
    branch: '', department: '', account_type: '', is_active: true,
  };
  const effectiveBranch = editing ? source.role_memberships?.[0]?.branch || '' : source.branch;
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, branch: effectiveBranch || undefined, is_active: true, ordering: 'name' }, { enabled: Boolean(effectiveBranch) });
  const staffTypes = accountTypes.rows.filter((item) => item.account_kind === 'staff' && item.is_active);
  const update = (name, value) => setForm((current) => ({ ...(current || source), [name]: value }));
  const save = useMutation({
    mutationFn: (body) => httpRequest(editing ? 'PATCH' : 'POST', editing ? `/api/v1/org/staff/${id}/` : '/api/v1/org/staff/', { body }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(editing ? 'Staff profile updated.' : 'Staff account created.', { title: editing ? 'Changes saved' : 'Staff member added' });
      onNav(`staff/${saved.id || id}`);
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'The staff account could not be saved.' });
      setError(message);
      toast.danger(message, { title: 'Staff account not saved' });
    },
  });
  useWorkspaceTitle(editing ? text(record.data?.full_name, 'Edit staff') : 'Add staff', 'Staff & HR');
  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (!String(source.phone || '').trim() && !String(source.email || '').trim()) {
      setError('Provide at least one contact channel: phone or email.');
      return;
    }
    const identity = {
      first_name: String(source.first_name || '').trim(),
      last_name: String(source.last_name || '').trim(),
      middle_name: String(source.middle_name || '').trim(),
      phone: String(source.phone || '').trim(),
      email: String(source.email || '').trim(),
      birthdate: source.birthdate || null,
      gender: source.gender || '',
    };
    save.mutate(editing ? { ...identity, is_active: Boolean(source.is_active) } : {
      ...identity,
      username: String(source.username || '').trim(),
      branch: Number(source.branch),
      department: source.department ? Number(source.department) : null,
      account_type: Number(source.account_type),
    });
  };
  if (editing && record.pending) return <div className="fw-page"><WorkspaceState state={record} /></div>;
  if (editing && record.error && !record.data) return <div className="fw-page"><WorkspaceState state={record} /></div>;
  return <div className="fw-page wf-page">
    <WorkspaceHeader eyebrow="People operations" title={editing ? `Edit ${text(record.data?.full_name, 'staff profile')}` : 'Add a staff member'} description={editing ? 'Update the role-owned identity and account state. Responsibilities and branch scope remain in the audited assignment workflow.' : 'Create a role-native staff identity and its first accountable responsibility assignment.'} actions={<LinkButton to={editing ? `staff/${id}` : 'staff'} onNav={onNav}>Cancel</LinkButton>} />
    <form className="fw-form" onSubmit={submit}>
      {error ? <div className="fw-form-error" role="alert">{error}</div> : null}
      <section className="fw-form-section"><header><h2>Identity and contact</h2><p>The account owns these details; the internal authorization bridge is never exposed.</p></header>
        {!editing ? <label>Username<input maxLength="150" autoComplete="off" value={source.username || ''} onChange={(event) => update('username', event.target.value)} placeholder="Generated if left blank" /></label> : null}
        <label>First name<input required maxLength="150" value={source.first_name || ''} onChange={(event) => update('first_name', event.target.value)} /></label>
        <label>Last name<input required maxLength="150" value={source.last_name || ''} onChange={(event) => update('last_name', event.target.value)} /></label>
        <label>Middle name<input maxLength="150" value={source.middle_name || ''} onChange={(event) => update('middle_name', event.target.value)} /></label>
        <label>Phone<input maxLength="32" autoComplete="tel" value={source.phone || ''} onChange={(event) => update('phone', event.target.value)} /></label>
        <label>Email<input type="email" maxLength="254" autoComplete="email" value={source.email || ''} onChange={(event) => update('email', event.target.value)} /></label>
        <label>Date of birth<input type="date" value={source.birthdate || ''} onChange={(event) => update('birthdate', event.target.value)} /></label>
        <label>Gender<select value={source.gender || ''} onChange={(event) => update('gender', event.target.value)}><option value="">Not recorded</option><option value="f">Female</option><option value="m">Male</option></select></label>
      </section>
      {!editing ? <section className="fw-form-section"><header><h2>Initial responsibility</h2><p>Additional branch or department assignments can be added from the staff profile after creation.</p></header>
        <label>Branch<select required value={source.branch || ''} onChange={(event) => setForm((current) => ({ ...(current || source), branch: event.target.value, department: '' }))}><option value="">Select branch</option>{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Department<select value={source.department || ''} onChange={(event) => update('department', event.target.value)}><option value="">Branch-wide</option>{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="is-wide">Account type<select required value={source.account_type || ''} onChange={(event) => update('account_type', event.target.value)}><option value="">Select responsibility</option>{staffTypes.map((item) => <option value={item.id} key={item.id}>{item.name} — {text(item.description, 'No description')}</option>)}</select></label>
      </section> : <section className="fw-form-section"><header><h2>Account state</h2><p>Branch and department responsibilities are managed separately so multi-scope staff identities cannot be changed accidentally.</p></header><label>Status<select value={source.is_active ? 'active' : 'inactive'} onChange={(event) => update('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></section>}
      <div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={save.isPending || (!editing && (!branches.data || !accountTypes.data))}>{save.isPending ? 'Saving…' : editing ? 'Save staff profile' : 'Create staff account'}</ActionButton></div>
    </form>
  </div>;
}

function ResponsibilityManager({ staff, assignments, onRefresh, user }) {
  const canWrite = canUseCapability(user, 'access:write');
  const accountTypes = useWorkspaceData('/api/v1/access/types/', { page_size: 100, ordering: 'name' }, { enabled: canWrite, staleTime: 5 * 60_000 });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' }, { enabled: canWrite });
  const [form, setForm] = useState({ account_type: '', branch: '', department: '' });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, branch: form.branch || undefined, is_active: true, ordering: 'name' }, { enabled: canWrite && Boolean(form.branch) });
  const [error, setError] = useState('');
  const toast = useToast();
  const add = useMutation({
    mutationFn: () => httpRequest('POST', '/api/v1/access/types/assignments/', { body: { account_type: Number(form.account_type), principal_kind: 'staff', principal_id: Number(staff.id), branch: Number(form.branch), department: form.department ? Number(form.department) : null } }),
    onSuccess: () => { setForm({ account_type: '', branch: '', department: '' }); setError(''); queryClient.invalidateQueries({ queryKey: ['api'] }); void onRefresh(); toast.success('Responsibility assigned.'); },
    onError: (failure) => { const message = userFacingError(failure, { fallback: 'The responsibility could not be assigned.' }); setError(message); toast.danger(message); },
  });
  const revoke = useMutation({
    mutationFn: (assignmentId) => httpRequest('DELETE', `/api/v1/access/types/assignments/${assignmentId}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); void onRefresh(); toast.success('Responsibility revoked.'); },
    onError: (failure) => toast.danger(userFacingError(failure, { fallback: 'The responsibility could not be revoked.' })),
  });
  const types = accountTypes.rows.filter((item) => item.account_kind === 'staff' && item.is_active);
  return <DetailSection eyebrow="Authorization" title="Responsibilities and scope" description="Each row is an independently audited grant. Multi-branch identities keep every assignment visible instead of hiding scope inside the profile.">
    <div className="wf-responsibilities">
      {assignments.rows.length ? assignments.rows.map((item) => <article key={item.id}><span>{Icons.shield}</span><div><strong>{item.account_type_name}</strong><small>{[item.branch_name, item.department_name].filter(Boolean).join(' · ') || 'Organization-wide'} · granted {formatOrganizationDate(item.granted_at)}</small></div>{canWrite ? <ActionButton tone="danger" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke ${item.account_type_name} from this scope?`)) revoke.mutate(item.id); }}>Revoke</ActionButton> : null}</article>) : <div className="wf-empty-inline">No active responsibility assignments are visible in this scope.</div>}
    </div>
    {canWrite ? <form className="wf-inline-form" onSubmit={(event) => { event.preventDefault(); setError(''); add.mutate(); }}><header><strong>Add responsibility</strong><small>The backend verifies organization, branch, department, and account-kind boundaries.</small></header><label>Account type<select required value={form.account_type} onChange={(event) => setForm({ ...form, account_type: event.target.value })}><option value="">Select type</option>{types.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Branch<select required value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value, department: '' })}><option value="">Select branch</option>{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option value="">Branch-wide</option>{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><ActionButton type="submit" tone="primary" disabled={add.isPending}>{add.isPending ? 'Assigning…' : 'Assign'}</ActionButton>{error ? <div className="fw-form-error" role="alert">{error}</div> : null}</form> : null}
  </DetailSection>;
}

function StaffDetail({ id, onNav, user }) {
  const canAccess = canUseCapability(user, 'access:read');
  const canTasks = canUseCapability(user, 'tasks:read');
  const canAudit = canUseCapability(user, 'audit:read');
  const canEdit = canUseCapability(user, 'users:write');
  const canTransfer = canUseCapability(user, 'org:write');
  const staff = useWorkspaceData(`/api/v1/org/staff/${id}/`);
  const activePrincipal = staff.data?.is_active !== false;
  const assignments = useWorkspaceData('/api/v1/access/types/assignments/', { page_size: 100, principal_kind: 'staff', principal_id: id, ordering: 'account_type__name' }, { enabled: canAccess && activePrincipal });
  const permissions = useWorkspaceData('/api/v1/access/types/effective-permissions/', { principal_kind: 'staff', principal_id: id }, { enabled: canAccess && activePrincipal });
  const tasks = useWorkspaceData('/api/v1/tasks/', { page_size: 25, assignee_kind: 'staff', assignee_principal_id: id, ordering: '-created_at' }, { enabled: canTasks });
  const audit = useWorkspaceData('/api/v1/audit/', { page_size: 25, actor_principal_kind: 'staff', actor_principal_id: id }, { enabled: canAudit });
  const [credentials, setCredentials] = useState(null);
  const toast = useToast();
  const issueCredentials = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/org/staff/${id}/credentials/`, { body: {} }),
    onSuccess: (value) => { setCredentials(value); queryClient.invalidateQueries({ queryKey: ['api'] }); toast.warning('A one-time password was issued. Store it securely before leaving this page.', { title: 'Credentials issued', duration: 9000 }); },
    onError: (failure) => toast.danger(userFacingError(failure, { fallback: 'Credentials could not be issued.' })),
  });
  const deactivate = useMutation({
    mutationFn: () => httpRequest('DELETE', `/api/v1/org/staff/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('The staff account was deactivated.'); onNav('staff'); },
    onError: (failure) => toast.danger(userFacingError(failure, { fallback: 'The staff account could not be deactivated.' })),
  });
  useWorkspaceTitle(text(staff.data?.full_name, 'Staff profile'), 'Staff & HR');
  if (staff.pending || (staff.error && !staff.data)) return <div className="fw-page"><WorkspaceState state={staff} /></div>;
  const data = staff.data;
  if (!data) return null;
  const permissionRows = Array.isArray(permissions.data?.permissions) ? permissions.data.permissions : [];
  const openTasks = tasks.rows.filter((item) => !['completed', 'cancelled'].includes(item.status)).length;
  return <div className="fw-page wf-page">
    <ProfileHero
      eyebrow="Staff account"
      name={text(data.full_name, data.username)}
      meta={<><StatusPill value={data.is_active ? 'active' : 'inactive'} /><span>@{data.username}</span><span>{data.must_change_password ? 'Password change required' : 'Password ready'}</span></>}
      actions={<><LinkButton to="staff" onNav={onNav}>All staff</LinkButton>{canEdit ? <LinkButton to={`staff/${id}/edit`} onNav={onNav} icon={Icons.user}>Edit profile</LinkButton> : null}{canEdit && data.is_active ? <ActionButton icon={Icons.shield} disabled={issueCredentials.isPending} onClick={() => { if (window.confirm('Issue a new one-time password? Any earlier temporary password will stop working.')) issueCredentials.mutate(); }}>{issueCredentials.isPending ? 'Issuing…' : 'Issue credentials'}</ActionButton> : null}{canEdit && data.is_active ? <ActionButton tone="danger" disabled={deactivate.isPending} onClick={() => { if (window.confirm('Deactivate this staff account and revoke its active access? The staff history will be preserved.')) deactivate.mutate(); }}>Deactivate</ActionButton> : null}</>}
    />
    {credentials ? <div className="fw-credential-reveal" role="status"><span><strong>One-time staff credentials</strong><small>Share directly over a trusted channel. The account must change this password at first sign-in.</small></span><code>{credentials.username}</code><code>{credentials.temporary_password}</code><ActionButton onClick={async () => { try { await navigator.clipboard.writeText(`${credentials.username}\n${credentials.temporary_password}`); toast.success('Credentials copied.'); } catch { toast.warning('Clipboard access is unavailable. Copy the values manually.'); } }}>Copy securely</ActionButton><button type="button" onClick={() => setCredentials(null)} aria-label="Hide credentials">{cloneElement(Icons.x, { size: 15 })}</button></div> : null}
    <WorkforceMetrics items={[
      { label: 'Active responsibilities', value: canAccess && assignments.data ? formatBusinessNumber(assignments.total) : formatBusinessNumber(data.role_memberships?.length || 0), detail: canAccess ? 'Audited assignments' : 'Visible profile assignments', icon: Icons.shield },
      { label: 'Allowed actions', value: canAccess && permissions.data ? formatBusinessNumber(permissionRows.length) : '—', detail: canAccess ? 'Across active responsibilities' : 'Outside current access grant', icon: Icons.check },
      { label: 'Open tasks loaded', value: canTasks && tasks.data ? formatBusinessNumber(openTasks) : '—', detail: canTasks ? 'Principal-attributed tasks' : 'Outside current task grant', icon: Icons.doc },
      { label: 'Audit events loaded', value: canAudit && audit.data ? formatBusinessNumber(audit.rows.length) : '—', detail: canAudit ? 'Permission-scoped history' : 'Outside current audit grant', icon: Icons.flag },
    ]} />
    <DetailSection eyebrow="Identity" title="Staff profile"><DetailGrid columns={3} fields={[
      { label: 'Username', value: data.username }, { label: 'First name', value: data.first_name }, { label: 'Last name', value: data.last_name },
      { label: 'Middle name', value: data.middle_name }, { label: 'Phone', value: data.phone }, { label: 'Email', value: data.email },
      { label: 'Birth date', value: formatOrganizationDate(data.birthdate, { dateOnly: true }) }, { label: 'Gender', value: formatGender(data.gender) }, { label: 'Last sign-in', value: formatOrganizationDate(data.last_login_at) },
      { label: 'Created', value: formatOrganizationDate(data.created_at) }, { label: 'Updated', value: formatOrganizationDate(data.updated_at) }, { label: 'Account readiness', value: data.must_change_password ? <StatusPill value="password change required" tone="warn" /> : <StatusPill value="ready" tone="success" /> },
    ]} /></DetailSection>
    {canAccess && activePrincipal ? <ResponsibilityManager staff={data} assignments={assignments} onRefresh={assignments.retry} user={user} /> : <DetailSection eyebrow="Authorization" title="Responsibilities"><div className="wf-chip-list">{(data.role_memberships || []).map((membership) => <span key={membership.id}>{responsibilityName(membership)} · {membershipScope(membership)}</span>)}</div></DetailSection>}
    {canTransfer && activePrincipal ? <BranchTransferPanel kind="staff" subjectId={id} subjectName={data.full_name || data.username} sourceBranches={(assignments.rows.length ? assignments.rows : data.role_memberships || []).map((membership) => ({ id: membership.branch, name: membership.branch_name || `Branch ${membership.branch}` }))} allowDepartment onTransferred={() => { queryClient.invalidateQueries({ queryKey: ['api'] }); void assignments.retry(); }} /> : null}
    {canAccess ? <DetailSection eyebrow="Access summary" title="What this person can do" description="A plain-language view of the access supplied by this person’s active responsibilities.">{!activePrincipal ? <div className="fw-data-note">This account is inactive, so it has no active access.</div> : permissions.pending ? <div className="wf-inline-loading">Checking current access…</div> : permissions.error ? <div className="fw-data-note">This person’s current access could not be checked. Try again before making an access decision.</div> : <CapabilitySummary capabilities={permissionRows} />}</DetailSection> : null}
    {canTasks ? <DetailSection eyebrow="Work ownership" title="Recent assigned tasks" description="Tasks use principal attribution; ambiguous legacy bridge assignments are not presented as this person’s work."><WorkspaceState state={tasks} empty={!tasks.rows.length} emptyTitle="No attributed tasks" emptyBody="No current task is attributed to this staff principal."><WorkspaceTable label="Staff tasks" rows={tasks.rows.slice(0, 10)} columns={[{ key: 'title', label: 'Task' }, { key: 'priority', label: 'Priority', render: (row) => <StatusPill value={row.priority} /> }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> }, { key: 'scope', label: 'Scope', render: (row) => [row.branch_name, row.department_name].filter(Boolean).join(' · ') || '—' }, { key: 'due_at', label: 'Due', render: (row) => formatOrganizationDate(row.due_at) || '—' }]} /></WorkspaceState></DetailSection> : null}
    {canAudit ? <DetailSection eyebrow="Accountability" title="Recent attributed activity" description="This is the permission-scoped immutable timeline for actions attributed to the staff principal."><WorkspaceState state={audit} empty={!audit.rows.length} emptyTitle="No visible activity" emptyBody="No audit event for this principal is visible in the current scope."><WorkspaceTable label="Staff audit history" rows={audit.rows.slice(0, 10)} columns={[{ key: 'action', label: 'Action', render: (row) => <StatusPill value={row.action} /> }, { key: 'resource_type', label: 'Resource' }, { key: 'resource_id', label: 'Record' }, { key: 'sensitivity', label: 'Sensitivity', render: (row) => <StatusPill value={row.sensitivity} /> }, { key: 'created_at', label: 'Time', render: (row) => formatOrganizationDate(row.created_at) }]} /></WorkspaceState></DetailSection> : null}
  </div>;
}

export function StaffPage({ route = 'staff', onNav, user }) {
  const segments = workspaceRoute(route).segments;
  const id = positiveId(segments[1]);
  if (segments[1] === 'new') return <StaffEditor onNav={onNav} user={user} />;
  if (id && segments[2] === 'edit') return <StaffEditor id={id} onNav={onNav} user={user} />;
  if (id) return <StaffDetail id={id} onNav={onNav} user={user} />;
  return <StaffDirectory route={route} onNav={onNav} user={user} />;
}

function useDepartmentComparisonData(id, user) {
  const enabled = Boolean(id);
  const department = useWorkspaceData(
    enabled ? `/api/v1/org/departments/${id}/` : null,
    undefined,
    { enabled },
  );
  const assignments = useWorkspaceData(
    '/api/v1/access/types/assignments/',
    { page_size: 1, department: id || undefined },
    { enabled: enabled && canUseCapability(user, 'access:read') },
  );
  const teachers = useWorkspaceData(
    '/api/v1/teachers/',
    { page_size: 1, department: id || undefined },
    { enabled: enabled && canUseCapability(user, 'teachers:read') },
  );
  const groups = useWorkspaceData(
    '/api/v1/cohorts/',
    { page_size: 1, department: id || undefined },
    { enabled: enabled && canUseCapability(user, 'cohorts:read') },
  );
  const intelligence = useWorkspaceData(
    '/api/v1/intelligence/executive-summary/',
    { department: id || undefined },
    { enabled: enabled && canUseCapability(user, 'intelligence:read') },
  );
  const payroll = useWorkspaceData(
    '/api/v1/payroll/periods/',
    { page_size: 12, department: id || undefined, ordering: '-period_start' },
    { enabled: enabled && canUseCapability(user, 'compensation:read') },
  );
  const latestPayroll = payroll.rows.find((item) => item.status !== 'draft') || payroll.rows[0] || null;
  return { id, department, assignments, teachers, groups, intelligence, payroll, latestPayroll };
}

function sourceValue(source, formatter, outside = 'Outside current grant') {
  if (!source.enabled) return outside;
  if (source.pending && !source.data) return 'Loading…';
  if (source.error && !source.data) return 'Unavailable';
  return formatter(source);
}

function executiveValue(snapshot, section, formatter) {
  return sourceValue(snapshot.intelligence, (source) => {
    const coverage = source.data?.coverage?.[section];
    if (coverage?.status === 'omitted') return 'Outside current grant';
    if (coverage?.status === 'no_data') return 'No measured data';
    return formatter(source.data?.[section], source.data);
  });
}

function DepartmentComparison({ route, onNav, user }) {
  useWorkspaceTitle('Compare departments', 'Departments');
  const routed = workspaceRoute(route);
  const departments = useWorkspaceData('/api/v1/org/departments/', {
    page_size: 100,
    ordering: 'name',
  });
  const leftId = positiveId(routed.params.get('left'));
  const rightId = positiveId(routed.params.get('right'));
  const left = useDepartmentComparisonData(leftId, user);
  const right = useDepartmentComparisonData(rightId, user);
  const update = (side, value) => {
    const nextLeft = side === 'left' ? value : leftId;
    const nextRight = side === 'right' ? value : rightId;
    onNav(departmentComparisonRoute(nextLeft, nextRight), { replace: true, scroll: false });
  };
  const departmentValue = (snapshot, formatter) => sourceValue(snapshot.department, (source) => formatter(source.data));
  const payrollValue = (snapshot, key) => sourceValue(snapshot.payroll, () => {
    if (!snapshot.latestPayroll) return 'No completed payroll run';
    return formatBusinessMoney(snapshot.latestPayroll[key], snapshot.latestPayroll.currency || 'UZS');
  });
  const rows = [
    { label: 'Branch', value: (snapshot) => departmentValue(snapshot, (item) => organizationLabel(item?.branch_name, '—')) },
    { label: 'Operating state', value: (snapshot) => departmentValue(snapshot, (item) => item?.is_active ? 'Active' : 'Inactive') },
    { label: 'Visible annual budget', value: (snapshot) => departmentValue(snapshot, (item) => item?.budget == null ? 'Protected or not set' : formatBusinessMoney(item.budget, 'UZS')) },
    { label: 'Scoped access responsibilities', value: (snapshot) => sourceValue(snapshot.assignments, (source) => formatBusinessNumber(source.total)) },
    { label: 'Teachers', value: (snapshot) => sourceValue(snapshot.teachers, (source) => formatBusinessNumber(source.total)) },
    { label: 'Groups', value: (snapshot) => sourceValue(snapshot.groups, (source) => formatBusinessNumber(source.total)) },
    { label: 'Students', value: (snapshot) => executiveValue(snapshot, 'students', (section) => formatBusinessNumber(section?.total)) },
    { label: '30-day attendance', value: (snapshot) => executiveValue(snapshot, 'attendance', (section) => percentage(section?.attendance_rate_fraction)) },
    { label: '30-day billed', value: (snapshot) => executiveValue(snapshot, 'finance', (section) => snapshotMoney(section?.billed)) },
    { label: '30-day collected', value: (snapshot) => executiveValue(snapshot, 'finance', (section) => snapshotMoney(section?.collected)) },
    { label: '30-day outstanding', value: (snapshot) => executiveValue(snapshot, 'finance', (section) => snapshotMoney(section?.outstanding_for_invoices_issued_in_window)) },
    { label: 'Latest teacher payroll period', value: (snapshot) => sourceValue(snapshot.payroll, () => snapshot.latestPayroll?.label || 'No completed payroll run') },
    { label: 'Latest teacher net payroll', value: (snapshot) => payrollValue(snapshot, 'net_total_uzs') },
    { label: 'Latest teacher payroll paid', value: (snapshot) => payrollValue(snapshot, 'paid_total_uzs') },
    { label: 'Latest teacher payroll outstanding', value: (snapshot) => payrollValue(snapshot, 'outstanding_total_uzs') },
  ];
  const header = (snapshot, fallback) => snapshot.id
    ? <span className="wf-comparison-heading"><RouteLink to={`departments/${snapshot.id}`} onNav={onNav}>{organizationLabel(snapshot.department.data?.name, fallback)}</RouteLink><small>{organizationLabel(snapshot.department.data?.branch_name, 'Branch not recorded')}</small></span>
    : fallback;
  return <div className="fw-page wf-page">
    <WorkspaceHeader eyebrow="Organization design" title="Compare departments" description="Compare two operating units across branches using exact permission-scoped headcount, learning, customer-finance, and teacher-payroll evidence." actions={<LinkButton to="departments" onNav={onNav}>All departments</LinkButton>} />
    <section className="wf-compare-picker" aria-label="Departments to compare">
      <label>First department<select value={leftId} onChange={(event) => update('left', event.target.value)}><option value="">Choose department</option>{departments.rows.map((item) => <option value={item.id} key={item.id} disabled={String(item.id) === String(rightId)}>{organizationLabel(item.name)} · {organizationLabel(item.branch_name, 'Branch not recorded')}</option>)}</select></label>
      <span aria-hidden="true">{Icons.chevR}</span>
      <label>Second department<select value={rightId} onChange={(event) => update('right', event.target.value)}><option value="">Choose department</option>{departments.rows.map((item) => <option value={item.id} key={item.id} disabled={String(item.id) === String(leftId)}>{organizationLabel(item.name)} · {organizationLabel(item.branch_name, 'Branch not recorded')}</option>)}</select></label>
    </section>
    <section className="wf-comparison" aria-labelledby="department-comparison-title">
      <header><div><h2 id="department-comparison-title">Operating and financial comparison</h2><p>The same trailing 30-day window is used for learning and customer-finance measures. Payroll shows the latest visible completed teacher-payroll period for each department.</p></div></header>
      <div className="wf-comparison-table-wrap" role="region" aria-label="Department comparison table" tabIndex="0">
        <table><thead><tr><th>Measure</th><th>{header(left, 'First department')}</th><th>{header(right, 'Second department')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{leftId ? row.value(left) : 'Choose a department'}</td><td>{rightId ? row.value(right) : 'Choose a department'}</td></tr>)}</tbody></table>
      </div>
      <div className="wf-comparison-mobile" aria-label="Department comparison">
        {rows.map((row) => <article key={row.label}>
          <h3>{row.label}</h3>
          <dl>
            <div><dt>{header(left, 'First department')}</dt><dd>{leftId ? row.value(left) : 'Choose a department'}</dd></div>
            <div><dt>{header(right, 'Second department')}</dt><dd>{rightId ? row.value(right) : 'Choose a department'}</dd></div>
          </dl>
        </article>)}
      </div>
      <footer>Administrative staff do not have a generic salary field in the current production contract. Compensation totals above therefore describe audited teacher payroll only.</footer>
    </section>
  </div>;
}

function DepartmentDirectory({ route, onNav, user }) {
  useWorkspaceTitle('Departments', 'Directory');
  const routed = workspaceRoute(route);
  const filters = departmentFilters(routed.params);
  const page = readDirectoryPage(routed.params);
  const canWrite = canUseCapability(user, 'org:write');
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' });
  const departments = useWorkspaceData('/api/v1/org/departments/', {
    page_size: DIRECTORY_PAGE_SIZE, page, search: filters.q || undefined, branch: filters.branch || undefined,
    is_active: filters.active || undefined, ordering: filters.ordering || undefined,
  });
  const pages = directoryPageCount(departments);
  const correctingPage = !departments.pending && !departments.error && page > pages;
  const activeCount = Object.values(filters).filter(Boolean).length;
  const routeFilter = (key, value, options) => onNav(directoryRoute('departments', { ...filters, [key]: value }), { scroll: false, ...options });
  useEffect(() => { if (correctingPage) onNav(directoryRoute('departments', filters, pages), { replace: true, scroll: false }); }, [correctingPage, filters, onNav, pages]);
  const activeLoaded = departments.rows.filter((item) => item.is_active).length;
  const headedLoaded = departments.rows.filter((item) => item.head).length;
  const visibleBudgets = departments.rows.filter((item) => item.budget != null);
  const visibleBudgetTotal = visibleBudgets.reduce((total, item) => total + Number(item.budget || 0), 0);
  return <div className="fw-page wf-page">
    <WorkspaceHeader eyebrow="Organization design" title="Departments" description="Create and maintain accountable operating units, department heads, branch ownership, active state, and permission-protected budgets." actions={<><LinkButton to="departments/compare" onNav={onNav} icon={Icons.trend}>Compare departments</LinkButton>{canWrite ? <LinkButton to="departments/new" onNav={onNav} icon={Icons.plus} tone="primary">Create department</LinkButton> : null}</>} />
    <WorkforceMetrics items={[
      { label: 'Departments in this result', value: formatBusinessNumber(departments.total), detail: departments.complete ? 'Complete filtered register' : 'Exact register total', icon: Icons.globe },
      { label: 'Active on this page', value: formatBusinessNumber(activeLoaded), detail: 'Loaded records only', icon: Icons.check },
      { label: 'Heads assigned on this page', value: formatBusinessNumber(headedLoaded), detail: 'Loaded records only', icon: Icons.user },
      { label: 'Visible budget on this page', value: visibleBudgets.length ? formatBusinessMoney(visibleBudgetTotal, 'UZS') : 'Protected', detail: visibleBudgets.length ? `${formatBusinessNumber(visibleBudgets.length)} permission-visible budgets` : 'Values remain permission-protected', icon: Icons.trend },
    ]} />
    <FilterPanel title="Department filters" activeCount={activeCount} primary={<><FilterField label="Search" wide><DeferredFilterInput type="search" value={filters.q} maxLength={120} placeholder="Department name or slug" onCommit={(value) => routeFilter('q', value, { replace: true })} /></FilterField><FilterField label="Branch"><select value={filters.branch} onChange={(event) => routeFilter('branch', event.target.value)}><option value="">All branches</option>{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField><FilterField label="Status"><select value={filters.active} onChange={(event) => routeFilter('active', event.target.value)}><option value="">All departments</option><option value="true">Active</option><option value="false">Inactive</option></select></FilterField></>} actions={activeCount ? <ActionButton onClick={() => onNav('departments')}>Clear filters</ActionButton> : null}><FilterField label="Sort"><select value={filters.ordering} onChange={(event) => routeFilter('ordering', event.target.value)}><option value="">Name</option><option value="-name">Name descending</option><option value="-created_at">Newest</option><option value="created_at">Oldest</option></select></FilterField></FilterPanel>
    <CoverageBar state={correctingPage ? { ...departments, pending: true, rows: [] } : departments} label="departments" filtered={activeCount > 0} pageLimited={pages > 1} />
    <WorkspaceState state={correctingPage ? { ...departments, pending: true, rows: [] } : departments} empty={!departments.rows.length} emptyTitle="No departments match this view" emptyBody="Adjust the filters or create a department within your authorized branch scope."><WorkspaceTable label="Department directory" rows={departments.rows} onOpen={(row) => onNav(`departments/${row.id}`)} rowLabel="name" columns={[{ key: 'name', label: 'Department', render: (row) => <span className="wf-person-cell"><strong>{row.name}</strong><small>{row.slug}</small></span> }, { key: 'branch_name', label: 'Branch', render: (row) => <RouteLink to={`branches/${row.branch}/overview`} onNav={onNav}>{text(row.branch_name, `Branch ${row.branch}`)}</RouteLink> }, { key: 'head_name', label: 'Department head', render: (row) => row.head ? <RouteLink to={`teachers/${row.head}/overview`} onNav={onNav}>{text(row.head_name)}</RouteLink> : 'Not assigned' }, { key: 'budget', label: 'Budget', render: (row) => row.budget == null ? 'Protected / not set' : formatBusinessMoney(row.budget, 'UZS') }, { key: 'is_active', label: 'State', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> }, { key: 'created_at', label: 'Created', render: (row) => formatOrganizationDate(row.created_at) }]} /></WorkspaceState>
    {!correctingPage ? <WorkspacePagination label="departments" page={page} pages={pages} total={departments.total} loading={departments.loading} onPage={(next) => onNav(directoryRoute('departments', filters, next), { scroll: false })} /> : null}
  </div>;
}

function DepartmentEditor({ id, onNav, user }) {
  const editing = Boolean(id);
  const record = useWorkspaceData(editing ? `/api/v1/org/departments/${id}/` : null, undefined, { enabled: editing });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();
  const source = form || record.data || { branch: '', name: '', slug: '', description: '', head: '', budget: '', is_active: true };
  const effectiveBranch = source.branch || '';
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: 100, branch: effectiveBranch || undefined, is_active: true }, { enabled: Boolean(effectiveBranch) && canUseCapability(user, 'teachers:read') });
  const canWriteFinance = canUseCapability(user, 'finance:write');
  const update = (name, value) => setForm((current) => ({ ...(current || source), [name]: value }));
  const save = useMutation({
    mutationFn: (body) => httpRequest(editing ? 'PATCH' : 'POST', editing ? `/api/v1/org/departments/${id}/` : '/api/v1/org/departments/', { body }),
    onSuccess: (saved) => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success(editing ? 'Department updated.' : 'Department created.'); onNav(`departments/${saved.id || id}`); },
    onError: (failure) => { const message = userFacingError(failure, { fallback: 'The department could not be saved.' }); setError(message); toast.danger(message); },
  });
  useWorkspaceTitle(editing ? text(record.data?.name, 'Edit department') : 'Create department', 'Departments');
  const submit = (event) => {
    event.preventDefault(); setError('');
    const body = { name: String(source.name || '').trim(), slug: String(source.slug || '').trim(), description: String(source.description || '').trim(), is_active: Boolean(source.is_active), head: source.head ? Number(source.head) : null };
    if (!editing) body.branch = Number(source.branch);
    if (canWriteFinance && Object.hasOwn(source, 'budget')) body.budget = source.budget === '' ? null : source.budget;
    save.mutate(body);
  };
  if (editing && (record.pending || (record.error && !record.data))) return <div className="fw-page"><WorkspaceState state={record} /></div>;
  return <div className="fw-page wf-page"><WorkspaceHeader eyebrow="Organization design" title={editing ? `Edit ${text(record.data?.name, 'department')}` : 'Create a department'} description="A department remains permanently anchored to its branch. Moving it requires a future reconciled transfer workflow because staff, groups, teachers, and finance all depend on that scope." actions={<LinkButton to={editing ? `departments/${id}` : 'departments'} onNav={onNav}>Cancel</LinkButton>} /><form className="fw-form" onSubmit={submit}>{error ? <div className="fw-form-error" role="alert">{error}</div> : null}<section className="fw-form-section"><header><h2>Department identity</h2><p>Name, stable slug, branch ownership, and operating state.</p></header>{!editing ? <label>Branch<select required value={source.branch || ''} onChange={(event) => setForm((current) => ({ ...(current || source), branch: event.target.value, head: '' }))}><option value="">Select branch</option>{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : <label>Branch<input value={text(source.branch_name, `Branch ${source.branch}`)} disabled /></label>}<label>Name<input required maxLength="200" value={source.name || ''} onChange={(event) => update('name', event.target.value)} /></label><label>Slug<input required maxLength="100" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={source.slug || ''} onChange={(event) => update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))} /></label><label>Status<select value={source.is_active ? 'active' : 'inactive'} onChange={(event) => update('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="is-wide">Description<textarea maxLength="4000" value={source.description || ''} onChange={(event) => update('description', event.target.value)} /></label></section><section className="fw-form-section"><header><h2>Leadership and budget</h2><p>Head selection is branch-bound. Budget changes require a separate finance write grant.</p></header><label>Department head<select value={source.head || ''} onChange={(event) => update('head', event.target.value)} disabled={!canUseCapability(user, 'teachers:read')}><option value="">No head assigned</option>{teachers.rows.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.username}</option>)}</select></label><label>Budget (UZS)<input type="number" min="0" step="0.01" inputMode="decimal" value={source.budget ?? ''} onChange={(event) => update('budget', event.target.value)} disabled={!canWriteFinance} placeholder={canWriteFinance ? 'Optional' : 'Finance grant required'} /></label></section><div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={save.isPending || (!editing && !branches.data)}>{save.isPending ? 'Saving…' : editing ? 'Save department' : 'Create department'}</ActionButton></div></form></div>;
}

function DepartmentTeamManager({ department, staff, onNav, user }) {
  const canWrite = canUseCapability(user, 'access:write');
  const assignments = useWorkspaceData('/api/v1/access/types/assignments/', {
    page_size: 100,
    department: department.id,
    ordering: 'account_type__name',
  });
  const branchAssignments = useWorkspaceData('/api/v1/access/types/assignments/', {
    page_size: 100,
    branch: department.branch,
    ordering: 'account_type__name',
  }, { enabled: canWrite });
  const accountTypes = useWorkspaceData('/api/v1/access/types/', {
    page_size: 100,
    ordering: 'name',
  }, { enabled: canWrite, staleTime: 5 * 60_000 });
  const [assignForm, setAssignForm] = useState({ staff: '', account_type: '' });
  const [moveAssignment, setMoveAssignment] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  const staffById = new Map(staff.rows.map((person) => [String(person.id), person]));
  const currentStaffAssignments = assignments.rows.filter((item) => item.principal_kind === 'staff');
  const currentKeys = new Set(currentStaffAssignments.map((item) => `${item.principal_id}:${item.account_type}`));
  const staffTypes = accountTypes.rows.filter((item) => item.account_kind === 'staff' && item.is_active);
  const movableAssignments = branchAssignments.rows.filter((item) =>
    item.principal_kind === 'staff' &&
    String(item.department || '') !== String(department.id));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['api'] });
    return Promise.all([assignments.retry(), branchAssignments.retry(), staff.retry()]);
  };
  const assign = useMutation({
    mutationFn: () => httpRequest('POST', '/api/v1/access/types/assignments/', {
      body: {
        account_type: Number(assignForm.account_type),
        principal_kind: 'staff',
        principal_id: Number(assignForm.staff),
        branch: Number(department.branch),
        department: Number(department.id),
      },
    }),
    onSuccess: () => {
      setAssignForm({ staff: '', account_type: '' });
      setError('');
      void refresh();
      toast.success('Staff responsibility added to this department.');
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'The staff responsibility could not be added.' });
      setError(message);
      toast.danger(message);
    },
  });
  const move = useMutation({
    mutationFn: async () => {
      const source = movableAssignments.find((item) => String(item.id) === String(moveAssignment));
      if (!source) throw new Error('Choose a responsibility to move.');
      await httpRequest('POST', '/api/v1/access/types/assignments/', {
        body: {
          account_type: Number(source.account_type),
          principal_kind: 'staff',
          principal_id: Number(source.principal_id),
          branch: Number(department.branch),
          department: Number(department.id),
        },
      });
      try {
        await httpRequest('DELETE', `/api/v1/access/types/assignments/${source.id}/`);
      } catch (failure) {
        const partial = new Error('The responsibility was added here, but its earlier assignment could not be revoked. Review both department records before continuing.');
        partial.partialMove = true;
        partial.cause = failure;
        throw partial;
      }
    },
    onSuccess: () => {
      setMoveAssignment('');
      setError('');
      void refresh();
      toast.success('The staff responsibility moved to this department.');
    },
    onError: (failure) => {
      const message = failure.partialMove
        ? failure.message
        : userFacingError(failure, { fallback: 'The staff responsibility could not be moved.' });
      setError(message);
      void refresh();
      if (failure.partialMove) toast.warning(message, { title: 'Review required' });
      else toast.danger(message);
    },
  });
  const revoke = useMutation({
    mutationFn: (assignmentId) => httpRequest('DELETE', `/api/v1/access/types/assignments/${assignmentId}/`),
    onSuccess: () => {
      setError('');
      void refresh();
      toast.success('The responsibility was removed from this department.');
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'The responsibility could not be removed.' });
      setError(message);
      toast.danger(message);
    },
  });
  const personName = (assignment) => {
    const person = staffById.get(String(assignment.principal_id));
    return text(person?.full_name, person?.username || `Staff ${assignment.principal_id}`);
  };
  return <DetailSection eyebrow="People" title="Administrative team" description="Add, move, or remove audited staff responsibilities without deleting the staff account or its history.">
    {error ? <div className="fw-form-error" role="alert">{error}</div> : null}
    <WorkspaceState state={assignments} empty={!currentStaffAssignments.length} emptyTitle="No administrative responsibilities" emptyBody="No visible staff responsibility is assigned to this department.">
      <WorkspaceTable label="Department administrative responsibilities" rows={currentStaffAssignments} onOpen={(row) => onNav(`staff/${row.principal_id}`)} rowLabel={(row) => personName(row)} columns={[
        { key: 'person', label: 'Staff member', render: (row) => <span className="wf-person-cell"><strong>{personName(row)}</strong><small>{staffById.get(String(row.principal_id))?.username || `Staff #${row.principal_id}`}</small></span> },
        { key: 'account_type_name', label: 'Responsibility' },
        { key: 'department_name', label: 'Department' },
        { key: 'granted_at', label: 'Assigned', render: (row) => formatOrganizationDate(row.granted_at) },
        ...(canWrite ? [{ key: 'remove', label: 'Remove', render: (row) => <button type="button" className="wf-table-action is-danger" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Remove ${row.account_type_name} for ${personName(row)} from this department? Their other responsibilities and staff account will remain.`)) revoke.mutate(row.id); }}>Remove</button> }] : []),
      ]} />
    </WorkspaceState>
    {!assignments.complete ? <div className="fw-data-note">This team view is limited to the first 100 visible responsibility assignments. No complete headcount is inferred beyond the stated total.</div> : null}
    {canWrite ? <div className="wf-team-controls">
      <form className="wf-inline-form" onSubmit={(event) => { event.preventDefault(); setError(''); assign.mutate(); }}>
        <header><strong>Add to this department</strong><small>Assign an existing staff account one responsibility in {department.name}.</small></header>
        <label>Staff member<select required value={assignForm.staff} onChange={(event) => setAssignForm({ ...assignForm, staff: event.target.value })}><option value="">Select staff</option>{staff.rows.filter((person) => person.is_active !== false).map((person) => <option value={person.id} key={person.id}>{text(person.full_name, person.username)} · @{person.username}</option>)}</select></label>
        <label>Responsibility<select required value={assignForm.account_type} onChange={(event) => setAssignForm({ ...assignForm, account_type: event.target.value })}><option value="">Select responsibility</option>{staffTypes.map((item) => <option value={item.id} key={item.id} disabled={currentKeys.has(`${assignForm.staff}:${item.id}`)}>{item.name}</option>)}</select></label>
        <ActionButton type="submit" tone="primary" disabled={assign.isPending || !assignForm.staff || !assignForm.account_type}>{assign.isPending ? 'Adding…' : 'Add responsibility'}</ActionButton>
      </form>
      <form className="wf-inline-form" onSubmit={(event) => { event.preventDefault(); setError(''); move.mutate(); }}>
        <header><strong>Move a branch responsibility here</strong><small>The new assignment is created first; the earlier department assignment is revoked only after that succeeds.</small></header>
        <label className="is-wide">Current responsibility<select required value={moveAssignment} onChange={(event) => setMoveAssignment(event.target.value)}><option value="">Select responsibility</option>{movableAssignments.map((item) => <option value={item.id} key={item.id}>{personName(item)} · {item.account_type_name} · {item.department_name || 'Branch-wide'}</option>)}</select></label>
        <ActionButton type="submit" disabled={move.isPending || !moveAssignment}>{move.isPending ? 'Moving…' : 'Move here'}</ActionButton>
      </form>
      <div className="fw-data-note">Cross-branch staff movement remains in the audited transfer workflow on each staff profile.</div>
    </div> : null}
  </DetailSection>;
}

function DepartmentDetail({ id, onNav, user }) {
  const canWrite = canUseCapability(user, 'org:write');
  const access = {
    staff: canUseCapability(user, 'users:read'), assignments: canUseCapability(user, 'access:read'), teachers: canUseCapability(user, 'teachers:read'), groups: canUseCapability(user, 'cohorts:read'),
    tasks: canUseCapability(user, 'tasks:read'), payroll: canUseCapability(user, 'compensation:read'), audit: canUseCapability(user, 'audit:read'),
  };
  const department = useWorkspaceData(`/api/v1/org/departments/${id}/`);
  const branchId = department.data?.branch;
  const staff = useWorkspaceData('/api/v1/org/staff/', { page_size: 100, ordering: 'last_name' }, { enabled: access.staff });
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: 25, department: id }, { enabled: access.teachers });
  const groups = useWorkspaceData('/api/v1/cohorts/', { page_size: 25, department: id, ordering: 'name' }, { enabled: access.groups });
  const tasks = useWorkspaceData('/api/v1/tasks/', { page_size: 25, department: id, ordering: '-created_at' }, { enabled: access.tasks });
  const payroll = useWorkspaceData('/api/v1/payroll/periods/', { page_size: 25, department: id, ordering: '-period_start' }, { enabled: access.payroll });
  const audit = useWorkspaceData('/api/v1/audit/', { page_size: 25, department: id }, { enabled: access.audit });
  const toast = useToast();
  const deactivate = useMutation({ mutationFn: () => httpRequest('PATCH', `/api/v1/org/departments/${id}/`, { body: { is_active: false } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Department deactivated. Its history and linked records were preserved.'); void department.retry(); }, onError: (failure) => toast.danger(userFacingError(failure, { fallback: 'The department could not be deactivated.' })) });
  useWorkspaceTitle(text(department.data?.name, 'Department'), 'Departments');
  if (department.pending || (department.error && !department.data)) return <div className="fw-page"><WorkspaceState state={department} /></div>;
  const data = department.data;
  if (!data) return null;
  const visibleStaff = staff.rows.filter((person) => (person.role_memberships || []).some((membership) => String(membership.department) === String(id)));
  const openTasks = tasks.rows.filter((item) => !['completed', 'cancelled'].includes(item.status)).length;
  const latestPayroll = payroll.rows.find((item) => item.status !== 'draft') || payroll.rows[0] || null;
  return <div className="fw-page wf-page"><WorkspaceHeader eyebrow="Organization design" title={data.name} description={text(data.description, 'No department description has been recorded.')} status={<StatusPill value={data.is_active ? 'active' : 'inactive'} />} actions={<><LinkButton to="departments" onNav={onNav}>All departments</LinkButton><LinkButton to={`departments/compare?left=${id}`} onNav={onNav} icon={Icons.trend}>Compare</LinkButton>{branchId ? <LinkButton to={`branches/${branchId}/overview`} onNav={onNav} icon={Icons.globe}>Open branch</LinkButton> : null}{canWrite ? <LinkButton to={`departments/${id}/edit`} onNav={onNav} icon={Icons.settings}>Edit</LinkButton> : null}{canWrite && data.is_active ? <ActionButton tone="danger" disabled={deactivate.isPending} onClick={() => { if (window.confirm('Deactivate this department? Linked staff, payroll, groups, and history will be preserved, but the department will leave active operating lists.')) deactivate.mutate(); }}>{deactivate.isPending ? 'Deactivating…' : 'Deactivate'}</ActionButton> : null}</>} /><WorkforceMetrics items={[{ label: 'Staff loaded', value: access.staff && staff.data ? formatBusinessNumber(visibleStaff.length) : '—', detail: access.staff ? staff.complete ? 'Complete visible staff join' : 'First 100 visible staff' : 'Outside staff grant', icon: Icons.user }, { label: 'Teachers', value: access.teachers && teachers.data ? formatBusinessNumber(teachers.total) : '—', detail: access.teachers ? 'Department-filtered register' : 'Outside teacher grant', icon: Icons.user }, { label: 'Groups', value: access.groups && groups.data ? formatBusinessNumber(groups.total) : '—', detail: access.groups ? 'Department-filtered register' : 'Outside group grant', icon: Icons.cohort }, { label: 'Open tasks loaded', value: access.tasks && tasks.data ? formatBusinessNumber(openTasks) : '—', detail: access.tasks ? 'Current loaded work' : 'Outside task grant', icon: Icons.doc }, { label: 'Visible budget', value: data.budget == null ? 'Protected' : formatBusinessMoney(data.budget, 'UZS'), detail: data.budget == null ? 'Outside finance grant or not set' : 'Department operating budget', icon: Icons.trend }, { label: 'Latest teacher payroll', value: access.payroll && latestPayroll ? formatBusinessMoney(latestPayroll.net_total_uzs, latestPayroll.currency || 'UZS') : access.payroll ? 'No run' : '—', detail: latestPayroll?.label || (access.payroll ? 'No visible completed period' : 'Outside compensation grant'), icon: Icons.wallet }]} /><DetailSection eyebrow="Structure" title="Department record"><DetailGrid columns={3} fields={[{ label: 'Name', value: data.name }, { label: 'Slug', value: data.slug }, { label: 'State', value: <StatusPill value={data.is_active ? 'active' : 'inactive'} /> }, { label: 'Branch', value: branchId ? <RouteLink to={`branches/${branchId}/overview`} onNav={onNav}>{text(data.branch_name, `Branch ${branchId}`)}</RouteLink> : null }, { label: 'Department head', value: data.head ? <RouteLink to={`teachers/${data.head}/overview`} onNav={onNav}>{text(data.head_name)}</RouteLink> : 'Not assigned' }, { label: 'Visible budget', value: data.budget == null ? 'Protected or not set' : formatBusinessMoney(data.budget, 'UZS') }, { label: 'Description', value: data.description, wide: true }, { label: 'Created', value: formatOrganizationDate(data.created_at) }]} /></DetailSection>{access.payroll || data.budget != null ? <DetailSection eyebrow="Financial control" title="Department financial snapshot" description="Budget and compensation retain separate grants. Teacher payroll is shown from the latest visible audited period; administrative staff have no generic salary field in the production contract."><DetailGrid columns={4} fields={[{ label: 'Visible budget', value: data.budget == null ? 'Protected or not set' : formatBusinessMoney(data.budget, 'UZS') }, { label: 'Latest payroll period', value: latestPayroll?.label || 'No visible completed period' }, { label: 'Teacher net payroll', value: latestPayroll ? formatBusinessMoney(latestPayroll.net_total_uzs, latestPayroll.currency || 'UZS') : '—' }, { label: 'Paid / outstanding', value: latestPayroll ? `${formatBusinessMoney(latestPayroll.paid_total_uzs, latestPayroll.currency || 'UZS')} / ${formatBusinessMoney(latestPayroll.outstanding_total_uzs, latestPayroll.currency || 'UZS')}` : '—' }]} /></DetailSection> : null}{access.staff && access.assignments ? <DepartmentTeamManager department={data} staff={staff} onNav={onNav} user={user} /> : access.staff ? <DetailSection eyebrow="People" title="Administrative staff" description="Staff are joined through their visible authorization assignments; hidden assignments never leak through the directory."><WorkspaceState state={staff} empty={!visibleStaff.length} emptyTitle="No visible administrative staff" emptyBody="No loaded staff responsibility is assigned to this department."><WorkspaceTable label="Department staff" rows={visibleStaff.slice(0, 10)} onOpen={(row) => onNav(`staff/${row.id}`)} columns={[{ key: 'full_name', label: 'Staff member' }, { key: 'username', label: 'Username' }, { key: 'role', label: 'Responsibility', render: (row) => (row.role_memberships || []).filter((membership) => String(membership.department) === String(id)).map(responsibilityName).join(', ') }, { key: 'is_active', label: 'State', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> }]} /></WorkspaceState>{!staff.complete ? <div className="fw-data-note">Staff relationship coverage is limited to the first 100 visible staff accounts; no complete headcount is inferred.</div> : null}</DetailSection> : null}{access.teachers ? <DetailSection eyebrow="Faculty" title="Department teachers"><WorkspaceState state={teachers} empty={!teachers.rows.length} emptyTitle="No teachers assigned" emptyBody="No visible teacher is assigned to this department."><WorkspaceTable label="Department teachers" rows={teachers.rows.slice(0, 10)} onOpen={(row) => onNav(`teachers/${row.id}/overview`)} columns={[{ key: 'full_name', label: 'Teacher' }, { key: 'subjects', label: 'Subjects', render: (row) => (row.subjects || []).join(', ') || '—' }, { key: 'is_substitute', label: 'Arrangement', render: (row) => row.is_substitute ? 'Substitute' : 'Regular' }, { key: 'is_active', label: 'State', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> }]} /></WorkspaceState></DetailSection> : null}{access.groups ? <DetailSection eyebrow="Learning delivery" title="Department groups"><WorkspaceState state={groups} empty={!groups.rows.length} emptyTitle="No groups assigned" emptyBody="No visible group is assigned to this department."><WorkspaceTable label="Department groups" rows={groups.rows.slice(0, 10)} onOpen={(row) => onNav(`groups/${row.id}/overview`)} columns={[{ key: 'name', label: 'Group' }, { key: 'level', label: 'Level' }, { key: 'primary_teacher_name', label: 'Primary teacher' }, { key: 'capacity', label: 'Capacity' }, { key: 'is_archived', label: 'State', render: (row) => <StatusPill value={row.is_archived ? 'archived' : 'active'} /> }]} /></WorkspaceState></DetailSection> : null}{access.tasks ? <DetailSection eyebrow="Delivery" title="Department tasks"><WorkspaceState state={tasks} empty={!tasks.rows.length} emptyTitle="No department tasks" emptyBody="No visible task is scoped to this department."><WorkspaceTable label="Department tasks" rows={tasks.rows.slice(0, 10)} columns={[{ key: 'title', label: 'Task' }, { key: 'assignee_name', label: 'Owner' }, { key: 'priority', label: 'Priority', render: (row) => <StatusPill value={row.priority} /> }, { key: 'status', label: 'State', render: (row) => <StatusPill value={row.status} /> }, { key: 'due_at', label: 'Due', render: (row) => formatOrganizationDate(row.due_at) || '—' }]} /></WorkspaceState></DetailSection> : null}{access.payroll ? <DetailSection eyebrow="Compensation" title="Department teacher payroll" description="Compensation uses its own grant and remains separate from customer-finance access."><WorkspaceState state={payroll} empty={!payroll.rows.length} emptyTitle="No payroll periods" emptyBody="No visible teacher-payroll period is scoped to this department."><WorkspaceTable label="Department teacher payroll" rows={payroll.rows.slice(0, 8)} columns={[{ key: 'label', label: 'Period', render: (row) => row.label || `Period ${row.id}` }, { key: 'status', label: 'State', render: (row) => <StatusPill value={row.status} /> }, { key: 'period_start', label: 'From', render: (row) => formatOrganizationDate(row.period_start, { dateOnly: true }) }, { key: 'period_end', label: 'To', render: (row) => formatOrganizationDate(row.period_end, { dateOnly: true }) }, { key: 'net_total_uzs', label: 'Net payroll', render: (row) => formatBusinessMoney(row.net_total_uzs, row.currency || 'UZS') }, { key: 'outstanding_total_uzs', label: 'Outstanding', render: (row) => formatBusinessMoney(row.outstanding_total_uzs, row.currency || 'UZS') }]} /></WorkspaceState></DetailSection> : null}{access.audit ? <DetailSection eyebrow="Assurance" title="Department activity"><WorkspaceState state={audit} empty={!audit.rows.length} emptyTitle="No visible activity" emptyBody="No permission-scoped audit event is attributed to this department."><WorkspaceTable label="Department audit history" rows={audit.rows.slice(0, 10)} columns={[{ key: 'action', label: 'Action', render: (row) => <StatusPill value={row.action} /> }, { key: 'resource_type', label: 'Resource' }, { key: 'actor_repr', label: 'Actor', render: (row) => row.actor_repr || row.actor_username || 'System' }, { key: 'created_at', label: 'Time', render: (row) => formatOrganizationDate(row.created_at) }]} /></WorkspaceState></DetailSection> : null}</div>;
}

export function DepartmentsPage({ route = 'departments', onNav, user }) {
  const segments = workspaceRoute(route).segments;
  const id = positiveId(segments[1]);
  if (segments[1] === 'compare') return <DepartmentComparison route={route} onNav={onNav} user={user} />;
  if (segments[1] === 'new') return <DepartmentEditor onNav={onNav} user={user} />;
  if (id && segments[2] === 'edit') return <DepartmentEditor id={id} onNav={onNav} user={user} />;
  if (id) return <DepartmentDetail id={id} onNav={onNav} user={user} />;
  return <DepartmentDirectory route={route} onNav={onNav} user={user} />;
}
