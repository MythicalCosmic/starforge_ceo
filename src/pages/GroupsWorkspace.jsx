import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from '../components/Icons.jsx';
import { EmptyState, Skeleton } from '../components/feedback.jsx';
import { SfAvatar } from '../components/primitives.jsx';
import { ApplicationUnavailableState } from '../components/AvailabilityState.jsx';
import { WorkspacePagination } from '../components/WorkspacePrimitives.jsx';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useOptionalToast, useToast } from '../context/ToastContext.jsx';
import {
  downloadSpreadsheet,
  useWorkspaceData,
  workspaceRoute,
} from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatOrganizationDate,
  formatOrganizationTime,
  organizationDateInput,
} from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import { isServiceUnavailable } from '../lib/appAvailability.js';
import '../styles/focused-v3.css';
import '../styles/groups-v3.css';

const PAGE_SIZE = 100;
const DETAIL_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Overview', description: 'Position and teaching team', icon: Icons.home },
  { id: 'settings', label: 'Group settings', description: 'Details, teachers, and membership', icon: Icons.settings },
  { id: 'students', label: 'Students', description: 'Current and past members', icon: Icons.cohort },
  { id: 'attendance', label: 'Attendance', description: 'Read-only monthly record', icon: Icons.check },
  { id: 'schedule', label: 'Schedule', description: 'Lessons, room, and teacher', icon: Icons.cal },
  { id: 'learning', label: 'Learning', description: 'Assignments and homework', icon: Icons.folder },
  { id: 'exams', label: 'Exams', description: 'Assessment plans', icon: Icons.doc },
  { id: 'finance', label: 'Finance', description: 'Invoices and allocations', icon: Icons.trend },
]);
const ATTENDANCE_LABELS = Object.freeze({
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
});
const ATTENDANCE_SHORT = Object.freeze({ present: 'P', absent: 'A', late: 'L', excused: 'E' });
const WEEKDAYS = Object.freeze([
  { value: 'MO', label: 'Monday' },
  { value: 'TU', label: 'Tuesday' },
  { value: 'WE', label: 'Wednesday' },
  { value: 'TH', label: 'Thursday' },
  { value: 'FR', label: 'Friday' },
  { value: 'SA', label: 'Saturday' },
  { value: 'SU', label: 'Sunday' },
]);
const DEFAULT_WEEKLY_SLOTS = Object.freeze([
  { id: 'monday', day: 'MO', start_time: '09:00', end_time: '10:30' },
  { id: 'wednesday', day: 'WE', start_time: '09:00', end_time: '10:30' },
  { id: 'friday', day: 'FR', start_time: '09:00', end_time: '10:30' },
]);

function text(value, fallback = 'Not recorded') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function finite(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCount(value) {
  const number = finite(value);
  return number != null && Number.isInteger(number) && number >= 0 ? number : null;
}

function boundedPercent(value) {
  const number = finite(value);
  return number != null && number >= 0 && number <= 100 ? number : null;
}

function completeTotalOf(rows, value) {
  let total = 0;
  for (const row of rows) {
    const amount = finite(typeof value === 'function' ? value(row) : row?.[value]);
    if (amount == null || amount < 0) return null;
    total += amount;
  }
  return total;
}

function declaredCollectionTotal(state) {
  const payload = state?.data;
  const candidates = [];
  if (state?.pagination && Object.prototype.hasOwnProperty.call(state.pagination, 'total')) candidates.push(state.pagination.total);
  if (payload && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'count')) candidates.push(payload.count);
  if (payload && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'total')) candidates.push(payload.total);
  if (!candidates.length) return null;
  const counts = candidates.map(validCount);
  if (counts.some((count) => count == null) || new Set(counts).size !== 1) return null;
  return counts[0];
}

function collectionComplete(state) {
  if (!state?.complete) return false;
  const payload = state.data;
  const hasDeclaration = Boolean(
    (state.pagination && Object.prototype.hasOwnProperty.call(state.pagination, 'total'))
    || (payload && !Array.isArray(payload) && (
      Object.prototype.hasOwnProperty.call(payload, 'count')
      || Object.prototype.hasOwnProperty.call(payload, 'total')
    )),
  );
  if (!hasDeclaration) return true;
  const total = declaredCollectionTotal(state);
  return total != null && total >= state.rows.length;
}

function percent(value) {
  const number = finite(value);
  return number == null ? '—' : `${formatBusinessNumber(number, { maximumFractionDigits: 1 })}%`;
}

function money(value) {
  const amount = finite(value);
  return amount == null || amount < 0 ? '—' : formatBusinessMoney(amount, 'UZS') || '—';
}

function dateOnly(value) {
  return value ? formatOrganizationDate(String(value).slice(0, 10), { dateOnly: true }) : '—';
}

function localDate(value) {
  return value ? formatOrganizationDate(value) : '—';
}

function timeOnly(value) {
  return formatOrganizationTime(value, { includeTimeZone: false }) || '—';
}

function todayInOrganization() {
  return organizationDateInput();
}

function shiftDate(isoDate, amount) {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function weekdayLabel(value) {
  return WEEKDAYS.find((day) => day.value === value)?.label || value || 'Day not recorded';
}

function ruleWeekday(rule) {
  const match = String(rule?.rrule || '').match(/(?:^|;)BYDAY=([^;]+)/i);
  return match?.[1]?.split(',')?.[0]?.toUpperCase() || 'MO';
}

function nextScheduleSlot(rows) {
  const used = new Set(rows.map((row) => row.day));
  const day = WEEKDAYS.find((item) => !used.has(item.value))?.value || 'MO';
  const previous = rows.at(-1);
  return {
    id: `slot-${Date.now()}-${rows.length}`,
    day,
    start_time: previous?.start_time || '09:00',
    end_time: previous?.end_time || '10:30',
  };
}

function validDate(value) {
  const normalized = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized;
}

function routeRange(params) {
  const today = todayInOrganization();
  const from = validDate(params.get('from')) ? params.get('from') : shiftDate(today, -89);
  const to = validDate(params.get('to')) ? params.get('to') : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

function assignmentRows(cohort) {
  const rows = Array.isArray(cohort?.teachers)
    ? cohort.teachers
    : Array.isArray(cohort?.co_teachers)
      ? cohort.co_teachers
      : [];
  if (cohort?.primary_teacher && !rows.some((row) => String(row.teacher) === String(cohort.primary_teacher))) {
    return [{
      id: `primary-${cohort.primary_teacher}`,
      teacher: cohort.primary_teacher,
      teacher_name: cohort.primary_teacher_name,
      teacher_type_name: 'Main teacher',
      teacher_type_slug: 'main-teacher',
      role: 'main',
    }, ...rows];
  }
  return rows;
}

function cohortHasTeacher(cohort, teacherId) {
  if (!teacherId || teacherId === 'all') return true;
  if (String(cohort.primary_teacher) === String(teacherId)) return true;
  return assignmentRows(cohort).some((assignment) => String(assignment.teacher) === String(teacherId));
}

function safeSpreadsheetValue(value) {
  const raw = String(value ?? '');
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

function safeFilename(value, fallback = 'group') {
  const normalized = String(value || fallback).trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 72) || fallback;
}

function navigate(onNav, to, options) {
  if (typeof onNav === 'function') onNav(to, options);
  else if (typeof window !== 'undefined') window.location.assign(`/${String(to || '').replace(/^\/+/, '')}`);
}

function groupsBase(branchId) {
  return branchId ? `branches/${branchId}/groups` : 'groups';
}

function directoryRoute(basePath, filters, page = 1) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.branch && filters.branch !== 'all') params.set('branch', filters.branch);
  if (filters.teacher && filters.teacher !== 'all') params.set('teacher', filters.teacher);
  if (filters.level && filters.level !== 'all') params.set('level', filters.level);
  if (filters.archived && filters.archived !== 'active') params.set('archived', filters.archived);
  if (page > 1) params.set('page', String(page));
  return `${basePath}${params.size ? `?${params}` : ''}`;
}

function groupAccess(user) {
  return {
    cohorts: canUseCapability(user, 'cohorts:read'),
    cohortsWrite: canUseCapability(user, 'cohorts:write'),
    organization: canUseCapability(user, 'org:read'),
    students: canUseCapability(user, 'students:read'),
    studentsWrite: canUseCapability(user, 'students:write'),
    teachers: canUseCapability(user, 'teachers:read'),
    attendance: canUseCapability(user, 'attendance:read'),
    schedule: canUseCapability(user, 'schedule:read'),
    scheduleWrite: canUseCapability(user, 'schedule:write'),
    assignments: canUseCapability(user, 'assignments:read'),
    academics: canUseCapability(user, 'academics:read'),
    finance: canUseCapability(user, 'finance:read'),
    cover: canUseCapability(user, 'cover:read'),
    coverApprove: canUseCapability(user, 'cover:approve'),
  };
}

function availableDetailSections(access) {
  return DETAIL_SECTIONS.filter((item) => {
    if (item.id === 'settings') return access.cohortsWrite;
    if (item.id === 'students') return access.students;
    if (item.id === 'attendance') return access.students && access.attendance && access.schedule;
    if (item.id === 'schedule') return access.schedule;
    if (item.id === 'learning') return access.assignments;
    if (item.id === 'exams') return access.academics;
    if (item.id === 'finance') return access.finance;
    return true;
  });
}

function RouteLink({ to, onNav, children, className = '', ...props }) {
  return (
    <a
      {...props}
      className={className}
      href={`/${String(to || '').replace(/^\/+/, '')}`}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(onNav, to);
      }}
    >
      {children}
    </a>
  );
}

function Icon({ source, size = 17 }) {
  return cloneElement(source, { size });
}

function Status({ value, children }) {
  const normalized = String(value || 'neutral').toLowerCase().replaceAll('_', '-');
  const rawLabel = typeof children === 'string' ? children : children || text(value, 'Unknown');
  const label = typeof rawLabel === 'string'
    ? rawLabel.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : rawLabel;
  return <span className={`gp3-status is-${normalized}`}>{label}</span>;
}

function Metric({ label, value, detail, tone = 'primary' }) {
  return (
    <article className={`gp3-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function CoverageNote({ complete, loaded, total, children }) {
  return (
    <div className={`gp3-coverage${complete ? '' : ' is-partial'}`} role={complete ? undefined : 'status'}>
      <Icon source={complete ? Icons.shield : Icons.flag} size={14} />
      <span>
        {children || (complete
          ? `Complete coverage · ${formatBusinessNumber(loaded)} records`
          : `Showing ${formatBusinessNumber(loaded)} of ${formatBusinessNumber(total)} records. Narrow the view for complete comparisons.`)}
      </span>
    </div>
  );
}

function QueryFailure({ error, retry, title = 'This section could not be opened' }) {
  if (isServiceUnavailable(error)) {
    return <ApplicationUnavailableState label={title.replace(/ could not be opened$/i, '')} status="unavailable" onRetry={retry} compact />;
  }
  return (
    <div className="gp3-query-state is-error" role="alert">
      <span aria-hidden="true"><Icon source={Icons.flag} size={19} /></span>
      <div><strong>{title}</strong><p>{userFacingError(error)}</p></div>
      <button type="button" onClick={() => retry()}>Try again</button>
    </div>
  );
}

function mutationMessage(error, fallback) {
  const details = readableValidationDetails(error);
  return details[0] || userFacingError(error, { fallback });
}

function LoadingPanel({ lines = 5 }) {
  return <div className="gp3-query-state" role="status" aria-label="Loading current information"><Skeleton lines={lines} /></div>;
}

function Panel({ eyebrow, title, detail, action, children, className = '' }) {
  return (
    <section className={`gp3-panel ${className}`}>
      <header className="gp3-panel-head">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
        {action ? <div className="gp3-panel-action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

function DetailValue({ label, value, children }) {
  return <div className="gp3-fact"><span>{label}</span><strong>{children || value || '—'}</strong></div>;
}

function DirectoryFilters({ filters, branches, teachers, levels, complete, branchId, basePath, access, onNav }) {
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const add = (key, value, empty = 'all') => {
      const normalized = String(value || '').trim();
      if (normalized && normalized !== empty) params.set(key, normalized);
    };
    add('q', form.get('q'), '');
    if (!branchId && access.organization) add('branch', form.get('branch'));
    if (access.teachers) add('teacher', form.get('teacher'));
    add('level', form.get('level'));
    add('archived', form.get('archived'), 'active');
    navigate(onNav, `${basePath}${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <form className="gp3-filterbar" onSubmit={submit} key={JSON.stringify(filters)}>
      {!complete ? <>
        <span className="gp3-sr-only" id="group-level-filter-help">Choose a branch or enter a search, then apply it to enable exact level filtering.</span>
        {access.teachers ? <span className="gp3-sr-only" id="group-teacher-filter-help">Choose a branch or enter a search, then apply it to enable exact teacher filtering.</span> : null}
      </> : null}
      <div className="gp3-filter-search">
        <Icon source={Icons.search} size={16} />
        <label><span>Find a group</span><input name="q" defaultValue={filters.q} placeholder="Name or level" maxLength={100} /></label>
      </div>
      {!branchId && access.organization ? (
        <label><span>Branch</span><select name="branch" defaultValue={filters.branch}>
          <option value="all">All branches</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select></label>
      ) : null}
      <label title={!complete ? 'Narrow by branch or search to enable exact level filtering.' : undefined}>
        <span>Level</span>
        <select name="level" defaultValue={filters.level} disabled={!complete} aria-describedby={!complete ? 'group-level-filter-help' : undefined}>
          <option value="all">All levels</option>
          {filters.level !== 'all' && !levels.includes(filters.level) ? <option value={filters.level}>{filters.level}</option> : null}
          {levels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
      {access.teachers ? (
        <label title={!complete ? 'Narrow by branch or search to enable exact teacher filtering.' : undefined}>
          <span>Teacher</span>
          <select name="teacher" defaultValue={filters.teacher} disabled={!complete} aria-describedby={!complete ? 'group-teacher-filter-help' : undefined}>
            <option value="all">All teachers</option>
            {filters.teacher !== 'all' && !teachers.some((teacher) => String(teacher.id) === String(filters.teacher))
              ? <option value={filters.teacher}>Selected teacher</option>
              : null}
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.name}</option>)}
          </select>
        </label>
      ) : null}
      <label><span>Group state</span><select name="archived" defaultValue={filters.archived}>
        <option value="active">Active</option>
        <option value="all">All</option>
        <option value="archived">Archived</option>
      </select></label>
      <button className="gp3-button is-primary" type="submit"><Icon source={Icons.filter} size={15} /> Apply</button>
      {(filters.q || (access.organization && filters.branch !== 'all') || (access.teachers && filters.teacher !== 'all') || filters.level !== 'all' || filters.archived !== 'active') ? (
        <button className="gp3-button" type="button" onClick={() => navigate(onNav, basePath)}>Clear</button>
      ) : null}
    </form>
  );
}

