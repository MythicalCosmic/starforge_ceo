import { cloneElement, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChartCard, RankedBars } from '../components/ExecutiveCharts.jsx';
import { Icons } from '../components/Icons.jsx';
import { UnloadedSelectionOption } from '../components/SelectionScopeOption.jsx';
import { BranchTransferPanel } from '../components/BranchTransferPanel.jsx';
import {
  ActionButton,
  CoverageBar,
  DetailGrid,
  DetailSection,
  FilterField,
  LinkButton,
  ProfileHero,
  RouteLink,
  StatusPill,
  WorkspaceHeader,
  WorkspacePagination,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { DeferredFilterInput, ProgressiveFilters, StudentStatus, WorkspaceTabs } from '../components/PeopleWorkspacePrimitives.jsx';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { downloadSpreadsheet, useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessNumber, formatGender, formatOrganizationDate } from '../lib/formatters.js';
import { DIRECTORY_PAGE_SIZE, directoryPageCount, directoryRoute, readDirectoryPage } from '../lib/directoryPagination.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';

const TEACHER_SECTIONS = Object.freeze([
  { id: 'directory', label: 'Teacher directory', description: 'Faculty and workload', icon: Icons.user },
  { id: 'activity', label: 'Teaching activity', description: 'Recent delivery signals', icon: Icons.trend },
  { id: 'employment', label: 'Employment view', description: 'Hiring and status', icon: Icons.doc },
]);

const PROFILE_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Overview', icon: Icons.home },
  { id: 'groups', label: 'Groups & students', icon: Icons.cohort },
  { id: 'activity', label: 'Teaching activity', icon: Icons.trend },
  { id: 'compensation', label: 'Compensation', icon: Icons.doc },
  { id: 'employment', label: 'Employment', icon: Icons.user },
]);
const TEACHER_ORDERING_FILTERS = Object.freeze(['hire_date', '-hire_date']);

function cleanId(value) {
  return /^\d+$/.test(String(value || '')) ? String(value) : null;
}

function boundedTextParam(params, key, maxLength) {
  return String(params.get(key) || '').trim().slice(0, maxLength);
}

function choiceParam(params, key, choices) {
  const value = String(params.get(key) || '');
  return choices.includes(value) ? value : '';
}

function idParam(params, key) {
  const value = String(params.get(key) || '');
  return /^\d{1,20}$/.test(value) ? value : '';
}

