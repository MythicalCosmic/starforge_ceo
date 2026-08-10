import { cloneElement, useEffect } from 'react';
import { ChartCard, DonutBreakdown, RankedBars } from '../components/ExecutiveCharts.jsx';
import { Icons } from '../components/Icons.jsx';
import { UnloadedSelectionOption } from '../components/SelectionScopeOption.jsx';
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
import {
  DeferredFilterInput,
  ProgressiveFilters,
  StudentStatus,
  WorkspaceTabs,
} from '../components/PeopleWorkspacePrimitives.jsx';
import { downloadSpreadsheet, useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessMoney, formatBusinessNumber, formatGender, formatOrganizationDate, isValidDateInput, organizationDateInput } from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { studentStatusPresentation } from '../lib/peoplePresentation.js';
import { DIRECTORY_PAGE_SIZE, directoryPageCount, directoryRoute, readDirectoryPage } from '../lib/directoryPagination.js';
import '../styles/focused-v3.css';

const STUDENT_SECTIONS = Object.freeze([
  { id: 'directory', label: 'Student directory', description: 'Search, segment, and export', icon: Icons.cohort },
  { id: 'enrollment', label: 'Enrollment', description: 'Movement and placement', icon: Icons.trend },
  { id: 'families', label: 'Families & guardians', description: 'Connected family records', icon: Icons.user },
  { id: 'birthdays', label: 'Upcoming birthdays', description: 'Care and recognition', icon: Icons.cal },
]);

const DETAIL_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Overview', icon: Icons.home },
  { id: 'enrollment', label: 'Enrollment', icon: Icons.cohort },
  { id: 'learning', label: 'Learning', icon: Icons.doc },
  { id: 'attendance', label: 'Attendance', icon: Icons.check },
  { id: 'finance', label: 'Finance', icon: Icons.trend },
  { id: 'family', label: 'Family & safety', icon: Icons.shield },
  { id: 'timeline', label: 'Timeline', icon: Icons.cal },
]);

const COLORS = ['var(--sf-primary)', 'var(--sf-success)', 'var(--sf-accent)', 'var(--sf-warn)', '#7389b6', '#9a82ba'];
const STUDENT_STATUS_FILTERS = Object.freeze(['lead', 'application', 'accepted', 'enrolled', 'active', 'graduated', 'withdrawn']);
const STUDENT_ORDERING_FILTERS = Object.freeze(['student_id', 'enrollment_date', '-enrollment_date']);

function cleanId(value) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value.id : value;
  return /^\d{1,20}$/.test(String(candidate ?? '')) ? String(candidate) : null;
}