function GroupEditor({ id, branchId, access, onNav, recordData = null, embedded = false }) {
  const editing = Boolean(id);
  const basePath = groupsBase(branchId);
  const cancelPath = editing ? `${basePath}/${id}/${embedded ? 'overview' : 'settings'}` : basePath;
  const record = useWorkspaceData(editing && !recordData ? `/api/v1/cohorts/${id}/` : null, undefined, { enabled: editing && !recordData });
  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(access.scheduleWrite));
  const [weeklySlots, setWeeklySlots] = useState(() => DEFAULT_WEEKLY_SLOTS.map((slot) => ({ ...slot })));
  const toast = useToast();
  const initial = {
    name: '',
    branch: branchId || '',
    department: '',
    level: '',
    study_month: 1,
    lesson_cycle_length: 12,
    start_date: todayInOrganization(),
    end_date: shiftDate(todayInOrganization(), 180),
    capacity: '',
    primary_teacher: '',
    default_room: '',
    is_archived: false,
  };
  const storedRecord = recordData || record.data;
  const source = form || storedRecord || initial;
  const effectiveBranch = String(branchId || source.branch || '');
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: PAGE_SIZE, ordering: 'name' }, { enabled: !branchId && access.organization });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: PAGE_SIZE, branch: effectiveBranch || undefined, ordering: 'name' }, { enabled: Boolean(effectiveBranch) && access.organization });
  const rooms = useWorkspaceData('/api/v1/org/rooms/', { page_size: PAGE_SIZE, branch: effectiveBranch || undefined, is_active: true, ordering: 'name' }, { enabled: Boolean(effectiveBranch) && access.organization });
  const teachers = useWorkspaceData('/api/v1/teachers/', {
    page_size: PAGE_SIZE,
    branch: effectiveBranch || undefined,
    department: source.department || undefined,
  }, { enabled: !editing && Boolean(effectiveBranch) && access.teachers });
  const terms = useWorkspaceData('/api/v1/schedule/terms/', {
    page_size: 20,
    is_current: true,
    ordering: '-start_date',
  }, { enabled: !editing && access.scheduleWrite, staleTime: 5 * 60_000 });
  const teacherRows = useMemo(() => teachers.rows.slice().sort((left, right) => (
    text(left.full_name || left.name).localeCompare(text(right.full_name || right.name))
  )), [teachers.rows]);
  const activeTeacherRows = useMemo(() => teacherRows.filter((teacher) => teacher.is_active !== false), [teacherRows]);
  const currentTerm = terms.rows.find((term) => term.is_current) || terms.rows[0] || null;
  useWorkspaceTitle(embedded ? null : editing ? storedRecord?.name || 'Edit group' : 'Create group', 'Groups', editing ? 'settings' : 'new');

  const change = (key, value) => setForm((current) => ({ ...(current || source), [key]: value }));
  const changeBranch = (value) => setForm((current) => ({
    ...(current || source),
    branch: value,
    department: '',
    primary_teacher: '',
    default_room: '',
  }));
  const mutation = useMutation({
    mutationFn: async ({ cohortPayload, schedule }) => {
      const saved = await httpRequest(
        editing ? 'PATCH' : 'POST',
        editing ? `/api/v1/cohorts/${id}/` : '/api/v1/cohorts/',
        { body: cohortPayload },
      );
      const scheduleFailures = [];
      let scheduled = 0;
      if (!editing && schedule?.slots?.length) {
        for (const slot of schedule.slots) {
          try {
            await httpRequest('POST', '/api/v1/schedule/rules/', {
              body: {
                term: Number(schedule.term),
                cohort: Number(saved.id),
                teacher: Number(schedule.teacher),
                room: cohortPayload.default_room,
                lesson_type: null,
                title: `${cohortPayload.name} · ${weekdayLabel(slot.day)}`,
                rrule: `FREQ=WEEKLY;BYDAY=${slot.day}`,
                start_date: schedule.start_date,
                end_date: schedule.end_date,
                start_time: slot.start_time,
                end_time: slot.end_time,
                is_active: true,
              },
            });
            scheduled += 1;
          } catch (failure) {
            scheduleFailures.push({ slot, failure });
          }
        }
      }
      return { saved, scheduled, scheduleFailures };
    },
    onSuccess: ({ saved, scheduled, scheduleFailures }) => {
      setSaveError(null);
      setForm(saved || null);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      if (scheduleFailures.length) {
        toast.warning(`The group was created and ${scheduled} weekly slot${scheduled === 1 ? '' : 's'} were scheduled. ${scheduleFailures.length} slot${scheduleFailures.length === 1 ? '' : 's'} still need attention in Group settings.`, { title: 'Group created with schedule review', duration: 9000 });
      } else {
        toast.success(editing ? 'Group record updated.' : scheduled ? `Group created with ${scheduled} weekly lesson slot${scheduled === 1 ? '' : 's'}.` : 'Group created and ready for its teaching team and students.', { title: editing ? 'Changes saved' : 'Group created' });
      }
      if (!embedded) navigate(onNav, `${basePath}/${saved?.id || id}/settings`);
    },
    onError: (failure) => {
      setSaveError(failure);
      toast.danger(mutationMessage(failure, 'The group could not be saved.'), { title: 'Group not saved' });
    },
  });

  if (editing && !recordData && record.pending) return <div className="gp3-page"><LoadingPanel lines={9} /></div>;
  if (editing && !recordData && (record.error || !record.data)) return <div className="gp3-page"><QueryFailure error={record.error} retry={record.retry} title="This group could not be opened for editing" /></div>;
  if (branchId && storedRecord && String(storedRecord.branch) !== String(branchId)) return <InvalidGroup onNav={onNav} basePath={basePath} mismatch />;
  if (storedRecord?.is_archived) {
    return <div className="gp3-page"><div className="gp3-back-row"><RouteLink to={cancelPath} onNav={onNav}><span aria-hidden="true">←</span> Back to group</RouteLink></div><EmptyState icon={Icons.shield} eyebrow="Archived group" title="Unarchive this group before editing" description="Archived records remain protected from accidental changes. Use the group overview to restore it first." /></div>;
  }

  const validationDetails = readableValidationDetails(saveError);
  const selectedOption = (value, rows, label) => value && !rows.some((row) => String(row.id) === String(value))
    ? <option value={value}>Current {label}</option>
    : null;
  const submit = (event) => {
    event.preventDefault();
    setSaveError(null);
    if (source.start_date && source.end_date && source.start_date > source.end_date) {
      setSaveError({ errors: { end_date: ['Must be on or after the start date.'] } });
      return;
    }
    if (!editing && scheduleEnabled) {
      if (!source.primary_teacher) {
        setSaveError({ errors: { primary_teacher: ['Choose the main teacher before creating the weekly schedule.'] } });
        return;
      }
      if (!currentTerm) {
        setSaveError({ errors: { schedule: ['A current academic term is required before lessons can be scheduled.'] } });
        return;
      }
      if (!weeklySlots.length) {
        setSaveError({ errors: { schedule: ['Add at least one teaching day.'] } });
        return;
      }
      const invalidSlot = weeklySlots.find((slot) => !slot.day || !slot.start_time || !slot.end_time || slot.start_time >= slot.end_time);
      if (invalidSlot) {
        setSaveError({ errors: { schedule: ['Every teaching day needs a start time earlier than its end time.'] } });
        return;
      }
      const scheduleStart = source.start_date < currentTerm.start_date ? currentTerm.start_date : source.start_date;
      const scheduleEnd = source.end_date > currentTerm.end_date ? currentTerm.end_date : source.end_date;
      if (scheduleStart > scheduleEnd) {
        setSaveError({ errors: { schedule: [`The group dates do not overlap the current term (${dateOnly(currentTerm.start_date)} – ${dateOnly(currentTerm.end_date)}).`] } });
        return;
      }
    }
    const cohortPayload = {
      name: String(source.name || '').trim(),
      branch: Number(branchId || source.branch),
      department: source.department ? Number(source.department) : null,
      level: String(source.level || '').trim(),
      study_month: Number(source.study_month || 1),
      lesson_cycle_length: Number(source.lesson_cycle_length || 12),
      start_date: source.start_date,
      end_date: source.end_date,
      capacity: source.capacity === '' || source.capacity == null ? null : Number(source.capacity),
      primary_teacher: source.primary_teacher ? Number(source.primary_teacher) : null,
      default_room: source.default_room ? Number(source.default_room) : null,
      is_archived: Boolean(source.is_archived),
    };
    const scheduleStart = currentTerm && source.start_date < currentTerm.start_date ? currentTerm.start_date : source.start_date;
    const scheduleEnd = currentTerm && source.end_date > currentTerm.end_date ? currentTerm.end_date : source.end_date;
    mutation.mutate({
      cohortPayload,
      schedule: !editing && scheduleEnabled ? {
        term: currentTerm?.id,
        teacher: source.primary_teacher,
        start_date: scheduleStart,
        end_date: scheduleEnd,
        slots: weeklySlots,
      } : null,
    });
  };

  const formView = (
      <form className="fw-form gp3-editor-form" onSubmit={submit}>
        {saveError ? <div className="fw-form-error" role="alert"><strong>{mutationMessage(saveError, 'Review the group details and try again.')}</strong>{validationDetails.length > 1 ? <ul>{validationDetails.slice(1).map((line) => <li key={line}>{line}</li>)}</ul> : null}</div> : null}
        <section className="fw-form-section">
          <header><h2>Group identity</h2><p>Branch and department scope control which students, teachers, and rooms can be connected.</p></header>
          <label className="is-wide">Group name<input required maxLength="120" value={source.name || ''} onChange={(event) => change('name', event.target.value)} placeholder="For example, IELTS Evening A" /></label>
          {!branchId ? <label>Branch<select required value={source.branch || ''} onChange={(event) => changeBranch(event.target.value)}><option value="">Select branch</option>{selectedOption(source.branch, branches.rows, 'branch')}{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : <label>Branch<input value={storedRecord?.branch_name || `Branch ${branchId}`} disabled /></label>}
          <label>Department<select value={source.department || ''} onChange={(event) => change('department', event.target.value)} disabled={!effectiveBranch || departments.pending}><option value="">No department</option>{selectedOption(source.department, departments.rows, 'department')}{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Academic level<input maxLength="64" value={source.level || ''} onChange={(event) => change('level', event.target.value)} placeholder="Optional level" /></label>
          <label>Capacity<input type="number" inputMode="numeric" min="0" max="32767" value={source.capacity ?? ''} onChange={(event) => change('capacity', event.target.value)} placeholder="Optional" /></label>
        </section>
        <section className="fw-form-section gp3-cycle-section">
          <header><h2>Study month and lesson cycle</h2><p>A study month finishes after the selected number of completed lessons, even when it starts near the end of a calendar month.</p></header>
          <label>Current study month<input required type="number" inputMode="numeric" min="1" max="600" value={source.study_month || 1} onChange={(event) => change('study_month', event.target.value)} /></label>
          <fieldset className="gp3-cycle-choice"><legend>Lessons in one study month</legend><div>{[8, 12].map((amount) => <label className={Number(source.lesson_cycle_length) === amount ? 'is-selected' : ''} key={amount}><input type="radio" name="lesson_cycle_length" value={amount} checked={Number(source.lesson_cycle_length) === amount} onChange={() => change('lesson_cycle_length', amount)} /><span><strong>{amount} lessons</strong><small>{amount === 8 ? 'Usually 2 lessons each week' : 'Usually 3 lessons each week'}</small></span></label>)}</div></fieldset>
        </section>
        <section className="fw-form-section">
          <header><h2>Dates and default room</h2><p>Save the group details here. Teaching assignments and student membership are managed separately below.</p></header>
          <label>Start date<input required type="date" value={source.start_date || ''} max={source.end_date || undefined} onChange={(event) => change('start_date', event.target.value)} /></label>
          <label>End date<input required type="date" value={source.end_date || ''} min={source.start_date || undefined} onChange={(event) => change('end_date', event.target.value)} /></label>
          {access.organization ? <label>Default room<select value={source.default_room || ''} onChange={(event) => change('default_room', event.target.value)} disabled={!effectiveBranch || rooms.pending}><option value="">No default room</option>{selectedOption(source.default_room, rooms.rows, 'room')}{rooms.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : null}
          {editing ? <label className="fw-check is-wide"><input type="checkbox" checked={Boolean(source.is_archived)} onChange={(event) => change('is_archived', event.target.checked)} /><span><strong>Archive after saving</strong><small>Archived groups remain visible but cannot be changed until restored.</small></span></label> : null}
        </section>
        {!editing && access.scheduleWrite ? <section className="fw-form-section gp3-create-schedule">
          <header><h2>Weekly teaching schedule</h2><p>Choose each teaching day and its exact time. Lessons are prepared for the part of the current academic term covered by this group.</p></header>
          <label className="fw-check is-wide"><input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} /><span><strong>Create the weekly lessons with this group</strong><small>Turn this off only when the teaching team or timetable will be decided later in Group settings.</small></span></label>
          {scheduleEnabled ? <>
            <label className="is-wide">Main teacher<select required value={source.primary_teacher || ''} onChange={(event) => change('primary_teacher', event.target.value)} disabled={!effectiveBranch || teachers.pending}><option value="">Select the teacher who owns this group</option>{selectedOption(source.primary_teacher, activeTeacherRows, 'teacher')}{activeTeacherRows.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.full_name || teacher.name}{teacher.department_name ? ` · ${teacher.department_name}` : ''}</option>)}</select><small className="gp3-field-help">Only active teachers in the selected branch and department are shown.</small></label>
            <div className="gp3-term-summary is-wide"><span><Icon source={Icons.cal} size={16} /></span><div><strong>{terms.pending ? 'Finding the current term…' : currentTerm ? currentTerm.name : 'No current academic term'}</strong><small>{currentTerm ? `${dateOnly(currentTerm.start_date)} – ${dateOnly(currentTerm.end_date)}. Group dates outside this window remain saved, and another term can be scheduled later.` : 'Mark an academic term as current before creating recurring lessons.'}</small></div></div>
            <div className="gp3-weekly-builder is-wide"><div className="gp3-weekly-builder-head"><div><strong>Teaching days and times</strong><small>{weeklySlots.length} lesson{weeklySlots.length === 1 ? '' : 's'} each week</small></div><button type="button" className="gp3-button" onClick={() => setWeeklySlots((rows) => [...rows, nextScheduleSlot(rows)])}><Icon source={Icons.plus} size={14} /> Add day</button></div>
              <div className="gp3-weekly-rows">{weeklySlots.map((slot, index) => <div className="gp3-weekly-row" key={slot.id}><span className="gp3-slot-number">{index + 1}</span><label><span>Day</span><select value={slot.day} onChange={(event) => setWeeklySlots((rows) => rows.map((row) => row.id === slot.id ? { ...row, day: event.target.value } : row))}>{WEEKDAYS.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label><span>Starts</span><input required type="time" value={slot.start_time} onChange={(event) => setWeeklySlots((rows) => rows.map((row) => row.id === slot.id ? { ...row, start_time: event.target.value } : row))} /></label><label><span>Ends</span><input required type="time" min={slot.start_time || undefined} value={slot.end_time} onChange={(event) => setWeeklySlots((rows) => rows.map((row) => row.id === slot.id ? { ...row, end_time: event.target.value } : row))} /></label><button type="button" className="gp3-icon-button" aria-label={`Remove ${weekdayLabel(slot.day)} slot`} disabled={weeklySlots.length === 1} onClick={() => setWeeklySlots((rows) => rows.filter((row) => row.id !== slot.id))}><Icon source={Icons.x} size={15} /></button></div>)}</div>
            </div>
          </> : null}
        </section> : null}
        <div className="fw-form-actions">{embedded ? null : <button type="button" className="gp3-button" onClick={() => navigate(onNav, cancelPath)} disabled={mutation.isPending}>Cancel</button>}<button type="submit" className="gp3-button is-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving group…' : editing ? 'Save group details' : 'Create group'}</button></div>
      </form>
  );

  if (embedded) return formView;
  return (
    <div className="gp3-page gp3-editor-page">
      <div className="gp3-back-row"><RouteLink to={cancelPath} onNav={onNav}><span aria-hidden="true">←</span> {editing ? 'Back to group' : 'Back to groups'}</RouteLink></div>
      <header className="gp3-page-head">
        <div><span className="gp3-eyebrow">Group administration</span><h1>{editing ? `Edit ${text(storedRecord?.name)}` : 'Create a group'}</h1><p>Create the group record first. Its settings page opens next so you can assign the teaching team and enroll eligible students safely.</p></div>
      </header>
      {formView}
    </div>
  );
}

