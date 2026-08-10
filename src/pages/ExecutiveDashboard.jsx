import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import {
  ActivityHeatmap,
  ChartCard,
  ChartEmpty,
  ComparisonBars,
  ExecutiveSelect,
  PeriodBars,
  RankedBars,
  SegmentedBreakdown,
} from '../components/ExecutiveCharts.jsx';
import {
  refreshWorkspaceStates,
  useWorkspaceData,
  workspaceRoute,
} from '../hooks/useWorkspaceData.js';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatOrganizationTime,
  isValidDateInput,
  organizationDateInput,
  organizationDateTimeInput,
  organizationHour,
  shiftDateInput,
} from '../lib/formatters.js';

const PAGE_100 = Object.freeze({ page_size: 100 });
const PERIOD_PRESETS = Object.freeze(['30d', '90d', '6m', '12m', 'custom']);
const PERIOD_OPTIONS = Object.freeze([
  { value: '30d', label: 'Last 30 days', detail: 'A focused operating window' },
  { value: '90d', label: 'Last 90 days', detail: 'Quarter-length comparison' },
  { value: '6m', label: 'Last 6 months', detail: 'Medium-term view' },
  { value: '12m', label: 'Last 12 months', detail: 'Annual operating view' },
  { value: 'custom', label: 'Custom dates', detail: 'Choose an inclusive range' },
]);
const STATUS_COLORS = Object.freeze({
  active: 'var(--sf-success)',
  enrolled: 'var(--sf-primary)',
  accepted: 'var(--sf-accent)',
  lead: '#7389b6',
  application: '#9a82ba',
  graduated: '#5f9e8a',
  withdrawn: 'var(--sf-danger)',
  issued: 'var(--sf-warn)',
  paid: 'var(--sf-success)',
  overdue: 'var(--sf-danger)',
  present: 'var(--sf-success)',
  absent: 'var(--sf-danger)',
  late: 'var(--sf-warn)',
  excused: '#7389b6',
});

function finite(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean' || typeof value === 'object') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const number = finite(value);
  return number != null && number >= 0 ? number : null;
}

function boundedPercent(value) {
  const number = finite(value);
  return number != null && number >= 0 && number <= 100 ? number : null;
}

function fraction(value) {
  const number = finite(value);
  return number != null && number >= 0 && number <= 1 ? number : null;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (finite(typeof key === 'function' ? key(row) : row?.[key]) || 0), 0);
}

function completeNonNegativeSum(rows, key) {
  let total = 0;
  for (const row of rows) {
    const value = finite(typeof key === 'function' ? key(row) : row?.[key]);
    if (value == null || value < 0) return null;
    total += value;
  }
  return total;
}

function evidenceSum(state, rows, key) {
  const total = completeNonNegativeSum(rows, key);
  if (total == null) return null;
  return state?.complete || total !== 0 ? total : null;
}

function percent(value) {
  const number = finite(value);
  return number == null ? '\u2014' : `${formatBusinessNumber(number, { maximumFractionDigits: 1 })}%`;
}

function money(value) {
  const amount = finite(value);
  return amount == null ? '\u2014' : formatBusinessMoney(amount, 'UZS') || '\u2014';
}

function snapshotMoney(value) {
  const rawMinor = value?.amount_minor;
  const normalizedMinor = typeof rawMinor === 'string' ? rawMinor.trim() : rawMinor;
  if (
    String(value?.currency || '').trim().toUpperCase() !== 'UZS' ||
    (typeof normalizedMinor !== 'number' && typeof normalizedMinor !== 'string') ||
    (typeof normalizedMinor === 'string' && !/^\d+$/.test(normalizedMinor))
  ) return null;
  const minor = Number(normalizedMinor);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor / 100 : null;
}

function positiveId(value) {
  const candidate = String(value || '');
  return /^[1-9]\d{0,19}$/.test(candidate) ? candidate : 'all';
}

function dateRange(params) {
  const today = organizationDateInput();
  const requestedPreset = String(params.get('range') || '90d');
  const preset = PERIOD_PRESETS.includes(requestedPreset) ? requestedPreset : '90d';
  if (preset === 'custom') {
    const end = isValidDateInput(params.get('to')) ? params.get('to') : today;
    const requestedFrom = isValidDateInput(params.get('from'))
      ? params.get('from')
      : shiftDateInput(end, -89);
    const ordered = requestedFrom <= end
      ? { from: requestedFrom, to: end }
      : { from: end, to: requestedFrom };
    const earliest = shiftDateInput(ordered.to, -365);
    return { from: ordered.from < earliest ? earliest : ordered.from, to: ordered.to, preset };
  }
  const days = { '30d': 30, '90d': 90, '6m': 183, '12m': 365 }[preset] || 90;
  return { from: shiftDateInput(today, -days + 1), to: today, preset };
}

function directoryContains(state, requested) {
  return state.rows.some((row) => String(row.id) === requested);
}

function needsExactLookup(requested, state) {
  if (requested === 'all' || directoryContains(state, requested)) return false;
  return !(state.data != null && !state.pending && !state.error && state.complete);
}

function resolvedDirectoryScope(requested, state, exactState, exactAllowed = () => true) {
  if (requested === 'all') return { value: 'all', ready: true };
  if (directoryContains(state, requested)) return { value: requested, ready: true };
  const complete = Boolean(state.data != null && !state.pending && !state.error && state.complete);
  if (complete) return { value: 'all', ready: true };
  const exact = exactState?.data;
  if (exact && String(exact.id) === requested && exactAllowed(exact)) {
    return { value: requested, ready: true, record: exact };
  }
  const rejected = exact != null || [400, 403, 404].includes(Number(exactState?.error?.status));
  return rejected ? { value: 'all', ready: true } : { value: requested, ready: false };
}

function dashboardRoute(filters) {
  const params = new URLSearchParams();
  if (filters.preset !== '90d') params.set('range', filters.preset);
  if (filters.preset === 'custom') {
    params.set('from', filters.from);
    params.set('to', filters.to);
  }
  if (filters.branch !== 'all') params.set('branch', filters.branch);
  if (filters.teacher !== 'all') params.set('teacher', filters.teacher);
  return params.toString() ? `overview?${params}` : 'overview';
}