function finite(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^[+]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function finiteCount(value) {
  const parsed = finite(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function displayCount(value) {
  const parsed = finiteCount(value);
  return parsed === null ? '\u2014' : formatBusinessNumber(parsed);
}

function humanLabel(value, fallback = '\u2014') {
  const normalized = String(value || '').trim().replaceAll('_', ' ');
  return normalized
    ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function readable(state) {
  return Boolean(state && !state.error && !state.paused && state.data != null);
}

function completeSum(rows, getter) {
  let total = 0;
  for (const row of rows) {
    const value = finite(typeof getter === 'function' ? getter(row) : row?.[getter]);
    if (value === null) return null;
    total += value;
  }
  return total;
}

function money(value) {
  const parsed = finite(value);
  return parsed === null ? '\u2014' : formatBusinessMoney(parsed, 'UZS') || '\u2014';
}

function fraction(value) {
  const parsed = finite(value);
  return parsed !== null && parsed <= 1 ? parsed : null;
}

function leadershipMoney(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '\u2014';
  const currency = String(value.currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return '\u2014';
  const decimalMajor = typeof value.amount_uzs === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.amount_uzs.trim())
    ? value.amount_uzs.trim()
    : null;
  if (decimalMajor !== null) return formatBusinessMoney(decimalMajor, currency) || '\u2014';
  const rawMinor = typeof value.amount_minor === 'string' ? value.amount_minor.trim() : value.amount_minor;
  if ((typeof rawMinor !== 'number' && typeof rawMinor !== 'string') ||
      (typeof rawMinor === 'string' && !/^[+-]?\d+$/.test(rawMinor))) return '\u2014';
  const minor = Number(rawMinor);
  return Number.isSafeInteger(minor)
    ? formatBusinessMoney(String(minor / 100), currency) || '\u2014'
    : '\u2014';
}

function leadershipProfileFor(value, studentId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identityId = cleanId(value.identity?.id);
  return identityId && identityId === cleanId(studentId) ? value : null;
}

function leadershipIdentity(profile) {
  if (!profile) return null;
  const identity = profile.identity;
  const group = identity.current_group;
  const block = identity.block || {};
  const safeguarding = profile.family?.safeguarding;
  return {
    ...identity,
    student_id: identity.public_student_id,
    branch: identity.branch?.id,
    branch_name: identity.branch?.name,
    current_cohort: group?.id ?? null,
    current_cohort_name: group?.name || '',
    academic_level: identity.academic_level || group?.level || '',
    is_blocked: block.is_blocked === true,
    blocked_at: block.blocked_at,
    block_reason: block.reason,
    medical_notes: safeguarding?.medical_notes,
    emergency_contacts: safeguarding?.emergency_contacts || [],
    created_at: profile.record_metadata?.created_at,
    updated_at: profile.record_metadata?.updated_at,
  };
}

function ageFrom(value) {
  if (!isValidDateInput(value)) return null;
  const birth = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const [year, month, day] = organizationDateInput().split('-').map(Number);
  let age = year - birth.getUTCFullYear();
  if (month - 1 < birth.getUTCMonth() || (month - 1 === birth.getUTCMonth() && day < birth.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function invoiceBalance(invoice) {
  const supplied = finite(invoice?.outstanding_uzs);
  if (supplied !== null) return Math.max(0, supplied);
  const total = finite(invoice?.total_uzs);
  const allocated = Array.isArray(invoice?.allocations)
    ? completeSum(invoice.allocations, (row) => row?.amount_uzs ?? row?.amount)
    : null;
  if (total === null || allocated === null) return null;
  if (allocated > total) return null;
  return total - allocated;
}

function boundedTextParam(routeParams, key, maxLength) {
  return String(routeParams.get(key) || '').trim().slice(0, maxLength);
}

function choiceParam(routeParams, key, choices) {
  const value = String(routeParams.get(key) || '');
  return choices.includes(value) ? value : '';
}

function idParam(routeParams, key) {
  const value = String(routeParams.get(key) || '');
  return /^\d{1,20}$/.test(value) ? value : '';
}

function dateParam(routeParams, key) {
  const value = String(routeParams.get(key) || '');
  return isValidDateInput(value) ? value : '';
}

function ageParam(routeParams, key) {
  const value = String(routeParams.get(key) || '');
  return /^(?:0|[1-9]\d?|1[01]\d|120)$/.test(value) ? value : '';
}

function paramsFrom(routeParams) {
  return {
    q: boundedTextParam(routeParams, 'q', 120),
    status: choiceParam(routeParams, 'status', STUDENT_STATUS_FILTERS),
    branch: idParam(routeParams, 'branch'),
    cohort: idParam(routeParams, 'cohort'),
    group: choiceParam(routeParams, 'group', ['none', 'assigned']),
    level: boundedTextParam(routeParams, 'level', 80),
    gender: choiceParam(routeParams, 'gender', ['f', 'm']),
    location: boundedTextParam(routeParams, 'location', 160),
    blocked: choiceParam(routeParams, 'blocked', ['true', 'false']),
    teacher: idParam(routeParams, 'teacher'),
    joined_after: dateParam(routeParams, 'joined_after'),
    joined_before: dateParam(routeParams, 'joined_before'),
    age_min: ageParam(routeParams, 'age_min'),
    age_max: ageParam(routeParams, 'age_max'),
    ordering: choiceParam(routeParams, 'ordering', STUDENT_ORDERING_FILTERS),
  };
}

function listParams(filters, branchId, page) {
  return {
    page_size: DIRECTORY_PAGE_SIZE,
    page,
    search: filters.q || undefined,
    status: filters.status || undefined,
    branch: branchId || filters.branch || undefined,
    cohort: filters.cohort || undefined,
    has_cohort: filters.group === 'none' ? false : filters.group === 'assigned' ? true : undefined,
    level: filters.level || undefined,
    gender: filters.gender || undefined,
    location: filters.location || undefined,
    blocked: filters.blocked || undefined,
    teacher: filters.teacher || undefined,
    joined_after: filters.joined_after || undefined,
    joined_before: filters.joined_before || undefined,
    age_min: filters.age_min || undefined,
    age_max: filters.age_max || undefined,
    ordering: filters.ordering || undefined,
  };
}

function setRouteFilter(filters, key, value, basePath, onNav, options) {
  onNav(directoryRoute(basePath, { ...filters, [key]: value }), { scroll: false, ...options });
}

function contextualPath(branchId, section, id, tail = 'overview') {
  return branchId ? `branches/${branchId}/${section}/${id}/${tail}` : `${section}/${id}/${tail}`;
}

function StudentDirectoryCard({ student, cohort, onNav, branchId, access }) {
  const status = studentStatusPresentation(student.status);
  const studentId = cleanId(student.id);
  const studentBranchId = cleanId(student.branch);
  const cohortId = cleanId(student.current_cohort);
  const teacherId = cleanId(cohort?.primary_teacher);
  const recordPath = studentId ? contextualPath(branchId, 'students', studentId) : null;
  const groupPath = cohortId ? contextualPath(branchId, 'groups', cohortId) : null;
  const teacherPath = teacherId ? contextualPath(branchId, 'teachers', teacherId) : null;
  const initials = String(student.full_name || student.username || 'Student').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
  return (
    <article className="fw-person-card is-student">
      <header>
        <span className="fw-person-avatar" aria-hidden="true">{initials}</span>
        <div>
          {recordPath ? <RouteLink className="fw-person-name" to={recordPath} onNav={onNav}>{student.full_name || 'Unnamed student'}</RouteLink> : <strong className="fw-person-name">{student.full_name || 'Unnamed student'}</strong>}
          <small>{[student.student_id, student.academic_level].filter(Boolean).join(' · ') || 'Student record'}</small>
        </div>
        <StatusPill value={status.label} tone={status.tone} />
      </header>
      <dl className="fw-person-facts">
        <div><dt>Branch</dt><dd>{access.branches && studentBranchId ? <RouteLink to={`branches/${studentBranchId}/overview`} onNav={onNav}>{student.branch_name || `Branch ${studentBranchId}`}</RouteLink> : student.branch_name || 'Not recorded'}</dd></div>
        <div><dt>Group</dt><dd>{access.groups && groupPath ? <RouteLink to={groupPath} onNav={onNav}>{student.current_cohort_name || `Group ${cohortId}`}</RouteLink> : student.current_cohort_name || 'Awaiting placement'}</dd></div>
        <div><dt>Main teacher</dt><dd>{access.teachers && teacherPath
          ? <RouteLink to={teacherPath} onNav={onNav}>{cohort.primary_teacher_name || `Teacher ${teacherId}`}</RouteLink>
          : cohort?.primary_teacher_name || (cohort ? 'Not assigned' : access.relationshipsComplete ? 'Not assigned' : 'Not available in loaded view')}</dd></div>
        <div><dt>Joined</dt><dd>{formatOrganizationDate(student.enrollment_date, { dateOnly: true }) || 'Not recorded'}</dd></div>
      </dl>
      <footer>
        <span>{student.location || student.phone || student.username || 'Contact not recorded'}</span>
        {student.is_blocked && <StatusPill value="Needs enrollment review" tone="danger" />}
        {recordPath && <RouteLink className="fw-card-open" to={recordPath} onNav={onNav} aria-label={`Open ${student.full_name || 'student'} record`}>Open record {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}
      </footer>
    </article>
  );
}

function StudentDirectory({ route, onNav, branchId, user }) {
  const routed = workspaceRoute(route);
  const filters = paramsFrom(routed.params);
  const page = readDirectoryPage(routed.params);
  const basePath = branchId ? `branches/${branchId}/students` : 'students/directory';
  const canViewBranches = canUseCapability(user, 'org:read');
  const canViewGroups = canUseCapability(user, 'cohorts:read');
  const canViewTeachers = canUseCapability(user, 'teachers:read');
  const students = useWorkspaceData('/api/v1/students/', listParams(filters, branchId, page));
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canViewBranches && !branchId });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: branchId || filters.branch || undefined }, { enabled: canViewGroups });
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: 100, branch: branchId || filters.branch || undefined }, { enabled: canViewTeachers });
  const activeCount = Object.values(filters).filter(Boolean).length;
  const advancedCount = ['teacher', 'level', 'gender', 'location', 'blocked', 'joined_after', 'joined_before', 'age_min', 'age_max', 'ordering']
    .filter((key) => Boolean(filters[key])).length;
  const levels = [...new Set(students.rows.map((student) => student.academic_level).filter(Boolean))].sort();
  const locations = [...new Set(students.rows.map((student) => student.location).filter(Boolean))].sort();
  const cohortById = new Map(cohorts.rows.map((cohort) => [cleanId(cohort.id), cohort]).filter(([cohortId]) => cohortId));
  const clear = () => onNav(basePath, { scroll: false });
  const pages = directoryPageCount(students);
  const correctingPage = !students.pending && !students.error && !students.paused && page > pages;
  const lastPageRoute = directoryRoute(basePath, filters, pages);

  useEffect(() => {
    if (correctingPage) onNav(lastPageRoute, { replace: true, scroll: false });
  }, [correctingPage, lastPageRoute, onNav]);

  const exportRows = () => downloadSpreadsheet(
    `students-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      { key: 'student_id', label: 'Student ID' }, { key: 'full_name', label: 'Student' },
      { key: 'username', label: 'Username' }, { label: 'Status', value: (row) => studentStatusPresentation(row.status).label },
      { key: 'branch_name', label: 'Branch' }, { key: 'current_cohort_name', label: 'Group' },
      { key: 'academic_level', label: 'Level' }, { key: 'enrollment_date', label: 'Enrollment date' },
      { key: 'birthdate', label: 'Birthdate' }, { key: 'gender', label: 'Gender' },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'location', label: 'Recorded location' }, { key: 'previous_school', label: 'Previous school' },
      { key: 'is_blocked', label: 'On hold' }, { key: 'block_reason', label: 'Hold reason' },
    ],
    students.rows,
  );

  return (
    <>
      <ProgressiveFilters
        title="Find students"
        advancedActiveCount={advancedCount}
        actions={<><ActionButton tone="ghost" onClick={clear} disabled={!activeCount}>Clear all</ActionButton><ActionButton onClick={exportRows} disabled={correctingPage || !students.rows.length} title={`Downloads the ${students.rows.length} loaded students on this page only`}>{cloneElement(Icons.doc, { size: 14 })} Download this page</ActionButton></>}
        primary={<>
          <FilterField label="Search"><DeferredFilterInput type="search" maxLength={120} value={filters.q} placeholder="Name, phone, or student ID" onCommit={(value) => setRouteFilter(filters, 'q', value, basePath, onNav, { replace: true })} /></FilterField>
          {!branchId && canViewBranches && <FilterField label="Branch"><select value={filters.branch} onChange={(event) => setRouteFilter(filters, 'branch', event.target.value, basePath, onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={branches.rows} label="branch" />{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>}
          {canViewGroups && <FilterField label="Group"><select value={filters.cohort || filters.group} onChange={(event) => {
            const value = event.target.value;
            if (['none', 'assigned'].includes(value)) setRouteFilter({ ...filters, cohort: '' }, 'group', value, basePath, onNav);
            else setRouteFilter({ ...filters, group: '' }, 'cohort', value, basePath, onNav);
          }}><option value="">All groups</option><option value="none">Awaiting placement</option><option value="assigned">Placed in a group</option><UnloadedSelectionOption value={filters.cohort} options={cohorts.rows} label="group" />{cohorts.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>}
          <FilterField label="Status"><select value={filters.status} onChange={(event) => setRouteFilter(filters, 'status', event.target.value, basePath, onNav)}><option value="">All statuses</option>{STUDENT_STATUS_FILTERS.map((value) => <option value={value} key={value}>{studentStatusPresentation(value).label}</option>)}</select></FilterField>
        </>}
        advanced={<>
          {canViewTeachers && <FilterField label="Teacher"><select value={filters.teacher} onChange={(event) => setRouteFilter(filters, 'teacher', event.target.value, basePath, onNav)}><option value="">All teachers</option><UnloadedSelectionOption value={filters.teacher} options={teachers.rows} label="teacher" />{teachers.rows.map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></FilterField>}
          <FilterField label="Level"><DeferredFilterInput list="student-levels" maxLength={80} value={filters.level} placeholder="Any level" onCommit={(value) => setRouteFilter(filters, 'level', value, basePath, onNav, { replace: true })} /><datalist id="student-levels">{levels.map((level) => <option value={level} key={level} />)}</datalist></FilterField>
          <FilterField label="Recorded location"><DeferredFilterInput list="student-locations" maxLength={160} value={filters.location} placeholder="Any location" onCommit={(value) => setRouteFilter(filters, 'location', value, basePath, onNav, { replace: true })} /><datalist id="student-locations">{locations.map((location) => <option value={location} key={location} />)}</datalist></FilterField>
          <FilterField label="Gender"><select value={filters.gender} onChange={(event) => setRouteFilter(filters, 'gender', event.target.value, basePath, onNav)}><option value="">Any gender</option><option value="f">Female</option><option value="m">Male</option></select></FilterField>
          <FilterField label="Enrollment review"><select value={filters.blocked} onChange={(event) => setRouteFilter(filters, 'blocked', event.target.value, basePath, onNav)}><option value="">Any</option><option value="true">Needs review</option><option value="false">No hold</option></select></FilterField>
          <FilterField label="Joined after"><input type="date" value={filters.joined_after} max={filters.joined_before || undefined} onChange={(event) => setRouteFilter(filters, 'joined_after', event.target.value, basePath, onNav)} /></FilterField>
          <FilterField label="Joined before"><input type="date" value={filters.joined_before} min={filters.joined_after || undefined} onChange={(event) => setRouteFilter(filters, 'joined_before', event.target.value, basePath, onNav)} /></FilterField>
          <FilterField label="Minimum age"><DeferredFilterInput type="number" min="0" max="120" value={filters.age_min} onCommit={(value) => setRouteFilter(filters, 'age_min', value, basePath, onNav, { replace: true })} /></FilterField>
          <FilterField label="Maximum age"><DeferredFilterInput type="number" min="0" max="120" value={filters.age_max} onCommit={(value) => setRouteFilter(filters, 'age_max', value, basePath, onNav, { replace: true })} /></FilterField>
          <FilterField label="Sort"><select value={filters.ordering} onChange={(event) => setRouteFilter(filters, 'ordering', event.target.value, basePath, onNav)}><option value="">Recently added</option><option value="student_id">Student ID</option><option value="enrollment_date">Earliest enrollment</option><option value="-enrollment_date">Latest enrollment</option></select></FilterField>
        </>}
      />
      <CoverageBar state={correctingPage ? { ...students, pending: true, rows: [] } : students} label="students" filtered={activeCount > 0} pageLimited={pages > 1} />
      <WorkspaceState state={correctingPage ? { ...students, pending: true, rows: [] } : students} empty={!students.rows.length}>
        <div className="fw-person-grid" aria-label="Student directory">
          {students.rows.map((student, index) => <StudentDirectoryCard key={cleanId(student.id) || `student-${index}`} student={student} cohort={cohortById.get(cleanId(student.current_cohort))} onNav={onNav} branchId={branchId} access={{ branches: canViewBranches, groups: canViewGroups, teachers: canViewTeachers, relationshipsComplete: cohorts.complete }} />)}
        </div>
      </WorkspaceState>
      {!correctingPage && <WorkspacePagination label="students" page={page} pages={pages} total={students.total} loading={students.loading} onPage={(nextPage) => onNav(directoryRoute(basePath, filters, nextPage), { scroll: false })} />}
    </>
  );
}

function StudentDetail({ id, section, onNav, branchId, user }) {
  const base = branchId ? `branches/${branchId}/students/${id}` : `students/${id}`;
  const canAttendance = canUseCapability(user, 'attendance:read');
  const canAcademics = canUseCapability(user, 'academics:read');
  const canFinance = canUseCapability(user, 'finance:read');
  const canFamily = canUseCapability(user, 'parents:read');
  const canIntelligence = canUseCapability(user, 'intelligence:read');
  const canGroups = canUseCapability(user, 'cohorts:read');
  const canBranches = canUseCapability(user, 'org:read');
  const canTeachers = canUseCapability(user, 'teachers:read');
  const canSchedule = canUseCapability(user, 'schedule:read');
  const leadership = useWorkspaceData(`/api/v1/students/${id}/leadership-profile/`);
  const profile = leadershipProfileFor(leadership.data, id);
  const leadershipStatus = Number(leadership.error?.status);
  const compatibilityFallback = [404, 405, 501].includes(leadershipStatus) ||
    (!leadership.error && leadership.data == null);
  const legacyProfile = !leadership.pending && !profile && compatibilityFallback;
  const recordAccessResolved = Boolean(profile) || legacyProfile;
  const coverageAvailable = (key) => profile?.coverage?.[key]?.status === 'available';
  const viewAttendance = profile
    ? coverageAvailable('attendance') && Boolean(profile.attendance)
    : legacyProfile && canAttendance;
  const viewAcademics = profile
    ? Boolean(profile.learning) && Array.isArray(profile.learning.recent_grades)
    : legacyProfile && canAcademics;
  const viewLearning = profile
    ? coverageAvailable('learning') && Boolean(profile.learning)
    : legacyProfile && canAcademics;
  const viewFinance = profile
    ? coverageAvailable('finance') && Boolean(profile.finance)
    : legacyProfile && canFinance;
  const viewFamily = profile
    ? coverageAvailable('family') && Boolean(profile.family)
    : legacyProfile && canFamily;
  const availableSections = DETAIL_SECTIONS.filter((item) => {
    if (item.id === 'attendance') return viewAttendance;
    if (item.id === 'learning') return viewLearning || canIntelligence;
    if (item.id === 'finance') return viewFinance;
    if (item.id === 'family') return viewFamily;
    if (item.id === 'timeline') return canIntelligence;
    return true;
  });
  const active = availableSections.some((item) => item.id === section) ? section : 'overview';
  const student = useWorkspaceData(`/api/v1/students/${id}/`, undefined, { enabled: legacyProfile });
  const events = useWorkspaceData(`/api/v1/students/${id}/events/`, { page_size: 100 }, { enabled: recordAccessResolved && active === 'enrollment' });
  const journey = useWorkspaceData(`/api/v1/intelligence/journey/${id}/`, undefined, { enabled: recordAccessResolved && active === 'timeline' && canIntelligence });
  const guardians = useWorkspaceData('/api/v1/parents/guardians/', { page_size: 100, student: id }, { enabled: active === 'family' && viewFamily && legacyProfile });
  const pickups = useWorkspaceData('/api/v1/parents/pickups/', { page_size: 100, student: id }, { enabled: active === 'family' && viewFamily && legacyProfile });
  const attendance = useWorkspaceData('/api/v1/attendance/records/', { page_size: 100, student: id }, { enabled: viewAttendance && (active === 'attendance' || (active === 'overview' && legacyProfile)) });
  const grades = useWorkspaceData('/api/v1/academics/grades/', { page_size: 100, student: id }, { enabled: viewAcademics && (active === 'learning' || (active === 'overview' && legacyProfile)) });
  const invoices = useWorkspaceData('/api/v1/finance/invoices/', { page_size: 100, student: id }, { enabled: viewFinance && (active === 'finance' || (active === 'overview' && legacyProfile)) });
  const risk = useWorkspaceData(`/api/v1/intelligence/risk/${id}/`, undefined, { enabled: recordAccessResolved && active === 'learning' && canIntelligence });
  const data = profile ? leadershipIdentity(profile) : student.data;
  const profileState = profile || !legacyProfile ? leadership : student;
  const cohortId = cleanId(data?.current_cohort);
  const cohort = useWorkspaceData(cohortId ? `/api/v1/cohorts/${cohortId}/` : null, undefined, { enabled: Boolean(cohortId) && (active === 'enrollment' || (active === 'overview' && legacyProfile)) && canGroups });
  useWorkspaceTitle(data?.full_name, 'Students', active);
  const invoiceStatuses = new Set(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void']);
  const billableStatuses = new Set(['issued', 'partially_paid', 'paid', 'overdue']);
  const invoiceStatesKnown = invoices.rows.every((invoice) => invoiceStatuses.has(typeof invoice.status === 'string' ? invoice.status.trim().toLowerCase() : ''));
  const issuedInvoices = invoiceStatesKnown
    ? invoices.rows.filter((invoice) => billableStatuses.has(invoice.status.trim().toLowerCase()))
    : [];
  const invoicesAvailable = readable(invoices);
  const invoicesExact = invoicesAvailable && invoices.complete === true && invoiceStatesKnown;
  const invoiceTotal = invoicesExact ? completeSum(issuedInvoices, (invoice) => invoice.total_uzs) : null;
  const invoiceOutstanding = invoicesExact ? completeSum(issuedInvoices, invoiceBalance) : null;
  const normalizedAttendance = attendance.rows.map((row) => typeof row.status === 'string' ? row.status.trim().toLowerCase() : '');
  const attended = normalizedAttendance.filter((statusValue) => ['present', 'late'].includes(statusValue)).length;
  const counted = normalizedAttendance.filter((statusValue) => ['present', 'late', 'absent'].includes(statusValue)).length;
  const attendanceAvailable = readable(attendance);
  const gradesAvailable = readable(grades);
  const aggregateAttendance = profile?.attendance;
  const aggregateAttendanceRate = fraction(aggregateAttendance?.attendance_rate_fraction);
  const aggregateAttendanceCount = finiteCount(aggregateAttendance?.countable_sessions);
  const aggregateLearning = profile?.learning;
  const aggregateRecentGrades = Array.isArray(aggregateLearning?.recent_grades) ? aggregateLearning.recent_grades : null;
  const aggregateRecentExams = Array.isArray(aggregateLearning?.recent_exam_results) ? aggregateLearning.recent_exam_results : null;
  const aggregateFinance = profile?.finance;
  const aggregateLearningEvidence = aggregateRecentGrades === null && aggregateRecentExams === null
    ? null
    : (aggregateRecentGrades?.length || 0) + (aggregateRecentExams?.length || 0);
  const guardianRows = profile
    ? (profile.family?.guardians || []).map((guardian) => ({
        ...guardian,
        parent_name: guardian.name,
        phone: guardian.contacts?.phone,
        email: guardian.contacts?.email,
      }))
    : guardians.rows;
  const pickupRows = profile
    ? (profile.family?.pickup_authorizations || []).map((pickup) => ({
        ...pickup,
        full_name: pickup.name,
        is_active: true,
      }))
    : pickups.rows;
  const invoiceCoverageMessage = !invoicesAvailable
    ? 'Billing information is unavailable'
    : invoices.complete !== true
      ? 'Complete invoice coverage is required before this total is stated'
      : !invoiceStatesKnown
        ? 'One or more invoice lifecycle states are unavailable'
        : null;
  const status = studentStatusPresentation(data?.status);
  const aggregateTeacher = Array.isArray(aggregateLearning?.teachers) ? aggregateLearning.teachers[0] : null;
  const teacherId = cleanId(cohort.data?.primary_teacher ?? aggregateTeacher?.id);
  const teacherName = cohort.data?.primary_teacher_name || aggregateTeacher?.name;
  const studentBranchId = cleanId(data?.branch);
  const groupPath = cohortId ? contextualPath(branchId, 'groups', cohortId) : null;
  const teacherPath = teacherId ? contextualPath(branchId, 'teachers', teacherId) : null;
  const branchPath = studentBranchId ? `branches/${studentBranchId}/overview` : null;

  return (
    <WorkspaceState state={profileState} empty={!data} emptyTitle="Student not found" emptyBody="This record may be outside your leadership scope.">
      {data && <>
        <ProfileHero
          name={data.full_name}
          eyebrow="Student profile"
          meta={<><StatusPill value={status.label} tone={status.tone} />{data.student_id && <span>{data.student_id}</span>}{branchPath && canBranches && <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${studentBranchId}`}</RouteLink>}{groupPath && canGroups && <RouteLink to={groupPath} onNav={onNav}>{data.current_cohort_name || `Group ${cohortId}`}</RouteLink>}{data.is_blocked && <StatusPill value="Needs enrollment review" tone="danger" />}</>}
          actions={<><ActionButton onClick={() => window.print()}>{cloneElement(Icons.doc, { size: 14 })} Print</ActionButton><LinkButton to={branchId ? `branches/${branchId}/students` : 'students/directory'} onNav={onNav}>Back to students</LinkButton></>}
        />
        <WorkspaceTabs label="Student record" items={availableSections} active={active} basePath={base} onNav={onNav} />
        <div className="fw-record-detail">
          {active === 'overview' && <>
            <section className="fw-record-placement" aria-label="Current placement">
              <div>
                <span>Current learning placement</span>
                <h2>{groupPath && canGroups ? <RouteLink to={groupPath} onNav={onNav}>{data.current_cohort_name || `Group ${cohortId}`}</RouteLink> : data.current_cohort_name || 'Awaiting group placement'}</h2>
                <p>
                  {branchPath && canBranches ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${studentBranchId}`}</RouteLink> : data.branch_name || 'Branch not recorded'}
                  {teacherPath && canTeachers && <> <i>·</i> <RouteLink to={teacherPath} onNav={onNav}>{teacherName || `Teacher ${teacherId}`}</RouteLink></>}
                  {data.academic_level && <> <i>·</i> {data.academic_level}</>}
                </p>
              </div>
              <StatusPill value={status.label} tone={status.tone} />
            </section>
            <div className="fw-summary-grid is-record-metrics">
              {viewAttendance && <div className="fw-summary-card"><span>Visible attendance</span><strong>{profile
                ? aggregateAttendanceCount > 0 && aggregateAttendanceRate !== null
                  ? `${formatBusinessNumber(aggregateAttendanceRate * 100, { maximumFractionDigits: 1 })}%`
                  : '\u2014'
                : attendanceAvailable && counted
                  ? `${formatBusinessNumber(attended / counted * 100, { maximumFractionDigits: 1 })}%`
                  : '\u2014'}</strong><small>{profile
                ? aggregateAttendanceCount === null
                  ? 'Attendance coverage is unavailable'
                  : `${formatBusinessNumber(aggregateAttendanceCount)} non-excused outcomes in the leadership window`
                : attendanceAvailable
                  ? `${formatBusinessNumber(counted)} recognized non-excused outcomes from ${formatBusinessNumber(attendance.rows.length)} loaded`
                  : 'Attendance information is unavailable'}</small></div>}
              {viewLearning && <div className="fw-summary-card"><span>Learning records</span><strong>{profile ? displayCount(aggregateLearningEvidence) : gradesAvailable ? displayCount(grades.total) : '\u2014'}</strong><small>{profile ? aggregateLearningEvidence === null ? 'Learning evidence is outside this exact scope' : 'Recent published grades and exam results' : gradesAvailable ? 'Grade register total' : 'Learning information is unavailable'}</small></div>}
              {viewFinance && <div className="fw-summary-card"><span>Issued billing</span><strong>{profile ? leadershipMoney(aggregateFinance?.window?.billed) : invoicesExact ? money(invoiceTotal) : '\u2014'}</strong><small>{profile ? 'Permission-pruned value in the leadership window' : invoiceCoverageMessage || (invoiceTotal === null ? 'One or more invoice amounts are unavailable' : `${formatBusinessNumber(issuedInvoices.length)} issued invoices`)}</small></div>}
              {viewFinance && <div className="fw-summary-card"><span>Outstanding balance</span><strong>{profile ? leadershipMoney(aggregateFinance?.all_time?.outstanding) : invoicesExact ? money(invoiceOutstanding) : '\u2014'}</strong><small>{profile ? `${displayCount(aggregateFinance?.all_time?.open_invoice_count)} open invoices across recorded history` : !invoicesAvailable ? 'Balance information is unavailable' : invoiceCoverageMessage || (invoiceOutstanding === null ? 'One or more balances are unavailable' : 'Invoice value less verified allocations')}</small></div>}
            </div>
            {profile && <div className="fw-leadership-source" role="note">
              <span className="fw-leadership-source-icon" aria-hidden="true">{cloneElement(Icons.shield, { size: 17 })}</span>
              <span><strong>Permission-pruned leadership snapshot</strong><small>{formatOrganizationDate(profile.window?.date_from, { dateOnly: true }) || 'Window start unavailable'} through {formatOrganizationDate(profile.window?.date_to, { dateOnly: true }) || 'window end unavailable'} · {profile.window?.timezone || 'organization timezone unavailable'}</small></span>
              <StatusPill value="Exact student scope" tone="success" />
            </div>}
            <DetailSection eyebrow="Identity" title="Student and contact information">
              <DetailGrid columns={4} fields={[
                { label: 'Student ID', value: data.student_id }, { label: 'Username', value: data.username },
                { label: 'First name', value: data.first_name }, { label: 'Middle name', value: data.middle_name },
                { label: 'Last name', value: data.last_name }, { label: 'Phone', value: data.phone },
                { label: 'Email', value: data.email }, { label: 'Date of birth', value: formatOrganizationDate(data.birthdate, { dateOnly: true }) },
                { label: 'Age', value: ageFrom(data.birthdate) }, { label: 'Gender', value: formatGender(data.gender) },
                { label: 'Account active', value: data.is_active == null ? null : data.is_active ? 'Yes' : 'No' }, { label: 'Last sign-in', value: formatOrganizationDate(data.last_login_at) },
              ]} />
            </DetailSection>
            <DetailSection eyebrow="Current position" title="Enrollment at a glance">
              <DetailGrid columns={4} fields={[
                { label: 'Status', value: status.label }, { label: 'Academic level', value: data.academic_level },
                { label: 'Branch', value: branchPath && canBranches ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${studentBranchId}`}</RouteLink> : data.branch_name },
                { label: 'Group', value: groupPath && canGroups ? <RouteLink to={groupPath} onNav={onNav}>{data.current_cohort_name || `Group ${cohortId}`}</RouteLink> : data.current_cohort_name },
                { label: 'Enrollment date', value: formatOrganizationDate(data.enrollment_date, { dateOnly: true }) },
                { label: 'Recorded location', value: data.location }, { label: 'Previous school', value: data.previous_school, wide: true },
                { label: 'Created', value: formatOrganizationDate(data.created_at) }, { label: 'Last updated', value: formatOrganizationDate(data.updated_at) },
              ]} />
            </DetailSection>
          </>}
          {active === 'enrollment' && <>
            <DetailSection eyebrow="Placement" title="Enrollment and group placement">
              <DetailGrid columns={3} fields={[
                { label: 'Enrollment status', value: status.label }, { label: 'Enrollment date', value: formatOrganizationDate(data.enrollment_date, { dateOnly: true }) },
                { label: 'Academic level', value: data.academic_level }, { label: 'Branch', value: branchPath && canBranches ? <RouteLink to={branchPath} onNav={onNav}>{data.branch_name || `Branch ${studentBranchId}`}</RouteLink> : data.branch_name },
                { label: 'Current group', value: groupPath && canGroups ? <RouteLink to={groupPath} onNav={onNav}>{data.current_cohort_name || `Group ${cohortId}`}</RouteLink> : data.current_cohort_name },
                { label: 'Primary teacher', value: teacherPath && canTeachers ? <RouteLink to={teacherPath} onNav={onNav}>{teacherName || `Teacher ${teacherId}`}</RouteLink> : teacherName },
                { label: 'Group start', value: formatOrganizationDate(cohort.data?.start_date, { dateOnly: true }) },
                { label: 'Group end', value: formatOrganizationDate(cohort.data?.end_date, { dateOnly: true }) },
                { label: 'Default room', value: cohort.data?.default_room_name },
              ]} />
            </DetailSection>
            <DetailSection eyebrow="History" title="Enrollment changes"><WorkspaceTable label="Enrollment history" rows={events.rows} columns={[
              { key: 'created_at', label: 'When', render: (row) => formatOrganizationDate(row.created_at) },
              { key: 'from_status', label: 'From', render: (row) => row.from_status ? <StudentStatus value={row.from_status} /> : <StatusPill value="New record" /> },
              { key: 'to_status', label: 'To', render: (row) => <StudentStatus value={row.to_status} /> },
              { key: 'reason_code', label: 'Reason', render: (row) => humanLabel(row.reason_code) }, { key: 'note', label: 'Note' },
            ]} /></DetailSection>
          </>}
          {active === 'learning' && <>
            {aggregateLearning && <DetailSection eyebrow="Leadership snapshot" title="Current learning position" description="Bounded recent evidence from the same permission-pruned student snapshot."><DetailGrid columns={4} fields={[
              { label: 'Teachers', value: Array.isArray(aggregateLearning.teachers) ? aggregateLearning.teachers.map((teacher) => teacher.name).join(', ') : null, wide: true },
              { label: 'Subjects', value: (aggregateLearning.subjects || []).map((subject) => subject.name).join(', '), wide: true },
              { label: 'Open assignments', value: finiteCount(aggregateLearning.assignments?.open) },
              { label: 'Late assignments', value: finiteCount(aggregateLearning.assignments?.late) },
              { label: 'Recent grades', value: aggregateRecentGrades?.length },
              { label: 'Recent exam results', value: aggregateRecentExams?.length },
              { label: 'Latest transcript', value: humanLabel(aggregateLearning.latest_transcript?.status, 'Not available') },
            ]} /></DetailSection>}
            {aggregateRecentExams && <DetailSection eyebrow="Assessments" title="Recent published exam results"><WorkspaceTable label="Recent exam results" rows={aggregateRecentExams} columns={[
              { key: 'exam', label: 'Exam', render: (row) => cleanId(row.exam?.id) ? <RouteLink to={`exams/exams/${cleanId(row.exam.id)}`} onNav={onNav}>{row.exam.title || `Exam ${cleanId(row.exam.id)}`}</RouteLink> : row.exam?.title },
              { key: 'subject', label: 'Subject', render: (row) => row.subject?.name },
              { key: 'score', label: 'Score', render: (row) => `${row.score} / ${row.maximum}` },
              { key: 'score_fraction', label: 'Result', render: (row) => fraction(row.score_fraction) === null ? '\u2014' : `${formatBusinessNumber(fraction(row.score_fraction) * 100, { maximumFractionDigits: 1 })}%` },
              { key: 'last_graded_at', label: 'Graded', render: (row) => formatOrganizationDate(row.last_graded_at) },
            ]} /></DetailSection>}
            {viewAcademics && <DetailSection eyebrow="Results" title="Academic grade records"><CoverageBar state={grades} label="grades" /><WorkspaceTable label="Grade records" rows={grades.rows} columns={[
              { key: 'subject_name', label: 'Subject', render: (row) => cleanId(row.subject) ? <RouteLink to={`academics/subjects/${cleanId(row.subject)}`} onNav={onNav}>{row.subject_name || `Subject ${cleanId(row.subject)}`}</RouteLink> : row.subject_name },
              { key: 'term', label: 'Term reference', render: (row) => cleanId(row.term) ? <RouteLink to={`academics/terms/${cleanId(row.term)}`} onNav={onNav}>Term {cleanId(row.term)}</RouteLink> : '\u2014' },
              { key: 'value_raw', label: 'Recorded value' }, { key: 'value_display', label: 'Grade' },
              { key: 'computed_at', label: 'Recorded', render: (row) => formatOrganizationDate(row.computed_at) },
            ]} /></DetailSection>}
            {canIntelligence && <DetailSection eyebrow="Signal" title="Explainable attention context"><DetailGrid columns={3} fields={[
              { label: 'Risk level', value: risk.data?.level }, { label: 'Risk score', value: risk.data?.score },
              { label: 'Signals', value: (risk.data?.flags || []).map((flag) => flag.reason || flag.code).join('; '), wide: true },
            ]} /></DetailSection>}
          </>}
          {active === 'attendance' && <>{aggregateAttendance && <div className="fw-summary-grid is-record-metrics">
            <div className="fw-summary-card"><span>Attendance rate</span><strong>{aggregateAttendanceCount > 0 && aggregateAttendanceRate !== null ? `${formatBusinessNumber(aggregateAttendanceRate * 100, { maximumFractionDigits: 1 })}%` : '\u2014'}</strong><small>{aggregateAttendance.metric_definition || 'Metric definition unavailable'}</small></div>
            <div className="fw-summary-card"><span>Present</span><strong>{displayCount(aggregateAttendance.present)}</strong><small>Recorded in the leadership window</small></div>
            <div className="fw-summary-card"><span>Late</span><strong>{displayCount(aggregateAttendance.late)}</strong><small>Included as attended</small></div>
            <div className="fw-summary-card"><span>Absent</span><strong>{displayCount(aggregateAttendance.absent)}</strong><small>{displayCount(aggregateAttendance.excused)} excused outcomes excluded</small></div>
          </div>}<DetailSection eyebrow="Read-only" title="Attendance record" description="Leadership can review patterns but cannot alter teacher marks here."><CoverageBar state={attendance} label="marks" /><WorkspaceTable label="Attendance marks" rows={attendance.rows} columns={[
            { key: 'lesson_starts_at', label: 'Lesson date', render: (row) => formatOrganizationDate(row.lesson_starts_at || row.lesson_start || row.marked_at) },
            { key: 'lesson_title', label: 'Lesson', render: (row) => cleanId(row.lesson) && canSchedule ? <RouteLink to={`schedule/lessons/${cleanId(row.lesson)}`} onNav={onNav}>{row.lesson_title || `Lesson ${cleanId(row.lesson)}`}</RouteLink> : row.lesson_title },
            { key: 'cohort_name', label: 'Group', render: (row) => cleanId(row.cohort) && canGroups ? <RouteLink to={contextualPath(branchId, 'groups', cleanId(row.cohort))} onNav={onNav}>{row.cohort_name || `Group ${cleanId(row.cohort)}`}</RouteLink> : row.cohort_name },
            { key: 'teacher_name', label: 'Teacher', render: (row) => cleanId(row.teacher) && canTeachers ? <RouteLink to={contextualPath(branchId, 'teachers', cleanId(row.teacher))} onNav={onNav}>{row.teacher_name || `Teacher ${cleanId(row.teacher)}`}</RouteLink> : row.teacher_name },
            { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
            { key: 'note', label: 'Note' },
          ]} /></DetailSection></>}
          {active === 'finance' && <>{aggregateFinance && <div className="fw-summary-grid is-record-metrics">
            <div className="fw-summary-card"><span>Billed in window</span><strong>{leadershipMoney(aggregateFinance.window?.billed)}</strong><small>Issued billing in the bounded snapshot</small></div>
            <div className="fw-summary-card"><span>Collected in window</span><strong>{leadershipMoney(aggregateFinance.window?.collected)}</strong><small>Verified allocations in the bounded snapshot</small></div>
            <div className="fw-summary-card"><span>All-time outstanding</span><strong>{leadershipMoney(aggregateFinance.all_time?.outstanding)}</strong><small>{displayCount(aggregateFinance.all_time?.open_invoice_count)} open invoices</small></div>
            <div className="fw-summary-card"><span>All-time overdue</span><strong>{leadershipMoney(aggregateFinance.all_time?.overdue)}</strong><small>{displayCount(aggregateFinance.all_time?.overdue_invoice_count)} overdue invoices</small></div>
          </div>}<DetailSection eyebrow="Finance" title="Invoices connected to this student"><CoverageBar state={invoices} label="invoices" /><WorkspaceTable label="Student invoices" rows={invoices.rows} columns={[
            { key: 'number', label: 'Invoice', render: (row) => cleanId(row.id) ? <RouteLink to={`finance/invoices/${cleanId(row.id)}`} onNav={onNav}>{row.number || `Invoice ${cleanId(row.id)}`}</RouteLink> : row.number },
            { key: 'period', label: 'Period' }, { key: 'cohort_name', label: 'Group', render: (row) => cleanId(row.cohort) && canGroups ? <RouteLink to={contextualPath(branchId, 'groups', cleanId(row.cohort))} onNav={onNav}>{row.cohort_name || `Group ${cleanId(row.cohort)}`}</RouteLink> : row.cohort_name },
            { key: 'total_uzs', label: 'Total', render: (row) => money(row.total_uzs) },
            { key: 'outstanding_uzs', label: 'Balance', render: (row) => money(invoiceBalance(row)) },
            { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
            { key: 'due_date', label: 'Due', render: (row) => formatOrganizationDate(row.due_date, { dateOnly: true }) },
          ]} /></DetailSection></>}
          {active === 'family' && <>
            <DetailSection eyebrow="Family network" title="Guardians"><WorkspaceTable label="Guardians" rows={guardianRows} columns={[
              { key: 'parent_name', label: 'Parent or guardian', render: (row) => cleanId(row.parent) ? <RouteLink to={`people/parents/${cleanId(row.parent)}`} onNav={onNav}>{row.parent_name || `Guardian ${cleanId(row.parent)}`}</RouteLink> : row.parent_name }, { key: 'relationship', label: 'Relationship' },
              { key: 'is_primary', label: 'Primary', render: (row) => row.is_primary ? 'Yes' : 'No' }, { key: 'custody_notes', label: 'Care notes' },
            ]} /></DetailSection>
            <DetailSection eyebrow="Safeguarding" title="Pickup permissions"><WorkspaceTable label="Pickup permissions" rows={pickupRows} columns={[
              { key: 'full_name', label: 'Authorized person' }, { key: 'relationship', label: 'Relationship' },
              { key: 'phone', label: 'Phone' }, { key: 'is_active', label: 'Active', render: (row) => row.is_active ? 'Yes' : 'No' },
            ]} /></DetailSection>
            {profile?.warnings?.some((warning) => warning.affected_sections?.includes('family')) && <div className="fw-data-note">Family contact verification is not recorded by the current service. Contact values are shown as recorded, not as verified.</div>}
            <DetailSection eyebrow="Care context" title="Emergency and support information"><DetailGrid columns={2} fields={[
              { label: 'Enrollment hold', value: data.is_blocked ? 'Yes' : 'No' }, { label: 'Hold placed', value: formatOrganizationDate(data.blocked_at) },
              { label: 'Hold reason', value: data.block_reason, wide: true },
              { label: 'Emergency contacts', value: (data.emergency_contacts || []).map((contact) => [contact.name, contact.relationship, contact.phone].filter(Boolean).join(' · ')).join('; '), wide: true },
              ...(data.medical_notes ? [{ label: 'Health and support notes', value: data.medical_notes, wide: true }] : []),
            ]} /></DetailSection>
          </>}
          {active === 'timeline' && <DetailSection eyebrow="Connected activity" title="Student journey"><WorkspaceTable label="Student journey" rows={journey.data?.events || journey.rows} columns={[
            { key: 'at', label: 'When', render: (row) => formatOrganizationDate(row.at) }, { key: 'type', label: 'Type', render: (row) => <StatusPill value={row.type} /> },
            { key: 'title', label: 'Event' }, { key: 'detail', label: 'Detail' },
          ]} /></DetailSection>}
        </div>
      </>}
    </WorkspaceState>
  );
}