function GroupCard({ cohort, studentCount, occupancyKnown, basePath, access, onNav }) {
  const teachers = assignmentRows(cohort);
  const capacity = validCount(cohort.capacity);
  const occupancy = occupancyKnown && capacity && capacity > 0 ? studentCount / capacity * 100 : null;
  return (
    <RouteLink className="gp3-group-card" to={`${basePath}/${cohort.id}/overview`} onNav={onNav}>
      <div className="gp3-group-card-top">
        <span className="gp3-group-mark" aria-hidden="true"><Icon source={Icons.cohort} size={19} /></span>
        <Status value={cohort.is_archived ? 'archived' : 'active'}>{cohort.is_archived ? 'Archived' : 'Active'}</Status>
      </div>
      <div><span className="gp3-eyebrow">{access.organization ? text(cohort.branch_name, 'Branch not recorded') : 'Group record'}</span><h3>{text(cohort.name)}</h3><p>{text(cohort.department_name, 'Department not recorded')} · {text(cohort.level, 'Level not recorded')}</p></div>
      <dl>
        {access.teachers ? <div><dt>Teacher</dt><dd>{text(cohort.primary_teacher_name || teachers[0]?.teacher_name)}</dd></div> : null}
        <div><dt>Room</dt><dd>{text(cohort.default_room_name)}</dd></div>
        {access.students ? <div><dt>Current students</dt><dd>{occupancyKnown ? formatBusinessNumber(studentCount) : '—'}</dd></div> : null}
        <div><dt>Capacity</dt><dd>{capacity == null ? '—' : formatBusinessNumber(capacity)}</dd></div>
        {access.students ? <div><dt>Occupancy</dt><dd>{occupancy == null ? '—' : percent(occupancy)}</dd></div> : null}
        <div><dt>Dates</dt><dd>{dateOnly(cohort.start_date)} – {dateOnly(cohort.end_date)}</dd></div>
      </dl>
      <span className="gp3-card-open">Open workspace <Icon source={Icons.chevR} size={15} /></span>
    </RouteLink>
  );
}