function invoiceAllocated(invoice) {
  if (!Array.isArray(invoice?.allocations)) return null;
  return completeNonNegativeSum(invoice.allocations, (row) => row.amount_uzs ?? row.amount);
}

function invoiceBalance(invoice) {
  const supplied = finite(invoice?.outstanding_uzs);
  if (supplied != null) return supplied >= 0 ? supplied : null;
  const total = finite(invoice?.total_uzs);
  const allocated = invoiceAllocated(invoice);
  if (total == null || total < 0 || allocated == null || allocated > total) return null;
  return total - allocated;
}

function evidenceInvoiceBalance(state, rows) {
  return evidenceSum(state, rows, invoiceBalance);
}

function within(value, from, to) {
  if (!value) return false;
  const date = String(value).slice(0, 10);
  return date >= from && date <= to;
}

function firstName(user) {
  const given = String(user?.first_name || '').trim();
  if (given) return given;
  return String(user?.full_name || user?.username || 'there').trim().split(/\s+/)[0];
}

function greeting() {
  const hour = organizationHour(new Date()) ?? 12;
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function RouteLink({ to, onNav, children, className = '' }) {
  return (
    <a
      className={className}
      href={`#/${to}`}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNav(to);
      }}
    >
      {children}
    </a>
  );
}

function FilterBar({ filters, branches, teachers, onChange, onReset }) {
  const hasAdditionalFilters = filters.teacher !== 'all' || filters.preset === 'custom';
  const additionalFilterCount = Number(filters.teacher !== 'all') + Number(filters.preset === 'custom');
  const [expanded, setExpanded] = useState(hasAdditionalFilters);
  const showAdditional = expanded || hasAdditionalFilters;
  const branchOptions = [{ value: 'all', label: 'All branches', detail: 'Entire visible organization' },
    ...branches.map((branch) => ({ value: branch.id, label: branch.name, detail: branch.address || 'Location address not recorded' }))];
  if (filters.branch !== 'all' && !branchOptions.some((option) => String(option.value) === filters.branch)) {
    branchOptions.push({ value: filters.branch, label: 'Checking selected branch…', detail: 'The overview waits for a verified branch record', disabled: true });
  }
  const teacherOptions = [{ value: 'all', label: 'All teachers', detail: 'Do not limit group relationships' },
    ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.full_name, detail: teacher.department_name || teacher.branch_name || 'Faculty record' }))];
  if (filters.teacher !== 'all' && !teacherOptions.some((option) => String(option.value) === filters.teacher)) {
    teacherOptions.push({ value: filters.teacher, label: 'Checking selected teacher…', detail: 'The overview waits for a verified faculty record', disabled: true });
  }
  return (
    <section className="ex-filterbar" aria-label="Dashboard filters">
      <div className="ex-filter-title">
        <span aria-hidden="true">{cloneElement(Icons.filter, { size: 16 })}</span>
        <span><strong>Focus this overview</strong><small>Every selection has a shareable address</small></span>
      </div>
      <ExecutiveSelect label="Period" value={filters.preset} options={PERIOD_OPTIONS} onChange={(value) => onChange('range', value)} />
      <ExecutiveSelect
        label="Branch"
        value={filters.branch}
        options={branchOptions}
        onChange={(value) => onChange('branch', value)}
      />
      <button className="ex-more-filters" type="button" aria-expanded={showAdditional} onClick={() => setExpanded((current) => !current)}>
        {cloneElement(Icons.filter, { size: 14 })}
        {showAdditional ? 'Hide additional' : 'More filters'}
        {hasAdditionalFilters && <b aria-label={`${additionalFilterCount} additional filters active`}>{additionalFilterCount}</b>}
      </button>
      {(filters.branch !== 'all' || filters.teacher !== 'all' || filters.preset !== '90d') && (
        <button className="ex-clear-filters" type="button" onClick={onReset}>Clear</button>
      )}
      {showAdditional && (
        <div className="ex-filter-secondary">
          <ExecutiveSelect
            label="Teacher"
            value={filters.teacher}
            options={teacherOptions}
            onChange={(value) => onChange('teacher', value)}
          />
          {filters.preset === 'custom' && (
            <>
              <label><span>From</span><input type="date" value={filters.from} min={shiftDateInput(filters.to, -365)} max={filters.to} onChange={(event) => onChange('from', event.target.value)} /></label>
              <label><span>To</span><input type="date" value={filters.to} min={filters.from} max={shiftDateInput(filters.from, 365)} onChange={(event) => onChange('to', event.target.value)} /></label>
            </>
          )}
          <p>Teacher scope follows recorded group relationships. Collections and expenses remain unavailable when they cannot be attributed safely.</p>
        </div>
      )}
    </section>
  );
}

function MetricTile({ label, value, detail, icon, tone = 'primary', to, onNav, loading, source }) {
  const content = (
    <>
      <span className={`ex-metric-icon is-${tone}`} aria-hidden="true">{cloneElement(icon, { size: 17 })}</span>
      <span className="ex-metric-label">{label}</span>
      <strong>{loading ? <i className="ex-value-skeleton" /> : value}</strong>
      <small>{detail}</small>
      {source && <em>{source}</em>}
      {to && <span className="ex-metric-arrow" aria-hidden="true">{cloneElement(Icons.chevR, { size: 15 })}</span>}
    </>
  );
  return to ? <RouteLink className="ex-metric" to={to} onNav={onNav}>{content}</RouteLink> : <article className="ex-metric">{content}</article>;
}