function EnrollmentView({ onNav }) {
  const stats = useWorkspaceData('/api/v1/students/stats/');
  const comparison = useWorkspaceData('/api/v1/students/comparison/', { metric: 'joined', unit: 'month' });
  const statsReady = readable(stats) && stats.data && typeof stats.data === 'object' && !Array.isArray(stats.data);
  const totalStudents = statsReady ? finiteCount(stats.data.total) : null;
  const placedStudents = statsReady ? finiteCount(stats.data.with_cohort) : null;
  const awaitingStudents = statsReady ? finiteCount(stats.data.without_cohort) : null;
  const blockedStudents = statsReady ? finiteCount(stats.data.blocked) : null;
  const statusRecord = statsReady && stats.data.by_status && typeof stats.data.by_status === 'object' && !Array.isArray(stats.data.by_status)
    ? stats.data.by_status
    : null;
  const statusEntries = statusRecord ? Object.entries(statusRecord).map(([label, value]) => [label, finiteCount(value)]) : [];
  const statusCountsValid = statusRecord !== null && statusEntries.every(([, value]) => value !== null);
  const statusCountTotal = statusCountsValid ? statusEntries.reduce((sum, [, value]) => sum + value, 0) : null;
  const mix = statusCountsValid && totalStudents !== null && statusCountTotal === totalStudents
    ? statusEntries.map(([label, value], index) => ({ label: studentStatusPresentation(label).label, value, color: COLORS[index % COLORS.length] }))
    : [];
  const branchRecord = statsReady && stats.data.by_branch && typeof stats.data.by_branch === 'object' && !Array.isArray(stats.data.by_branch)
    ? stats.data.by_branch
    : null;
  const branches = branchRecord ? Object.entries(branchRecord)
    .map(([label, value]) => ({ label, value: finiteCount(value) }))
    .filter((item) => item.value !== null) : [];
  const movement = readable(comparison) ? [
    { label: 'Current month', value: finiteCount(comparison.data?.current) },
    { label: 'Previous month', value: finiteCount(comparison.data?.previous) },
  ] : [];
  return <div className="fw-analytics-grid">
    <div className="fw-summary-grid is-full">
      <div className="fw-summary-card"><span>Total students</span><strong>{displayCount(totalStudents)}</strong><small>{statsReady ? 'Organization-wide snapshot' : 'Enrollment snapshot unavailable'}</small></div>
      <div className="fw-summary-card"><span>Placed in groups</span><strong>{displayCount(placedStudents)}</strong><small>{statsReady ? 'Current group assigned' : 'Placement snapshot unavailable'}</small></div>
      <div className="fw-summary-card"><span>Awaiting group</span><strong>{displayCount(awaitingStudents)}</strong><small>{awaitingStudents === null ? 'Placement snapshot unavailable' : <RouteLink to="students/directory?group=none" onNav={onNav}>Review students</RouteLink>}</small></div>
      <div className="fw-summary-card"><span>Enrollment holds</span><strong>{displayCount(blockedStudents)}</strong><small>{blockedStudents === null ? 'Hold snapshot unavailable' : <RouteLink to="students/directory?blocked=true" onNav={onNav}>Review holds</RouteLink>}</small></div>
    </div>
    <ChartCard eyebrow="Enrollment status" title="Current student mix" description={mix.length || totalStudents === 0 ? 'Organization-wide snapshot; status counts reconcile to the recorded total.' : 'Status mix is withheld because its counts do not reconcile to a verified total.'}><DonutBreakdown data={mix} centerValue={displayCount(totalStudents)} centerLabel="students" /></ChartCard>
    <ChartCard eyebrow="Branches" title="Students by branch" description="Current valid student counts by recorded branch; students without a recorded branch are not assigned here."><RankedBars data={branches} /></ChartCard>
    <ChartCard eyebrow="Movement" title="Month-over-month joins" description="One current and previous calendar window from enrollment records."><RankedBars data={[
      ...movement,
    ]} /></ChartCard>
  </div>;
}