function GroupsDirectory({ route, onNav, branchId, access }) {
  const routed = workspaceRoute(route);
  const forcedBranch = branchId == null || branchId === 'all' ? '' : String(branchId);
  const requestedPage = Number(routed.params.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters = {
    q: String(routed.params.get('q') || '').slice(0, 100),
    branch: forcedBranch || (access.organization ? routed.params.get('branch') : '') || 'all',
    teacher: access.teachers ? routed.params.get('teacher') || 'all' : 'all',
    level: String(routed.params.get('level') || 'all').slice(0, 80),
    archived: ['all', 'archived'].includes(routed.params.get('archived')) ? routed.params.get('archived') : 'active',
  };
  const basePath = groupsBase(forcedBranch);
  const cohortsState = useWorkspaceData('/api/v1/cohorts/', {
    page_size: PAGE_SIZE,
    page,
    branch: filters.branch === 'all' ? undefined : filters.branch,
    is_archived: filters.archived === 'all' ? undefined : filters.archived === 'archived',
    search: filters.q || undefined,
    ordering: 'name',
  });
  const branchesState = useWorkspaceData('/api/v1/org/branches/', { page_size: PAGE_SIZE, ordering: 'name' }, { enabled: !forcedBranch && access.organization });
  const teachersState = useWorkspaceData('/api/v1/teachers/', {
    page_size: PAGE_SIZE,
    branch: filters.branch === 'all' ? undefined : filters.branch,
  }, { enabled: access.teachers });
  const studentsState = useWorkspaceData('/api/v1/students/', {
    page_size: PAGE_SIZE,
    branch: filters.branch === 'all' ? undefined : filters.branch,
    has_cohort: true,
  }, { enabled: access.students });

  const complete = !cohortsState.pending && collectionComplete(cohortsState);
  const pages = Number(cohortsState.pagination?.pages) || Math.max(1, Math.ceil(cohortsState.total / PAGE_SIZE));
  const correctingPage = !cohortsState.pending && !cohortsState.error && page > pages;
  const correctedRoute = directoryRoute(basePath, filters, pages);
  useEffect(() => {
    if (!correctingPage) return;
    navigate(onNav, correctedRoute, { replace: true, scroll: false });
  }, [correctedRoute, correctingPage, onNav]);
  const levels = useMemo(() => [...new Set(cohortsState.rows.map((cohort) => text(cohort.level, '')).filter(Boolean))].sort(), [cohortsState.rows]);
  const fallbackTeachers = useMemo(() => {
    const map = new Map();
    if (!access.teachers) return [];
    cohortsState.rows.forEach((cohort) => assignmentRows(cohort).forEach((assignment) => {
      if (assignment.teacher) map.set(String(assignment.teacher), { id: assignment.teacher, full_name: assignment.teacher_name });
    }));
    return [...map.values()];
  }, [access.teachers, cohortsState.rows]);
  const teachers = useMemo(() => {
    const map = new Map();
    [...teachersState.rows, ...fallbackTeachers].forEach((teacher) => {
      if (teacher?.id != null) map.set(String(teacher.id), teacher);
    });
    return [...map.values()].sort((left, right) => text(left.full_name || left.name).localeCompare(text(right.full_name || right.name)));
  }, [fallbackTeachers, teachersState.rows]);
  const visibleRows = useMemo(() => cohortsState.rows.filter((cohort) => {
    if (!complete) return true;
    if (filters.level !== 'all' && String(cohort.level) !== filters.level) return false;
    return cohortHasTeacher(cohort, filters.teacher);
  }), [cohortsState.rows, complete, filters.level, filters.teacher]);
  const occupancyKnown = access.students && !studentsState.pending && collectionComplete(studentsState) && !studentsState.error;
  const studentsByGroup = useMemo(() => studentsState.rows.reduce((map, student) => {
    if (student.current_cohort != null) {
      const key = String(student.current_cohort);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, new Map()), [studentsState.rows]);
  const active = visibleRows.filter((cohort) => !cohort.is_archived).length;
  const archived = visibleRows.length - active;
  const capacity = completeTotalOf(visibleRows, (cohort) => validCount(cohort.capacity));

  function exportRows() {
    const columns = [
      { label: 'Group', value: (row) => safeSpreadsheetValue(row.name) },
      { label: 'Department', value: (row) => safeSpreadsheetValue(row.department_name) },
      { label: 'Level', value: (row) => safeSpreadsheetValue(row.level) },
      { label: 'Room', value: (row) => safeSpreadsheetValue(row.default_room_name) },
      { label: 'Capacity', value: (row) => validCount(row.capacity) ?? '' },
      { label: 'Start date', value: (row) => row.start_date },
      { label: 'End date', value: (row) => row.end_date },
      { label: 'State', value: (row) => row.is_archived ? 'Archived' : 'Active' },
    ];
    if (access.organization) columns.splice(1, 0, { label: 'Branch', value: (row) => safeSpreadsheetValue(row.branch_name) });
    if (access.teachers) columns.splice(4, 0,
      { label: 'Main teacher', value: (row) => safeSpreadsheetValue(row.primary_teacher_name) },
      { label: 'All teachers', value: (row) => safeSpreadsheetValue(assignmentRows(row).map((item) => item.teacher_name).filter(Boolean).join('; ')) },
    );
    if (access.students) columns.splice(-3, 0, { label: 'Current students', value: (row) => occupancyKnown ? studentsByGroup.get(String(row.id)) || 0 : '' });
    downloadSpreadsheet(`groups-${todayInOrganization()}.csv`, columns, visibleRows);
  }

  return (
    <div className="gp3-page gp3-directory">
      <header className="gp3-page-head">
        <div><span className="gp3-eyebrow">Learning operations</span><h1>Groups</h1><p>Compare teaching groups, then open the operating record and connected areas available within your responsibilities.</p></div>
        <div className="gp3-head-actions">{access.cohortsWrite ? <RouteLink className="gp3-button is-primary" to={`${basePath}/new`} onNav={onNav}><Icon source={Icons.plus} size={15} /> Create group</RouteLink> : null}<button className="gp3-button" type="button" disabled={!visibleRows.length} onClick={exportRows} title={complete ? 'Downloads every matched group in an Excel-compatible file' : 'Downloads the currently loaded page in an Excel-compatible file'}><Icon source={Icons.doc} size={15} /> Download {complete ? 'filtered' : 'current page'} spreadsheet</button></div>
      </header>

      <DirectoryFilters filters={filters} branches={branchesState.rows} teachers={teachers} levels={levels} complete={complete} branchId={forcedBranch} basePath={basePath} access={access} onNav={onNav} />

      {cohortsState.pending ? <LoadingPanel lines={6} /> : cohortsState.error ? (
        <QueryFailure error={cohortsState.error} retry={cohortsState.retry} title="Groups could not be loaded" />
      ) : (
        <>
          <div className="gp3-metrics">
            <Metric label={complete ? 'Groups in view' : 'Groups on this page'} value={formatBusinessNumber(visibleRows.length)} detail={complete ? 'Exact filtered result' : `${formatBusinessNumber(cohortsState.total)} matched across all pages`} />
            <Metric label="Active" value={formatBusinessNumber(active)} detail={complete ? 'Open learning groups' : 'Open groups on this page'} tone="success" />
            <Metric label="Archived" value={formatBusinessNumber(archived)} detail={complete ? 'Closed groups in this view' : 'Closed groups on this page'} tone="neutral" />
            <Metric
              label="Recorded capacity"
              value={capacity == null ? '—' : formatBusinessNumber(capacity)}
              detail={capacity == null
                ? 'One or more visible groups have no usable recorded capacity'
                : complete
                  ? 'Seats across visible groups'
                  : 'Seats on this page; every loaded group has a recorded capacity'}
              tone="accent"
            />
          </div>
          <CoverageNote complete={complete} loaded={cohortsState.rows.length} total={cohortsState.total}>
            {complete
              ? `Complete result · exact ${access.teachers ? 'level and teacher filters are' : 'level filtering is'} available across ${formatBusinessNumber(cohortsState.rows.length)} matched groups.`
              : `The first ${formatBusinessNumber(cohortsState.rows.length)} of ${formatBusinessNumber(cohortsState.total)} matched groups are loaded. ${access.teachers ? 'Teacher and level filters stay' : 'Level filtering stays'} unavailable until branch or search makes the result complete.`}
          </CoverageNote>
          {access.students ? <CoverageNote complete={occupancyKnown} loaded={studentsState.rows.length} total={studentsState.total}>
            {studentsState.pending
              ? 'Student coverage is loading. Occupancy stays blank until the assigned-student result is complete.'
              : occupancyKnown
              ? `Student coverage is complete for this branch view, so group occupancy is exact across ${formatBusinessNumber(studentsState.rows.length)} assigned student records.`
              : studentsState.error
                ? 'Student coverage is temporarily unavailable. Occupancy stays blank rather than showing an unsafe estimate.'
                : `Student coverage is partial (${formatBusinessNumber(studentsState.rows.length)} of ${formatBusinessNumber(studentsState.total)} records). Occupancy stays blank until the view is complete.`}
          </CoverageNote> : null}
          {visibleRows.length ? (
            <Panel eyebrow="Directory" title="Groups in this view" detail="Open any group to inspect its permitted operating record." className="gp3-directory-panel">
              <div className="gp3-card-grid">{visibleRows.map((cohort) => <GroupCard key={cohort.id} cohort={cohort} studentCount={studentsByGroup.get(String(cohort.id)) || 0} occupancyKnown={occupancyKnown} basePath={basePath} access={access} onNav={onNav} />)}</div>
              <div className="gp3-table-wrap gp3-desktop-table" role="region" aria-label="Group directory, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Group directory">
                <thead><tr><th>Group</th>{access.organization ? <th>Branch</th> : null}<th>Level</th>{access.teachers ? <th>Teachers</th> : null}<th>Room</th>{access.students ? <th>Students</th> : null}<th>Capacity</th><th>Dates</th><th>State</th><th><span className="gp3-sr-only">Open</span></th></tr></thead>
                <tbody>{visibleRows.map((cohort) => <tr key={cohort.id}>
                  <td><RouteLink to={`${basePath}/${cohort.id}/overview`} onNav={onNav}><strong>{text(cohort.name)}</strong><small>{text(cohort.department_name)}</small></RouteLink></td>
                  {access.organization ? <td>{text(cohort.branch_name)}</td> : null}<td>{text(cohort.level, '—')}</td>
                  {access.teachers ? <td>{text(assignmentRows(cohort).map((item) => item.teacher_name).filter(Boolean).join(', '))}</td> : null}
                  <td>{text(cohort.default_room_name, '—')}</td>{access.students ? <td>{occupancyKnown ? formatBusinessNumber(studentsByGroup.get(String(cohort.id)) || 0) : '—'}<small>{occupancyKnown && validCount(cohort.capacity) > 0 ? `${percent((studentsByGroup.get(String(cohort.id)) || 0) / validCount(cohort.capacity) * 100)} occupied` : 'Exact coverage and a positive capacity are required'}</small></td> : null}
                  <td>{validCount(cohort.capacity) == null ? '—' : formatBusinessNumber(cohort.capacity)}</td><td>{dateOnly(cohort.start_date)}<small>to {dateOnly(cohort.end_date)}</small></td>
                  <td><Status value={cohort.is_archived ? 'archived' : 'active'}>{cohort.is_archived ? 'Archived' : 'Active'}</Status></td>
                  <td><RouteLink className="gp3-icon-link" to={`${basePath}/${cohort.id}/overview`} onNav={onNav}><Icon source={Icons.chevR} size={16} /><span className="gp3-sr-only">Open {cohort.name}</span></RouteLink></td>
                </tr>)}</tbody>
              </table></div>
            </Panel>
          ) : <EmptyState icon={Icons.cohort} eyebrow="No matched groups" title="No groups fit this view" description="Clear one or more filters to widen the directory." />}
          {!correctingPage && <WorkspacePagination label="groups" page={page} pages={pages} total={cohortsState.total} loading={cohortsState.loading} onPage={(nextPage) => navigate(onNav, directoryRoute(basePath, filters, nextPage), { scroll: false })} />}
        </>
      )}
    </div>
  );
}

function DateRangeForm({ groupId, section, range, basePath, onNav }) {
  const today = todayInOrganization();
  const presets = [
    { label: '30 days', from: shiftDate(today, -29) },
    { label: '90 days', from: shiftDate(today, -89) },
    { label: '6 months', from: shiftDate(today, -179) },
  ];

  function openRange(from, to = today) {
    navigate(onNav, `${basePath}/${groupId}/${section}?from=${from}&to=${to}`);
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get('from') || '');
    const to = String(form.get('to') || '');
    if (!validDate(from) || !validDate(to)) return;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    navigate(onNav, `${basePath}/${groupId}/${section}?from=${ordered.from}&to=${ordered.to}`);
  }
  return (
    <form className="gp3-range" onSubmit={submit} key={`${range.from}-${range.to}`}>
      <span><Icon source={Icons.cal} size={15} /> Reporting period</span>
      <div className="gp3-range-presets" aria-label="Quick reporting periods">
        {presets.map((preset) => (
          <button
            className={range.from === preset.from && range.to === today ? 'is-active' : ''}
            key={preset.label}
            type="button"
            onClick={() => openRange(preset.from)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label><span>From</span><input name="from" type="date" defaultValue={range.from} /></label>
      <label><span>To</span><input name="to" type="date" defaultValue={range.to} /></label>
      <button type="submit" className="gp3-button">Apply</button>
    </form>
  );
}

function RestoreGroupButton({ cohortId }) {
  const toast = useOptionalToast();
  const unarchive = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/cohorts/${cohortId}/unarchive/`, { body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The group is active and editable again.', { title: 'Group restored' });
    },
    onError: (failure) => toast.danger(mutationMessage(failure, 'The group could not be restored.'), { title: 'Group not restored' }),
  });
  return <button type="button" className="gp3-button is-primary" onClick={() => unarchive.mutate()} disabled={unarchive.isPending}>{unarchive.isPending ? 'Restoring…' : 'Restore group'}</button>;
}

function GroupHero({ cohort, basePath, access, onNav }) {
  return (
    <>
      <div className="gp3-back-row"><RouteLink to={basePath} onNav={onNav}><span aria-hidden="true">←</span> All groups</RouteLink></div>
      <header className="gp3-detail-hero">
        <div className="gp3-detail-title">
          <span className="gp3-group-mark" aria-hidden="true"><Icon source={Icons.cohort} size={21} /></span>
          <div><span className="gp3-eyebrow">Group workspace</span><h1>{text(cohort.name)}</h1><p>
            {access.organization ? <><RouteLink to={`branches/${cohort.branch}`} onNav={onNav}>{text(cohort.branch_name)}</RouteLink><span>·</span></> : null}
            {text(cohort.department_name)}<span>·</span>{text(cohort.level, 'Level not recorded')}
          </p></div>
        </div>
        <div className="gp3-hero-meta"><Status value={cohort.is_archived ? 'archived' : 'active'}>{cohort.is_archived ? 'Archived' : 'Active'}</Status><span>{dateOnly(cohort.start_date)} – {dateOnly(cohort.end_date)}</span>{access.cohortsWrite && !cohort.is_archived ? <RouteLink className="gp3-button" to={`${basePath}/${cohort.id}/settings`} onNav={onNav}><Icon source={Icons.settings} size={14} /> Group settings</RouteLink> : null}{access.cohortsWrite && cohort.is_archived ? <RestoreGroupButton cohortId={cohort.id} /> : null}</div>
      </header>
    </>
  );
}

function GroupSectionNavigation({ cohort, section, sections, basePath, range, onNav }) {
  const rangeQuery = range ? `?from=${range.from}&to=${range.to}` : '';
  return <nav className="gp3-section-nav" aria-label="Group workspace sections">
    {sections.map((item) => <RouteLink title={item.description} aria-current={item.id === section ? 'page' : undefined} className={item.id === section ? 'is-active' : ''} key={item.id} to={`${basePath}/${cohort.id}/${item.id}${rangeQuery}`} onNav={onNav}><span aria-hidden="true"><Icon source={item.icon} size={15} /></span><strong>{item.label}</strong></RouteLink>)}
  </nav>;
}

function TeacherRoster({ rows, cohort, onNav }) {
  const roster = rows.length ? rows : assignmentRows(cohort);
  if (!roster.length) return <EmptyState icon={Icons.user} eyebrow="Teacher roster" title="No teacher assignment is recorded" description="The group is available, but its teaching relationship has not been recorded yet." />;
  return <div className="gp3-roster">{roster.map((assignment) => (
    <RouteLink key={assignment.id || assignment.teacher} to={`teachers/directory/${assignment.teacher}`} onNav={onNav}>
      <SfAvatar name={assignment.teacher_name} size={34} decorative />
      <span><strong>{text(assignment.teacher_name)}</strong><small>{text(assignment.teacher_type_name || assignment.role, 'Teacher')}</small></span>
      <Icon source={Icons.chevR} size={14} />
    </RouteLink>
  ))}</div>;
}

function TeacherAssignmentManager({ cohort, rows, standalone = false }) {
  const [teacherId, setTeacherId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [error, setError] = useState(null);
  const toast = useToast();
  const teachers = useWorkspaceData('/api/v1/teachers/', {
    page_size: PAGE_SIZE,
    branch: cohort.branch,
    department: cohort.department || undefined,
    is_active: true,
  });
  const teacherRows = useMemo(() => teachers.rows.slice().sort((left, right) => (
    text(left.full_name || left.name).localeCompare(text(right.full_name || right.name))
  )), [teachers.rows]);
  const activeTeacherRows = useMemo(() => teacherRows.filter((teacher) => teacher.is_active !== false), [teacherRows]);
  const types = useWorkspaceData('/api/v1/cohorts/teacher-types/', undefined, { staleTime: 5 * 60_000 });
  const activeTypes = types.rows.filter((item) => item.is_active !== false);
  const selectedType = activeTypes.find((item) => String(item.id) === String(typeId))
    || activeTypes.find((item) => item.is_default)
    || activeTypes[0];
  const mutation = useMutation({
    mutationFn: ({ kind, assignmentId, teacher, teacherType }) => {
      if (kind === 'remove') return httpRequest('DELETE', `/api/v1/cohorts/${cohort.id}/teachers/${assignmentId}/`);
      if (selectedType?.slug === 'main-teacher') {
        return httpRequest('PATCH', `/api/v1/cohorts/${cohort.id}/`, { body: { primary_teacher: Number(teacher) } });
      }
      return httpRequest('POST', `/api/v1/cohorts/${cohort.id}/teachers/`, { body: { teacher: Number(teacher), teacher_type: Number(teacherType) } });
    },
    onSuccess: (_saved, variables) => {
      setError(null);
      setTeacherId('');
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(variables.kind === 'remove' ? 'Teacher assignment removed.' : selectedType?.slug === 'main-teacher' ? 'Main teacher updated.' : 'Teacher assigned to the group.', { title: 'Teaching team updated' });
    },
    onError: (failure) => {
      setError(failure);
      toast.danger(mutationMessage(failure, 'The teaching assignment could not be changed.'), { title: 'Teaching team not changed' });
    },
  });
  const remove = (assignment) => {
    if (!/^\d+$/.test(String(assignment.id || ''))) return;
    if (!window.confirm(`Remove ${text(assignment.teacher_name, 'this teacher')} from this group assignment?`)) return;
    mutation.mutate({ kind: 'remove', assignmentId: assignment.id });
  };

  const content = (
      <div className="gp3-management-panel">
        {error ? <div className="fw-form-error" role="alert">{mutationMessage(error, 'The teaching assignment could not be changed.')}</div> : null}
        {teachers.error ? <QueryFailure error={teachers.error} retry={teachers.retry} title="Teacher choices could not be loaded" /> : null}
        {types.error ? <QueryFailure error={types.error} retry={types.retry} title="Teaching roles could not be loaded" /> : null}
        {(teachers.pending || types.pending) && !teachers.rows.length ? <LoadingPanel lines={2} /> : null}
        {!teachers.error && !types.error ? <form className="gp3-inline-form" onSubmit={(event) => {
          event.preventDefault();
          if (!teacherId || !selectedType?.id) return;
          const selectedTeacher = teacherRows.find((teacher) => String(teacher.id) === String(teacherId));
          const warning = selectedType?.slug === 'main-teacher' && cohort.primary_teacher
            ? `Replace the current main teacher with ${text(selectedTeacher?.full_name || selectedTeacher?.name, 'this teacher')}? The previous main teacher will no longer own this group.`
            : `Assign ${text(selectedTeacher?.full_name || selectedTeacher?.name, 'this teacher')} as ${text(selectedType?.name, 'a teacher')} for ${text(cohort.name)}?`;
          if (!window.confirm(warning)) return;
          mutation.mutate({ kind: 'assign', teacher: teacherId, teacherType: selectedType.id });
        }}>
          <label><span>Teacher</span><select required value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Select an active teacher</option>{activeTeacherRows.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.full_name || teacher.name}{teacher.is_substitute ? ' · Substitute' : ''}</option>)}</select></label>
          <label><span>Assignment type</span><select required value={typeId || selectedType?.id || ''} onChange={(event) => setTypeId(event.target.value)}><option value="">Select a role</option>{activeTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
          <button type="submit" className="gp3-button is-primary" disabled={mutation.isPending || !teacherId || !selectedType?.id}>{mutation.isPending ? 'Updating…' : selectedType?.slug === 'main-teacher' ? 'Set main teacher' : 'Assign teacher'}</button>
        </form> : null}
        <div className="gp3-safety-note"><Icon source={Icons.shield} size={16} /><span><strong>Assignment safeguard</strong><small>Only active teachers in this group’s branch and department are offered. You will be asked to confirm before the teaching team changes.</small></span></div>
        {rows.length ? <div className="gp3-assignment-actions">{rows.map((assignment) => <div key={assignment.id || `${assignment.teacher}-${assignment.teacher_type}`}><span><strong>{text(assignment.teacher_name)}</strong><small>{text(assignment.teacher_type_name || assignment.role, 'Teacher')}</small></span>{/^\d+$/.test(String(assignment.id || '')) ? <button type="button" className="gp3-button is-danger" onClick={() => remove(assignment)} disabled={mutation.isPending}>Remove</button> : null}</div>)}</div> : null}
      </div>
  );
  if (standalone) return <section className="gp3-settings-card"><header><span><Icon source={Icons.user} size={17} /></span><div><h2>Teaching team</h2><p>Assign the main teacher and any additional teaching roles.</p></div></header>{content}</section>;
  return (
    <details className="gp3-manage-disclosure">
      <summary><span><Icon source={Icons.settings} size={15} /> Manage teaching team</span><small>Assign a main, additional, video, assistant, or substitute role</small></summary>
      {content}
    </details>
  );
}

function GroupScheduleManager({ cohort }) {
  const rules = useWorkspaceData('/api/v1/schedule/rules/', {
    page_size: PAGE_SIZE,
    cohort: cohort.id,
    ordering: 'created_at',
  });
  const terms = useWorkspaceData('/api/v1/schedule/terms/', {
    page_size: 100,
    ordering: '-start_date',
  }, { staleTime: 5 * 60_000 });
  const teachers = assignmentRows(cohort);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({
    day: 'MO',
    start_time: '09:00',
    end_time: '10:30',
    teacher: String(cohort.primary_teacher || teachers[0]?.teacher || ''),
    term: '',
  });
  const [error, setError] = useState(null);
  const toast = useToast();
  const currentTerm = terms.rows.find((term) => term.is_current) || terms.rows[0] || null;
  const selectedTerm = terms.rows.find((term) => String(term.id) === String(draft.term)) || currentTerm;
  const scheduleStart = selectedTerm && cohort.start_date < selectedTerm.start_date ? selectedTerm.start_date : cohort.start_date;
  const scheduleEnd = selectedTerm && cohort.end_date > selectedTerm.end_date ? selectedTerm.end_date : cohort.end_date;
  const resetDraft = () => {
    setEditingId(null);
    setDraft({
      day: 'MO',
      start_time: '09:00',
      end_time: '10:30',
      teacher: String(cohort.primary_teacher || teachers[0]?.teacher || ''),
      term: '',
    });
  };
  const mutation = useMutation({
    mutationFn: async ({ kind, rule }) => {
      if (kind === 'delete') {
        if (rule.is_active) {
          // Deactivation first lets the scheduling domain safely remove future,
          // unattended generated lessons. Deleting only the rule would leave
          // those lesson rows detached from their weekly source.
          await httpRequest('PATCH', `/api/v1/schedule/rules/${rule.id}/`, { body: { is_active: false } });
        }
        return httpRequest('DELETE', `/api/v1/schedule/rules/${rule.id}/`);
      }
      if (kind === 'toggle') return httpRequest('PATCH', `/api/v1/schedule/rules/${rule.id}/`, { body: { is_active: !rule.is_active } });
      const payload = {
        term: Number(selectedTerm?.id),
        cohort: Number(cohort.id),
        teacher: Number(draft.teacher),
        room: cohort.default_room ? Number(cohort.default_room) : null,
        lesson_type: rule?.lesson_type || null,
        title: `${cohort.name} · ${weekdayLabel(draft.day)}`,
        rrule: `FREQ=WEEKLY;BYDAY=${draft.day}`,
        start_date: scheduleStart,
        end_date: scheduleEnd,
        start_time: draft.start_time,
        end_time: draft.end_time,
        is_active: rule?.is_active ?? true,
      };
      return httpRequest(rule ? 'PATCH' : 'POST', rule ? `/api/v1/schedule/rules/${rule.id}/` : '/api/v1/schedule/rules/', { body: payload });
    },
    onSuccess: (_saved, variables) => {
      setError(null);
      resetDraft();
      queryClient.invalidateQueries({ queryKey: ['api'] });
      const messages = {
        create: 'Weekly lesson time added.',
        update: 'Weekly lesson time updated.',
        delete: 'Weekly lesson time removed.',
        toggle: variables.rule.is_active ? 'Weekly lesson time paused.' : 'Weekly lesson time resumed.',
      };
      toast.success(messages[variables.kind], { title: 'Schedule updated' });
    },
    onError: (failure) => {
      setError(failure);
      toast.danger(mutationMessage(failure, 'The weekly lesson time could not be saved.'), { title: 'Schedule not changed' });
    },
  });
  const submit = (event) => {
    event.preventDefault();
    setError(null);
    if (!draft.teacher) {
      setError({ errors: { teacher: ['Assign a teacher to this group first.'] } });
      return;
    }
    if (!selectedTerm) {
      setError({ errors: { term: ['Create or mark an academic term as current first.'] } });
      return;
    }
    if (!scheduleStart || !scheduleEnd || scheduleStart > scheduleEnd) {
      setError({ errors: { term: ['The selected term does not overlap this group’s dates.'] } });
      return;
    }
    if (!draft.start_time || !draft.end_time || draft.start_time >= draft.end_time) {
      setError({ errors: { end_time: ['The lesson must end after it starts.'] } });
      return;
    }
    const rule = editingId ? rules.rows.find((item) => String(item.id) === String(editingId)) : null;
    mutation.mutate({ kind: rule ? 'update' : 'create', rule });
  };
  const edit = (rule) => {
    setEditingId(rule.id);
    setError(null);
    setDraft({
      day: ruleWeekday(rule),
      start_time: String(rule.start_time || '').slice(0, 5),
      end_time: String(rule.end_time || '').slice(0, 5),
      teacher: String(rule.teacher || ''),
      term: String(rule.term || ''),
    });
  };
  return <section className="gp3-settings-card gp3-schedule-settings"><header><span><Icon source={Icons.cal} size={17} /></span><div><h2>Weekly schedule</h2><p>Add, change, pause, or remove the recurring lesson times for this group.</p></div></header><div className="gp3-management-panel">
    {error ? <div className="fw-form-error" role="alert">{mutationMessage(error, 'Review the lesson time and try again.')}</div> : null}
    {!teachers.length ? <div className="gp3-move-warning"><Icon source={Icons.flag} size={16} /><span><strong>A teaching assignment is required</strong><small>Open Teaching team, assign the main teacher, then return here to prepare weekly lessons.</small></span></div> : null}
    {rules.error ? <QueryFailure error={rules.error} retry={rules.retry} title="Weekly lesson times could not be loaded" /> : rules.pending ? <LoadingPanel lines={3} /> : rules.rows.length ? <div className="gp3-rule-list">{rules.rows.map((rule) => <article key={rule.id} className={String(editingId) === String(rule.id) ? 'is-editing' : ''}><span className="gp3-rule-day">{weekdayLabel(ruleWeekday(rule)).slice(0, 3)}</span><div><strong>{weekdayLabel(ruleWeekday(rule))}</strong><small>{String(rule.start_time || '').slice(0, 5)} – {String(rule.end_time || '').slice(0, 5)} · {text(rule.teacher_name)}</small><small>{text(rule.term_name)} · {dateOnly(rule.start_date)} – {dateOnly(rule.end_date)}</small></div><Status value={rule.is_active ? 'active' : 'paused'}>{rule.is_active ? 'Active' : 'Paused'}</Status><div className="gp3-rule-actions"><button type="button" className="gp3-button" onClick={() => edit(rule)} disabled={mutation.isPending}>Edit</button><button type="button" className="gp3-button" onClick={() => mutation.mutate({ kind: 'toggle', rule })} disabled={mutation.isPending}>{rule.is_active ? 'Pause' : 'Resume'}</button><button type="button" className="gp3-button is-danger" onClick={() => { if (window.confirm(`Remove the ${weekdayLabel(ruleWeekday(rule))} recurring lesson time? Future lessons without attendance will be removed.`)) mutation.mutate({ kind: 'delete', rule }); }} disabled={mutation.isPending}>Remove</button></div></article>)}</div> : <div className="gp3-compact-empty"><span><Icon source={Icons.cal} size={20} /></span><div><strong>No weekly lesson times yet</strong><p>Add the first teaching day below. The lesson calendar will be generated automatically.</p></div></div>}
    <form className="gp3-schedule-form" onSubmit={submit}><div className="gp3-schedule-form-head"><div><strong>{editingId ? 'Edit weekly lesson time' : 'Add a weekly lesson time'}</strong><small>Use a separate row when different days have different times.</small></div>{editingId ? <button type="button" className="gp3-button" onClick={resetDraft}>Cancel editing</button> : null}</div><label><span>Day</span><select value={draft.day} onChange={(event) => setDraft((current) => ({ ...current, day: event.target.value }))}>{WEEKDAYS.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label><span>Starts</span><input required type="time" value={draft.start_time} onChange={(event) => setDraft((current) => ({ ...current, start_time: event.target.value }))} /></label><label><span>Ends</span><input required type="time" min={draft.start_time || undefined} value={draft.end_time} onChange={(event) => setDraft((current) => ({ ...current, end_time: event.target.value }))} /></label><label><span>Teacher</span><select required value={draft.teacher} onChange={(event) => setDraft((current) => ({ ...current, teacher: event.target.value }))}><option value="">Assign a teacher first</option>{teachers.map((assignment) => <option value={assignment.teacher} key={assignment.id || assignment.teacher}>{assignment.teacher_name} · {assignment.teacher_type_name || 'Teacher'}</option>)}</select></label><label><span>Academic term</span><select required value={draft.term || currentTerm?.id || ''} onChange={(event) => setDraft((current) => ({ ...current, term: event.target.value }))}><option value="">Select term</option>{terms.rows.map((term) => <option value={term.id} key={term.id}>{term.name}{term.is_current ? ' · Current' : ''}</option>)}</select></label><button className="gp3-button is-primary" type="submit" disabled={mutation.isPending || !teachers.length || terms.pending}>{mutation.isPending ? 'Saving…' : editingId ? 'Save lesson time' : 'Add lesson time'}</button><div className="gp3-schedule-window"><Icon source={Icons.cal} size={15} /><span><strong>Lesson window</strong><small>{selectedTerm && scheduleStart <= scheduleEnd ? `${dateOnly(scheduleStart)} – ${dateOnly(scheduleEnd)}` : 'Choose a term that overlaps the group dates.'}</small></span></div></form>
  </div></section>;
}

function OverviewSection({ cohort, membersState, teachersState, dashboardState, lessonsState, range, basePath, access, onNav }) {
  const today = todayInOrganization();
  const activeMembers = membersState.rows.filter((member) => String(member.start_date || '') <= today && (!member.end_date || member.end_date >= today));
  const capacity = validCount(cohort.capacity);
  const reportedCurrentStudents = validCount(cohort.current_student_count);
  const declaredMemberTotal = declaredCollectionTotal(membersState);
  const membersComplete = collectionComplete(membersState);
  const trustworthyReportedCurrent = reportedCurrentStudents != null && reportedCurrentStudents >= activeMembers.length
    ? reportedCurrentStudents
    : null;
  const trustworthyMemberTotal = declaredMemberTotal != null && declaredMemberTotal >= membersState.rows.length
    ? declaredMemberTotal
    : null;
  const exactCurrentStudents = trustworthyReportedCurrent != null
    ? trustworthyReportedCurrent
    : membersComplete
      ? activeMembers.length
      : trustworthyMemberTotal;
  const loadedCurrentStudents = activeMembers.length;
  const utilization = exactCurrentStudents != null && capacity != null && capacity > 0
    ? exactCurrentStudents / capacity * 100
    : null;
  const attendanceRows = Array.isArray(dashboardState.data?.students) ? dashboardState.data.students : [];
  const attendanceOutcomeCount = attendanceRows.reduce((total, row) => total + (finite(row.total) || 0), 0);
  const attendanceRate = attendanceOutcomeCount > 0 ? dashboardState.data?.rate : null;
  const attendanceComplete = dashboardState.complete;
  const memberValue = membersState.pending
    ? '…'
    : membersState.error
      ? '—'
      : exactCurrentStudents != null
        ? formatBusinessNumber(exactCurrentStudents)
        : loadedCurrentStudents > 0
          ? `${formatBusinessNumber(loadedCurrentStudents)} loaded`
          : '—';
  const memberDetail = membersState.error
    ? 'Membership is temporarily unavailable'
    : exactCurrentStudents == null
      ? 'The membership result is partial; an exact current-student total is unavailable'
      : !membersComplete
        ? `${formatBusinessNumber(loadedCurrentStudents)} current membership${loadedCurrentStudents === 1 ? ' is' : 's are'} loaded; the exact total is reported separately`
        : capacity != null
          ? `${formatBusinessNumber(capacity)} recorded seats`
          : 'Capacity not recorded';
  const utilizationDetail = membersState.error
    ? 'Membership is temporarily unavailable'
    : exactCurrentStudents == null
      ? 'Withheld until an exact current-student total is available'
      : capacity == null || capacity <= 0
        ? 'A positive recorded capacity is required'
        : 'Exact current students ÷ recorded capacity';
  const attendanceDetail = dashboardState.error
    ? 'Attendance summary is temporarily unavailable'
    : !attendanceComplete && attendanceOutcomeCount === 0
      ? 'Attendance summary coverage is incomplete; a zero rate cannot be verified'
      : attendanceOutcomeCount > 0
        ? `${formatBusinessNumber(attendanceOutcomeCount)} ${attendanceComplete ? 'recorded' : 'loaded'} outcomes across ${formatBusinessNumber(attendanceRows.length)} students${attendanceComplete ? '' : ' · partial summary'}`
        : 'No attendance outcomes recorded';
  const upcoming = lessonsState.rows.slice().sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at))).slice(0, 6);
  return (
    <div className="gp3-section-stack">
      <DateRangeForm groupId={cohort.id} section="overview" range={range} basePath={basePath} onNav={onNav} />
      <div className="gp3-metrics">
        {access.students ? <Metric label="Current students" value={memberValue} detail={memberDetail} /> : <Metric label="Recorded capacity" value={capacity == null ? '—' : formatBusinessNumber(capacity)} detail="Seats recorded on the group" />}
        {access.students ? <Metric label="Capacity use" value={membersState.pending ? '…' : membersState.error ? '—' : percent(utilization)} detail={utilizationDetail} tone={utilization != null && utilization > 100 ? 'danger' : 'success'} /> : null}
        {access.teachers ? <Metric label="Teaching team" value={teachersState.pending ? '…' : teachersState.error && !assignmentRows(cohort).length ? '—' : formatBusinessNumber(teachersState.rows.length || assignmentRows(cohort).length)} detail={teachersState.error ? 'Using assignments recorded on this group' : 'Recorded assignments'} tone="accent" /> : null}
        {access.attendance ? <Metric label="Attendance" value={dashboardState.pending ? '…' : dashboardState.error || (!attendanceComplete && attendanceOutcomeCount === 0) ? '—' : percent(attendanceRate)} detail={attendanceDetail} tone="success" /> : null}
      </div>
      <div className="gp3-two-col">
        <Panel eyebrow="Group record" title="Operating details" detail="The durable information behind this group.">
          <div className="gp3-facts">
            {access.organization ? <DetailValue label="Branch"><RouteLink to={`branches/${cohort.branch}`} onNav={onNav}>{text(cohort.branch_name)}</RouteLink></DetailValue> : null}
            <DetailValue label="Department" value={text(cohort.department_name)} />
            <DetailValue label="Level" value={text(cohort.level)} />
            <DetailValue label="Default room" value={text(cohort.default_room_name)} />
            <DetailValue label="Capacity" value={capacity == null ? 'Not recorded' : `${formatBusinessNumber(capacity)} students`} />
            <DetailValue label="Created" value={localDate(cohort.created_at)} />
          </div>
        </Panel>
        {access.teachers ? <Panel eyebrow="Teaching" title="Assigned teachers" detail="Open a teacher to continue into their full record.">
          {teachersState.error ? <QueryFailure error={teachersState.error} retry={teachersState.retry} /> : teachersState.pending ? <LoadingPanel lines={3} /> : <TeacherRoster rows={teachersState.rows} cohort={cohort} onNav={onNav} />}
        </Panel> : null}
      </div>
      {access.schedule ? <Panel eyebrow="Recent activity" title="Lessons in the reporting period" detail={`${dateOnly(range.from)} through ${dateOnly(range.to)}`} action={<RouteLink className="gp3-text-link" to={`${basePath}/${cohort.id}/schedule?from=${range.from}&to=${range.to}`} onNav={onNav}>Full schedule <Icon source={Icons.chevR} size={14} /></RouteLink>}>
        {lessonsState.error ? <QueryFailure error={lessonsState.error} retry={lessonsState.retry} /> : lessonsState.pending ? <LoadingPanel lines={4} /> : upcoming.length ? <div className="gp3-activity-list">{upcoming.map((lesson) => <div key={lesson.id}><span className="gp3-activity-icon"><Icon source={Icons.cal} size={16} /></span><span><strong>{text(lesson.title, 'Lesson')}</strong><small>{localDate(lesson.starts_at)} · {text(lesson.room_name)} · {access.teachers ? <RouteLink to={`teachers/directory/${lesson.teacher}`} onNav={onNav}>{text(lesson.teacher_name)}</RouteLink> : text(lesson.teacher_name)}</small></span><Status value={lesson.status}>{lesson.status}</Status></div>)}</div> : <EmptyState icon={Icons.cal} eyebrow="Schedule" title="No lessons are recorded in this period" description="Change the reporting period to inspect another part of the schedule." />}
      </Panel> : null}
    </div>
  );
}

function MembershipManager({ cohort, members, canCreateStudent, onNav, standalone = false }) {
  const [moveMode, setMoveMode] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [joinReason, setJoinReason] = useState('');
  const [memberId, setMemberId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [error, setError] = useState(null);
  const toast = useToast();
  const students = useWorkspaceData('/api/v1/students/', {
    page_size: PAGE_SIZE,
    branch: cohort.branch,
    status: 'active',
    has_cohort: moveMode ? true : false,
    search: search || undefined,
    ordering: 'student_id',
  });
  const groups = useWorkspaceData('/api/v1/cohorts/', {
    page_size: PAGE_SIZE,
    branch: cohort.branch,
    is_archived: false,
    ordering: 'name',
  });
  const candidates = students.rows.filter((student) => (
    String(student.current_cohort || '') !== String(cohort.id)
    && (moveMode ? Boolean(student.current_cohort) : !student.current_cohort)
  ));
  const selectedCandidate = candidates.find((student) => String(student.id) === String(candidateId));
  const selectedMember = members.find((member) => String(member.student) === String(memberId));
  const targetGroups = groups.rows.filter((group) => String(group.id) !== String(cohort.id));
  const mutation = useMutation({
    mutationFn: ({ kind, student, target, reason }) => {
      if (kind === 'enroll') return httpRequest('POST', `/api/v1/cohorts/${cohort.id}/enroll/`, { body: { student: Number(student), start_date: todayInOrganization() } });
      if (kind === 'move-in') return httpRequest('POST', `/api/v1/cohorts/${cohort.id}/move-student/`, { body: { student: Number(student), reason } });
      if (kind === 'move-out') return httpRequest('POST', `/api/v1/cohorts/${target}/move-student/`, { body: { student: Number(student), reason } });
      return httpRequest('POST', `/api/v1/cohorts/${cohort.id}/remove-student/`, { body: { student: Number(student), reason } });
    },
    onSuccess: (saved, variables) => {
      setError(null);
      setCandidateId('');
      setJoinReason('');
      setMemberId('');
      setTargetId('');
      setMoveReason('');
      queryClient.invalidateQueries({ queryKey: ['api'] });
      const messages = {
        enroll: 'Student enrolled in this group.',
        'move-in': 'Student moved into this group.',
        'move-out': 'Student moved to the selected group.',
        remove: 'Student removed from this group and kept enrolled at the center.',
      };
      if (saved?.over_capacity) toast.warning('The move was recorded, but the destination group is now above its recorded capacity.', { title: 'Capacity review needed' });
      else toast.success(messages[variables.kind], { title: 'Membership updated' });
    },
    onError: (failure) => {
      setError(failure);
      toast.danger(mutationMessage(failure, 'The student membership could not be changed.'), { title: 'Membership not changed' });
    },
  });

  const addOrMove = (event) => {
    event.preventDefault();
    if (!selectedCandidate) return;
    const moving = Boolean(selectedCandidate.current_cohort);
    if (moving && !joinReason.trim()) {
      setError({ errors: { reason: ['Record why this student is changing groups.'] } });
      return;
    }
    if (moving && !window.confirm(`Move ${text(selectedCandidate.full_name || selectedCandidate.student_id, 'this student')} from ${text(selectedCandidate.current_cohort_name, 'their current group')} into ${text(cohort.name)}? Their current active group membership will be closed and this change will be recorded.`)) return;
    if (!moving && !window.confirm(`Enroll ${text(selectedCandidate.full_name || selectedCandidate.student_id, 'this student')} in ${text(cohort.name)}?`)) return;
    mutation.mutate({ kind: moving ? 'move-in' : 'enroll', student: selectedCandidate.id, reason: joinReason.trim() });
  };
  const moveOut = (event) => {
    event.preventDefault();
    if (!selectedMember || !targetId || !moveReason.trim()) return;
    const target = targetGroups.find((group) => String(group.id) === String(targetId));
    if (!window.confirm(`Move ${text(selectedMember.student_name, 'this student')} from ${text(cohort.name)} to ${text(target?.name, 'the selected group')}? Their current membership will be closed and the reason will be recorded.`)) return;
    mutation.mutate({ kind: 'move-out', student: selectedMember.student, target: targetId, reason: moveReason.trim() });
  };
  const remove = () => {
    if (!selectedMember || !moveReason.trim()) {
      setError({ errors: { reason: ['Record why this student is leaving the group.'] } });
      return;
    }
    if (!window.confirm(`Remove ${text(selectedMember.student_name, 'this student')} from ${text(cohort.name)} without assigning another group?`)) return;
    mutation.mutate({ kind: 'remove', student: selectedMember.student, reason: moveReason.trim() });
  };

  const content = (
      <div className="gp3-management-panel">
        {error ? <div className="fw-form-error" role="alert">{mutationMessage(error, 'The membership could not be changed.')}</div> : null}
        <section className="gp3-management-section">
          <header><div><strong>{moveMode ? 'Move a student from another group' : 'Add an unassigned active student'}</strong><small>{moveMode ? 'This closes the student’s current membership and requires a recorded reason and confirmation.' : 'Only active students in this branch who do not currently have a primary group are shown.'}</small></div>{canCreateStudent ? <RouteLink className="gp3-button" to={`students/new?branch=${cohort.branch}&cohort=${cohort.id}`} onNav={onNav}><Icon source={Icons.plus} size={14} /> Create student</RouteLink> : null}</header>
          <div className="gp3-candidate-modes" role="group" aria-label="Student assignment mode"><button type="button" className={!moveMode ? 'is-active' : ''} onClick={() => { setMoveMode(false); setCandidateId(''); setJoinReason(''); }}>Unassigned students</button><button type="button" className={moveMode ? 'is-active is-warning' : ''} onClick={() => { setMoveMode(true); setCandidateId(''); setJoinReason(''); }}>Move from another group</button></div>
          {moveMode ? <div className="gp3-move-warning" role="note"><Icon source={Icons.flag} size={17} /><span><strong>Moving a student affects their active enrollment</strong><small>The previous group membership will end immediately. Review the current group, enter a reason, and confirm before continuing.</small></span></div> : null}
          <form className="gp3-search-inline" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setCandidateId(''); }}><label><span>Find a student</span><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength="100" placeholder="Name, phone, or student ID" /></label><button type="submit" className="gp3-button">Search</button></form>
          {students.pending ? <LoadingPanel lines={2} /> : students.error ? <QueryFailure error={students.error} retry={students.retry} title="Student choices could not be loaded" /> : (
            <form className="gp3-inline-form" onSubmit={addOrMove}>
              <label className="is-wide"><span>Student</span><select required value={candidateId} onChange={(event) => { setCandidateId(event.target.value); setError(null); }}><option value="">{moveMode ? 'Select a student to move' : 'Select an unassigned student'}</option>{candidates.map((student) => <option value={student.id} key={student.id}>{student.full_name || student.student_id}{student.current_cohort ? ` · Current group: ${student.current_cohort_name || `group ${student.current_cohort}`}` : ' · Unassigned'}</option>)}</select></label>
              {selectedCandidate?.current_cohort ? <label className="is-wide"><span>Reason for move</span><input required maxLength="64" value={joinReason} onChange={(event) => setJoinReason(event.target.value)} placeholder="For example, level placement change" /></label> : null}
              <button type="submit" className="gp3-button is-primary" disabled={mutation.isPending || !selectedCandidate}>{mutation.isPending ? 'Updating…' : selectedCandidate?.current_cohort ? 'Move into this group' : 'Enroll in this group'}</button>
            </form>
          )}
          {!students.pending && !students.error && !candidates.length ? <p className="gp3-management-note">{moveMode ? 'No active students in another group match this search.' : 'No active unassigned students match this search. Try another name or create a student record.'}</p> : null}
        </section>
        <section className="gp3-management-section">
          <header><div><strong>Move or remove a current student</strong><small>These changes require a reason and confirmation because they alter active membership.</small></div></header>
          <form className="gp3-inline-form" onSubmit={moveOut}>
            <label><span>Current student</span><select required value={memberId} onChange={(event) => { setMemberId(event.target.value); setError(null); }}><option value="">Select a student</option>{members.map((member) => <option value={member.student} key={member.id || member.student}>{member.student_name}</option>)}</select></label>
            <label><span>Destination group</span><select required value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={groups.pending}><option value="">Select another group</option>{targetGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
            <label className="is-wide"><span>Reason</span><input required maxLength="64" value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder="Record the operational reason" /></label>
            <div className="gp3-inline-actions"><button type="submit" className="gp3-button is-primary" disabled={mutation.isPending || !selectedMember || !targetId || !moveReason.trim()}>Move student</button><button type="button" className="gp3-button is-danger" onClick={remove} disabled={mutation.isPending || !selectedMember || !moveReason.trim()}>Remove without another group</button></div>
          </form>
        </section>
      </div>
  );
  if (standalone) return <section className="gp3-settings-card"><header><span><Icon source={Icons.cohort} size={17} /></span><div><h2>Student membership</h2><p>Add eligible students or use a confirmed move workflow.</p></div></header>{content}</section>;
  return (
    <details className="gp3-manage-disclosure gp3-membership-manager">
      <summary><span><Icon source={Icons.settings} size={15} /> Manage group membership</span><small>Add, move, or remove students with an auditable reason</small></summary>
      {content}
    </details>
  );
}

function StudentsSection({ cohort, membersState, dashboardState, canViewAttendance, onNav }) {
  const dashboardByStudent = new Map((dashboardState.data?.students || []).map((row) => [String(row.student), row]));
  const membersComplete = collectionComplete(membersState);
  function exportStudents() {
    const columns = [
      { label: 'Student', value: (row) => safeSpreadsheetValue(row.student_name) },
      { label: 'Joined group', value: (row) => row.start_date },
      { label: 'Left group', value: (row) => row.end_date },
      { label: 'Move reason', value: (row) => safeSpreadsheetValue(row.moved_reason) },
    ];
    if (canViewAttendance) columns.push({
      label: 'Attendance',
      value: (row) => {
        const attendance = dashboardByStudent.get(String(row.student));
        return dashboardState.complete && validCount(attendance?.total) > 0
          ? boundedPercent(attendance.percent_present) ?? ''
          : '';
      },
    });
    downloadSpreadsheet(`${safeFilename(cohort.name)}-students-${todayInOrganization()}.csv`, columns, membersState.rows);
  }
  return <Panel eyebrow="Membership" title="Students" detail="Current membership connected to each student's full record." action={<button type="button" className="gp3-button" disabled={!membersState.rows.length} onClick={exportStudents} title="Downloads an Excel-compatible file"><Icon source={Icons.doc} size={14} /> Download spreadsheet</button>}>
    {membersState.error ? <QueryFailure error={membersState.error} retry={membersState.retry} /> : membersState.pending ? <LoadingPanel lines={7} /> : membersState.rows.length ? <>
      <CoverageNote complete={membersComplete} loaded={membersState.rows.length} total={membersState.total} />
      {canViewAttendance && dashboardState.error ? <div className="gp3-inline-warning" role="status"><Icon source={Icons.flag} size={15} /><span>Attendance summaries are temporarily unavailable. Membership information below is still current.</span><button type="button" onClick={() => dashboardState.retry()}>Retry attendance</button></div> : null}
      <div className="gp3-table-wrap" role="region" aria-label="Group students, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Group students"><thead><tr><th>Student</th><th>Joined</th><th>Membership</th>{canViewAttendance ? <th>Attendance</th> : null}<th>Move reason</th><th><span className="gp3-sr-only">Open</span></th></tr></thead><tbody>
        {membersState.rows.map((member) => {
          const attendance = dashboardByStudent.get(String(member.student));
          const today = todayInOrganization();
          const future = String(member.start_date || '') > today;
          const current = !future && (!member.end_date || member.end_date >= today);
          const attendanceDetail = dashboardState.pending
            ? 'Loading attendance…'
            : dashboardState.error
              ? 'Attendance unavailable'
              : attendance
                ? `${attendance.present} present · ${attendance.absent} absent`
                : 'No records in the current period';
          const hasAttendanceEvidence = dashboardState.complete && validCount(attendance?.total) > 0 && boundedPercent(attendance?.percent_present) != null;
          return <tr key={member.id}><td><RouteLink to={`students/directory/${member.student}`} onNav={onNav}><strong>{text(member.student_name)}</strong><small>Student #{member.student}</small></RouteLink></td><td>{dateOnly(member.start_date)}</td><td><Status value={current ? 'active' : future ? 'scheduled' : 'ended'}>{current ? 'Current' : future ? `Starts ${dateOnly(member.start_date)}` : `Ended ${dateOnly(member.end_date)}`}</Status></td>{canViewAttendance ? <td><strong>{dashboardState.pending ? '…' : hasAttendanceEvidence ? percent(boundedPercent(attendance.percent_present)) : '—'}</strong><small>{attendanceDetail}</small></td> : null}<td>{text(member.moved_reason, '—')}</td><td><RouteLink className="gp3-icon-link" to={`students/directory/${member.student}`} onNav={onNav}><Icon source={Icons.chevR} size={15} /><span className="gp3-sr-only">Open {member.student_name}</span></RouteLink></td></tr>;
        })}
      </tbody></table></div>
    </> : <EmptyState icon={Icons.cohort} eyebrow="Membership" title="No students are recorded for this group" description="The group exists, but no membership history is available." />}
  </Panel>;
}

function GroupSettingsSection({ cohort, membersState, teachersState, access, onNav, branchId }) {
  const areas = [
    { id: 'details', label: 'Group details', detail: 'Identity, cycle, dates, room', icon: Icons.settings },
    ...(access.teachers ? [{ id: 'teaching', label: 'Teaching team', detail: 'Main and additional teachers', icon: Icons.user }] : []),
    ...(access.students ? [{ id: 'students', label: 'Students', detail: 'Add or safely move students', icon: Icons.cohort }] : []),
    ...(access.scheduleWrite ? [{ id: 'schedule', label: 'Weekly schedule', detail: 'Days, times, and recurring lessons', icon: Icons.cal }] : []),
  ];
  const [activeArea, setActiveArea] = useState('details');
  const area = areas.some((item) => item.id === activeArea) ? activeArea : 'details';
  const assignments = teachersState.rows.length ? teachersState.rows : assignmentRows(cohort);
  const currentMembers = membersState.rows.filter((member) => !member.end_date).length;
  return <div className="gp3-settings-layout">
    <aside className="gp3-settings-rail"><div className="gp3-settings-rail-head"><span><Icon source={Icons.shield} size={18} /></span><div><strong>Group setup</strong><small>Configure one area at a time</small></div></div><nav aria-label="Group setup areas">{areas.map((item) => <button type="button" key={item.id} className={area === item.id ? 'is-active' : ''} aria-current={area === item.id ? 'page' : undefined} onClick={() => setActiveArea(item.id)}><span><Icon source={item.icon} size={17} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><Icon source={Icons.chevR} size={14} /></button>)}</nav><div className="gp3-settings-summary"><div><span>Study month</span><strong>{validCount(cohort.study_month) || 1}</strong></div><div><span>Lessons / month</span><strong>{[8, 12].includes(Number(cohort.lesson_cycle_length)) ? cohort.lesson_cycle_length : 12}</strong></div>{access.teachers ? <div><span>Teachers</span><strong>{teachersState.pending ? '…' : assignments.length}</strong></div> : null}{access.students ? <div><span>Current students</span><strong>{membersState.pending ? '…' : currentMembers}</strong></div> : null}</div></aside>
    <div className="gp3-settings-workarea"><div className="gp3-settings-intro"><span><Icon source={areas.find((item) => item.id === area)?.icon || Icons.settings} size={18} /></span><div><strong>{areas.find((item) => item.id === area)?.label}</strong><p>{area === 'details' ? 'Keep the group’s identity, study month, lesson cycle, capacity, dates, and room in one clear record.' : area === 'teaching' ? 'Choose the main teacher and add assistant, video, substitute, or other teaching roles with confirmation.' : area === 'students' ? 'Start with unassigned active students. Moving someone from another group always requires a warning, reason, and confirmation.' : 'Maintain the days and exact times that generate this group’s lesson calendar.'}</p></div></div>
      {area === 'details' ? <section className="gp3-settings-card"><header><span><Icon source={Icons.settings} size={17} /></span><div><h2>Group details</h2><p>Maintain the group record and the 8- or 12-lesson study-month cycle.</p></div></header><div className="gp3-settings-card-body"><GroupEditor id={cohort.id} branchId={branchId} access={access} onNav={onNav} recordData={cohort} embedded /></div></section> : null}
      {area === 'teaching' ? teachersState.error ? <QueryFailure error={teachersState.error} retry={teachersState.retry} title="Teaching assignments could not be loaded" /> : teachersState.pending ? <LoadingPanel lines={4} /> : <TeacherAssignmentManager cohort={cohort} rows={assignments} standalone /> : null}
      {area === 'students' ? membersState.error ? <QueryFailure error={membersState.error} retry={membersState.retry} title="Student membership could not be loaded" /> : membersState.pending ? <LoadingPanel lines={5} /> : <MembershipManager cohort={cohort} members={membersState.rows} canCreateStudent={access.studentsWrite} onNav={onNav} standalone /> : null}
      {area === 'schedule' ? <GroupScheduleManager cohort={cohort} /> : null}
    </div>
  </div>;
}

function AttendanceMatrix({ members, dashboardRows, lessons, records, complete, onNav }) {
  const lessonMap = new Map();
  lessons.forEach((lesson) => lessonMap.set(String(lesson.id), lesson));
  records.forEach((record) => {
    const key = String(record.lesson);
    if (!lessonMap.has(key)) lessonMap.set(key, { id: record.lesson, title: record.lesson_title, starts_at: record.lesson_starts_at, teacher: record.teacher, teacher_name: record.teacher_name });
  });
  const columns = [...lessonMap.values()].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const studentMap = new Map();
  members.forEach((member) => studentMap.set(String(member.student), { id: member.student, name: member.student_name }));
  dashboardRows.forEach((row) => {
    if (!studentMap.has(String(row.student))) studentMap.set(String(row.student), { id: row.student, name: row.name, code: row.student_code });
  });
  const students = [...studentMap.values()].sort((a, b) => text(a.name).localeCompare(text(b.name)));
  const recordMap = new Map(records.map((record) => [`${record.student}:${record.lesson}`, record]));
  if (!students.length || !columns.length) return <EmptyState icon={Icons.cal} eyebrow="Attendance matrix" title="There is not enough recorded information for a matrix" description="A matrix appears when this group has students and lessons in the selected period." />;
  return <>
    <CoverageNote complete={complete} loaded={records.length} total={records.length}>
      {complete ? 'All loaded lessons and attendance rows for this period are represented below.' : 'This is a partial matrix because one or more registers exceeded the current view. Missing cells must not be interpreted as absences.'}
    </CoverageNote>
    <div className="gp3-matrix-wrap" role="region" tabIndex="0" aria-label="Scrollable attendance matrix">
      <table className="gp3-matrix" aria-label="Attendance by student and lesson"><thead><tr><th>Student</th>{columns.map((lesson) => <th key={lesson.id} title={`${text(lesson.title, 'Lesson')} · ${localDate(lesson.starts_at)}`}><span>{dateOnly(lesson.starts_at)}</span><small>{timeOnly(lesson.starts_at)}</small></th>)}</tr></thead><tbody>
        {students.map((student) => <tr key={student.id}><th><RouteLink to={`students/directory/${student.id}`} onNav={onNav}>{text(student.name)}</RouteLink><small>{student.code || `#${student.id}`}</small></th>{columns.map((lesson) => {
          const record = recordMap.get(`${student.id}:${lesson.id}`);
          const status = record?.status;
          return <td key={lesson.id}><span className={`gp3-att-cell${status ? ` is-${status}` : ''}`} title={status ? ATTENDANCE_LABELS[status] || status : 'No attendance record'} aria-label={`${text(student.name)}, ${dateOnly(lesson.starts_at)}: ${status ? ATTENDANCE_LABELS[status] || status : 'No record'}`}>{status ? ATTENDANCE_SHORT[status] || '?' : '—'}</span></td>;
        })}</tr>)}
      </tbody></table>
    </div>
    <div className="gp3-legend" aria-label="Attendance legend">{Object.entries(ATTENDANCE_LABELS).map(([key, label]) => <span key={key}><i className={`is-${key}`} />{label}</span>)}<span><i />No record</span></div>
  </>;
}

function monthEnd(month) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
}