function dateParam(params, key) {
  const value = String(params.get(key) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

function finiteMetric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeMetric(value) {
  const parsed = finiteMetric(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function percentMetric(value) {
  const parsed = finiteMetric(value);
  return parsed != null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function filterValues(params) {
  return {
    q: boundedTextParam(params, 'q', 120),
    branch: idParam(params, 'branch'),
    department: idParam(params, 'department'),
    substitute: choiceParam(params, 'substitute', ['true', 'false']),
    active: choiceParam(params, 'active', ['true', 'false']),
    subject: boundedTextParam(params, 'subject', 100),
    salary: choiceParam(params, 'salary', ['monthly', 'hourly']),
    hired_after: dateParam(params, 'hired_after'),
    hired_before: dateParam(params, 'hired_before'),
    ordering: choiceParam(params, 'ordering', TEACHER_ORDERING_FILTERS),
  };
}

function routeFilter(filters, key, value, base, onNav, options) {
  onNav(directoryRoute(base, { ...filters, [key]: value }), { scroll: false, ...options });
}

function teacherGroups(teacherId, cohorts) {
  return cohorts.filter((cohort) =>
    String(cohort.primary_teacher) === String(teacherId) ||
    (cohort.teachers || []).some((assignment) => String(assignment.teacher) === String(teacherId)));
}

function contextualPath(branchId, section, id, tail = 'overview') {
  return branchId ? `branches/${branchId}/${section}/${id}/${tail}` : `${section}/${id}/${tail}`;
}

function TeacherDirectoryCard({ teacher, onNav, branchId, access }) {
  const recordPath = contextualPath(branchId, 'teachers', teacher.id);
  const initials = String(teacher.full_name || teacher.username || 'Teacher').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
  return (
    <article className="fw-person-card is-teacher">
      <header>
        <span className="fw-person-avatar" aria-hidden="true">{initials}</span>
        <div>
          <RouteLink className="fw-person-name" to={recordPath} onNav={onNav}>{teacher.full_name || 'Unnamed teacher'}</RouteLink>
          <small>{(teacher.subjects || []).join(' · ') || 'Subjects not recorded'}</small>
        </div>
        <StatusPill value={teacher.is_active ? 'Active' : 'Inactive'} tone={teacher.is_active ? 'success' : 'neutral'} />
      </header>
      <div className="fw-workload-strip" aria-label="Current workload">
        <div><strong>{access.groupsComplete ? formatBusinessNumber(teacher.group_count) : '\u2014'}</strong><span>Groups</span></div>
        <div><strong>{access.studentsComplete ? formatBusinessNumber(teacher.student_count) : '\u2014'}</strong><span>Students</span></div>
        <div><strong>{teacher.engagement == null ? '\u2014' : `${formatBusinessNumber(teacher.engagement, { maximumFractionDigits: 1 })}%`}</strong><span>Recent engagement</span></div>
      </div>
      <dl className="fw-person-facts">
        <div><dt>Branch</dt><dd>{access.organization && teacher.branch ? <RouteLink to={`branches/${teacher.branch}/overview`} onNav={onNav}>{teacher.branch_name || `Branch ${teacher.branch}`}</RouteLink> : teacher.branch_name || 'Not recorded'}</dd></div>
        <div><dt>Department</dt><dd>{teacher.department_name || 'Not assigned'}</dd></div>
        <div className="is-wide"><dt>Current groups</dt><dd className="fw-inline-links">{
          !access.groups
            ? 'Group assignments are outside your current responsibilities'
            : teacher.assigned_groups?.length
              ? teacher.assigned_groups.slice(0, 3).map((group) => <RouteLink key={group.id} to={contextualPath(branchId, 'groups', group.id)} onNav={onNav}>{group.name}</RouteLink>)
              : access.groupsComplete
                ? 'No current group assignments'
                : access.groupCoverageMessage
        }</dd></div>
      </dl>
      <footer>
        <span>{teacher.is_substitute ? 'Substitute arrangement' : formatOrganizationDate(teacher.hire_date, { dateOnly: true }) ? `Joined ${formatOrganizationDate(teacher.hire_date, { dateOnly: true })}` : 'Hire date not recorded'}</span>
        <RouteLink className="fw-card-open" to={recordPath} onNav={onNav} aria-label={`Open ${teacher.full_name || 'teacher'} record`}>Open profile {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>
      </footer>
    </article>
  );
}

function TeacherDirectory({ route, onNav, branchId, user }) {
  const routed = workspaceRoute(route);
  const filters = filterValues(routed.params);
  const page = readDirectoryPage(routed.params);
  const base = branchId ? `branches/${branchId}/teachers` : 'teachers/directory';
  const canViewOrganization = canUseCapability(user, 'org:read');
  const canViewGroups = canUseCapability(user, 'cohorts:read');
  const canViewStudents = canUseCapability(user, 'students:read');
  const canViewIntelligence = canUseCapability(user, 'intelligence:read');
  // Staff compensation is deliberately separate from customer finance.  A
  // finance grant must never become a salary-disclosure grant (and a scoped
  // compensation operator can use this filter without being given finance).
  const canViewCompensation = canUseCapability(user, 'compensation:read');
  const teachers = useWorkspaceData('/api/v1/teachers/', {
    page_size: DIRECTORY_PAGE_SIZE,
    page,
    search: filters.q || undefined,
    branch: branchId || filters.branch || undefined,
    department: filters.department || undefined,
    is_substitute: filters.substitute || undefined,
    is_active: filters.active || undefined,
    subject: filters.subject || undefined,
    salary_type: canViewCompensation ? filters.salary || undefined : undefined,
    hired_after: filters.hired_after || undefined,
    hired_before: filters.hired_before || undefined,
    ordering: filters.ordering || undefined,
  });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canViewOrganization && !branchId });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, branch: branchId || filters.branch || undefined }, { enabled: canViewOrganization });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: branchId || filters.branch || undefined }, { enabled: canViewGroups });
  const students = useWorkspaceData('/api/v1/students/', { page_size: 100, branch: branchId || filters.branch || undefined }, { enabled: canViewStudents });
  const signals = useWorkspaceData('/api/v1/intelligence/teachers/', { page_size: 100 }, { enabled: canViewIntelligence });
  const groupCountsComplete = canViewGroups && cohorts.complete;
  const studentCountsComplete = canViewGroups && canViewStudents && cohorts.complete && students.complete;
  const incompleteWorkload = (canViewGroups && !groupCountsComplete) || (canViewStudents && !studentCountsComplete);
  const groupCoverageMessage = cohorts.pending
    ? 'Group assignments are loading'
    : cohorts.error || cohorts.paused
      ? 'Group assignment information is unavailable'
      : 'Group assignment coverage is incomplete';
  const subjects = [...new Set(teachers.rows.flatMap((teacher) => Array.isArray(teacher.subjects) ? teacher.subjects : []).filter(Boolean))].sort();
  const visible = teachers.rows.filter((teacher) => {
    if (filters.active && String(Boolean(teacher.is_active)) !== filters.active) return false;
    if (filters.subject && !(teacher.subjects || []).some((subject) => String(subject).toLowerCase() === filters.subject.toLowerCase())) return false;
    if (canViewCompensation && filters.salary && teacher.salary_type !== filters.salary) return false;
    if (filters.hired_after && String(teacher.hire_date || '') < filters.hired_after) return false;
    if (filters.hired_before && String(teacher.hire_date || '') > filters.hired_before) return false;
    return true;
  }).map((teacher) => {
    const groups = teacherGroups(teacher.id, cohorts.rows);
    const groupIds = new Set(groups.map((group) => String(group.id)));
    const signal = signals.rows.find((row) => String(row.teacher) === String(teacher.id));
    return {
      ...teacher,
      assigned_groups: groups,
      group_count: groupCountsComplete ? groups.length : null,
      student_count: studentCountsComplete ? students.rows.filter((student) => groupIds.has(String(student.current_cohort))).length : null,
      engagement: percentMetric(signal?.engagement_score),
      lesson_count: nonNegativeMetric(signal?.lessons_delivered),
    };
  });
  const activeCount = Object.values(filters).filter(Boolean).length;
  const advancedCount = ['department', 'substitute', 'salary', 'hired_after', 'hired_before', 'ordering']
    .filter((key) => Boolean(filters[key])).length;
  const pages = directoryPageCount(teachers);
  const correctingPage = !teachers.pending && !teachers.error && !teachers.paused && page > pages;
  const lastPageRoute = directoryRoute(base, filters, pages);

  useEffect(() => {
    if (correctingPage) onNav(lastPageRoute, { replace: true, scroll: false });
  }, [correctingPage, lastPageRoute, onNav]);

  const exportRows = () => downloadSpreadsheet(`teachers-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`, [
    { key: 'full_name', label: 'Teacher' }, { key: 'username', label: 'Username' }, { key: 'branch_name', label: 'Branch' },
    { key: 'department_name', label: 'Department' }, { key: 'subjects', label: 'Subjects' }, { key: 'hire_date', label: 'Hire date' },
    { key: 'group_count', label: 'Groups' }, { key: 'student_count', label: 'Students' }, { key: 'engagement', label: 'Recent engagement' },
    { key: 'is_substitute', label: 'Substitute' }, { key: 'is_active', label: 'Active' },
  ], visible);

  return <>
    <ProgressiveFilters
      title="Find teachers"
      advancedActiveCount={advancedCount}
      actions={<><ActionButton tone="ghost" onClick={() => onNav(base, { scroll: false })} disabled={!activeCount}>Clear all</ActionButton><ActionButton onClick={exportRows} disabled={correctingPage || !visible.length} title={`Downloads the ${visible.length} loaded teachers on this page only`}>{cloneElement(Icons.doc, { size: 14 })} Download this page</ActionButton></>}
      primary={<>
        <FilterField label="Search"><DeferredFilterInput type="search" maxLength={120} value={filters.q} placeholder="Name or phone" onCommit={(value) => routeFilter(filters, 'q', value, base, onNav, { replace: true })} /></FilterField>
        {!branchId && canViewOrganization && <FilterField label="Branch"><select value={filters.branch} onChange={(event) => routeFilter(filters, 'branch', event.target.value, base, onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={branches.rows} label="branch" />{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>}
        <FilterField label="Subject"><DeferredFilterInput list="teacher-subjects" maxLength={100} value={filters.subject} placeholder="Any subject" onCommit={(value) => routeFilter(filters, 'subject', value, base, onNav, { replace: true })} /><datalist id="teacher-subjects">{subjects.map((item) => <option value={item} key={item} />)}</datalist></FilterField>
        <FilterField label="Status"><select value={filters.active} onChange={(event) => routeFilter(filters, 'active', event.target.value, base, onNav)}><option value="">All teachers</option><option value="true">Active teachers</option><option value="false">Inactive teachers</option></select></FilterField>
      </>}
      advanced={<>
        {canViewOrganization && <FilterField label="Department"><select value={filters.department} onChange={(event) => routeFilter(filters, 'department', event.target.value, base, onNav)}><option value="">All departments</option><UnloadedSelectionOption value={filters.department} options={departments.rows} label="department" />{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>}
        <FilterField label="Teaching arrangement"><select value={filters.substitute} onChange={(event) => routeFilter(filters, 'substitute', event.target.value, base, onNav)}><option value="">All arrangements</option><option value="true">Substitute</option><option value="false">Regular</option></select></FilterField>
        {canViewCompensation && <FilterField label="Pay profile"><select value={filters.salary} onChange={(event) => routeFilter(filters, 'salary', event.target.value, base, onNav)}><option value="">Any visible type</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option></select></FilterField>}
        <FilterField label="Hired after"><input type="date" value={filters.hired_after} max={filters.hired_before || undefined} onChange={(event) => routeFilter(filters, 'hired_after', event.target.value, base, onNav)} /></FilterField>
        <FilterField label="Hired before"><input type="date" value={filters.hired_before} min={filters.hired_after || undefined} onChange={(event) => routeFilter(filters, 'hired_before', event.target.value, base, onNav)} /></FilterField>
        <FilterField label="Sort"><select value={filters.ordering} onChange={(event) => routeFilter(filters, 'ordering', event.target.value, base, onNav)}><option value="">Recently added</option><option value="hire_date">Earliest hire</option><option value="-hire_date">Latest hire</option></select></FilterField>
      </>}
    />
    <CoverageBar state={correctingPage ? { ...teachers, pending: true, rows: [] } : teachers} label="teachers" filtered={activeCount > 0} pageLimited={pages > 1} />
    {incompleteWorkload && <div className="fw-data-note">Group and student workload counts stay blank until all linked relationship records are loaded.</div>}
    <WorkspaceState state={correctingPage ? { ...teachers, pending: true, rows: [] } : teachers} empty={!visible.length}>
      <div className="fw-person-grid is-teachers" aria-label="Teacher directory">
        {visible.map((teacher) => <TeacherDirectoryCard key={teacher.id} teacher={teacher} onNav={onNav} branchId={branchId} access={{ organization: canViewOrganization, groups: canViewGroups, groupsComplete: groupCountsComplete, studentsComplete: studentCountsComplete, groupCoverageMessage }} />)}
      </div>
    </WorkspaceState>
    {!correctingPage && <WorkspacePagination label="teachers" page={page} pages={pages} total={teachers.total} loading={teachers.loading} onPage={(nextPage) => onNav(directoryRoute(base, filters, nextPage), { scroll: false })} />}
  </>;
}

function TeacherEditor({ id, onNav, branchId }) {
  const editing = Boolean(id);
  const cancelRoute = editing
    ? branchId ? `branches/${branchId}/teachers/${id}/overview` : `teachers/${id}/overview`
    : branchId ? `branches/${branchId}/teachers` : 'teachers/directory';
  const teacher = useWorkspaceData(editing ? `/api/v1/teachers/${id}/` : null, undefined, { enabled: editing });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 });
  const toast = useToast();
  const [form, setForm] = useState(null);
  const source = form || teacher.data || { branch: branchId || '', first_name: '', last_name: '', middle_name: '', username: '', phone: '', email: '', birthdate: '', gender: '', department: '', hire_date: '', subjects: [], qualifications: '', is_substitute: false, is_active: true };
  const effectiveBranch = branchId || source.branch || '';
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, branch: effectiveBranch || undefined });
  const [error, setError] = useState('');
  const update = (key, value) => setForm((current) => ({ ...(current || source), [key]: value }));
  const updateBranch = (value) => setForm((current) => ({ ...(current || source), branch: value, department: '' }));
  const mutation = useMutation({
    mutationFn: (payload) => httpRequest(editing ? 'PATCH' : 'POST', editing ? `/api/v1/teachers/${id}/` : '/api/v1/teachers/', { body: payload }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(editing ? 'Teacher record updated.' : 'Teacher hired successfully.', { title: editing ? 'Changes saved' : 'Teacher added' });
      onNav(branchId ? `branches/${branchId}/teachers/${saved.id || id}/overview` : `teachers/${saved.id || id}/overview`);
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'The teacher record could not be saved.' });
      setError(message);
      toast.danger(message, { title: 'Teacher not saved' });
    },
  });
  const submit = (event) => {
    event.preventDefault();
    setError('');
    const payload = {
      branch: Number(effectiveBranch), department: source.department ? Number(source.department) : null,
      first_name: source.first_name, last_name: source.last_name, middle_name: source.middle_name || '',
      phone: source.phone || '', email: source.email || '', birthdate: source.birthdate || null, gender: source.gender || '',
      hire_date: source.hire_date || null, subjects: Array.isArray(source.subjects) ? source.subjects : String(source.subjects || '').split(',').map((item) => item.trim()).filter(Boolean),
      qualifications: source.qualifications || '', is_substitute: Boolean(source.is_substitute),
      ...(editing ? { is_active: Boolean(source.is_active) } : { username: source.username || '' }),
    };
    mutation.mutate(payload);
  };
  if (editing && teacher.pending) return <WorkspaceState state={teacher} />;
  return <div className="fw-page"><WorkspaceHeader eyebrow="Faculty record" title={editing ? `Edit ${teacher.data?.full_name || 'teacher'}` : 'Hire a teacher'} description="Use a full-page, auditable employment form. Compensation is configured separately because it follows a controlled payout rule." actions={<LinkButton to={cancelRoute} onNav={onNav}>Cancel</LinkButton>} /><form className="fw-form" onSubmit={submit}>
    {error && <div className="fw-form-error" role="alert">{error}</div>}
    <section className="fw-form-section"><header><h2>Identity and contact</h2><p>Provide at least one reliable contact channel.</p></header>
      {!editing && <label>Username<input value={source.username || ''} onChange={(event) => update('username', event.target.value)} /></label>}
      <label>First name<input required value={source.first_name || ''} onChange={(event) => update('first_name', event.target.value)} /></label>
      <label>Last name<input required value={source.last_name || ''} onChange={(event) => update('last_name', event.target.value)} /></label>
      <label>Middle name<input value={source.middle_name || ''} onChange={(event) => update('middle_name', event.target.value)} /></label>
      <label>Phone<input value={source.phone || ''} onChange={(event) => update('phone', event.target.value)} /></label>
      <label>Email<input type="email" value={source.email || ''} onChange={(event) => update('email', event.target.value)} /></label>
      <label>Date of birth<input type="date" value={source.birthdate || ''} onChange={(event) => update('birthdate', event.target.value)} /></label>
      <label>Gender<select value={source.gender || ''} onChange={(event) => update('gender', event.target.value)}><option value="">Not recorded</option><option value="f">Female</option><option value="m">Male</option></select></label>
    </section>
    <section className="fw-form-section"><header><h2>Employment and teaching</h2><p>Group assignments are managed from the Groups workspace.</p></header>
      {branchId
        ? <label>Branch<input value={teacher.data?.branch_name || branches.rows.find((item) => String(item.id) === String(branchId))?.name || `Current branch`} disabled /></label>
        : <label>Branch<select required value={source.branch || ''} onChange={(event) => updateBranch(event.target.value)}><option value="">Select branch</option><UnloadedSelectionOption value={source.branch} options={branches.rows} label="branch" />{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      <label>Department<select value={source.department || ''} onChange={(event) => update('department', event.target.value)}><option value="">No department</option><UnloadedSelectionOption value={source.department} options={departments.rows} label="department" />{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Hire date<input type="date" value={source.hire_date || ''} onChange={(event) => update('hire_date', event.target.value)} /></label>
      <label>Arrangement<select value={source.is_substitute ? 'substitute' : 'regular'} onChange={(event) => update('is_substitute', event.target.value === 'substitute')}><option value="regular">Regular teacher</option><option value="substitute">Substitute</option></select></label>
      <label className="is-wide">Subjects<input value={Array.isArray(source.subjects) ? source.subjects.join(', ') : source.subjects || ''} placeholder="English, Speaking" onChange={(event) => update('subjects', event.target.value)} /></label>
      <label className="is-wide">Qualifications<textarea value={source.qualifications || ''} onChange={(event) => update('qualifications', event.target.value)} /></label>
      {editing && <label>Account status<select value={source.is_active ? 'active' : 'inactive'} onChange={(event) => update('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
    </section>
    <div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Hire teacher'}</ActionButton></div>
  </form></div>;
}

function CompensationPanel({ id, canManage }) {
  const policy = useWorkspaceData(`/api/v1/teachers/${id}/payout-policy/`);
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const toast = useToast();
  const source = draft || policy.data || { method: 'flat_monthly', flat_amount_uzs: '', hourly_rate_uzs: '', tuition_percent: '', is_active: true };
  const save = useMutation({
    mutationFn: () => httpRequest('PUT', `/api/v1/teachers/${id}/payout-policy/`, { body: {
      method: source.method, is_active: Boolean(source.is_active),
      hourly_rate_uzs: source.method === 'hourly' ? source.hourly_rate_uzs : null,
      flat_amount_uzs: source.method === 'flat_monthly' ? source.flat_amount_uzs : null,
      tuition_percent: source.method === 'percent_of_collected_tuition' ? source.tuition_percent : null,
    } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      setDraft(null);
      setFeedback({ tone: 'success', message: 'The payout rule was saved.' });
      toast.success('The payout rule was saved.');
    },
    onError: (error) => {
      const message = userFacingError(error, { fallback: 'The payout rule could not be saved.' });
      setFeedback({ tone: 'error', message });
      toast.danger(message, { title: 'Payout rule not saved' });
    },
  });
  if (policy.error?.status === 403) return <DetailSection eyebrow="Restricted" title="Compensation"><div className="fw-safety-block">Compensation needs a scoped compensation grant. Customer-finance access does not reveal staff pay.</div></DetailSection>;
  return <DetailSection eyebrow="Controlled compensation" title="Authoritative payout rule" description="Salary preparation uses this rule—not the legacy profile rate.">
    <div className="fw-compensation-grid">
      <label>Method<select disabled={!canManage} value={source.method || 'flat_monthly'} onChange={(event) => setDraft({ ...source, method: event.target.value })}><option value="flat_monthly">Flat monthly</option><option value="hourly">Hourly</option><option value="percent_of_collected_tuition">Share of collected tuition</option></select></label>
      {source.method === 'flat_monthly' && <label>Monthly amount (UZS)<input disabled={!canManage} type="number" inputMode="decimal" min="0" step="0.01" value={source.flat_amount_uzs || ''} onChange={(event) => setDraft({ ...source, flat_amount_uzs: event.target.value })} /></label>}
      {source.method === 'hourly' && <label>Hourly rate (UZS)<input disabled={!canManage} type="number" inputMode="decimal" min="0" step="0.01" value={source.hourly_rate_uzs || ''} onChange={(event) => setDraft({ ...source, hourly_rate_uzs: event.target.value })} /></label>}
      {source.method === 'percent_of_collected_tuition' && <label>Tuition share (%)<input disabled={!canManage} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={source.tuition_percent || ''} onChange={(event) => setDraft({ ...source, tuition_percent: event.target.value })} /></label>}
      <label>Status<select disabled={!canManage} value={source.is_active ? 'active' : 'inactive'} onChange={(event) => setDraft({ ...source, is_active: event.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </div>
    {feedback && <p className={feedback.tone === 'success' ? 'fw-form-success' : 'fw-form-error'} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
    {canManage && <div className="fw-inline-actions"><ActionButton tone="primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save payout rule'}</ActionButton></div>}
    <div className="fw-data-note">Bonuses and deductions are not shown until an accountable adjustment ledger is available. No estimated compensation is presented as official.</div>
  </DetailSection>;
}

function TeacherProfile({ id, section, onNav, user, branchId }) {
  const canEdit = canUseCapability(user, 'teachers:write');
  const canTransfer = canUseCapability(user, 'org:write');
  const canViewCompensation = canUseCapability(user, 'compensation:read');
  const canManageCompensation = canUseCapability(user, 'compensation:write');
  const canViewGroups = canUseCapability(user, 'cohorts:read');
  const canViewStudents = canUseCapability(user, 'students:read');
  const canViewIntelligence = canUseCapability(user, 'intelligence:read');
  const availableSections = PROFILE_SECTIONS.filter((item) => {
    if (item.id === 'groups') return canViewGroups || canViewStudents;
    if (item.id === 'activity') return canViewIntelligence;
    if (item.id === 'compensation') return canViewCompensation;
    return true;
  });
  const active = availableSections.some((item) => item.id === section) ? section : 'overview';
  const teacher = useWorkspaceData(`/api/v1/teachers/${id}/`);
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: teacher.data?.branch }, { enabled: Boolean(teacher.data?.branch) && canViewGroups && ['overview', 'groups'].includes(active) });
  const students = useWorkspaceData('/api/v1/students/', { page_size: 100, teacher: id }, { enabled: canViewStudents && ['overview', 'groups'].includes(active) });
  const signals = useWorkspaceData('/api/v1/intelligence/teachers/', { page_size: 100 }, { enabled: canViewIntelligence && ['overview', 'activity'].includes(active) });
  const data = teacher.data;
  useWorkspaceTitle(data?.full_name, 'Teachers', active);
  const groups = data ? teacherGroups(id, cohorts.rows) : [];
  const signal = signals.rows.find((row) => String(row.teacher) === String(id));
  const groupRelationshipsComplete = cohorts.complete;
  const groupSummaryDetail = cohorts.pending
    ? 'Group information is loading'
    : cohorts.error || cohorts.paused
      ? 'Group information is unavailable'
      : groupRelationshipsComplete
        ? 'Current teaching assignments'
        : 'Group assignment coverage is incomplete';
  const studentsAvailable = students.data != null && !students.error && !students.paused;
  const signalStudentsReached = nonNegativeMetric(signal?.students_reached);
  const directoryStudentsReached = studentsAvailable ? nonNegativeMetric(students.total) : null;
  const studentsReached = signalStudentsReached ?? directoryStudentsReached;
  const lessonsDelivered = nonNegativeMetric(signal?.lessons_delivered);
  const engagementScore = percentMetric(signal?.engagement_score);
  const incompleteSignalCoverage = !signal && !signals.complete && !signals.pending && !signals.error && !signals.paused;
  const teachingSignalDetail = signal
    ? lessonsDelivered == null ? 'Not recorded in this teacher signal' : 'Recent 30-day window'
    : signals.pending
      ? 'Teaching activity is loading'
      : signals.error || signals.paused
        ? 'Teaching activity is unavailable'
        : signals.complete
          ? 'No recent delivery signal recorded'
          : 'Teaching activity coverage is incomplete';
  const engagementDetail = signal
    ? engagementScore == null ? 'Not recorded in this teacher signal' : 'Not a teacher-quality rating'
    : signals.pending
      ? 'Engagement information is loading'
      : signals.error || signals.paused
        ? 'Engagement information is unavailable'
        : signals.complete
          ? 'No recent engagement signal recorded'
          : 'Engagement coverage is incomplete';
  const studentsReachedDetail = signalStudentsReached != null
    ? 'Recent teaching signal'
    : directoryStudentsReached != null
      ? 'Current visible directory'
      : students.pending
        ? 'Student reach is loading'
        : 'Student reach is unavailable';
  const base = branchId ? `branches/${branchId}/teachers/${id}` : `teachers/${id}`;
  const branchPath = data?.branch ? `branches/${data.branch}/overview` : null;
  return <WorkspaceState state={teacher} empty={!data} emptyTitle="Teacher not found" emptyBody="This record may be outside your leadership scope.">{data && <>
    <ProfileHero name={data.full_name} eyebrow="Teacher profile" meta={<><StatusPill value={data.is_active ? 'Active' : 'Inactive'} />{branchPath ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${data.branch}`}</RouteLink> : data.branch_name && <span>{data.branch_name}</span>}{data.department_name && <span>{data.department_name}</span>}{data.is_substitute && <StatusPill value="Substitute" tone="warn" />}</>} actions={<>{canEdit && <LinkButton to={`${base}/edit`} onNav={onNav} icon={Icons.doc} tone="primary">Edit teacher</LinkButton>}<LinkButton to={branchId ? `branches/${branchId}/teachers` : 'teachers/directory'} onNav={onNav}>Back</LinkButton></>} />
    <WorkspaceTabs label="Teacher record" items={availableSections} active={active} basePath={base} onNav={onNav} />
    <div className="fw-record-detail">
      {active === 'overview' && <><section className="fw-record-placement" aria-label="Teaching position"><div><span>Current teaching position</span><h2>{data.department_name || 'Faculty assignment'}</h2><p>{branchPath ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${data.branch}`}</RouteLink> : data.branch_name || 'Branch not recorded'}{data.is_substitute && <> <i>·</i> Substitute arrangement</>}{data.hire_date && <> <i>·</i> Since {formatOrganizationDate(data.hire_date, { dateOnly: true })}</>}</p></div><div className="fw-subject-cloud">{(data.subjects || []).slice(0, 5).map((subject) => <span key={subject}>{subject}</span>)}</div></section><div className="fw-summary-grid is-record-metrics">
        {canViewGroups && <div className="fw-summary-card"><span>Groups</span><strong>{groupRelationshipsComplete ? formatBusinessNumber(groups.length) : '\u2014'}</strong><small>{groupSummaryDetail}</small></div>}
        {(canViewIntelligence || canViewStudents) && <div className="fw-summary-card"><span>Students reached</span><strong>{studentsReached == null ? '\u2014' : formatBusinessNumber(studentsReached)}</strong><small>{studentsReachedDetail}</small></div>}
        {canViewIntelligence && <div className="fw-summary-card"><span>Lessons delivered</span><strong>{lessonsDelivered == null ? '\u2014' : formatBusinessNumber(lessonsDelivered)}</strong><small>{teachingSignalDetail}</small></div>}
        {canViewIntelligence && <div className="fw-summary-card"><span>Attendance engagement</span><strong>{engagementScore == null ? '\u2014' : `${formatBusinessNumber(engagementScore, { maximumFractionDigits: 1 })}%`}</strong><small>{engagementDetail}</small></div>}
      </div><DetailSection eyebrow="Faculty" title="Professional profile"><DetailGrid columns={4} fields={[
        { label: 'Username', value: data.username }, { label: 'Phone', value: data.phone }, { label: 'Email', value: data.email },
        { label: 'Date of birth', value: formatOrganizationDate(data.birthdate, { dateOnly: true }) }, { label: 'Gender', value: formatGender(data.gender) },
        { label: 'Branch', value: branchPath ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${data.branch}`}</RouteLink> : data.branch_name }, { label: 'Department', value: data.department_name }, { label: 'Hire date', value: formatOrganizationDate(data.hire_date, { dateOnly: true }) },
        { label: 'Subjects', value: (data.subjects || []).join(', '), wide: true }, { label: 'Qualifications', value: data.qualifications, wide: true },
        { label: 'Last sign-in', value: formatOrganizationDate(data.last_login_at) }, { label: 'Created', value: formatOrganizationDate(data.created_at) },
      ]} /></DetailSection></>}
      {active === 'groups' && <>{canViewGroups && <DetailSection eyebrow="Teaching assignments" title="Groups"><CoverageBar state={cohorts} label="groups" /><WorkspaceTable label="Teacher groups" rows={groups} empty={groupRelationshipsComplete ? 'No current group assignments.' : 'Group assignment coverage is incomplete; no conclusion is available.'} columns={[
        { key: 'name', label: 'Group', render: (row) => <RouteLink to={contextualPath(branchId, 'groups', row.id)} onNav={onNav}>{row.name}</RouteLink> },
        { key: 'branch_name', label: 'Branch', render: (row) => row.branch ? <RouteLink to={`branches/${row.branch}/overview`} onNav={onNav}>{row.branch_name || `Branch ${row.branch}`}</RouteLink> : row.branch_name },
        { key: 'level', label: 'Level' }, { key: 'start_date', label: 'Start', render: (row) => formatOrganizationDate(row.start_date, { dateOnly: true }) },
        { key: 'capacity', label: 'Capacity' }, { key: 'default_room_name', label: 'Room' },
      ]} /></DetailSection>}{canViewStudents && <DetailSection eyebrow="Students" title="Students in current groups"><CoverageBar state={students} label="students" /><WorkspaceTable label="Teacher students" rows={students.rows} columns={[
        { key: 'full_name', label: 'Student', render: (row) => <RouteLink to={contextualPath(branchId, 'students', row.id)} onNav={onNav}>{row.full_name}</RouteLink> },
        { key: 'current_cohort_name', label: 'Group', render: (row) => row.current_cohort ? <RouteLink to={contextualPath(branchId, 'groups', row.current_cohort)} onNav={onNav}>{row.current_cohort_name || `Group ${row.current_cohort}`}</RouteLink> : row.current_cohort_name },
        { key: 'academic_level', label: 'Level' }, { key: 'status', label: 'Status', render: (row) => <StudentStatus value={row.status} /> },
      ]} /></DetailSection>}</>}
      {active === 'activity' && <><div className="fw-data-note">These are recent delivery and attendance-engagement signals. They support workload review; they do not establish causal teacher quality.</div>{incompleteSignalCoverage && <div className="fw-data-note">This loaded intelligence window is incomplete and does not contain an exact signal for this teacher, so absence and zero cannot be inferred.</div>}<ChartCard eyebrow="Recent delivery" title={data.full_name} description="Fixed recent 30-day method from leadership intelligence."><RankedBars data={[
        { label: 'Engagement score', value: percentMetric(signal?.engagement_score), detail: 'Attendance participation' },
        { label: 'Attendance rate', value: percentMetric(signal?.attendance_rate), detail: 'Present + late share' },
        { label: 'Lessons delivered', value: nonNegativeMetric(signal?.lessons_delivered) }, { label: 'Students reached', value: nonNegativeMetric(signal?.students_reached) },
        { label: 'Marks sampled', value: nonNegativeMetric(signal?.marks_sampled) },
      ]} /></ChartCard></>}
      {active === 'compensation' && canViewCompensation && <CompensationPanel id={id} canManage={canManageCompensation} />}
      {active === 'employment' && <><DetailSection eyebrow="Employment" title="Account and role context"><DetailGrid columns={3} fields={[
        { label: 'Active account', value: data.is_active ? 'Yes' : 'No' }, { label: 'Password reset required', value: data.must_change_password ? 'Yes' : 'No' },
        { label: 'Teaching arrangement', value: data.is_substitute ? 'Substitute' : 'Regular' }, { label: 'Hire date', value: formatOrganizationDate(data.hire_date, { dateOnly: true }) },
        { label: 'Responsibility assignments', value: (data.account_type_assignments || []).map((item) => [item.account_type_name, item.branch_name || (item.branch ? `Branch ${item.branch}` : ''), item.department_name || (item.department ? `Department ${item.department}` : '')].filter(Boolean).join(' · ')).join('; '), wide: true },
      ]} /></DetailSection>{canTransfer && data.branch ? <BranchTransferPanel kind="teacher" subjectId={id} subjectName={data.full_name} currentBranchId={data.branch} currentBranchName={data.branch_name} allowDepartment onTransferred={() => { queryClient.invalidateQueries({ queryKey: ['api'] }); }} /> : null}</>}
    </div>
  </>}</WorkspaceState>;
}

function ActivityView({ onNav }) {
  const signals = useWorkspaceData('/api/v1/intelligence/teachers/', { page_size: 100 });
  return <><div className="fw-data-note">This view compares teaching delivery and attendance engagement in the defined recent 30-day window. It is not a causal performance leaderboard.</div><ChartCard eyebrow="Faculty delivery" title="Teachers by recent attendance engagement" description="Lessons delivered, students reached, and marks sampled remain visible beside the signal."><RankedBars formatter={(value) => `${formatBusinessNumber(value, { maximumFractionDigits: 1 })}%`} data={signals.rows.map((teacher) => ({ id: teacher.teacher, label: teacher.name, value: percentMetric(teacher.engagement_score), detail: `${formatBusinessNumber(nonNegativeMetric(teacher.lessons_delivered))} lessons · ${formatBusinessNumber(nonNegativeMetric(teacher.students_reached))} students · ${formatBusinessNumber(nonNegativeMetric(teacher.marks_sampled))} marks` }))} onSelect={(teacher) => onNav(`teachers/${teacher.id}/activity`)} /></ChartCard></>;
}

export function TeachersPage({ route, onNav, user, branchId }) {
  const routed = workspaceRoute(route);
  const relative = branchId ? routed.segments.slice(3) : routed.segments.slice(1);
  const canHire = canUseCapability(user, 'teachers:write');
  if (!branchId && relative[0] === 'new' && canHire) return <TeacherEditor onNav={onNav} />;
  const legacy = relative[0] === 'directory' ? cleanId(relative[1]) : null;
  const direct = cleanId(relative[0]);
  const id = legacy || direct;
  const tail = legacy ? relative[2] : relative[1];
  if (id && tail === 'edit' && canHire) return <TeacherEditor id={id} onNav={onNav} branchId={branchId} />;
  if (id) return <div className="fw-page"><TeacherProfile id={id} section={tail || 'overview'} onNav={onNav} user={user} branchId={branchId} /></div>;
  const availableSections = TEACHER_SECTIONS.filter((item) => item.id !== 'activity' || canUseCapability(user, 'intelligence:read'));
  const section = availableSections.some((item) => item.id === relative[0]) ? relative[0] : 'directory';
  const base = branchId ? `branches/${branchId}/teachers` : 'teachers';
  return <div className="fw-page">
    {!branchId && <WorkspaceHeader eyebrow="Faculty" title="Teachers" description="See group and student workload, recent delivery signals, employment context, and controlled compensation without reducing educators to a single score." actions={canHire && <LinkButton to="teachers/new" onNav={onNav} icon={Icons.user} tone="primary">Hire teacher</LinkButton>} />}
    {!branchId && <WorkspaceTabs label="Teachers" items={availableSections} active={section} basePath={base} onNav={onNav} />}
    <div className="fw-layout-content">
      {section === 'directory' && <TeacherDirectory route={route} onNav={onNav} branchId={branchId} user={user} />}
      {section === 'activity' && <ActivityView onNav={onNav} />}
      {section === 'employment' && <TeacherDirectory route={`${base}?active=true`} onNav={onNav} branchId={branchId} user={user} />}
    </div>
  </div>;
}