function FamilyView() {
  const parents = useWorkspaceData('/api/v1/parents/', { page_size: 100 });
  const guardians = useWorkspaceData('/api/v1/parents/guardians/', { page_size: 100 });
  return <><div className="fw-summary-grid"><div className="fw-summary-card"><span>Parent records</span><strong>{readable(parents) ? displayCount(parents.total) : '\u2014'}</strong><small>{readable(parents) ? 'Visible register total' : 'Parent register unavailable'}</small></div><div className="fw-summary-card"><span>Guardian links</span><strong>{readable(guardians) ? displayCount(guardians.total) : '\u2014'}</strong><small>{readable(guardians) ? 'Visible relationship total' : 'Guardian register unavailable'}</small></div></div><DetailSection eyebrow="Family directory" title="Parents and guardians"><CoverageBar state={parents} label="parents" /><WorkspaceTable label="Parents" rows={parents.rows} columns={[
    { key: 'full_name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
    { key: 'workplace', label: 'Workplace' }, { key: 'is_active', label: 'Active', render: (row) => row.is_active ? 'Yes' : 'No' },
  ]} /></DetailSection></>;
}

function BirthdayView() {
  const birthdays = useWorkspaceData('/api/v1/students/birthdays/', { page_size: 100, days: 60 });
  return <DetailSection eyebrow="Next 60 days" title="Upcoming student birthdays" description="A concise care view; contact details remain access controlled."><CoverageBar state={birthdays} label="birthdays" /><WorkspaceTable label="Upcoming birthdays" rows={birthdays.rows} columns={[
    { key: 'full_name', label: 'Student' }, { key: 'birthdate', label: 'Birthday', render: (row) => formatOrganizationDate(row.birthdate, { dateOnly: true }) },
    { key: 'current_cohort_name', label: 'Group' }, { key: 'branch_name', label: 'Branch' }, { key: 'status', label: 'Status', render: (row) => <StudentStatus value={row.status} /> },
  ]} /></DetailSection>;
}

export function StudentsPage({ route, onNav, branchId, user }) {
  const routed = workspaceRoute(route);
  const relative = branchId ? routed.segments.slice(3) : routed.segments.slice(1);
  const legacyDetail = relative[0] === 'directory' ? cleanId(relative[1]) : null;
  const directDetail = cleanId(relative[0]);
  const detailId = legacyDetail || directDetail;
  const detailSection = legacyDetail ? relative[2] : relative[1];
  if (detailId) return <div className="fw-page"><StudentDetail id={detailId} section={detailSection || 'overview'} onNav={onNav} branchId={branchId} user={user} /></div>;

  const availableSections = STUDENT_SECTIONS.filter((item) => item.id !== 'families' || canUseCapability(user, 'parents:read'));
  const section = availableSections.some((item) => item.id === relative[0]) ? relative[0] : 'directory';
  const basePath = branchId ? `branches/${branchId}/students` : 'students';
  return (
    <div className="fw-page">
      {!branchId && <WorkspaceHeader eyebrow="People" title="Students" description="Search the student portfolio, apply decision-ready filters, and open every learning, family, attendance, or finance section permitted for your role." actions={<LinkButton to="students/directory?group=none" onNav={onNav} icon={Icons.flag}>Unassigned students</LinkButton>} />}
      {!branchId && <WorkspaceTabs label="Students" items={availableSections} active={section} basePath={basePath} onNav={onNav} />}
      <div className="fw-layout-content">
        {section === 'directory' && <StudentDirectory route={route} onNav={onNav} branchId={branchId} user={user} />}
        {section === 'enrollment' && <EnrollmentView onNav={onNav} />}
        {section === 'families' && <FamilyView />}
        {section === 'birthdays' && <BirthdayView />}
      </div>
    </div>
  );
}