function MonthlyAttendance({ cohort, records, lessons, basePath, onNav }) {
  const lessonDates = new Map(lessons.map((lesson) => [String(lesson.id), lesson.starts_at]));
  const months = new Map();
  records.forEach((record) => {
    const date = String(record.lesson_starts_at || lessonDates.get(String(record.lesson)) || '').slice(0, 10);
    const month = date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const current = months.get(month) || { month, present: 0, total: 0 };
    current.total += 1;
    if (record.status === 'present') current.present += 1;
    months.set(month, current);
  });
  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 2) return null;
  return <Panel eyebrow="Movement" title="Monthly recorded presence" detail="Present outcomes divided by all recorded outcomes in each month. Select a month to inspect its exact matrix.">
    <div className="gp3-month-bars">{rows.map((row) => {
      const rate = row.total ? row.present / row.total * 100 : 0;
      const label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.month}-01T12:00:00Z`));
      return <button type="button" key={row.month} onClick={() => navigate(onNav, `${basePath}/${cohort.id}/attendance?from=${row.month}-01&to=${monthEnd(row.month)}`)}>
        <span><strong>{label}</strong><small>{formatBusinessNumber(row.present)} present · {formatBusinessNumber(row.total)} outcomes</small></span>
        <span className="gp3-month-track"><i style={{ width: `${rate > 0 ? Math.max(2, Math.min(100, rate)) : 0}%` }} /></span>
        <strong>{percent(rate)}</strong>
      </button>;
    })}</div>
  </Panel>;
}

function AttendanceSection({ cohort, membersState, dashboardState, recordsState, lessonsState, range, basePath, onNav }) {
  const records = recordsState.rows;
  const dashboardRows = Array.isArray(dashboardState.data?.students) ? dashboardState.data.students : [];
  const dashboardCountsValid = dashboardRows.every((row) => validCount(row.total) != null);
  const dashboardOutcomeCount = dashboardCountsValid
    ? dashboardRows.reduce((total, row) => total + validCount(row.total), 0)
    : 0;
  const attendanceRate = dashboardOutcomeCount > 0 ? boundedPercent(dashboardState.data?.rate) : null;
  const dashboardComplete = dashboardState.complete;
  const periodMembers = membersState.rows.filter((member) => String(member.start_date || '') <= range.to && (!member.end_date || String(member.end_date) >= range.from));
  const counts = Object.fromEntries(Object.keys(ATTENDANCE_LABELS).map((status) => [status, records.filter((record) => record.status === status).length]));
  const recordsComplete = collectionComplete(recordsState);
  const sourceComplete = collectionComplete(membersState) && recordsComplete && collectionComplete(lessonsState);
  const registerPartial = !recordsState.pending && !recordsState.error && !recordsComplete;
  const recordValue = (value) => recordsState.pending
    ? '…'
    : recordsState.error || (registerPartial && value === 0)
      ? '—'
      : formatBusinessNumber(value);
  const recordDetail = registerPartial ? 'Loaded outcomes · partial register' : 'Recorded outcomes';
  const dashboardDetail = dashboardState.error
    ? 'Attendance summary is temporarily unavailable'
    : dashboardRows.length > 0 && !dashboardCountsValid
      ? 'Attendance outcome counts are incomplete or invalid'
    : !dashboardComplete && dashboardOutcomeCount === 0
      ? 'Attendance summary coverage is incomplete; a zero rate cannot be verified'
      : dashboardOutcomeCount > 0 && attendanceRate == null
        ? 'The recorded attendance percentage is outside the valid range'
      : dashboardOutcomeCount > 0
        ? `Present records ÷ all ${dashboardComplete ? 'recorded' : 'loaded'} outcomes${dashboardComplete ? '' : ' · partial summary'}`
        : 'No attendance outcomes recorded';
  const declaredRecords = declaredCollectionTotal(recordsState);
  return <div className="gp3-section-stack">
    <DateRangeForm groupId={cohort.id} section="attendance" range={range} basePath={basePath} onNav={onNav} />
    <div className="gp3-metrics">
      <Metric label="Group attendance" value={dashboardState.pending ? '…' : dashboardState.error || (!dashboardComplete && dashboardOutcomeCount === 0) ? '—' : percent(attendanceRate)} detail={dashboardDetail} tone="success" />
      <Metric label="Present" value={recordValue(counts.present)} detail={recordDetail} tone="success" />
      <Metric label="Absent" value={recordValue(counts.absent)} detail={recordDetail} tone="danger" />
      <Metric label="Late / excused" value={recordValue(counts.late + counts.excused)} detail={recordDetail} tone="accent" />
    </div>
    {registerPartial ? <CoverageNote complete={false} loaded={records.length} total={declaredRecords ?? records.length}>
      {declaredRecords != null
        ? `Loaded ${formatBusinessNumber(records.length)} of ${formatBusinessNumber(declaredRecords)} attendance records. Status cards show loaded non-zero counts only; zero values are withheld until the register is complete.`
        : `${formatBusinessNumber(records.length)} attendance records are loaded from a partial register. Status cards show loaded non-zero counts only; zero values are withheld until coverage is complete.`}
    </CoverageNote> : null}
    {!recordsState.pending && !recordsState.error && recordsComplete ? <MonthlyAttendance cohort={cohort} records={records} lessons={lessonsState.rows} basePath={basePath} onNav={onNav} /> : null}
    <Panel eyebrow="Read-only record" title="Attendance matrix" detail={`${dateOnly(range.from)} through ${dateOnly(range.to)}. Blank cells mean no record, never an assumed absence.`}>
      {[membersState, recordsState, lessonsState].some((state) => state.error) ? <QueryFailure error={[membersState, recordsState, lessonsState].find((state) => state.error)?.error} retry={() => Promise.all([membersState.retry(), recordsState.retry(), lessonsState.retry()])} /> : [membersState, recordsState, lessonsState].some((state) => state.pending) ? <LoadingPanel lines={8} /> : <AttendanceMatrix members={periodMembers} dashboardRows={dashboardRows} lessons={lessonsState.rows} records={records} complete={sourceComplete} onNav={onNav} />}
    </Panel>
    <Panel eyebrow="Student summary" title="Attendance by student" detail="Counts come from the group attendance summary for this reporting period.">
      {dashboardState.error ? <QueryFailure error={dashboardState.error} retry={dashboardState.retry} /> : dashboardState.pending ? <LoadingPanel lines={6} /> : dashboardRows.length ? <div className="gp3-table-wrap" role="region" aria-label="Student attendance summary, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Student attendance summary"><thead><tr><th>Student</th><th>Attendance</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Total</th></tr></thead><tbody>{dashboardRows.map((student) => <tr key={student.student}><td><RouteLink to={`students/directory/${student.student}`} onNav={onNav}><strong>{text(student.name)}</strong><small>{text(student.student_code, `#${student.student}`)}</small></RouteLink></td><td><strong>{validCount(student.total) > 0 && boundedPercent(student.percent_present) != null ? percent(boundedPercent(student.percent_present)) : '—'}</strong></td><td>{validCount(student.present) ?? '—'}</td><td>{validCount(student.absent) ?? '—'}</td><td>{validCount(student.late) ?? '—'}</td><td>{validCount(student.excused) ?? '—'}</td><td>{validCount(student.total) ?? '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={Icons.cal} eyebrow="Attendance summary" title="No attendance has been recorded in this period" description="Choose another reporting period to inspect earlier records." />}
    </Panel>
  </div>;
}

function CoverAssignmentManager({ cohort, lessons, access }) {
  const [choices, setChoices] = useState({});
  const [error, setError] = useState(null);
  const toast = useToast();
  const covers = useWorkspaceData('/api/v1/cover/', { page_size: PAGE_SIZE, branch: cohort.branch, status: 'open', ordering: '-created_at' }, { enabled: access.cover });
  const lessonMap = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
  const rows = covers.rows.filter((cover) => lessonMap.has(String(cover.lesson)));
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: PAGE_SIZE, branch: cohort.branch, is_active: true }, { enabled: access.coverApprove && rows.length > 0 });
  const mutation = useMutation({
    mutationFn: ({ cover, action, teacher }) => {
      const path = action === 'assign'
        ? `/api/v1/cover/${cover}/assign/`
        : action === 'open-pool'
          ? `/api/v1/cover/${cover}/open-pool/`
          : `/api/v1/cover/${cover}/reject/`;
      return httpRequest('POST', path, { body: action === 'assign' ? { cover_teacher: Number(teacher) } : {} });
    },
    onSuccess: (_saved, variables) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      const message = variables.action === 'assign' ? 'Cover teacher assigned and the lesson schedule updated.' : variables.action === 'open-pool' ? 'The request is open to eligible teachers in the branch.' : 'The cover request was rejected.';
      toast.success(message, { title: 'Lesson cover updated' });
    },
    onError: (failure) => {
      setError(failure);
      toast.danger(mutationMessage(failure, 'The cover request could not be updated.'), { title: failure?.code === 'cover_conflict' ? 'Teacher is not free at this time' : 'Cover not updated' });
    },
  });
  if (!access.cover) return null;
  return <Panel eyebrow="Absence coverage" title="Open cover requests" detail="Assign another active teacher or open the lesson to the branch pool. Schedule conflicts are verified by the backend before reassignment.">
    {error ? <div className="fw-form-error" role="alert">{mutationMessage(error, 'The cover request could not be updated.')}</div> : null}
    {covers.error ? <QueryFailure error={covers.error} retry={covers.retry} title="Lesson-cover requests could not be opened" /> : covers.pending ? <LoadingPanel lines={3} /> : rows.length ? <div className="gp3-cover-list">{rows.map((cover) => { const lesson = lessonMap.get(String(cover.lesson)); const choice = choices[cover.id] || ''; return <article key={cover.id}><div><span className="gp3-activity-icon"><Icon source={Icons.user} size={16} /></span><span><strong>{text(lesson?.title, `Lesson ${cover.lesson}`)}</strong><small>{localDate(lesson?.starts_at)} · {text(lesson?.teacher_name, 'Teacher not recorded')}</small><small>{text(cover.reason, 'No absence reason was recorded')}</small></span><Status value={cover.pool ? 'pool' : cover.status}>{cover.pool ? 'Open pool' : cover.status}</Status></div>{access.coverApprove ? <div className="gp3-cover-actions"><select aria-label={`Cover teacher for ${text(lesson?.title, 'lesson')}`} value={choice} onChange={(event) => setChoices((current) => ({ ...current, [cover.id]: event.target.value }))}><option value="">Select an active teacher</option>{teachers.rows.filter((teacher) => String(teacher.id) !== String(lesson?.teacher)).map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.full_name || teacher.name}{teacher.is_substitute ? ' · Substitute' : ''}</option>)}</select><button type="button" className="gp3-button is-primary" disabled={!choice || mutation.isPending} onClick={() => mutation.mutate({ cover: cover.id, action: 'assign', teacher: choice })}>Assign cover</button><button type="button" className="gp3-button" disabled={cover.pool || mutation.isPending} onClick={() => mutation.mutate({ cover: cover.id, action: 'open-pool' })}>Open to pool</button><button type="button" className="gp3-button is-danger" disabled={mutation.isPending} onClick={() => { if (window.confirm('Reject this open cover request?')) mutation.mutate({ cover: cover.id, action: 'reject' }); }}>Reject</button></div> : null}</article>; })}</div> : <EmptyState icon={Icons.check} eyebrow="Cover board" title="No open cover requests for these lessons" description="A request appears here after the lesson’s assigned teacher records an absence request." />}
  </Panel>;
}