function Freshness({ states, onRefresh }) {
  const active = states.filter((state) => state?.enabled);
  const loading = active.some((state) => state.loading);
  const degraded = active.some((state) => state.error || state.paused || state.warnings?.length || (!state.loading && !state.complete));
  const updated = active.map((state) => state.updatedAt).filter(Boolean).sort((a, b) => a - b)[0];
  return (
    <div className="ex-freshness">
      <span><i className={loading ? 'is-loading' : degraded ? 'is-warning' : ''} />{loading ? 'Updating view' : degraded ? 'Some panels need attention' : 'Overview ready'}</span>
      <small>{updated ? `Updated ${formatOrganizationTime(updated)}` : 'Preparing current information'}</small>
      <button type="button" onClick={onRefresh} disabled={loading}>{cloneElement(Icons.trend, { size: 15 })} Refresh</button>
    </div>
  );
}

function SourceNote({ partial, children }) {
  return (
    <div className={`ex-source-note${partial ? ' is-partial' : ''}`}>
      <span aria-hidden="true">{cloneElement(partial ? Icons.flag : Icons.shield, { size: 14 })}</span>
      <span>{children}</span>
    </div>
  );
}

function Queue({ items, onNav, conclusive }) {
  return (
    <section className="ex-queue">
      <header><span>Leadership queue</span><h2>What needs attention</h2><p>Only recorded, actionable signals are shown.</p></header>
      <div>
        {items.length ? items.map((item) => (
          <RouteLink to={item.to} onNav={onNav} key={item.label}>
            <span className={`is-${item.tone}`}>{cloneElement(item.icon, { size: 17 })}</span>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            <b>{formatBusinessNumber(item.value)}</b>
            {cloneElement(Icons.chevR, { size: 15 })}
          </RouteLink>
        )) : conclusive
          ? <div className="ex-queue-clear">No priority exceptions are recorded in the verified current view.</div>
          : <div className="ex-queue-clear">Priority coverage is incomplete, so an all-clear cannot be confirmed.</div>}
        {items.length > 0 && !conclusive && <div className="ex-queue-clear">These recorded priorities are visible, but additional signals may exist outside the available coverage.</div>}
      </div>
    </section>
  );
}

export function ExecutiveDashboardPage({ user, route, onNav }) {
  const { t } = useTranslation();
  const routed = workspaceRoute(route);
  const requestedFilters = {
    ...dateRange(routed.params),
    branch: positiveId(routed.params.get('branch')),
    teacher: positiveId(routed.params.get('teacher')),
  };

  const branchesState = useWorkspaceData('/api/v1/org/branches/', PAGE_100);
  const branchNeedsExact = needsExactLookup(requestedFilters.branch, branchesState);
  const branchExactState = useWorkspaceData(
    branchNeedsExact ? `/api/v1/org/branches/${requestedFilters.branch}/` : '',
    undefined,
    { enabled: branchNeedsExact },
  );
  const branchScope = resolvedDirectoryScope(requestedFilters.branch, branchesState, branchExactState);
  const branchOptions = branchScope.record ? [...branchesState.rows, branchScope.record] : branchesState.rows;
  const teachersState = useWorkspaceData('/api/v1/teachers/', {
    page_size: 100,
    branch: branchScope.ready && branchScope.value !== 'all' ? branchScope.value : undefined,
  }, { enabled: branchScope.ready });
  const teacherNeedsExact = branchScope.ready && needsExactLookup(requestedFilters.teacher, teachersState);
  const teacherExactState = useWorkspaceData(
    teacherNeedsExact ? `/api/v1/teachers/${requestedFilters.teacher}/` : '',
    undefined,
    { enabled: teacherNeedsExact },
  );
  const teacherScope = branchScope.ready
    ? resolvedDirectoryScope(
        requestedFilters.teacher,
        teachersState,
        teacherExactState,
        (teacher) => branchScope.value === 'all' || String(teacher.branch) === branchScope.value,
      )
    : { value: requestedFilters.teacher, ready: false };
  const teacherOptions = teacherScope.record ? [...teachersState.rows, teacherScope.record] : teachersState.rows;
  const filters = { ...requestedFilters, branch: branchScope.value, teacher: teacherScope.value };
  const scopeReady = branchScope.ready && teacherScope.ready;
  const canonicalRoute = dashboardRoute(filters);
  const currentRoute = routed.params.toString() ? `overview?${routed.params}` : 'overview';

  useEffect(() => {
    if (canonicalRoute !== currentRoute) {
      onNav(canonicalRoute, { replace: true, scroll: false });
    }
  }, [canonicalRoute, currentRoute, onNav]);

  const executiveState = useWorkspaceData('/api/v1/intelligence/executive-summary/', {
    branch: scopeReady && filters.branch !== 'all' ? filters.branch : undefined,
    date_from: filters.from,
    date_to: filters.to,
  }, { enabled: scopeReady && filters.teacher === 'all', staleTime: 45_000 });
  // Let the cached aggregate paint the decision-critical headline before the
  // row-heavy drill-down registers compete for the same browser connection.
  const detailReady = scopeReady && (filters.teacher !== 'all' || !executiveState.pending);
  const cohortsState = useWorkspaceData('/api/v1/cohorts/', {
    page_size: 100,
    branch: scopeReady && filters.branch !== 'all' ? filters.branch : undefined,
  }, { enabled: scopeReady });
  const studentsState = useWorkspaceData('/api/v1/students/', {
    page_size: 100,
    status: 'active',
    branch: scopeReady && filters.branch !== 'all' ? filters.branch : undefined,
    teacher: scopeReady && filters.teacher !== 'all' ? filters.teacher : undefined,
  }, { enabled: detailReady });
  // Compatibility reads stay dormant unless an older deployment does not yet
  // expose the aggregate contract. This lets backend and frontend roll out in
  // either order without paying for duplicate registers on the current build.
  const legacyFallback = scopeReady && filters.teacher === 'all' && Boolean(executiveState.error && !executiveState.data);
  const statsState = useWorkspaceData('/api/v1/students/stats/', undefined, { enabled: legacyFallback });
  const comparisonState = useWorkspaceData('/api/v1/students/comparison/', { metric: 'joined', unit: 'month' }, { enabled: detailReady });
  const branchSignalsState = useWorkspaceData('/api/v1/intelligence/branches/', PAGE_100, { enabled: detailReady });
  const teacherSignalsState = useWorkspaceData('/api/v1/intelligence/teachers/', PAGE_100, { enabled: detailReady });
  const riskState = useWorkspaceData('/api/v1/intelligence/risk/', { page_size: 100 }, { enabled: detailReady });
  const attendanceFrom = organizationDateTimeInput(filters.from);
  const attendanceTo = organizationDateTimeInput(filters.to, { endOfDay: true });
  const attendanceWindowValid = Boolean(attendanceFrom && attendanceTo);
  const attendanceState = useWorkspaceData('/api/v1/attendance/records/', {
    page_size: 100,
    date_from: attendanceFrom,
    date_to: attendanceTo,
  }, { enabled: detailReady && attendanceWindowValid });
  const financialWindow = {
    page_size: 100,
    branch: scopeReady && filters.branch !== 'all' ? filters.branch : undefined,
    date_from: filters.from,
    date_to: filters.to,
  };
  const invoicesState = useWorkspaceData('/api/v1/finance/invoices/', financialWindow, { enabled: detailReady });
  const paymentsState = useWorkspaceData('/api/v1/payments/', financialWindow, { enabled: legacyFallback });
  const expensesState = useWorkspaceData('/api/v1/finance/expenses/', financialWindow, { enabled: legacyFallback });

  const allStates = [branchesState, branchExactState, teachersState, teacherExactState, executiveState, cohortsState, studentsState, statsState,
    comparisonState, branchSignalsState, teacherSignalsState, riskState, attendanceState,
    invoicesState, paymentsState, expensesState];

  const cohortIds = new Set(cohortsState.rows.map((cohort) => String(cohort.id)));
  const teacherCohortIds = useMemo(() => {
    if (filters.teacher === 'all') return null;
    return new Set(cohortsState.rows.filter((cohort) =>
      String(cohort.primary_teacher) === String(filters.teacher) ||
      (cohort.teachers || []).some((assignment) => String(assignment.teacher) === String(filters.teacher)))
      .map((cohort) => String(cohort.id)));
  }, [cohortsState.rows, filters.teacher]);
  const effectiveCohorts = teacherCohortIds || cohortIds;
  const relationshipScopeComplete = (filters.branch === 'all' && filters.teacher === 'all') || cohortsState.complete;
  const financeRelationshipComplete = filters.teacher === 'all' || cohortsState.complete;

  const filteredInvoices = invoicesState.rows.filter((invoice) =>
    within(invoice.issue_date || invoice.created_at, filters.from, filters.to) &&
    (filters.teacher === 'all' || (financeRelationshipComplete && effectiveCohorts.has(String(invoice.cohort)))));
  const filteredExpenses = expensesState.rows.filter((expense) => within(expense.created_at, filters.from, filters.to));
  const filteredPayments = paymentsState.rows.filter((payment) => within(payment.paid_at || payment.created_at, filters.from, filters.to));
  const filteredAttendance = attendanceState.rows.filter((record) => {
    // Attendance records are owned by a cohort and do not expose a reliable
    // teacher identity. Scope them through the already authorized cohort list
    // instead of treating the absent teacher field as a genuine zero.
    if (!relationshipScopeComplete) return false;
    if ((filters.branch !== 'all' || filters.teacher !== 'all') &&
        !effectiveCohorts.has(String(record.cohort))) return false;
    return true;
  });

  const visibleBranchSignals = filters.branch === 'all'
    ? branchSignalsState.rows
    : branchSignalsState.rows.filter((branch) => String(branch.branch) === String(filters.branch));
  const selectedTeacherSignal = filters.teacher === 'all'
    ? null
    : teacherSignalsState.rows.find((teacher) => String(teacher.teacher) === String(filters.teacher));
  const scopedTeacherIds = new Set(teachersState.rows.map((teacher) => String(teacher.id)));
  const visibleTeacherSignals = filters.teacher === 'all'
    ? teacherSignalsState.rows.filter((teacher) => filters.branch === 'all' || scopedTeacherIds.has(String(teacher.teacher)))
    : teacherSignalsState.rows.filter((teacher) => String(teacher.teacher) === String(filters.teacher));

  const visibleRisk = (filters.branch === 'all' && filters.teacher === 'all')
    ? riskState.rows
    : relationshipScopeComplete
      ? riskState.rows.filter((item) => effectiveCohorts.has(String(item.cohort)))
      : [];

  const snapshot = filters.teacher === 'all' ? executiveState.data : null;
  const snapshotStudents = snapshot?.students;
  const snapshotAttendance = snapshot?.attendance;
  const snapshotFinance = snapshot?.finance;
  const loadedAttendanceDenominator = filteredAttendance.filter((record) => record.status !== 'excused').length;
  const loadedAttended = filteredAttendance.filter((record) => ['present', 'late'].includes(record.status)).length;
  const snapshotAttendanceDenominator = nonNegative(snapshotAttendance?.denominator);
  const snapshotAttendanceRate = fraction(snapshotAttendance?.attendance_rate_fraction);
  const snapshotAttendancePresent = snapshotAttendance != null &&
    (snapshotAttendanceDenominator != null || snapshotAttendanceRate != null);
  const snapshotAttendanceComplete = snapshotAttendanceDenominator != null &&
    (snapshotAttendanceDenominator === 0 || snapshotAttendanceRate != null);
  const loadedAttendanceUsable = !snapshotAttendancePresent && relationshipScopeComplete && attendanceState.data != null;
  const attendanceDenominator = snapshotAttendancePresent
    ? snapshotAttendanceDenominator
    : loadedAttendanceUsable ? loadedAttendanceDenominator : null;
  const attendanceRate = snapshotAttendancePresent
    ? snapshotAttendanceComplete && snapshotAttendanceDenominator > 0
      ? snapshotAttendanceRate * 100
      : null
    : loadedAttendanceUsable && loadedAttendanceDenominator > 0
      ? loadedAttended / loadedAttendanceDenominator * 100
      : null;
  const issuedInvoices = filteredInvoices.filter((invoice) => ['issued', 'partially_paid', 'paid', 'overdue'].includes(String(invoice.status).toLowerCase()));
  const financeTeacherScoped = filters.teacher !== 'all';
  const snapshotActiveStudents = nonNegative(snapshotStudents?.active);
  const snapshotBilled = snapshotMoney(snapshotFinance?.billed);
  const snapshotCollected = snapshotMoney(snapshotFinance?.collected);
  const snapshotExpenses = snapshotMoney(snapshotFinance?.paid_expense);
  const snapshotOutstanding = snapshotMoney(snapshotFinance?.outstanding_for_invoices_issued_in_window);
  const billed = snapshotBilled ??
    (financeRelationshipComplete && invoicesState.data ? evidenceSum(invoicesState, issuedInvoices, 'total_uzs') : null);
  const collected = financeTeacherScoped ? null : snapshotCollected ??
    (paymentsState.data ? evidenceSum(paymentsState, filteredPayments.filter((payment) => String(payment.status).toLowerCase() === 'completed'), 'amount_uzs') : null);
  const expenses = financeTeacherScoped ? null : snapshotExpenses ??
    (expensesState.data ? evidenceSum(expensesState, filteredExpenses.filter((expense) => String(expense.status).toLowerCase() === 'paid'), 'amount_uzs') : null);
  const outstanding = snapshotOutstanding ??
    (financeRelationshipComplete && invoicesState.data ? evidenceInvoiceBalance(invoicesState, issuedInvoices) : null);
  const activeStudents = snapshotActiveStudents ??
    (studentsState.data ? studentsState.total : null);
  const groupCapacity = cohortsState.complete ? completeNonNegativeSum(cohortsState.rows, 'capacity') : null;
  const studentsByCohort = studentsState.rows.reduce((map, student) => {
    const key = String(student.current_cohort || 'unassigned');
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  const monthSeries = useMemo(() => {
    if (invoicesState.data == null || !invoicesState.complete || issuedInvoices.some((invoice) => finite(invoice.total_uzs) == null)) return [];
    const from = new Date(`${filters.from}T00:00:00`);
    const to = new Date(`${filters.to}T00:00:00`);
    const months = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to && months.length < 13) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' }), value: 0, count: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    issuedInvoices.forEach((invoice) => {
      const key = String(invoice.issue_date || invoice.created_at || '').slice(0, 7);
      const point = months.find((month) => month.key === key);
      if (point) {
        point.value += finite(invoice.total_uzs);
        point.count += 1;
      }
    });
    return months.map((month) => ({ ...month, detail: `${formatBusinessNumber(month.count)} issued ${month.count === 1 ? 'invoice' : 'invoices'}` }));
  }, [invoicesState.complete, invoicesState.data, issuedInvoices, filters.from, filters.to]);

  const scoredTeacherSignals = visibleTeacherSignals.filter((item) => boundedPercent(item.engagement_score) != null);
  const teachingActivity = selectedTeacherSignal
    ? boundedPercent(selectedTeacherSignal.engagement_score)
    : scoredTeacherSignals.length
      ? sum(scoredTeacherSignals, (signal) => boundedPercent(signal.engagement_score)) / scoredTeacherSignals.length
      : null;

  const statusMix = Object.entries(
    studentsState.rows.reduce((map, student) => {
      const key = student.status || 'unknown';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {}),
  ).map(([label, value]) => ({ key: label, label: label.replaceAll('_', ' '), value, color: STATUS_COLORS[label] || 'var(--sf-muted)' }));
  const riskMix = Object.entries(
    visibleRisk.reduce((map, item) => {
      const key = item.level || 'review';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {}),
  ).map(([label, value]) => ({ key: label, label, value, color: label === 'high' ? 'var(--sf-danger)' : label === 'medium' ? 'var(--sf-warn)' : 'var(--sf-success)' }));
  const locationBars = Object.entries(
    studentsState.rows.reduce((map, student) => {
      const key = String(student.location || 'Not recorded').trim() || 'Not recorded';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value }));

  const scopedDirectory = filters.branch !== 'all' || filters.teacher !== 'all';
  const snapshotPlacement = filters.teacher === 'all' ? nonNegative(snapshotStudents?.ungrouped) : null;
  const legacyPlacement = filters.teacher === 'all' ? nonNegative(statsState.data?.without_cohort) : null;
  const snapshotBlocked = filters.teacher === 'all' ? nonNegative(snapshotStudents?.blocked) : null;
  const legacyBlocked = filters.teacher === 'all' ? nonNegative(statsState.data?.blocked) : null;
  const snapshotOverdue = filters.teacher === 'all' ? nonNegative(snapshotFinance?.overdue_invoice_count) : null;
  const placementCount = snapshotPlacement != null
    ? snapshotPlacement
    : legacyPlacement != null
      ? legacyPlacement
    : studentsState.data ? studentsState.rows.filter((student) => !student.current_cohort).length : null;
  const blockedCount = snapshotBlocked != null
    ? snapshotBlocked
    : legacyBlocked != null
      ? legacyBlocked
    : studentsState.data ? studentsState.rows.filter((student) => student.blocked).length : null;
  const overdueCount = snapshotOverdue != null
    ? snapshotOverdue
    : invoicesState.data ? filteredInvoices.filter((invoice) => invoice.status === 'overdue').length : null;
  const placementConclusive = snapshotPlacement != null || legacyPlacement != null || studentsState.complete;
  const blockedConclusive = snapshotBlocked != null || legacyBlocked != null || studentsState.complete;
  const overdueConclusive = snapshotOverdue != null || invoicesState.complete;
  const queue = [
    { value: placementCount, label: 'Students awaiting a group', detail: placementConclusive ? 'Verified current records in this scope.' : 'Recorded items in the available coverage.', to: 'students?group=none', icon: Icons.cohort, tone: 'warn' },
    { value: blockedCount, label: 'Enrollment holds', detail: blockedConclusive ? 'Verified current records in this scope.' : 'Recorded items in the available coverage.', to: 'students?blocked=true', icon: Icons.shield, tone: 'danger' },
    { value: visibleRisk.filter((item) => item.level === 'high').length, label: 'High-priority student signals', detail: 'Open the explainable risk record.', to: 'intelligence/risk', icon: Icons.flag, tone: 'danger' },
    { value: overdueCount, label: 'Overdue invoices in view', detail: 'Follow up with the connected family.', to: 'finance/invoices?status=overdue', icon: Icons.trend, tone: 'warn' },
  ].filter((item) => finite(item.value) > 0);
  const queueConclusive = [placementCount, blockedCount, overdueCount].every((value) => finite(value) != null) &&
    placementConclusive && blockedConclusive && overdueConclusive &&
    riskState.data != null && riskState.complete && relationshipScopeComplete;

  const updateFilter = (key, value) => {
    const params = new URLSearchParams(canonicalRoute.split('?')[1] || '');
    if (key === 'range') {
      const nextPreset = PERIOD_PRESETS.includes(String(value)) ? String(value) : '90d';
      if (nextPreset === '90d') params.delete('range');
      else params.set('range', nextPreset);
      if (nextPreset !== 'custom') {
        params.delete('from');
        params.delete('to');
      }
    } else if (['branch', 'teacher'].includes(key)) {
      const nextId = value === 'all' ? 'all' : positiveId(value);
      if (nextId === 'all') params.delete(key);
      else params.set(key, nextId);
      if (key === 'branch') params.delete('teacher');
    } else if (['from', 'to'].includes(key) && isValidDateInput(value)) {
      params.set(key, value);
      params.set('range', 'custom');
    }
    onNav(params.toString() ? `overview?${params}` : 'overview', { scroll: false });
  };
  const resetFilters = () => onNav('overview', { scroll: false });
  // TanStack Query permits an explicit refetch even when a query is disabled.
  // Keep compatibility fallbacks and permission-pruned reads dormant unless
  // their panel is genuinely active in the current filter scope.
  const refreshAll = () => refreshWorkspaceStates(allStates);

  if (!scopeReady) {
    return (
      <div className="ex-page ex-dashboard">
        <header className="ex-hero">
          <div>
            <span className="ex-eyebrow">Executive overview</span>
            <h1>{greeting()}, {firstName(user)}.</h1>
            <p>Money, students, teaching delivery, and branch health in one decision-ready view.</p>
          </div>
          <Freshness states={[branchesState, branchExactState, teachersState, teacherExactState]} onRefresh={() => refreshWorkspaceStates([branchesState, branchExactState, teachersState, teacherExactState])} />
        </header>
        <FilterBar filters={filters} branches={branchOptions} teachers={teacherOptions} onChange={updateFilter} onReset={resetFilters} />
        <SourceNote partial>
          Verifying the selected branch and teacher before loading scoped leadership information. You can clear the filters while this check completes.
        </SourceNote>
      </div>
    );
  }

  return (
    <div className="ex-page ex-dashboard">
      <header className="ex-hero">
        <div>
          <span className="ex-eyebrow">Executive overview</span>
          <h1>{greeting()}, {firstName(user)}.</h1>
          <p>Money, students, teaching delivery, and branch health in one decision-ready view.</p>
        </div>
        <div className="ex-hero-actions">
          <RouteLink to="star-ai" onNav={onNav}>{cloneElement(Icons.ai, { size: 16 })} Ask StarAI</RouteLink>
          <RouteLink to="reports/library" onNav={onNav}>{cloneElement(Icons.doc, { size: 16 })} Reports</RouteLink>
        </div>
        <Freshness states={allStates} onRefresh={refreshAll} />
      </header>

      <FilterBar filters={filters} branches={branchOptions} teachers={teacherOptions} onChange={updateFilter} onReset={resetFilters} />

      <div className="ex-metric-grid">
        <MetricTile label="Active students" value={activeStudents == null ? '\u2014' : formatBusinessNumber(activeStudents)} detail={cohortsState.data ? `${formatBusinessNumber(cohortsState.total)} groups in this scope` : 'Group coverage is temporarily unavailable'} icon={Icons.cohort} to="students" onNav={onNav} loading={filters.teacher === 'all' ? executiveState.pending : studentsState.pending} source={snapshotActiveStudents != null ? 'Exact management snapshot' : studentsState.data ? 'Current visible records' : 'Unavailable'} />
        <MetricTile label="Issued billing in view" value={money(billed)} detail={billed == null ? 'The consolidated invoice view is temporarily unavailable' : 'Invoices issued in the selected reporting window'} icon={Icons.doc} tone="accent" to="finance/invoices" onNav={onNav} loading={filters.teacher === 'all' ? executiveState.pending : invoicesState.pending} source={snapshotBilled != null ? 'Exact management snapshot' : billed == null ? 'Unavailable' : invoicesState.complete ? 'Complete current register' : 'Loaded records only'} />
        <MetricTile label="Completed collections" value={financeTeacherScoped || collected == null ? '—' : money(collected)} detail={financeTeacherScoped ? 'Not attributable to one teacher from current records' : collected == null ? 'The consolidated money view is temporarily unavailable' : 'Completed payments in the selected branch and period'} icon={Icons.trend} tone="success" to="finance/payments" onNav={onNav} loading={!financeTeacherScoped && (executiveState.pending || paymentsState.pending)} source={financeTeacherScoped ? 'Filter unavailable' : snapshotCollected != null ? 'Exact management snapshot' : collected != null ? 'Compatible current register' : 'Unavailable'} />
        <MetricTile label="Outstanding balance" value={money(outstanding)} detail={outstanding == null ? 'The consolidated invoice view is temporarily unavailable' : 'Issued value less recorded allocations'} icon={Icons.flag} tone={outstanding == null ? 'primary' : outstanding > 0 ? 'warn' : 'success'} to="finance/invoices?status=issued" onNav={onNav} loading={filters.teacher === 'all' ? executiveState.pending : invoicesState.pending} source={outstanding == null ? 'Unavailable' : 'Not net income'} />
        <MetricTile label="Visible attendance" value={percent(attendanceRate)} detail={attendanceDenominator == null ? 'Attendance evidence is temporarily unavailable' : attendanceDenominator === 0 ? 'No non-excused marks are recorded in this range' : attendanceRate == null ? `The attendance rate is unavailable for ${formatBusinessNumber(attendanceDenominator)} recorded outcomes` : `${formatBusinessNumber(attendanceDenominator)} non-excused marks in range`} icon={Icons.check} tone={attendanceRate != null && attendanceRate < 85 ? 'warn' : 'success'} to="groups" onNav={onNav} loading={filters.teacher === 'all' ? executiveState.pending : attendanceState.pending} source={snapshotAttendanceComplete ? 'Exact management snapshot' : snapshotAttendancePresent ? 'Snapshot incomplete' : loadedAttendanceUsable ? 'Present + late · loaded records' : 'Unavailable'} />
        <MetricTile label="Teaching activity" value={percent(teachingActivity)} detail={teacherSignalsState.data == null ? 'Teaching evidence is temporarily unavailable' : selectedTeacherSignal ? `${selectedTeacherSignal.lessons_delivered} lessons · ${selectedTeacherSignal.students_reached} students` : `${formatBusinessNumber(scoredTeacherSignals.length)} teachers with recorded engagement`} icon={Icons.user} tone="primary" to="teachers" onNav={onNav} loading={teacherSignalsState.pending} source={teacherSignalsState.data == null ? 'Unavailable' : 'Recent attendance engagement'} />
      </div>

      <SourceNote partial={allStates.some((state) => state.enabled && (state.error || state.paused || state.warnings?.length || (!state.loading && !state.complete)))}>
        {filters.teacher === 'all'
          ? 'Headline student, attendance, and money totals share one permission-pruned management snapshot. Detail charts use the visible registers and disclose incomplete coverage. Intelligence scores remain their defined recent 30-day measures.'
          : 'Teacher scope follows recorded group relationships. Collections and expenses remain unavailable because they cannot be attributed safely to one teacher; every other loaded detail is labeled by its real coverage. Intelligence scores remain their defined recent 30-day measures.'}
      </SourceNote>

      <div className="ex-dashboard-grid ex-grid-money">
        <ChartCard eyebrow="Money" title="Financial position" description={`Recorded activity from ${filters.from} to ${filters.to}. Values are not a profit-and-loss statement.`} className="is-wide">
          <ComparisonBars
            formatter={money}
            onSelect={(item) => onNav(item.to)}
            data={[
              { label: 'Issued billing', detail: 'Issued invoice totals', value: billed, color: 'var(--sf-primary)', to: `finance/invoices?from=${filters.from}&to=${filters.to}` },
              { label: 'Completed collections', detail: financeTeacherScoped ? 'Unavailable for teacher scope' : collected == null ? 'Snapshot unavailable' : 'Completed payments', value: collected ?? undefined, color: 'var(--sf-success)', to: `finance/payments?from=${filters.from}&to=${filters.to}&status=completed` },
              { label: 'Paid expenses', detail: financeTeacherScoped ? 'Unavailable for teacher scope' : expenses == null ? 'Snapshot unavailable' : 'Completed disbursements', value: expenses ?? undefined, color: 'var(--sf-warn)', to: `finance/expenses?from=${filters.from}&to=${filters.to}&status=paid` },
              { label: 'Outstanding', detail: 'Invoice value less allocations', value: outstanding, color: 'var(--sf-danger)', to: `finance/invoices?from=${filters.from}&to=${filters.to}&status=issued` },
            ]}
          />
        </ChartCard>
        <Queue items={queue} onNav={onNav} conclusive={queueConclusive} />
      </div>

      <div className="ex-dashboard-grid">
        <ChartCard eyebrow="Billing periods" title="Issued value by recorded month" description="Discrete issue-month totals · UZS · selected period. Separate columns avoid implying movement between sparse observations." className="is-wide">
          {invoicesState.data == null
            ? <ChartEmpty>Billing-period detail is temporarily unavailable.</ChartEmpty>
            : !invoicesState.complete
              ? <ChartEmpty>Billing-period coverage is incomplete, so no zero-value trend has been inferred.</ChartEmpty>
            : issuedInvoices.some((invoice) => finite(invoice.total_uzs) == null)
              ? <ChartEmpty>Billing-period amounts are incomplete, so no zero-value trend has been inferred.</ChartEmpty>
              : <PeriodBars data={monthSeries} formatter={money} onSelect={(month) => {
            const [year, rawMonth] = month.key.split('-').map(Number);
            const end = new Date(year, rawMonth, 0).getDate();
            onNav(`finance/invoices?from=${month.key}-01&to=${month.key}-${String(end).padStart(2, '0')}`);
          }} />}
        </ChartCard>
        <ChartCard eyebrow="Enrollment" title="Month-over-month joins" description="Current and previous calendar windows from enrollment records.">
          {scopedDirectory ? <ChartEmpty>Enrollment comparison is organization-wide in the current records and is hidden while branch or teacher scope is active.</ChartEmpty> : <ComparisonBars formatter={(value) => formatBusinessNumber(value)} data={[
            { label: 'Previous month', value: nonNegative(comparisonState.data?.previous), color: 'var(--sf-muted-2)' },
            { label: 'Current month', value: nonNegative(comparisonState.data?.current), color: 'var(--sf-primary)' },
          ]} />}
        </ChartCard>
      </div>

      <div className="ex-dashboard-grid">
        <ChartCard eyebrow="Branch comparison" title="Branch health ranking" description="Fixed recent 30-day score · attendance 50%, grades 30%, lower student risk 20%" className="is-wide" action={<RouteLink to="branches" onNav={onNav}>Compare branches {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          {filters.teacher !== 'all' ? <ChartEmpty>Branch rankings are hidden while one teacher is selected because the score is not a teacher-attribution measure.</ChartEmpty> : <RankedBars data={visibleBranchSignals.map((branch) => ({
            id: branch.branch,
            rank: branch.rank,
            label: branch.name,
            value: boundedPercent(branch.score),
            detail: `${formatBusinessNumber(nonNegative(branch.active_students))} students · ${fraction(branch.attendance_rate) == null ? 'attendance unavailable' : `${percent(fraction(branch.attendance_rate) * 100)} attendance`}`,
            metrics: [
              { label: 'Attendance', value: fraction(branch.attendance_rate) == null ? '—' : percent(fraction(branch.attendance_rate) * 100) },
              { label: 'Average grade', value: percent(boundedPercent(branch.avg_grade_pct)) },
              { label: 'At-risk share', value: fraction(branch.at_risk_rate) == null ? '—' : percent(fraction(branch.at_risk_rate) * 100) },
            ],
          }))} onSelect={(branch) => onNav(`branches/${branch.id}/overview`)} />}
        </ChartCard>
        <ChartCard eyebrow="Student portfolio" title="Enrollment status mix" description="Current active view; based on the loaded directory.">
          <SegmentedBreakdown data={statusMix} onSelect={(item) => onNav(`students?status=${item.key}`)} />
        </ChartCard>
      </div>

      <div className="ex-dashboard-grid">
        <ChartCard eyebrow="Teaching delivery" title="Recent teacher engagement" description="Attendance participation in delivered lessons · not a causal teacher rating" className="is-wide" action={<RouteLink to="teachers" onNav={onNav}>Open teachers {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          <RankedBars formatter={percent} data={visibleTeacherSignals.slice(0, 8).map((teacher) => ({
            id: teacher.teacher,
            label: teacher.name,
            value: boundedPercent(teacher.engagement_score),
            detail: `${formatBusinessNumber(nonNegative(teacher.lessons_delivered))} lessons · ${formatBusinessNumber(nonNegative(teacher.students_reached))} students reached`,
            metrics: [
              { label: 'Lessons', value: formatBusinessNumber(nonNegative(teacher.lessons_delivered)) },
              { label: 'Students', value: formatBusinessNumber(nonNegative(teacher.students_reached)) },
              { label: 'Marks sampled', value: formatBusinessNumber(nonNegative(teacher.marks_sampled)) },
            ],
          }))} onSelect={(teacher) => onNav(`teachers/${teacher.id}`)} />
        </ChartCard>
        <ChartCard eyebrow="Student attention" title="Risk signal mix" description="Explainable rules; counts reflect the loaded risk register.">
          <SegmentedBreakdown data={riskMix} onSelect={(item) => onNav(`intelligence/risk?level=${item.key}`)} />
        </ChartCard>
      </div>

      <div className="ex-dashboard-grid">
        <ChartCard eyebrow="Learning capacity" title="Group occupancy" description={`Current students against recorded capacity${groupCapacity ? ` · ${formatBusinessNumber(groupCapacity)} seats total` : ''}.`}>
          {studentsState.data == null || cohortsState.data == null
            ? <ChartEmpty>Student-to-group occupancy is temporarily unavailable.</ChartEmpty>
            : !studentsState.complete || !cohortsState.complete || groupCapacity == null
              ? <ChartEmpty>Student-to-group occupancy coverage is incomplete, so no utilization percentage is inferred.</ChartEmpty>
            : <RankedBars max={100} formatter={percent} data={cohortsState.rows.map((cohort) => {
            const enrolled = studentsByCohort.get(String(cohort.id)) || 0;
            const capacity = finite(cohort.capacity);
            return {
              id: cohort.id,
              label: cohort.name,
              value: capacity && (enrolled > 0 || studentsState.complete) ? enrolled / capacity * 100 : null,
              detail: capacity ? `${enrolled} of ${capacity} seats loaded` : `${enrolled} students · capacity not set`,
            };
          })} onSelect={(cohort) => onNav(`groups/${cohort.id}/overview`)} />}
        </ChartCard>
        <ChartCard eyebrow="Recorded locations" title="Where student records point" description="The current field is free text and may describe a campus, not a true origin. It is shown without geographic inference.">
          <RankedBars data={locationBars} />
        </ChartCard>
      </div>

      <ChartCard eyebrow="Attendance detail" title="Attendance by group and status" description={`Recorded marks from ${filters.from} to ${filters.to} · leaders have read-only access`} className="is-full">
        {attendanceState.data == null
          ? <ChartEmpty>Attendance detail is temporarily unavailable.</ChartEmpty>
          : !attendanceState.complete
            ? <ChartEmpty>Attendance coverage is incomplete, so zero-count group comparisons are not inferred.</ChartEmpty>
            : cohortsState.rows.length ? (
          <ActivityHeatmap
            rows={cohortsState.rows.map((cohort) => ({ id: cohort.id, label: cohort.name }))}
            columns={['present', 'late', 'absent', 'excused'].map((status) => ({ key: status, label: status.charAt(0).toUpperCase() + status.slice(1) }))}
            value={(cohort, column) => filteredAttendance.filter((record) => String(record.cohort) === String(cohort.id) && record.status === column.key).length}
            formatter={(value) => formatBusinessNumber(value)}
            onSelect={(cohort) => onNav(`groups/${cohort.id}/attendance?from=${filters.from}&to=${filters.to}`)}
          />
        ) : <ChartEmpty />}
      </ChartCard>

      {(executiveState.error || invoicesState.error || attendanceState.error) && (
        <section className="ex-inline-warning" role="status">
          {cloneElement(Icons.flag, { size: 17 })}
          <span><strong>Part of this overview is using the last available information.</strong><small>Refresh the affected view; other panels remain usable.</small></span>
        </section>
      )}

      <footer className="ex-dashboard-foot">
        <span>{t('app.name', { defaultValue: 'StarForge EDU' })}</span>
        <span>Metrics show their real scope and denominator; unavailable data is never replaced with invented values.</span>
      </footer>
    </div>
  );
}