function ScheduleSection({ cohort, lessonsState, range, basePath, access, onNav }) {
  return <div className="gp3-section-stack"><DateRangeForm groupId={cohort.id} section="schedule" range={range} basePath={basePath} onNav={onNav} /><Panel eyebrow="Teaching calendar" title="Schedule" detail={`${dateOnly(range.from)} through ${dateOnly(range.to)}`}>
    {lessonsState.error ? <QueryFailure error={lessonsState.error} retry={lessonsState.retry} /> : lessonsState.pending ? <LoadingPanel lines={7} /> : lessonsState.rows.length ? <>
      <CoverageNote complete={collectionComplete(lessonsState)} loaded={lessonsState.rows.length} total={lessonsState.total} />
      <div className="gp3-table-wrap" role="region" aria-label="Group schedule, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Group schedule"><thead><tr><th>Date and time</th><th>Lesson</th><th>Teacher</th><th>Room</th><th>Type</th><th>State</th></tr></thead><tbody>{lessonsState.rows.map((lesson) => <tr key={lesson.id}><td><strong>{localDate(lesson.starts_at)}</strong><small>Ends {localDate(lesson.ends_at)}</small></td><td>{text(lesson.title, 'Lesson')}</td><td>{access.teachers ? <RouteLink to={`teachers/directory/${lesson.teacher}`} onNav={onNav}>{text(lesson.teacher_name)}</RouteLink> : text(lesson.teacher_name)}</td><td>{text(lesson.room_name)}</td><td>{text(lesson.lesson_type_name)}</td><td><Status value={lesson.status}>{lesson.status}</Status>{lesson.cancel_reason ? <small>{lesson.cancel_reason}</small> : null}</td></tr>)}</tbody></table></div>
    </> : <EmptyState icon={Icons.cal} eyebrow="Schedule" title="No lessons are recorded in this period" description="Choose another reporting period to inspect the teaching calendar." />}
  </Panel>{!lessonsState.pending && !lessonsState.error ? <CoverAssignmentManager cohort={cohort} lessons={lessonsState.rows} access={access} /> : null}</div>;
}

function LearningSection({ assignmentsState }) {
  return <Panel eyebrow="Learning work" title="Assignments" detail="Published, draft, and closed work connected directly to this group.">
    {assignmentsState.error ? <QueryFailure error={assignmentsState.error} retry={assignmentsState.retry} /> : assignmentsState.pending ? <LoadingPanel lines={7} /> : assignmentsState.rows.length ? <>
      <CoverageNote complete={collectionComplete(assignmentsState)} loaded={assignmentsState.rows.length} total={assignmentsState.total} />
      <div className="gp3-card-grid gp3-learning-grid">{assignmentsState.rows.map((assignment) => <article className="gp3-learning-card" key={assignment.id}><div><span className="gp3-learning-icon"><Icon source={Icons.doc} size={17} /></span><Status value={assignment.status}>{assignment.status}</Status></div><h3>{text(assignment.title)}</h3><p>{text(assignment.description, 'No description was recorded.')}</p><dl><div><dt>Due</dt><dd>{localDate(assignment.due_at)}</dd></div><div><dt>Maximum score</dt><dd>{finite(assignment.max_score) == null ? '—' : formatBusinessNumber(assignment.max_score)}</dd></div><div><dt>Resubmissions</dt><dd>{formatBusinessNumber(assignment.max_resubmits || 0)}</dd></div><div><dt>Published</dt><dd>{localDate(assignment.published_at)}</dd></div></dl></article>)}</div>
    </> : <EmptyState icon={Icons.doc} eyebrow="Assignments" title="No assignments are recorded for this group" description="Learning work will appear here when it is connected to the group." />}
  </Panel>;
}

function ExamsSection({ examsState }) {
  return <Panel eyebrow="Assessment" title="Exams" detail="Exam plans connected to this group, including subject, type, weighting, and publication state.">
    {examsState.error ? <QueryFailure error={examsState.error} retry={examsState.retry} /> : examsState.pending ? <LoadingPanel lines={7} /> : examsState.rows.length ? <>
      <CoverageNote complete={collectionComplete(examsState)} loaded={examsState.rows.length} total={examsState.total} />
      <div className="gp3-table-wrap" role="region" aria-label="Group exams, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Group exams"><thead><tr><th>Exam</th><th>Subject</th><th>Term</th><th>Date</th><th>Maximum score</th><th>Weight</th><th>Publication</th></tr></thead><tbody>{examsState.rows.map((exam) => <tr key={exam.id}><td><strong>{text(exam.title)}</strong><small>{text(exam.exam_type_detail?.name)}</small></td><td>{text(exam.subject_name)}</td><td>{text(exam.term_name)}</td><td>{dateOnly(exam.exam_date)}</td><td>{formatBusinessNumber(exam.max_score)}</td><td>{finite(exam.weight) == null ? '—' : formatBusinessNumber(exam.weight, { maximumFractionDigits: 3 })}</td><td><Status value={exam.is_published ? 'published' : 'draft'}>{exam.is_published ? 'Published' : 'Draft'}</Status></td></tr>)}</tbody></table></div>
    </> : <EmptyState icon={Icons.doc} eyebrow="Exams" title="No exams are recorded for this group" description="Exam plans will appear here when they are connected to the group." />}
  </Panel>;
}

function FinanceSection({ invoicesState, canViewStudents, onNav }) {
  const financeComplete = collectionComplete(invoicesState);
  const financialInvoices = invoicesState.rows.filter((invoice) => ['issued', 'partially_paid', 'paid', 'overdue'].includes(String(invoice.status || '').toLowerCase()));
  const measuredInvoiced = completeTotalOf(financialInvoices, 'total_uzs');
  const invoiced = measuredInvoiced == null || (!financeComplete && measuredInvoiced === 0) ? null : measuredInvoiced;
  const balanceFor = (invoice) => invoice.outstanding_uzs != null
    ? finite(invoice.outstanding_uzs) == null || finite(invoice.outstanding_uzs) < 0 ? null : finite(invoice.outstanding_uzs)
    : (() => {
        const total = finite(invoice.total_uzs);
        if (!Array.isArray(invoice.allocations)) return null;
        const allocated = completeTotalOf(invoice.allocations, (allocation) => allocation?.amount_uzs ?? allocation?.amount);
        return total == null || total < 0 || allocated == null || allocated > total ? null : total - allocated;
      })();
  const measuredOutstanding = completeTotalOf(financialInvoices, balanceFor);
  const outstanding = measuredOutstanding == null || (!financeComplete && measuredOutstanding === 0) ? null : measuredOutstanding;
  const settled = invoiced == null || outstanding == null || outstanding > invoiced ? null : invoiced - outstanding;
  const overdueCount = invoicesState.rows.filter((invoice) => invoice.status === 'overdue' || (['issued', 'partially_paid'].includes(invoice.status) && invoice.due_date && invoice.due_date < todayInOrganization())).length;
  const overdue = financeComplete || overdueCount > 0 ? overdueCount : null;
  const value = (amount, formatter = money) => {
    if (invoicesState.pending) return '…';
    if (invoicesState.error || amount == null) return '—';
    return formatter(amount) || '—';
  };
  const incompleteRegister = !financeComplete;
  const missingInvoiceTotals = financialInvoices.length > 0 && invoiced == null;
  const missingBalanceEvidence = financialInvoices.length > 0 && outstanding == null;
  const invoicedDetail = incompleteRegister
    ? invoiced == null
      ? 'Loaded invoice coverage is incomplete; a zero position cannot be verified'
      : 'Loaded invoices only · the group invoice register is incomplete'
    : missingInvoiceTotals
      ? 'One or more invoices has no usable issued value'
      : 'Across loaded group invoices';
  const balanceDetail = incompleteRegister
    ? outstanding == null
      ? 'Loaded invoice coverage is incomplete; a zero position cannot be verified'
      : 'Loaded invoice balances only · the group invoice register is incomplete'
    : missingBalanceEvidence
      ? 'One or more invoices has neither a valid reported balance nor complete allocation evidence'
      : 'Open balance reported or derived from complete allocation evidence';
  return <div className="gp3-section-stack"><div className="gp3-metrics"><Metric label="Invoiced" value={value(invoiced)} detail={invoicedDetail} /><Metric label="Settled value" value={value(settled)} detail={missingBalanceEvidence ? 'Withheld because settled value cannot be established' : incompleteRegister ? 'Loaded invoices only · register is incomplete' : 'Invoice value no longer outstanding'} tone="success" /><Metric label="Outstanding" value={value(outstanding)} detail={balanceDetail} tone={outstanding ? 'accent' : 'success'} /><Metric label="Past due" value={value(overdue, formatBusinessNumber)} detail={incompleteRegister ? 'Loaded invoices requiring review · register is incomplete' : 'Issued invoices requiring review'} tone={overdue ? 'danger' : 'success'} /></div><Panel eyebrow="Group finance" title="Invoices" detail="Every row links the financial record to the student and this learning group.">
    {invoicesState.error ? <QueryFailure error={invoicesState.error} retry={invoicesState.retry} /> : invoicesState.pending ? <LoadingPanel lines={7} /> : invoicesState.rows.length ? <>
      <CoverageNote complete={financeComplete} loaded={invoicesState.rows.length} total={invoicesState.total} />
      <div className="gp3-table-wrap" role="region" aria-label="Group invoices, scrollable table" tabIndex="0"><table className="gp3-table" aria-label="Group invoices"><thead><tr><th>Invoice</th><th>Student</th><th>Period</th><th>Issued / due</th><th>Total</th><th>Settled value</th><th>Balance</th><th>State</th><th><span className="gp3-sr-only">Open</span></th></tr></thead><tbody>{invoicesState.rows.map((invoice) => { const balance = balanceFor(invoice); const total = finite(invoice.total_uzs); const paid = total == null || total < 0 || balance == null || balance > total ? null : total - balance; return <tr key={invoice.id}><td><RouteLink to={`finance/invoices/${invoice.id}`} onNav={onNav}><strong>{text(invoice.number)}</strong><small>{text(invoice.fee_schedule_name)}</small></RouteLink></td><td>{invoice.student && canViewStudents ? <RouteLink to={`students/directory/${invoice.student}`} onNav={onNav}>{text(invoice.student_name)}</RouteLink> : text(invoice.student_name)}</td><td>{text(invoice.period)}</td><td>{dateOnly(invoice.issue_date)}<small>Due {dateOnly(invoice.due_date)}</small></td><td><strong>{money(invoice.total_uzs)}</strong></td><td>{money(paid)}</td><td>{money(balance)}</td><td><Status value={invoice.status}>{invoice.status}</Status></td><td><RouteLink className="gp3-icon-link" to={`finance/invoices/${invoice.id}`} onNav={onNav}><Icon source={Icons.chevR} size={15} /><span className="gp3-sr-only">Open invoice {invoice.number}</span></RouteLink></td></tr>; })}</tbody></table></div>
    </> : <EmptyState icon={Icons.doc} eyebrow="Finance" title="No invoices are connected to this group" description="Group invoices will appear here when they are issued." />}
  </Panel></div>;
}

function InvalidGroup({ onNav, basePath = 'groups', mismatch = false }) {
  return <div className="gp3-page"><EmptyState icon={Icons.flag} eyebrow="Group workspace" title={mismatch ? 'This group is outside the selected branch' : 'This group address is not valid'} description={mismatch ? 'Return to the branch group directory and choose a group recorded for that branch.' : 'Return to the group directory and choose a current record.'} action={<button type="button" className="gp3-button is-primary" onClick={() => navigate(onNav, basePath)}>Open groups</button>} /></div>;
}

function GroupDetail({ groupId, section, sections, route, onNav, branchId, access }) {
  const routed = workspaceRoute(route);
  const range = routeRange(routed.params);
  const base = `/api/v1/cohorts/${groupId}`;
  const cohortState = useWorkspaceData(`${base}/`);
  useWorkspaceTitle(cohortState.data?.name, 'Groups', section);
  const branchVerified = Boolean(cohortState.data && (!branchId || String(cohortState.data.branch) === String(branchId)));
  const needsMembers = access.students && ['overview', 'settings', 'students', 'attendance'].includes(section);
  const needsDashboard = access.attendance && ['overview', 'students', 'attendance'].includes(section);
  const needsLessons = access.schedule && ['overview', 'attendance', 'schedule'].includes(section);
  const membersState = useWorkspaceData(`${base}/members/`, undefined, { enabled: branchVerified && needsMembers });
  const teachersState = useWorkspaceData(`${base}/teachers/`, undefined, { enabled: branchVerified && ['overview', 'settings'].includes(section) && access.teachers });
  const dashboardState = useWorkspaceData(`/api/v1/attendance/cohorts/${groupId}/dashboard/`, {
    date_from: `${range.from}T00:00:00+05:00`,
    date_to: `${range.to}T23:59:59.999+05:00`,
  }, { enabled: branchVerified && needsDashboard });
  const recordsState = useWorkspaceData('/api/v1/attendance/records/', {
    page_size: PAGE_SIZE,
    cohort: groupId,
    date_from: `${range.from}T00:00:00+05:00`,
    date_to: `${range.to}T23:59:59.999+05:00`,
    ordering: 'created_at',
  }, { enabled: branchVerified && section === 'attendance' && access.attendance });
  const lessonsState = useWorkspaceData('/api/v1/schedule/lessons/', {
    page_size: PAGE_SIZE,
    cohort: groupId,
    date_from: `${range.from}T00:00:00+05:00`,
    date_to: `${range.to}T23:59:59.999+05:00`,
    ordering: 'starts_at',
  }, { enabled: branchVerified && needsLessons });
  const assignmentsState = useWorkspaceData('/api/v1/assignments/', { page_size: PAGE_SIZE, cohort: groupId, ordering: '-created_at' }, { enabled: branchVerified && section === 'learning' && access.assignments });
  const examsState = useWorkspaceData('/api/v1/academics/exams/', { page_size: PAGE_SIZE, cohort: groupId, ordering: '-exam_date' }, { enabled: branchVerified && section === 'exams' && access.academics });
  const invoicesState = useWorkspaceData('/api/v1/finance/invoices/', { page_size: PAGE_SIZE, cohort: groupId, ordering: '-created_at' }, { enabled: branchVerified && section === 'finance' && access.finance });

  if (cohortState.pending) return <div className="gp3-page"><LoadingPanel lines={9} /></div>;
  if (cohortState.error || !cohortState.data) return <div className="gp3-page"><QueryFailure error={cohortState.error} retry={cohortState.retry} title="This group workspace could not be opened" /></div>;
  const cohort = cohortState.data;
  const basePath = groupsBase(branchId);
  if (branchId && String(cohort.branch) !== String(branchId)) return <InvalidGroup onNav={onNav} basePath={basePath} mismatch />;
  return <div className="gp3-page gp3-detail"><GroupHero cohort={cohort} basePath={basePath} access={access} onNav={onNav} />
    <GroupSectionNavigation cohort={cohort} section={section} sections={sections} basePath={basePath} range={range} onNav={onNav} />
    <label className="gp3-section-select"><span>Group record section</span><select value={section} onChange={(event) => navigate(onNav, `${basePath}/${cohort.id}/${event.target.value}?from=${range.from}&to=${range.to}`)}>{sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <div className="gp3-detail-content">
        {section === 'overview' ? <OverviewSection cohort={cohort} membersState={membersState} teachersState={teachersState} dashboardState={dashboardState} lessonsState={lessonsState} range={range} basePath={basePath} access={access} onNav={onNav} /> : null}
        {section === 'settings' ? <GroupSettingsSection cohort={cohort} membersState={membersState} teachersState={teachersState} access={access} onNav={onNav} branchId={branchId} /> : null}
        {section === 'students' ? <StudentsSection cohort={cohort} membersState={membersState} dashboardState={dashboardState} canViewAttendance={access.attendance} onNav={onNav} /> : null}
        {section === 'attendance' ? <AttendanceSection cohort={cohort} membersState={membersState} dashboardState={dashboardState} recordsState={recordsState} lessonsState={lessonsState} range={range} basePath={basePath} onNav={onNav} /> : null}
        {section === 'schedule' ? <ScheduleSection cohort={cohort} lessonsState={lessonsState} range={range} basePath={basePath} access={access} onNav={onNav} /> : null}
        {section === 'learning' ? <LearningSection assignmentsState={assignmentsState} /> : null}
        {section === 'exams' ? <ExamsSection examsState={examsState} /> : null}
        {section === 'finance' ? <FinanceSection invoicesState={invoicesState} canViewStudents={access.students} onNav={onNav} /> : null}
    </div>
  </div>;
}

export function GroupsPage({ route = 'groups', onNav, branchId, user }) {
  const routed = workspaceRoute(route);
  const nestedBranch = branchId == null ? '' : String(branchId);
  const branchRoute = nestedBranch && routed.segments[0] === 'branches' && routed.segments[2] === 'groups';
  const rawId = branchRoute ? routed.segments[3] : routed.segments[0] === 'groups' ? routed.segments[1] : undefined;
  const access = useMemo(() => groupAccess(user), [user]);
  const sections = useMemo(() => availableDetailSections(access), [access]);
  const validGroupId = /^\d+$/.test(rawId || '') && Number(rawId) > 0;
  const requestedSection = (branchRoute ? routed.segments[4] : routed.segments[2]) || 'overview';
  const creating = rawId === 'new';
  const editing = validGroupId && requestedSection === 'edit';
  const section = sections.some((item) => item.id === requestedSection) ? requestedSection : 'overview';
  const range = routeRange(routed.params);
  const preserveRange = routed.params.has('from') || routed.params.has('to');

  useEffect(() => {
    if (!access.cohorts || !validGroupId || editing || requestedSection === section) return;
    const suffix = preserveRange ? `?from=${range.from}&to=${range.to}` : '';
    navigate(onNav, `${groupsBase(nestedBranch)}/${rawId}/overview${suffix}`, { replace: true, scroll: false });
  }, [access.cohorts, editing, nestedBranch, onNav, preserveRange, range.from, range.to, rawId, requestedSection, section, validGroupId]);

  if (!access.cohorts) return <div className="gp3-page"><EmptyState icon={Icons.shield} eyebrow="Group workspace" title="Group information is outside this scope" description="This workspace stays closed because the signed-in role does not include group records." /></div>;
  if (!rawId) return <GroupsDirectory route={route} onNav={onNav} branchId={branchId} access={access} />;
  if ((creating || editing) && !access.cohortsWrite) return <div className="gp3-page"><EmptyState icon={Icons.shield} eyebrow="Group administration" title="Group changes are outside this scope" description="Your current role can review group records but cannot create or edit them." action={<button type="button" className="gp3-button" onClick={() => navigate(onNav, groupsBase(nestedBranch))}>Back to groups</button>} /></div>;
  if (creating) return <GroupEditor branchId={nestedBranch} access={access} onNav={onNav} />;
  if (editing) return <GroupEditor id={rawId} branchId={nestedBranch} access={access} onNav={onNav} />;
  if (!/^\d+$/.test(rawId) || Number(rawId) < 1) return <InvalidGroup onNav={onNav} basePath={groupsBase(nestedBranch)} />;
  return <GroupDetail groupId={rawId} section={section} sections={sections} route={route} onNav={onNav} branchId={nestedBranch} access={access} />;
}
