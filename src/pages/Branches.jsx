import { cloneElement, lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  ChartCard,
  ChartEmpty,
  ComparisonBars,
  DonutBreakdown,
  ExecutiveSelect,
  RankedBars,
} from '../components/ExecutiveCharts.jsx';
import { Icons } from '../components/Icons.jsx';
import { PageLoader } from '../components/feedback.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatOrganizationDate,
  formatOrganizationTime,
} from '../lib/formatters.js';
import { effectiveCapabilities, hasCapability } from '../lib/permissions.js';
import '../styles/branches-v3.css';

const BranchStudentsWorkspace = lazy(() => import('./StudentsWorkspace.jsx')
  .then((module) => ({ default: module.StudentsPage })));
const BranchTeachersWorkspace = lazy(() => import('./TeachersWorkspace.jsx')
  .then((module) => ({ default: module.TeachersPage })));
const BranchGroupsWorkspace = lazy(() => import('./GroupsWorkspace.jsx')
  .then((module) => ({ default: module.GroupsPage })));
const BranchExamsWorkspace = lazy(() => import('./ExamsWorkspace.jsx')
  .then((module) => ({ default: module.ExamsPage })));

const PAGE_100 = Object.freeze({ page_size: 100 });
const EMPTY = '\u2014';
const STATUS_COLORS = Object.freeze({
  active: 'var(--sf-success)',
  enrolled: 'var(--sf-primary)',
  accepted: 'var(--sf-primary)',
  lead: '#7389b6',
  application: '#9a82ba',
  graduated: '#5f9e8a',
  withdrawn: 'var(--sf-danger)',
  draft: 'var(--sf-muted-2)',
  issued: 'var(--sf-warn)',
  partially_paid: 'var(--sf-accent)',
  paid: 'var(--sf-success)',
  overdue: 'var(--sf-danger)',
  scheduled: 'var(--sf-primary)',
  completed: 'var(--sf-success)',
  cancelled: 'var(--sf-danger)',
  queued: 'var(--sf-warn)',
  printing: 'var(--sf-primary)',
  done: 'var(--sf-success)',
  failed: 'var(--sf-danger)',
  blocked: 'var(--sf-danger)',
  revoked: 'var(--sf-danger)',
  inactive: 'var(--sf-muted-2)',
  archived: 'var(--sf-muted-2)',
  published: 'var(--sf-success)',
  substitute: 'var(--sf-accent)',
});

function finite(value) {
  if (
    value == null
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || typeof value === 'object'
    || typeof value === 'function'
    || typeof value === 'symbol'
    || (typeof value === 'string' && value.trim() === '')
  ) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const parsed = finite(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function boundedPercent(value) {
  const parsed = finite(value);
  return parsed != null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function fraction(value) {
  const parsed = finite(value);
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function idKey(value) {
  if (
    value == null
    || typeof value === 'boolean'
    || typeof value === 'object'
    || typeof value === 'function'
    || typeof value === 'symbol'
  ) return null;
  const key = String(value).trim();
  return key || null;
}

function relationKey(value) {
  return idKey(value && typeof value === 'object' ? value.id : value);
}

function number(value) {
  const parsed = finite(value);
  return parsed == null ? EMPTY : formatBusinessNumber(parsed, { maximumFractionDigits: 1 });
}

function money(value) {
  const parsed = finite(value);
  return parsed == null || parsed < 0 ? EMPTY : formatBusinessMoney(parsed) || EMPTY;
}

function percent(value) {
  const parsed = finite(value);
  return parsed == null
    ? EMPTY
    : `${formatBusinessNumber(parsed, { maximumFractionDigits: 1 })}%`;
}

function date(value, dateOnly = true) {
  return value ? formatOrganizationDate(value, { dateOnly }) || EMPTY : EMPTY;
}

function sum(rows, getter) {
  return rows.reduce((total, row) => {
    const value = typeof getter === 'function' ? getter(row) : row?.[getter];
    return total + (finite(value) || 0);
  }, 0);
}

function completeSum(rows, getter) {
  let total = 0;
  for (const row of rows) {
    const value = finite(typeof getter === 'function' ? getter(row) : row?.[getter]);
    if (value == null || value < 0) return null;
    total += value;
  }
  return total;
}

function evidenceSum(state, rows, getter) {
  const total = completeSum(rows, getter);
  if (total == null) return null;
  return state?.complete || total !== 0 ? total : null;
}

function billableInvoice(invoice) {
  return ['issued', 'partially_paid', 'paid', 'overdue'].includes(normalizedStatus(invoice?.status));
}

function invoiceAllocated(invoice) {
  if (!Array.isArray(invoice?.allocations)) return null;
  return completeSum(invoice.allocations, (allocation) => allocation.amount_uzs ?? allocation.amount);
}

function invoiceBalance(invoice) {
  const supplied = finite(invoice?.outstanding_uzs);
  if (supplied != null) return supplied >= 0 ? supplied : null;
  const total = finite(invoice?.total_uzs);
  const allocated = invoiceAllocated(invoice);
  if (total == null || total < 0 || allocated == null || allocated > total) return null;
  return total - allocated;
}

function normalizedStatus(value) {
  return String(value || 'unknown').trim().toLowerCase().replaceAll(' ', '_');
}

function displayStatus(value) {
  const status = normalizedStatus(value);
  return status === 'unknown'
    ? 'Not recorded'
    : status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayList(value) {
  if (Array.isArray(value)) {
    const labels = value.map((item) => {
      if (typeof item === 'string') return item;
      return item?.name || item?.label || item?.teacher_name || '';
    }).filter(Boolean);
    return labels.join(', ') || EMPTY;
  }
  return String(value || '').trim() || EMPTY;
}

function recordName(row, fallback = 'Unnamed record') {
  return String(row?.full_name || row?.name || row?.title || '').trim() || fallback;
}

function RouteLink({ to, onNav, children, className = '', ...props }) {
  return (
    <a
      {...props}
      className={className}
      href={`#/${to}`}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) return;
        event.preventDefault();
        onNav(to);
      }}
    >
      {children}
    </a>
  );
}

function StatusPill({ value }) {
  const status = normalizedStatus(value);
  return (
    <span
      className={`br-status is-${status}`}
      style={{ '--status-color': STATUS_COLORS[status] || 'var(--sf-muted)' }}
    >
      <i />
      {displayStatus(value)}
    </span>
  );
}

function Metric({ label, value, detail, icon, tone = 'primary', loading = false }) {
  return (
    <article className={`br-metric is-${tone}`}>
      <span aria-hidden="true">{cloneElement(icon, { size: 17 })}</span>
      <small>{label}</small>
      <strong>{loading ? <i className="br-skeleton" /> : value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function MetricGrid({ children }) {
  return <section className="br-metrics" aria-label="Branch measures">{children}</section>;
}

function CoverageNote({ states = [], children, forcePartial = false }) {
  const partial = forcePartial || states.some((state) => state.error || state.paused || !state.complete);
  return (
    <div className={`br-coverage${partial ? ' is-partial' : ''}`}>
      <span aria-hidden="true">{cloneElement(partial ? Icons.flag : Icons.shield, { size: 15 })}</span>
      <span>{children}</span>
    </div>
  );
}

function Freshness({ states, onRefresh }) {
  const active = states.filter(Boolean);
  const loading = active.some((state) => state.loading);
  const degraded = active.some((state) => state.error || state.paused || state.warnings?.length || !state.complete);
  const oldest = active
    .map((state) => state.updatedAt)
    .filter(Boolean)
    .sort((left, right) => left - right)[0];
  return (
    <div className="br-freshness" role="status" aria-live="polite" aria-atomic="true">
      <span><i className={loading ? 'is-loading' : degraded ? 'is-warning' : ''} />{loading ? 'Updating this view' : degraded ? 'Some areas need attention' : 'Current view ready'}</span>
      <small>{oldest ? `Checked ${formatOrganizationTime(oldest)}` : 'Preparing current information'}</small>
      <button type="button" onClick={onRefresh} disabled={loading}>
        {cloneElement(Icons.trend, { size: 15 })}
        Refresh
      </button>
    </div>
  );
}

function EmptyState({ title, body, icon = Icons.folder, action }) {
  return (
    <section className="br-empty">
      <span aria-hidden="true">{cloneElement(icon, { size: 23 })}</span>
      <div><h2>{title}</h2><p>{body}</p></div>
      {action}
    </section>
  );
}

function DataGate({ states, title, children }) {
  const active = states.filter(Boolean);
  const unavailable = active.filter((state) => state.data == null && (state.error || state.paused));
  const preparing = active.some((state) => state.data == null && state.pending && !state.paused);
  if (unavailable.length) {
    return (
      <EmptyState
        icon={Icons.flag}
        title={`${title} could not be prepared`}
        body="The requested information is unavailable right now. No empty result or organization-wide substitute has been shown in its place."
        action={<button className="br-retry" type="button" onClick={() => unavailable.forEach((state) => state.retry())}>Try again</button>}
      />
    );
  }
  if (preparing) return <PageLoader label={`Preparing ${title.toLocaleLowerCase()}…`} />;
  return children;
}

function AccessHold({ section }) {
  return (
    <EmptyState
      icon={Icons.shield}
      title={`${section} is outside this leadership view`}
      body="Your current responsibilities do not include this branch information. Nothing has been substituted from a broader organization-wide view."
    />
  );
}

function DataTable({ label, columns, rows, rowKey = 'id', empty = 'No matching records are available.' }) {
  if (!rows.length) {
    return <div className="br-table-empty">{empty}</div>;
  }
  return (
    <div className="br-table-wrap" tabIndex="0" role="region" aria-label={label}>
      <table className="br-table">
        <caption className="br-sr-only">{label}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row?.[rowKey] ?? index}>
              {columns.map((column) => (
                <td key={column.label} data-label={column.label} className={column.className || ''}>
                  {column.render
                    ? column.render(row, index)
                    : String(column.key || '').split('.').reduce((current, key) => current?.[key], row) ?? EMPTY}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <header className="br-section-head">
      <div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
      {action && <div>{action}</div>}
    </header>
  );
}

function RegisterSection({ eyebrow, title, description, action, children, className = '' }) {
  return (
    <section className={`br-register ${className}`.trim()}>
      <SectionHeader eyebrow={eyebrow} title={title} description={description} action={action} />
      <div className="br-register-body">{children}</div>
    </section>
  );
}

function invoiceBranch(invoice, cohortBranches, studentBranches) {
  return relationKey(invoice?.branch)
    || studentBranches.get(relationKey(invoice?.student))
    || cohortBranches.get(relationKey(invoice?.cohort))
    || null;
}

function directoryAttribution({ branches, students, cohorts, invoices, expenses }) {
  const visibleBranches = new Set(branches.map((branch) => idKey(branch.key ?? branch.id)).filter(Boolean));
  const studentBranches = new Map(students.map((row) => [idKey(row.id), relationKey(row.branch)]));
  const cohortBranches = new Map(cohorts.map((row) => [idKey(row.id), relationKey(row.branch)]));
  const issuedWithoutVisibleBranch = invoices.filter((invoice) => {
    if (!billableInvoice(invoice)) return false;
    const key = invoiceBranch(invoice, cohortBranches, studentBranches);
    return !key || !visibleBranches.has(key);
  });
  const paidExpensesWithoutVisibleBranch = expenses.filter((expense) => {
    if (normalizedStatus(expense.status) !== 'paid') return false;
    const key = relationKey(expense.branch);
    return !key || !visibleBranches.has(key);
  });
  return {
    issuedWithoutVisibleBranch,
    paidExpensesWithoutVisibleBranch,
  };
}

function addMeasuredAmount(map, key, rawValue) {
  if (!key) return;
  const value = finite(rawValue);
  if (value == null || value < 0) {
    map.set(key, null);
    return;
  }
  if (map.get(key) !== null) map.set(key, (map.get(key) || 0) + value);
}

function branchModels({ branches, signals, students, teachers, cohorts, invoices, expenses }) {
  const signalByBranch = new Map(signals.map((row) => [relationKey(row.branch), row]));
  const studentBranches = new Map(students.map((row) => [idKey(row.id), relationKey(row.branch)]));
  const cohortBranches = new Map(cohorts.map((row) => [idKey(row.id), relationKey(row.branch)]));
  const studentsByBranch = new Map();
  const teachersByBranch = new Map();
  const cohortsByBranch = new Map();
  const billedByBranch = new Map();
  const expensesByBranch = new Map();

  students.forEach((student) => {
    const key = relationKey(student.branch);
    if (key && ['active', 'enrolled'].includes(normalizedStatus(student.status))) {
      studentsByBranch.set(key, (studentsByBranch.get(key) || 0) + 1);
    }
  });
  teachers.forEach((teacher) => {
    const key = relationKey(teacher.branch);
    if (key) teachersByBranch.set(key, (teachersByBranch.get(key) || 0) + 1);
  });
  cohorts.forEach((cohort) => {
    const key = relationKey(cohort.branch);
    if (key) cohortsByBranch.set(key, (cohortsByBranch.get(key) || 0) + 1);
  });
  invoices.forEach((invoice) => {
    if (!billableInvoice(invoice)) return;
    const key = invoiceBranch(invoice, cohortBranches, studentBranches);
    addMeasuredAmount(billedByBranch, key, invoice.total_uzs);
  });
  expenses.forEach((expense) => {
    if (normalizedStatus(expense.status) !== 'paid') return;
    const key = relationKey(expense.branch);
    addMeasuredAmount(expensesByBranch, key, expense.amount_uzs);
  });

  const baseById = new Map();
  branches.forEach((branch) => {
    const key = idKey(branch.id);
    if (key) baseById.set(key, branch);
  });
  signals.forEach((signal) => {
    const key = relationKey(signal.branch);
    if (key && !baseById.has(key)) {
      baseById.set(key, { id: signal.branch, name: signal.name });
    }
  });
  const base = [...baseById.values()];
  return base.map((branch) => {
    const key = idKey(branch.id);
    const signal = signalByBranch.get(key) || null;
    return {
      ...branch,
      key,
      signal,
      score: boundedPercent(signal?.score),
      rank: nonNegative(signal?.rank),
      attendance: fraction(signal?.attendance_rate) == null ? null : fraction(signal.attendance_rate) * 100,
      grade: boundedPercent(signal?.avg_grade_pct),
      riskRate: fraction(signal?.at_risk_rate) == null ? null : fraction(signal.at_risk_rate) * 100,
      atRisk: nonNegative(signal?.at_risk),
      overdueStudents: nonNegative(signal?.overdue_students),
      students: nonNegative(signal?.active_students),
      studentsLoaded: studentsByBranch.get(key) || 0,
      teachers: teachersByBranch.get(key) || 0,
      cohorts: cohortsByBranch.get(key) || 0,
      billed: billedByBranch.has(key) ? billedByBranch.get(key) : 0,
      expenses: expensesByBranch.has(key) ? expensesByBranch.get(key) : 0,
    };
  });
}

function BranchCard({ branch, selected, onCompare, onNav, billingReady, teachersReady, cohortsReady }) {
  const state = branch.archived_at ? 'archived' : branch.is_active === false ? 'inactive' : 'active';
  return (
    <article className={`br-directory-card${selected ? ' is-selected' : ''}`}>
      <header>
        <span className="br-directory-rank">{branch.rank ? `#${branch.rank}` : 'Branch'}</span>
        <StatusPill value={state} />
      </header>
      <div className="br-directory-identity">
        <span aria-hidden="true">{String(branch.name || 'B').slice(0, 2).toUpperCase()}</span>
        <div><h2>{branch.name}</h2><p>{branch.address || branch.timezone || 'Address not recorded'}</p></div>
      </div>
      <div className="br-directory-score">
        <span><small>Health score</small><strong>{number(branch.score)}</strong></span>
        <span className="br-score-track" aria-hidden="true"><i style={{ '--score-width': `${Math.max(0, Math.min(100, branch.score || 0))}%` }} /></span>
        <small>{branch.score == null ? 'Recent learning evidence is incomplete' : 'Recent defined learning window'}</small>
      </div>
      <dl>
        <div><dt>Active students</dt><dd>{number(branch.students)}</dd></div>
        <div><dt>Attendance</dt><dd>{percent(branch.attendance)}</dd></div>
        <div><dt>Average grade</dt><dd>{percent(branch.grade)}</dd></div>
        <div><dt>At-risk share</dt><dd>{percent(branch.riskRate)}</dd></div>
        <div><dt>Teachers loaded</dt><dd>{teachersReady ? number(branch.teachers) : EMPTY}</dd></div>
        <div><dt>Groups loaded</dt><dd>{cohortsReady ? number(branch.cohorts) : EMPTY}</dd></div>
        <div className="is-wide"><dt>Issued billing attributed</dt><dd>{billingReady ? money(branch.billed) : EMPTY}</dd></div>
      </dl>
      <footer>
        <button type="button" onClick={() => onCompare(branch.key)} aria-pressed={selected}>{selected ? 'Comparison focus' : 'Compare'}</button>
        <RouteLink to={`branches/${branch.id}/overview`} onNav={onNav}>Open workspace {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>
      </footer>
    </article>
  );
}

function comparisonDelta(left, right, format, suffix = '') {
  const leftValue = finite(left);
  const rightValue = finite(right);
  if (leftValue == null || rightValue == null) return 'Comparison unavailable';
  const difference = leftValue - rightValue;
  if (Math.abs(difference) < 0.0001) return 'Even';
  return `Focus ${difference > 0 ? '+' : '−'}${format(Math.abs(difference))}${suffix}`;
}

function BranchDuel({ focal, comparator, models, onFocal, onComparator, onNav, billingReady, expensesReady, teachersReady, cohortsReady }) {
  if (!focal || !comparator) {
    return <EmptyState title="A second branch is needed for comparison" body="Add or restore another visible branch to use the side-by-side executive view." icon={Icons.trend} />;
  }
  const metrics = [
    { label: 'Health score', detail: 'Defined recent learning score', left: focal.score, right: comparator.score, format: number },
    { label: 'Active students', detail: 'Intelligence count when available', left: focal.students, right: comparator.students, format: number },
    { label: 'Attendance', detail: 'Recent recorded attendance', left: focal.attendance, right: comparator.attendance, format: percent, deltaFormat: (value) => formatBusinessNumber(value, { maximumFractionDigits: 1 }), suffix: ' pp' },
    { label: 'Average grade', detail: 'Published grade evidence', left: focal.grade, right: comparator.grade, format: percent, deltaFormat: (value) => formatBusinessNumber(value, { maximumFractionDigits: 1 }), suffix: ' pp' },
    { label: 'At-risk share', detail: 'Lower is preferable; descriptive delta only', left: focal.riskRate, right: comparator.riskRate, format: percent, deltaFormat: (value) => formatBusinessNumber(value, { maximumFractionDigits: 1 }), suffix: ' pp' },
    { label: 'Teachers loaded', detail: 'Bounded current register', left: teachersReady ? focal.teachers : null, right: teachersReady ? comparator.teachers : null, format: number },
    { label: 'Groups loaded', detail: 'Bounded current register', left: cohortsReady ? focal.cohorts : null, right: cohortsReady ? comparator.cohorts : null, format: number },
    { label: 'Issued billing attributed', detail: 'Current student and group relationships', left: billingReady ? focal.billed : null, right: billingReady ? comparator.billed : null, format: money },
    { label: 'Paid expenses loaded', detail: 'Completed branch disbursements', left: expensesReady ? focal.expenses : null, right: expensesReady ? comparator.expenses : null, format: money },
  ];
  return (
    <section className="br-duel" aria-labelledby="branch-duel-title">
      <header className="br-duel-head">
        <div><span>Direct comparison</span><h2 id="branch-duel-title">Branch against branch</h2><p>Choose a focus and a comparator. Exact values remain visible; deltas describe the focus branch relative to the comparator.</p></div>
        <div className="br-duel-controls">
          <ExecutiveSelect label="Focus branch" value={focal.key} options={models.map((branch) => ({ value: branch.key, label: branch.name, detail: branch.address || 'Address not recorded' }))} onChange={onFocal} />
          <ExecutiveSelect label="Comparator" value={comparator.key} options={models.map((branch) => ({ value: branch.key, label: branch.name, detail: branch.key === focal.key ? 'Already selected as focus' : branch.address || 'Address not recorded', disabled: branch.key === focal.key }))} onChange={onComparator} />
        </div>
      </header>
      <div className="br-duel-identities">
        <RouteLink to={`branches/${focal.id}/overview`} onNav={onNav}><span>Focus</span><strong>{focal.name}</strong><small>Open branch workspace</small></RouteLink>
        <i aria-hidden="true">versus</i>
        <RouteLink to={`branches/${comparator.id}/overview`} onNav={onNav}><span>Comparator</span><strong>{comparator.name}</strong><small>Open branch workspace</small></RouteLink>
      </div>
      <div className="br-duel-metrics">
        {metrics.map((metric) => {
          const left = finite(metric.left);
          const right = finite(metric.right);
          const maximum = Math.max(left || 0, right || 0, 1);
          return (
            <div key={metric.label}>
              <span className="br-duel-value is-left"><strong>{metric.format(metric.left)}</strong><i aria-hidden="true" style={{ '--duel-width': `${left == null ? 0 : left / maximum * 100}%` }} /></span>
              <span className="br-duel-label"><strong>{metric.label}</strong><small>{metric.detail}</small><em>{comparisonDelta(metric.left, metric.right, metric.deltaFormat || metric.format, metric.suffix)}</em></span>
              <span className="br-duel-value is-right"><strong>{metric.format(metric.right)}</strong><i aria-hidden="true" style={{ '--duel-width': `${right == null ? 0 : right / maximum * 100}%` }} /></span>
            </div>
          );
        })}
      </div>
      <footer>Comparisons marked loaded use at most 100 visible rows. Historical billing branch attribution is not available in the current record shape.</footer>
    </section>
  );
}

function BranchSignalMatrix({ models, onNav }) {
  const columns = [
    { key: 'attendance', label: 'Attendance', format: percent },
    { key: 'grade', label: 'Average grade', format: percent },
    { key: 'riskRate', label: 'At-risk share', format: percent, lower: true },
    { key: 'score', label: 'Health score', format: number },
  ];
  return (
    <div className="br-signal-matrix" role="region" aria-label="Branch learning signal comparison" tabIndex="0">
      <div className="br-signal-matrix-inner">
        <span />
        {columns.map((column) => <b key={column.key}>{column.label}{column.lower && <small>Lower is better</small>}</b>)}
        {models.map((branch) => (
          <div className="br-signal-row" key={branch.key}>
            <button type="button" onClick={() => onNav(`branches/${branch.id}/overview`)}><strong>{branch.name}</strong><small>{branch.students == null ? 'Active student count unavailable' : `${number(branch.students)} active students`}</small></button>
            {columns.map((column) => {
              const value = finite(branch[column.key]);
              return <span key={column.key}><strong>{column.format(value)}</strong><i aria-hidden="true"><b style={{ '--signal-width': `${Math.max(0, Math.min(100, value || 0))}%` }} /></i></span>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchDirectory({ models, states, refreshStates, access, onNav }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('score');
  const [focalId, setFocalId] = useState(() => models[0]?.key || '');
  const [comparatorId, setComparatorId] = useState(() => models.find((branch) => branch.key !== models[0]?.key)?.key || '');
  const usable = (state) => state?.data != null;
  const studentsReady = access.students && usable(states[2]);
  const teachersReady = access.teachers && usable(states[3]);
  const cohortsReady = access.cohorts && usable(states[4]);
  const billingReady = access.invoiceAttribution && studentsReady && cohortsReady && usable(states[5]);
  const expensesReady = access.finance && usable(states[6]);
  const attribution = useMemo(() => directoryAttribution({
    branches: models,
    students: states[2]?.rows || [],
    cohorts: states[4]?.rows || [],
    invoices: states[5]?.rows || [],
    expenses: states[6]?.rows || [],
  }), [models, states]);
  const billingComparable = billingReady && attribution.issuedWithoutVisibleBranch.length === 0;
  const expensesComparable = expensesReady && attribution.paidExpensesWithoutVisibleBranch.length === 0;
  const studentsComplete = studentsReady && states[2]?.complete;
  const teachersComplete = teachersReady && states[3]?.complete;
  const cohortsComplete = cohortsReady && states[4]?.complete;
  const billingComplete = billingComparable && states[2]?.complete && states[4]?.complete && states[5]?.complete;
  const expensesComplete = expensesComparable && states[6]?.complete;
  const evidenceModels = useMemo(() => models.map((branch) => ({
    ...branch,
    students: branch.students ?? (studentsComplete ? branch.studentsLoaded : null),
    teachers: branch.teachers !== 0 || teachersComplete ? branch.teachers : null,
    cohorts: branch.cohorts !== 0 || cohortsComplete ? branch.cohorts : null,
    billed: billingComparable && (branch.billed !== 0 || billingComplete) ? branch.billed : null,
    expenses: expensesComparable && (branch.expenses !== 0 || expensesComplete) ? branch.expenses : null,
  })), [billingComparable, billingComplete, cohortsComplete, expensesComparable, expensesComplete, models, studentsComplete, teachersComplete]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const filtered = needle
      ? evidenceModels.filter((branch) => `${branch.name} ${branch.address || ''} ${branch.slug || ''}`.toLocaleLowerCase().includes(needle))
      : evidenceModels;
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return String(left.name).localeCompare(String(right.name));
      if (sort === 'students') return (right.students || 0) - (left.students || 0);
      if (sort === 'billed') return (right.billed || 0) - (left.billed || 0);
      return (right.score ?? -1) - (left.score ?? -1);
    });
  }, [evidenceModels, search, sort]);
  const branchCapacityLoaded = completeSum(evidenceModels, (branch) => branch.max_students);
  const branchCapacity = states[0]?.complete && branchCapacityLoaded != null ? branchCapacityLoaded : null;
  const issuedRows = (states[5]?.rows || []).filter(billableInvoice);
  const paidExpenseRows = (states[6]?.rows || []).filter((expense) => normalizedStatus(expense.status) === 'paid');
  const billed = billingReady ? evidenceSum(states[5], issuedRows, 'total_uzs') : null;
  const expenses = expensesReady ? evidenceSum(states[6], paidExpenseRows, 'amount_uzs') : null;
  const refresh = useCallback(() => refreshStates.forEach((state) => state.retry()), [refreshStates]);
  const focal = evidenceModels.find((branch) => branch.key === focalId) || evidenceModels[0];
  const comparator = evidenceModels.find((branch) => branch.key === comparatorId && branch.key !== focal?.key)
    || evidenceModels.find((branch) => branch.key !== focal?.key);
  const chooseFocal = (value) => {
    setFocalId(String(value));
    if (String(value) === comparator?.key) {
      setComparatorId(evidenceModels.find((branch) => branch.key !== String(value))?.key || '');
    }
  };
  const chooseComparator = (value) => setComparatorId(String(value));
  const sortOptions = [
    { value: 'score', label: 'Health score', detail: 'Recent defined learning score' },
    { value: 'students', label: 'Student reach', detail: 'Active students in view' },
    ...(billingComparable ? [{ value: 'billed', label: 'Issued billing', detail: 'Current branch attribution' }] : []),
    { value: 'name', label: 'Branch name', detail: 'Alphabetical directory' },
  ];

  return (
    <div className="ex-page br-page br-directory-page">
      <header className="br-hero">
        <div>
          <span className="ex-eyebrow">Organization comparison</span>
          <h1>Branches</h1>
          <p>Compare student reach, teaching capacity, learning signals, and recorded financial activity before opening a branch workspace.</p>
        </div>
        <div className="br-hero-actions">
          {access.intelligence && <RouteLink to="intelligence/branches" onNav={onNav}>{cloneElement(Icons.trend, { size: 16 })} Methodology</RouteLink>}
          {access.org && <RouteLink to="organization/branches" onNav={onNav}>{cloneElement(Icons.globe, { size: 16 })} Branch directory</RouteLink>}
        </div>
        <Freshness states={refreshStates} onRefresh={refresh} />
      </header>

      <section className="br-directory" aria-labelledby="branch-directory-title">
        <header>
          <div><span>Branch directory</span><h2 id="branch-directory-title">Choose a branch or make it the comparison focus</h2><p>The branch itself is the primary object: each card carries learning, scale, staffing, and attributed billing context.</p></div>
          <div className="br-directory-tools">
            <label><span className="br-sr-only">Search branches</span>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branches" maxLength={100} /></label>
            <ExecutiveSelect label="Sort" value={sort} options={sortOptions} onChange={setSort} />
          </div>
        </header>
        {visible.length ? (
          <div className="br-directory-grid">
            {visible.map((branch) => (
              <BranchCard
                key={branch.key}
                branch={branch}
                selected={branch.key === focal?.key}
                onCompare={chooseFocal}
                onNav={onNav}
                billingReady={billingComparable}
                teachersReady={teachersReady}
                cohortsReady={cohortsReady}
              />
            ))}
          </div>
        ) : <div className="br-table-empty">No visible branch matches that search.</div>}
      </section>

      <BranchDuel
        focal={focal}
        comparator={comparator}
        models={evidenceModels}
        onFocal={chooseFocal}
        onComparator={chooseComparator}
        onNav={onNav}
        billingReady={billingComparable}
        expensesReady={expensesComparable}
        teachersReady={teachersReady}
        cohortsReady={cohortsReady}
      />

      <MetricGrid>
        <Metric label="Branches in view" value={number(evidenceModels.length)} detail="Organization locations available to this role" icon={Icons.globe} />
        <Metric label="Student records" value={studentsReady ? number(states[2]?.total) : EMPTY} detail={studentsReady ? 'Exact total from the visible student register' : access.students ? 'Unavailable right now' : 'Outside current responsibilities'} icon={Icons.cohort} loading={access.students && states[2]?.pending} />
        <Metric label="Teachers" value={teachersReady ? number(states[3]?.total) : EMPTY} detail={teachersReady ? 'Exact total from the visible faculty register' : access.teachers ? 'Unavailable right now' : 'Outside current responsibilities'} icon={Icons.user} loading={access.teachers && states[3]?.pending} />
        <Metric label="Groups" value={cohortsReady ? number(states[4]?.total) : EMPTY} detail={cohortsReady ? branchCapacity == null ? states[0]?.complete ? 'Complete capacity is unavailable because at least one branch has no recorded limit' : 'Complete capacity is unavailable while the branch directory is partial' : `${number(branchCapacity)} complete recorded branch student capacity` : access.cohorts ? 'Unavailable right now' : 'Outside current responsibilities'} icon={Icons.cohort} loading={access.cohorts && states[4]?.pending} />
        <Metric label="Issued billing in view" value={billingReady ? money(billed) : EMPTY} detail={billingReady ? billed == null ? 'The loaded register is incomplete; a zero total cannot be verified' : billingComparable ? 'Issued invoices grouped by current verified branch relationships' : 'Organization register total; branch comparison is withheld where attribution is incomplete' : access.finance ? 'Attribution is unavailable or outside this view' : 'Outside current responsibilities'} icon={Icons.doc} tone="accent" loading={access.invoiceAttribution && states[5]?.pending} />
        <Metric label="Paid expenses loaded" value={expensesReady ? money(expenses) : EMPTY} detail={expensesReady ? expenses == null ? 'The loaded register is incomplete; a zero total cannot be verified' : 'Completed branch disbursements' : access.finance ? 'Unavailable right now' : 'Outside current responsibilities'} icon={Icons.trend} tone="warn" loading={access.finance && states[6]?.pending} />
      </MetricGrid>

      <CoverageNote
        states={states.slice(2)}
        forcePartial={attribution.issuedWithoutVisibleBranch.length > 0 || attribution.paidExpensesWithoutVisibleBranch.length > 0}
      >
        Exact totals are taken from each visible register. Branch-level teacher, group, and money comparisons use at most 100 loaded records per register; incomplete coverage is labeled “loaded” and is never presented as a complete financial statement.
        {attribution.issuedWithoutVisibleBranch.length > 0 && ` ${number(attribution.issuedWithoutVisibleBranch.length)} issued ${attribution.issuedWithoutVisibleBranch.length === 1 ? 'invoice cannot' : 'invoices cannot'} be matched to a visible branch, so every per-branch billing comparison is withheld.`}
        {attribution.paidExpensesWithoutVisibleBranch.length > 0 && ` ${number(attribution.paidExpensesWithoutVisibleBranch.length)} paid ${attribution.paidExpensesWithoutVisibleBranch.length === 1 ? 'expense cannot' : 'expenses cannot'} be matched to a visible branch, so every per-branch expense comparison is withheld.`}
      </CoverageNote>

      <div className="br-chart-grid br-chart-grid-balanced">
        <ChartCard eyebrow="Learning position" title="Comparable branch signals" description="Recent defined branch-intelligence window. Exact values stay visible; at-risk share is explicitly marked as lower-is-better." className="is-wide">
          <BranchSignalMatrix models={evidenceModels} onNav={onNav} />
        </ChartCard>
        <ChartCard eyebrow="Operating scale" title="Students, faculty, and groups" description="Student count uses branch intelligence when available. Faculty and group measures are bounded loaded registers.">
          <RankedBars
            data={evidenceModels.map((branch) => ({
              id: branch.id,
              rank: branch.rank,
              label: branch.name,
              value: branch.students,
              detail: branch.score == null ? 'Learning score unavailable' : `${number(branch.score)} health score`,
              metrics: [
                { label: 'Teachers loaded', value: teachersReady ? number(branch.teachers) : EMPTY },
                { label: 'Groups loaded', value: cohortsReady ? number(branch.cohorts) : EMPTY },
                { label: 'Capacity', value: number(branch.max_students) },
              ],
            }))}
            onSelect={(branch) => onNav(`branches/${branch.id}/students`)}
          />
        </ChartCard>
      </div>

      <div className="br-chart-grid br-chart-grid-balanced">
        <ChartCard eyebrow="Financial comparison" title="Issued billing attributed by branch" description="Uses current student and group relationships, not immutable historical branch ownership. Loaded register coverage only." className="is-wide">
          {billingComparable ? <RankedBars
            formatter={money}
            data={evidenceModels.map((branch) => ({
              id: branch.id,
              label: branch.name,
              value: branch.billed,
              detail: `${number(branch.studentsLoaded)} student records joined`,
              metrics: [{ label: 'Paid expenses loaded', value: expensesComparable ? money(branch.expenses) : EMPTY }],
            }))}
            onSelect={(branch) => onNav(`branches/${branch.id}/finance`)}
          /> : <ChartEmpty>{billingReady ? 'Branch billing is withheld because at least one issued invoice cannot be matched to a visible branch.' : 'Branch billing cannot be attributed without both student and group relationships.'}</ChartEmpty>}
        </ChartCard>
        <ChartCard eyebrow="Organization position" title="Loaded money registers" description="Organization totals for the visible bounded records. These values are not cash income or profit.">
          {billingReady && expensesReady ? <ComparisonBars formatter={money} onSelect={(item) => onNav(item.to)} data={[
            { label: 'Issued billing loaded', detail: billingComparable ? 'Current branch relationships verified' : 'Includes records without a verified visible branch', value: billed, color: 'var(--sf-primary)', to: 'finance/invoices' },
            { label: 'Paid expenses loaded', detail: 'Completed disbursements', value: expenses, color: 'var(--sf-warn)', to: 'finance/expenses?status=paid' },
          ]} /> : <ChartEmpty>The joined money comparison is unavailable in this view.</ChartEmpty>}
        </ChartCard>
      </div>

      <ChartCard eyebrow="Decision register" title="Exact branch comparison" description="One row per visible branch. Use this register for lookup after reviewing the cards and direct comparison above." className="is-full">
        <DataTable
          label="Exact branch comparison table"
          rows={evidenceModels}
          columns={[
            { label: 'Branch', render: (branch) => <span className="br-branch-cell"><i>{branch.rank ?? '—'}</i><span><RouteLink to={`branches/${branch.id}/overview`} onNav={onNav}>{branch.name}</RouteLink><small>{branch.address || branch.timezone || 'Address not recorded'}</small></span></span> },
            { label: 'Health', render: (branch) => <strong>{number(branch.score)}</strong> },
            { label: 'Active students', render: (branch) => <strong>{number(branch.students)}</strong> },
            { label: 'Teachers loaded', render: (branch) => teachersReady ? number(branch.teachers) : EMPTY },
            { label: 'Groups loaded', render: (branch) => cohortsReady ? number(branch.cohorts) : EMPTY },
            { label: 'Attendance', render: (branch) => percent(branch.attendance) },
            { label: 'Average grade', render: (branch) => percent(branch.grade) },
            { label: 'At-risk share', render: (branch) => percent(branch.riskRate) },
            { label: 'Issued billing attributed', render: (branch) => billingComparable ? money(branch.billed) : EMPTY },
            { label: 'Paid expenses loaded', render: (branch) => expensesComparable ? money(branch.expenses) : EMPTY },
            { label: 'Open', render: (branch) => <RouteLink className="br-open-link" to={`branches/${branch.id}/overview`} onNav={onNav} aria-label={`Open ${branch.name}`}>{cloneElement(Icons.chevR, { size: 15 })}</RouteLink> },
          ]}
        />
      </ChartCard>
    </div>
  );
}

function BranchHeader({ branch, section, states, onNav, showFreshness = true }) {
  const refresh = useCallback(() => states.forEach((state) => state?.retry()), [states]);
  const label = section.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <header className="br-workspace-head">
      <div className="br-workspace-title">
        <RouteLink to="branches" onNav={onNav}>{cloneElement(Icons.chevR, { size: 14 })} All branches</RouteLink>
        <span className="ex-eyebrow">Branch workspace · {label}</span>
        <h1>{branch.name || `Branch ${branch.id}`}</h1>
        <p>{branch.address || 'Address not recorded'}{branch.phone ? ` · ${branch.phone}` : ''}</p>
      </div>
      <div className="br-branch-facts">
        <span><small>Time zone</small><strong>{branch.timezone || EMPTY}</strong></span>
        <span><small>Student capacity</small><strong>{number(branch.max_students)}</strong></span>
        <span><small>Teacher capacity</small><strong>{number(branch.max_teachers)}</strong></span>
        <StatusPill value={branch.archived_at ? 'archived' : branch.is_active === true ? 'active' : branch.is_active === false ? 'inactive' : 'unknown'} />
      </div>
      {showFreshness && <Freshness states={states} onRefresh={refresh} />}
    </header>
  );
}

function StudentTable({ rows, branchId, canOpenDetails, onNav }) {
  return (
    <DataTable
      label="Branch students"
      rows={rows}
      columns={[
        { label: 'Student', render: (student) => <span className="br-person"><span>{recordName(student).split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span><span>{canOpenDetails ? <RouteLink to={`branches/${branchId}/students/${student.id}/overview`} onNav={onNav}>{recordName(student)}</RouteLink> : <strong>{recordName(student)}</strong>}<small>{student.student_id || student.username || EMPTY}</small></span></span> },
        { label: 'Status', render: (student) => <StatusPill value={student.status} /> },
        { label: 'Group', render: (student) => student.current_cohort_name || 'Not assigned' },
        { label: 'Level', render: (student) => student.academic_level || EMPTY },
        { label: 'Enrolled', render: (student) => date(student.enrollment_date) },
        { label: 'Location', render: (student) => student.location || EMPTY },
        { label: 'Contact', render: (student) => <span className="br-stacked"><strong>{student.phone || EMPTY}</strong><small>{student.email || ''}</small></span> },
        { label: 'Hold', render: (student) => student.is_blocked ? <StatusPill value="blocked" /> : 'No' },
      ]}
    />
  );
}

function StudentsSection({ state, cohorts, branchId, canViewCohorts, canOpenDirectory, canOpenDetails, canOpenGroups, onNav }) {
  const statusMix = Object.entries(state.rows.reduce((result, student) => {
    const key = normalizedStatus(student.status);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {})).map(([label, value]) => ({ label: displayStatus(label), value, color: STATUS_COLORS[label] || 'var(--sf-muted)' }));
  const unassigned = state.rows.filter((student) => !student.current_cohort).length;
  const blocked = state.rows.filter((student) => student.is_blocked).length;
  return (
    <>
      <MetricGrid>
        <Metric label="Student records" value={number(state.total)} detail="Exact branch-filtered total" icon={Icons.cohort} loading={state.pending} />
        <Metric label="Loaded now" value={number(state.rows.length)} detail={state.complete ? 'Complete branch register' : `First ${state.rows.length} records`} icon={Icons.doc} />
        <Metric label="Without a group loaded" value={number(unassigned)} detail="Placement follow-up in loaded records" icon={Icons.flag} tone={unassigned ? 'warn' : 'success'} />
        <Metric label="Enrollment holds loaded" value={number(blocked)} detail="Records with a current hold" icon={Icons.shield} tone={blocked ? 'danger' : 'success'} />
        <Metric label="Groups" value={canViewCohorts ? number(cohorts.total) : EMPTY} detail={canViewCohorts ? 'Exact branch-filtered total' : 'Outside current responsibilities'} icon={Icons.cohort} loading={canViewCohorts && cohorts.pending} />
      </MetricGrid>
      <CoverageNote states={[state]}>This page is branch-filtered before records are returned. When more than 100 students exist, the table and mix show the first 100 while the total remains exact.</CoverageNote>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Enrollment" title="Status mix" description="Loaded branch student records."><DonutBreakdown data={statusMix} centerValue={number(state.rows.length)} centerLabel="students loaded" /></ChartCard>
        <ChartCard eyebrow="Placement" title="Students represented by group" description="Loaded records grouped by their current placement." className="is-wide">
          {canViewCohorts ? <RankedBars data={cohorts.rows.map((cohort) => { const studentCount = state.rows.filter((student) => idKey(student.current_cohort) === idKey(cohort.id)).length; return { id: cohort.id, label: cohort.name, value: studentCount > 0 || state.complete ? studentCount : null, detail: cohort.level || 'Level not recorded' }; })} onSelect={canOpenGroups ? (cohort) => onNav(`branches/${branchId}/groups/${cohort.id}/overview`) : undefined} /> : <ChartEmpty>Group comparisons are outside the current responsibilities.</ChartEmpty>}
        </ChartCard>
      </div>
      <RegisterSection eyebrow="Student register" title="Students in this branch" description="Identity, placement, enrollment, and contact fields from the branch-filtered directory." action={canOpenDirectory ? <RouteLink className="br-secondary-action" to={`branches/${branchId}/students/directory`} onNav={onNav}>Advanced filters {cloneElement(Icons.chevR, { size: 14 })}</RouteLink> : null}>
        <StudentTable rows={state.rows} branchId={branchId} canOpenDetails={canOpenDetails} onNav={onNav} />
      </RegisterSection>
    </>
  );
}

function TeachersSection({ state, cohorts, branchId, canViewCohorts, canOpenDirectory, canOpenDetails, onNav }) {
  const groupsByTeacher = useMemo(() => {
    const counts = new Map();
    cohorts.rows.forEach((cohort) => {
      const ids = new Set([
        idKey(cohort.primary_teacher),
        ...(cohort.teachers || []).map((assignment) => idKey(assignment.teacher)),
      ].filter(Boolean));
      ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    return counts;
  }, [cohorts.rows]);
  const assigned = state.rows.filter((teacher) => (groupsByTeacher.get(idKey(teacher.id)) || 0) > 0).length;
  return (
    <>
      <MetricGrid>
        <Metric label="Teachers" value={number(state.total)} detail="Exact branch-filtered total" icon={Icons.user} loading={state.pending} />
        <Metric label="Loaded now" value={number(state.rows.length)} detail={state.complete ? 'Complete branch register' : 'First 100 records'} icon={Icons.doc} />
        <Metric label="With groups loaded" value={canViewCohorts ? number(assigned) : EMPTY} detail={canViewCohorts ? 'Joined through recorded group assignments' : 'Group relationships are outside this view'} icon={Icons.cohort} />
        <Metric label="Substitutes loaded" value={number(state.rows.filter((teacher) => teacher.is_substitute).length)} detail="Faculty marked as substitutes" icon={Icons.user} />
        <Metric label="Groups" value={canViewCohorts ? number(cohorts.total) : EMPTY} detail={canViewCohorts ? 'Exact branch group total' : 'Outside current responsibilities'} icon={Icons.cohort} loading={canViewCohorts && cohorts.pending} />
      </MetricGrid>
      <CoverageNote states={[state, cohorts]}>Teacher identity is branch-filtered. Group load is joined from up to 100 branch groups and is a workload signal, not an employee rating.</CoverageNote>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Teaching capacity" title="Recorded groups per teacher" description="Primary and additional assignments in loaded groups." className="is-wide">
          {canViewCohorts ? <RankedBars data={state.rows.map((teacher) => { const groupCount = groupsByTeacher.get(idKey(teacher.id)) || 0; return { id: teacher.id, label: recordName(teacher), value: groupCount > 0 || cohorts.complete ? groupCount : null, detail: teacher.department_name || 'Department not recorded' }; })} onSelect={canOpenDetails ? (teacher) => onNav(`branches/${branchId}/teachers/${teacher.id}/overview`) : undefined} /> : <ChartEmpty>Group workload is outside the current responsibilities.</ChartEmpty>}
        </ChartCard>
        <ChartCard eyebrow="Faculty mix" title="Assignment coverage" description="Loaded faculty records with at least one joined group.">
          <DonutBreakdown data={[
            ...(canViewCohorts ? [
              { label: 'With groups', value: assigned, color: 'var(--sf-success)' },
              { label: 'No loaded group', value: Math.max(0, state.rows.length - assigned), color: 'var(--sf-warn)' },
            ] : []),
          ]} centerValue={number(state.rows.length)} centerLabel="teachers loaded" />
        </ChartCard>
      </div>
      <RegisterSection eyebrow="Faculty register" title="Teachers in this branch" description="Contact, department, subject, and joined group information. Compensation remains permission-protected." action={canOpenDirectory ? <RouteLink className="br-secondary-action" to={`branches/${branchId}/teachers/directory`} onNav={onNav}>Advanced filters {cloneElement(Icons.chevR, { size: 14 })}</RouteLink> : null}>
        <DataTable label="Branch teachers" rows={state.rows} columns={[
          { label: 'Teacher', render: (teacher) => <span className="br-person"><span>{recordName(teacher).split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span><span>{canOpenDetails ? <RouteLink to={`branches/${branchId}/teachers/${teacher.id}/overview`} onNav={onNav}>{recordName(teacher)}</RouteLink> : <strong>{recordName(teacher)}</strong>}<small>{teacher.username || EMPTY}</small></span></span> },
          { label: 'Department', render: (teacher) => teacher.department_name || EMPTY },
          { label: 'Subjects', render: (teacher) => displayList(teacher.subjects) },
          { label: 'Groups loaded', render: (teacher) => <strong>{canViewCohorts ? number(groupsByTeacher.get(idKey(teacher.id)) || 0) : EMPTY}</strong> },
          { label: 'Hired', render: (teacher) => date(teacher.hire_date) },
          { label: 'Contact', render: (teacher) => <span className="br-stacked"><strong>{teacher.phone || EMPTY}</strong><small>{teacher.email || ''}</small></span> },
          { label: 'Type', render: (teacher) => teacher.is_substitute ? <StatusPill value="substitute" /> : 'Faculty' },
          { label: 'Account', render: (teacher) => <StatusPill value={teacher.is_active === false ? 'inactive' : 'active'} /> },
        ]} />
      </RegisterSection>
    </>
  );
}

function GroupsSection({ state, students, branchId, canViewStudents, canOpenDetails, onNav }) {
  const studentsByGroup = useMemo(() => students.rows.reduce((map, student) => {
    const key = relationKey(student.current_cohort);
    if (key) map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()), [students.rows]);
  const loadedCapacity = completeSum(state.rows, 'capacity');
  const capacity = state.complete && loadedCapacity != null ? loadedCapacity : null;
  const placementsComplete = Boolean(canViewStudents && state.complete && students.complete);
  const occupied = placementsComplete
    ? sum(state.rows, (cohort) => studentsByGroup.get(idKey(cohort.id)) || 0)
    : null;
  const activeCount = state.rows.filter((cohort) => !cohort.is_archived).length;
  const withoutRoomCount = state.rows.filter((cohort) => !cohort.default_room).length;
  return (
    <>
      <MetricGrid>
        <Metric label="Groups" value={number(state.total)} detail="Exact branch-filtered total" icon={Icons.cohort} loading={state.pending} />
        <Metric label="Active loaded" value={number(state.complete || activeCount > 0 ? activeCount : null)} detail={state.complete ? 'Complete branch group register' : 'Positive evidence from the loaded page only'} icon={Icons.check} />
        <Metric label="Recorded seats" value={number(capacity)} detail={capacity == null ? state.complete ? 'At least one group has no valid recorded capacity' : 'Complete capacity is unavailable while the group register is partial' : `${number(occupied)} verified primary placements joined`} icon={Icons.cohort} />
        <Metric label="Primary placement ratio" value={capacity > 0 && occupied != null ? percent(occupied / capacity * 100) : EMPTY} detail={!canViewStudents ? 'Student relationships are outside this view' : !state.complete || !students.complete ? 'Complete group and student registers are required for this ratio' : capacity == null ? 'Every group needs a valid recorded capacity' : 'Verified primary placements against complete recorded seats'} icon={Icons.trend} />
        <Metric label="Without a room loaded" value={number(state.complete || withoutRoomCount > 0 ? withoutRoomCount : null)} detail={state.complete ? 'Complete branch group register' : 'Only positive loaded follow-up evidence is shown'} icon={Icons.flag} tone="warn" />
      </MetricGrid>
      <CoverageNote states={[state, students]}>Groups are branch-filtered. Placement ratios require complete group and student registers, use each student profile’s primary group, and do not count additional current memberships. Missing capacity never becomes zero.</CoverageNote>
      <ChartCard eyebrow="Capacity" title="Primary placements by group" description="Loaded primary student placements against each group’s recorded capacity." className="is-full">
        {canViewStudents && students.complete ? <RankedBars max={100} formatter={percent} data={state.rows.map((cohort) => {
          const enrolled = studentsByGroup.get(idKey(cohort.id)) || 0;
          const seats = finite(cohort.capacity);
          return { id: cohort.id, label: cohort.name, value: seats > 0 ? enrolled / seats * 100 : null, detail: seats != null ? `${enrolled} of ${seats} seats · ${cohort.primary_teacher_name || 'teacher not assigned'}` : `${enrolled} students · capacity not recorded` };
        }).filter((cohort) => cohort.value != null)} onSelect={canOpenDetails ? (cohort) => onNav(`branches/${branchId}/groups/${cohort.id}/overview`) : undefined} /> : <ChartEmpty>{canViewStudents ? 'A complete student register is required before placement percentages are shown.' : 'Primary placement comparisons are outside the current responsibilities.'}</ChartEmpty>}
      </ChartCard>
      <RegisterSection eyebrow="Group register" title="Groups in this branch" description="Leadership context for level, teacher, room, dates, and loaded primary placements.">
        <DataTable label="Branch groups" rows={state.rows} columns={[
          { label: 'Group', render: (cohort) => <span className="br-stacked">{canOpenDetails ? <RouteLink to={`branches/${branchId}/groups/${cohort.id}/overview`} onNav={onNav}>{cohort.name}</RouteLink> : <strong>{cohort.name}</strong>}<small>{cohort.department_name || EMPTY}</small></span> },
          { label: 'Level', render: (cohort) => cohort.level || EMPTY },
          { label: 'Primary teacher', render: (cohort) => cohort.primary_teacher_name || 'Not assigned' },
          { label: 'Primary placements', render: (cohort) => placementsComplete ? number(studentsByGroup.get(idKey(cohort.id)) || 0) : EMPTY },
          { label: 'Capacity', render: (cohort) => number(cohort.capacity) },
          { label: 'Room', render: (cohort) => cohort.default_room_name || 'Not assigned' },
          { label: 'Dates', render: (cohort) => <span className="br-stacked"><strong>{date(cohort.start_date)}</strong><small>to {date(cohort.end_date)}</small></span> },
          { label: 'Status', render: (cohort) => <StatusPill value={cohort.is_archived ? 'archived' : 'active'} /> },
        ]} />
      </RegisterSection>
    </>
  );
}

function ExamsSection({ state, cohortIds, branchId, onNav }) {
  const rows = state.rows.filter((exam) => cohortIds.has(relationKey(exam.cohort)));
  const subjects = rows.map((exam) => ({
    key: relationKey(exam.subject),
    label: String(exam.subject_name || '').trim(),
  })).filter((subject) => subject.key);
  const subjectMix = Object.entries(subjects.reduce((map, subject) => {
    const label = subject.label || `Subject ${subject.key}`;
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {})).sort((left, right) => right[1] - left[1]).map(([label, value]) => ({ label, value }));
  const subjectCount = new Set(subjects.map((subject) => subject.key)).size;
  return (
    <>
      <MetricGrid>
        <Metric label="Branch-linked exams loaded" value={number(rows.length)} detail="Joined through the branch group identifiers" icon={Icons.doc} loading={state.pending} />
        <Metric label="Published loaded" value={number(rows.filter((exam) => exam.is_published).length)} detail="Results released in loaded records" icon={Icons.check} />
        <Metric label="Unpublished loaded" value={number(rows.filter((exam) => !exam.is_published).length)} detail="Assessment records not yet published" icon={Icons.flag} tone="warn" />
        <Metric label="Subjects represented" value={number(subjectCount > 0 ? subjectCount : null)} detail={subjectCount > 0 ? 'Stable subject identifiers in loaded records' : 'No branch-linked exam has a recorded subject identifier'} icon={Icons.folder} />
      </MetricGrid>
      <CoverageNote states={[state]}>The assessment register has no direct branch selector. This view joins up to 100 visible exams to this branch’s groups and excludes exams whose group cannot be verified.</CoverageNote>
      <ChartCard eyebrow="Assessment coverage" title="Exams by subject" description="Branch-linked exams in the loaded assessment register." className="is-full">{subjectMix.length ? <RankedBars data={subjectMix} /> : <ChartEmpty>No branch-linked exam has a recorded subject.</ChartEmpty>}</ChartCard>
      <RegisterSection eyebrow="Assessment register" title="Exams linked to this branch" description="Read-only leadership detail. Creation, grading, and publishing stay in the controlled academic workflow." action={<RouteLink className="br-secondary-action" to="exams/exams" onNav={onNav}>Organization exams {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
        <DataTable label="Branch-linked exams" rows={rows} empty="No loaded exam can be linked to this branch’s groups." columns={[
          { label: 'Exam', render: (exam) => <span className="br-stacked"><RouteLink to={`branches/${branchId}/exams/exams/${exam.id}`} onNav={onNav}>{exam.title}</RouteLink><small>{exam.exam_type_detail?.name || 'Type not recorded'}</small></span> },
          { label: 'Subject', render: (exam) => String(exam.subject_name || '').trim() || EMPTY },
          { label: 'Group', render: (exam) => exam.cohort_name || EMPTY },
          { label: 'Term', render: (exam) => exam.term_name || EMPTY },
          { label: 'Date', render: (exam) => date(exam.exam_date) },
          { label: 'Maximum', render: (exam) => number(exam.max_score) },
          { label: 'Weight', render: (exam) => number(exam.weight) },
          { label: 'Status', render: (exam) => <StatusPill value={exam.is_published ? 'published' : 'draft'} /> },
        ]} />
      </RegisterSection>
    </>
  );
}

function FinanceSection({ invoices, expenses, canAttributeInvoices, onNav }) {
  const invoiceRows = canAttributeInvoices
    ? invoices.rows
    : [];
  const expenseRows = expenses.rows;
  const issuedRows = invoiceRows.filter(billableInvoice);
  const billed = evidenceSum(invoices, issuedRows, 'total_uzs');
  const paidInvoices = evidenceSum(invoices, invoiceRows.filter((invoice) => normalizedStatus(invoice.status) === 'paid'), 'total_uzs');
  const outstanding = evidenceSum(invoices, issuedRows, invoiceBalance);
  const spent = evidenceSum(expenses, expenseRows.filter((expense) => normalizedStatus(expense.status) === 'paid'), 'amount_uzs');
  const commitments = evidenceSum(expenses, expenseRows.filter((expense) => normalizedStatus(expense.status) === 'approved'), 'amount_uzs');
  const invoiceMix = Object.entries(invoiceRows.reduce((map, invoice) => {
    const key = normalizedStatus(invoice.status);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {})).map(([label, value]) => ({ label: displayStatus(label), value, color: STATUS_COLORS[label] || 'var(--sf-muted)' }));
  return (
    <>
      <MetricGrid>
        <Metric label="Issued billing in view" value={canAttributeInvoices ? money(billed) : EMPTY} detail={canAttributeInvoices ? billed == null ? 'The loaded register cannot verify a zero total' : `${number(issuedRows.length)} issued invoices connected to current student placements` : 'Billing is outside current responsibilities'} icon={Icons.doc} tone="accent" loading={canAttributeInvoices && invoices.pending} />
        <Metric label="Paid invoice value loaded" value={canAttributeInvoices ? money(paidInvoices) : EMPTY} detail={canAttributeInvoices ? 'Invoice status, not a cash collection total' : 'Invoice attribution cannot be verified'} icon={Icons.check} tone="success" />
        <Metric label="Outstanding balance loaded" value={canAttributeInvoices ? money(outstanding) : EMPTY} detail={canAttributeInvoices ? 'Issued value less recorded allocations' : 'Invoice attribution cannot be verified'} icon={Icons.flag} tone="warn" />
        <Metric label="Paid expenses" value={money(spent)} detail="Completed branch disbursements loaded" icon={Icons.trend} tone="warn" loading={expenses.pending} />
        <Metric label="Approved commitments" value={money(commitments)} detail="Approved requests not counted as spent" icon={Icons.doc} tone="accent" loading={expenses.pending} />
        <Metric label="Overdue invoices loaded" value={canAttributeInvoices ? number(invoices.complete || invoiceRows.some((invoice) => normalizedStatus(invoice.status) === 'overdue') ? invoiceRows.filter((invoice) => normalizedStatus(invoice.status) === 'overdue').length : null) : EMPTY} detail={canAttributeInvoices ? invoices.complete ? 'Follow-up items in the complete register' : 'Only positive loaded follow-up evidence is shown' : 'Invoice attribution cannot be verified'} icon={Icons.flag} tone="danger" />
      </MetricGrid>
      <CoverageNote states={[invoices, expenses]}>Expenses and invoices are branch-filtered before loading. Invoices do not preserve the branch at issue, so billing follows each student’s current branch and can change after a transfer.</CoverageNote>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Financial position" title="Billing and expenses in view" description="Operational estimate only; not historical branch income, cash collection, or profit." className="is-wide">
          {canAttributeInvoices ? <ComparisonBars formatter={money} data={[
            { label: 'Issued billing', value: billed, color: 'var(--sf-primary)' },
            { label: 'Paid invoice value', value: paidInvoices, color: 'var(--sf-success)' },
            { label: 'Outstanding balance', value: outstanding, color: 'var(--sf-danger)' },
            { label: 'Paid expenses', value: spent, color: 'var(--sf-warn)' },
          ]} /> : <ChartEmpty>Billing is outside the current responsibilities.</ChartEmpty>}
        </ChartCard>
        <ChartCard eyebrow="Invoice register" title="Status mix" description="Invoices connected to current student placements.">{canAttributeInvoices ? <DonutBreakdown data={invoiceMix} centerValue={number(invoiceRows.length)} centerLabel="invoices loaded" /> : <ChartEmpty>Billing is outside the current responsibilities.</ChartEmpty>}</ChartCard>
      </div>
      <div className="br-split-registers">
        <RegisterSection eyebrow="Billing" title="Invoices in this branch view" description="Placement follows the student’s current branch; it is not an immutable historical branch record." action={<RouteLink className="br-secondary-action" to="finance/invoices" onNav={onNav}>All invoices {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          {canAttributeInvoices ? <DataTable label="Branch invoices in view" rows={invoiceRows} empty="No invoice is connected to a current student placement in this branch." columns={[
            { label: 'Invoice', render: (invoice) => <span className="br-stacked"><RouteLink to={`finance/invoices/${invoice.id}`} onNav={onNav}>{invoice.number || `Invoice ${invoice.id}`}</RouteLink><small>{invoice.period || ''}</small></span> },
            { label: 'Student', render: (invoice) => invoice.student_name || EMPTY },
            { label: 'Group', render: (invoice) => invoice.cohort_name || EMPTY },
            { label: 'Status', render: (invoice) => <StatusPill value={invoice.status} /> },
            { label: 'Issued', render: (invoice) => date(invoice.issue_date) },
            { label: 'Due', render: (invoice) => date(invoice.due_date) },
            { label: 'Total', render: (invoice) => <strong>{money(invoice.total_uzs)}</strong> },
            { label: 'Balance', render: (invoice) => <strong>{money(invoiceBalance(invoice))}</strong> },
          ]} /> : <div className="br-table-empty">Billing is outside the current responsibilities.</div>}
        </RegisterSection>
        <RegisterSection eyebrow="Outgoing commitments" title="Branch expenses" description="Branch-filtered requests with the responsible people and recorded payment state." action={<RouteLink className="br-secondary-action" to="finance/expenses" onNav={onNav}>All expenses {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          <DataTable label="Branch expenses" rows={expenseRows} columns={[
            { label: 'Expense', render: (expense) => <span className="br-stacked"><strong>{expense.description || `Expense ${expense.id}`}</strong><small>{expense.category || 'Uncategorized'}</small></span> },
            { label: 'Status', render: (expense) => <StatusPill value={expense.status} /> },
            { label: 'Amount', render: (expense) => <strong>{money(expense.amount_uzs)}</strong> },
            { label: 'Method', render: (expense) => expense.payment_method_name || EMPTY },
            { label: 'Created by', render: (expense) => expense.created_by_name || EMPTY },
            { label: 'Recorded', render: (expense) => date(expense.created_at, false) },
          ]} />
        </RegisterSection>
      </div>
    </>
  );
}

function MeetingsSection({ state, onNav }) {
  const upcoming = state.rows.filter((meeting) => new Date(meeting.starts_at).getTime() >= Date.now() && normalizedStatus(meeting.status) !== 'cancelled');
  return (
    <>
      <MetricGrid>
        <Metric label="Meetings" value={number(state.total)} detail="Exact branch-filtered total" icon={Icons.cal} loading={state.pending} />
        <Metric label="Upcoming loaded" value={number(upcoming.length)} detail="Future meetings in loaded records" icon={Icons.cal} />
        <Metric label="Completed loaded" value={number(state.rows.filter((meeting) => normalizedStatus(meeting.status) === 'completed').length)} detail="Meetings marked completed" icon={Icons.check} tone="success" />
        <Metric label="Cancelled loaded" value={number(state.rows.filter((meeting) => normalizedStatus(meeting.status) === 'cancelled').length)} detail="Meetings marked cancelled" icon={Icons.x} tone="warn" />
      </MetricGrid>
      <CoverageNote states={[state]}>Meetings are branch-filtered before loading. The exact total remains visible when the first 100 records do not cover the complete register.</CoverageNote>
      <RegisterSection eyebrow="Coordination" title="Branch meetings" description="Agenda, time, location, response count, and current state." action={<RouteLink className="br-secondary-action" to="schedule/meetings" onNav={onNav}>Organization schedule {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
        <DataTable label="Branch meetings" rows={state.rows} columns={[
          { label: 'Meeting', render: (meeting) => <span className="br-stacked"><RouteLink to={`schedule/meetings/${meeting.id}`} onNav={onNav}>{meeting.title}</RouteLink><small>{meeting.agenda || 'No agenda recorded'}</small></span> },
          { label: 'Status', render: (meeting) => <StatusPill value={meeting.status} /> },
          { label: 'Starts', render: (meeting) => date(meeting.starts_at, false) },
          { label: 'Ends', render: (meeting) => date(meeting.ends_at, false) },
          { label: 'Location', render: (meeting) => meeting.location || EMPTY },
          { label: 'Attendees', render: (meeting) => number(meeting.attendees?.length) },
        ]} />
      </RegisterSection>
    </>
  );
}

function ContentSection({ libraries, departments, cohortIds, canViewDepartments, canViewCohorts, onNav }) {
  const departmentIds = new Set(canViewDepartments ? departments.rows.map((department) => idKey(department.id)) : []);
  const rows = libraries.rows.filter((library) => (
    (canViewCohorts && cohortIds.has(idKey(library.cohort)))
    || (canViewDepartments && departmentIds.has(idKey(library.department)))
  ));
  const groupLibraries = rows.filter((library) => cohortIds.has(idKey(library.cohort))).length;
  const departmentLibraries = rows.filter((library) => departmentIds.has(idKey(library.department))).length;
  const columns = [
    { label: 'Library', render: (library) => <span className="br-stacked"><RouteLink to={`content/libraries/${library.id}`} onNav={onNav}>{library.name}</RouteLink><small>{library.description || 'No description recorded'}</small></span> },
    { label: 'Visibility', render: (library) => <StatusPill value={library.visibility} /> },
    ...(canViewDepartments ? [{ label: 'Department', render: (library) => library.department_name || EMPTY }] : []),
    ...(canViewCohorts ? [{ label: 'Group', render: (library) => library.cohort_name || EMPTY }] : []),
    { label: 'Allowed roles', render: (library) => displayList(library.allowed_roles) },
    { label: 'Status', render: (library) => <StatusPill value={library.is_active ? 'active' : 'inactive'} /> },
  ];
  return (
    <>
      <MetricGrid>
        <Metric label="Libraries linked loaded" value={number(rows.length)} detail={canViewDepartments && canViewCohorts ? 'Joined through branch groups or departments' : canViewCohorts ? 'Joined through branch groups in this view' : 'Joined through branch departments in this view'} icon={Icons.folder} loading={libraries.pending} />
        <Metric label="Group libraries" value={canViewCohorts ? number(groupLibraries) : EMPTY} detail={canViewCohorts ? 'Linked to a specific branch group' : 'Group relationships are outside this view'} icon={Icons.cohort} />
        <Metric label="Department libraries" value={canViewDepartments ? number(departmentLibraries) : EMPTY} detail={canViewDepartments ? 'Linked to a branch department' : 'Department relationships are outside this view'} icon={Icons.folder} />
        <Metric label="Active loaded" value={number(rows.filter((library) => library.is_active).length)} detail="Libraries currently marked active" icon={Icons.check} tone="success" />
      </MetricGrid>
      <CoverageNote states={[libraries, ...(canViewDepartments ? [departments] : [])]}>The learning library has no direct branch field. This view joins up to 100 visible libraries through the branch relationships available to your role; center-wide libraries and unavailable relationship types are intentionally excluded.</CoverageNote>
      <RegisterSection eyebrow="Learning library" title="Content connected to this branch" description="Audience, ownership, and current availability for branch-linked libraries." action={<RouteLink className="br-secondary-action" to="content/libraries" onNav={onNav}>All learning libraries {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
        <DataTable label="Branch-linked libraries" rows={rows} empty="No loaded library is linked through the branch relationships available in this view." columns={columns} />
      </RegisterSection>
    </>
  );
}

function PrintersSection({ jobs, printers, agents, onNav }) {
  const activePrinters = printers.rows.filter((printer) => printer.is_active).length;
  const registeredConnections = agents.rows.filter((agent) => !agent.revoked_at).length;
  const largestJobs = [...jobs.rows]
    .sort((left, right) => (finite(right.copies) || 0) - (finite(left.copies) || 0))
    .slice(0, 10);
  const jobMix = Object.entries(jobs.rows.reduce((map, job) => {
    const key = normalizedStatus(job.status);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {})).map(([label, value]) => ({ label: displayStatus(label), value, color: STATUS_COLORS[label] || 'var(--sf-muted)' }));
  return (
    <>
      <MetricGrid>
        <Metric label="Printers" value={number(printers.total)} detail={`${number(activePrinters)} active in loaded records`} icon={Icons.doc} loading={printers.pending} />
        <Metric label="Print connections" value={number(agents.total)} detail={`${number(registeredConnections)} registered and not revoked`} icon={Icons.settings} loading={agents.pending} />
        <Metric label="Print work" value={number(jobs.total)} detail="Exact branch-filtered total" icon={Icons.doc} loading={jobs.pending} />
        <Metric label="Needs attention loaded" value={number(jobs.rows.filter((job) => normalizedStatus(job.status) === 'failed').length)} detail="Failed work in loaded records" icon={Icons.flag} tone="danger" />
        <Metric label="Pages completed loaded" value={number(evidenceSum(jobs, jobs.rows, 'pages_printed'))} detail="Recorded completed pages; missing values are not treated as zero" icon={Icons.check} tone="success" />
      </MetricGrid>
      <CoverageNote states={[jobs, printers, agents]}>Printers, connections, and print work are branch-filtered before loading. Authentication secrets are never included in this leadership view.</CoverageNote>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Print operations" title="Work status" description="Loaded branch print work by recorded state."><DonutBreakdown data={jobMix} centerValue={number(jobs.rows.length)} centerLabel="jobs loaded" /></ChartCard>
        <ChartCard eyebrow="Capacity" title="Copies by work item" description="Largest loaded print requests, measured in requested copies." className="is-wide"><RankedBars data={largestJobs.map((job) => ({ id: job.id, label: `${displayStatus(job.source)} #${job.source_id || job.id}`, value: job.copies, detail: `${number(job.pages)} pages · ${displayStatus(job.status)}` }))} onSelect={(job) => onNav(`content/print-jobs/${job.id}`)} /></ChartCard>
      </div>
      <div className="br-split-registers">
        <RegisterSection eyebrow="Equipment" title="Branch printers" description="Model, capabilities, and current availability." action={<RouteLink className="br-secondary-action" to="content/printers" onNav={onNav}>All printers {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          <DataTable label="Branch printers" rows={printers.rows} columns={[
            { label: 'Printer', render: (printer) => <span className="br-stacked"><RouteLink to={`content/printers/${printer.id}`} onNav={onNav}>{printer.name}</RouteLink><small>{printer.model_name || 'Model not recorded'}</small></span> },
            { label: 'Status', render: (printer) => <StatusPill value={printer.is_active ? 'active' : 'inactive'} /> },
            { label: 'Color', render: (printer) => printer.capabilities?.color ? 'Yes' : 'No' },
            { label: 'Duplex', render: (printer) => printer.capabilities?.duplex ? 'Yes' : 'No' },
            { label: 'Updated', render: (printer) => date(printer.updated_at, false) },
          ]} />
        </RegisterSection>
        <RegisterSection eyebrow="Queue" title="Recent print work" description="Read-only operational status for loaded branch work." action={<RouteLink className="br-secondary-action" to="content/print-jobs" onNav={onNav}>All print work {cloneElement(Icons.chevR, { size: 14 })}</RouteLink>}>
          <DataTable label="Branch print work" rows={jobs.rows} columns={[
            { label: 'Work', render: (job) => <span className="br-stacked"><RouteLink to={`content/print-jobs/${job.id}`} onNav={onNav}>{`${displayStatus(job.source)} #${job.source_id || job.id}`}</RouteLink><small>{date(job.created_at, false)}</small></span> },
            { label: 'Status', render: (job) => <StatusPill value={job.status} /> },
            { label: 'Pages', render: (job) => number(job.pages) },
            { label: 'Copies', render: (job) => number(job.copies) },
            { label: 'Completed', render: (job) => number(job.pages_printed) },
            { label: 'Attempts', render: (job) => number(job.attempts) },
          ]} />
        </RegisterSection>
      </div>
      <RegisterSection eyebrow="Print connections" title="Branch print connections" description="Last contact and revocation state. Sensitive connection credentials are never displayed.">
        <DataTable label="Branch print connections" rows={agents.rows} columns={[
          { label: 'Connection', render: (agent) => <span className="br-stacked"><strong>{agent.name}</strong><small>Connection {agent.id}</small></span> },
          { label: 'Status', render: (agent) => <StatusPill value={agent.revoked_at ? 'revoked' : 'active'} /> },
          { label: 'Last seen', render: (agent) => date(agent.last_seen_at, false) },
          { label: 'Created', render: (agent) => date(agent.created_at, false) },
        ]} />
      </RegisterSection>
    </>
  );
}

function ActivitySafetyHold({ branchName }) {
  return (
    <section className="br-safety-hold">
      <span aria-hidden="true">{cloneElement(Icons.shield, { size: 28 })}</span>
      <div>
        <span className="ex-eyebrow">Protected by design</span>
        <h2>Branch-safe activity history is not available yet</h2>
        <p>The organization activity register does not expose a verified branch relationship. Showing it here could mislabel organization-wide events as activity from {branchName}. This view stays closed until every event can be scoped reliably.</p>
        <ul><li>No organization-wide activity has been copied into this branch.</li><li>No event has been inferred from a person, group, or text label.</li><li>The organization Activity history remains available from the main workspace.</li></ul>
      </div>
    </section>
  );
}

function BranchOverview({ model, students, teachers, cohorts, invoices, expenses, access, onNav }) {
  const invoiceRows = invoices.rows;
  const issuedRows = invoiceRows.filter(billableInvoice);
  const billed = evidenceSum(invoices, issuedRows, 'total_uzs');
  const spent = evidenceSum(expenses, expenses.rows.filter((expense) => normalizedStatus(expense.status) === 'paid'), 'amount_uzs');
  const studentsByGroup = students.rows.reduce((map, student) => {
    const key = relationKey(student.current_cohort);
    if (key) map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  const groupsByTeacher = cohorts.rows.reduce((map, cohort) => {
    const ids = new Set([idKey(cohort.primary_teacher), ...(cohort.teachers || []).map((assignment) => idKey(assignment.teacher))].filter(Boolean));
    ids.forEach((id) => map.set(id, (map.get(id) || 0) + 1));
    return map;
  }, new Map());
  const studentMix = Object.entries(students.rows.reduce((map, student) => {
    const key = normalizedStatus(student.status);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {})).map(([label, value]) => ({ label: displayStatus(label), value, color: STATUS_COLORS[label] || 'var(--sf-muted)' }));
  return (
    <>
      <MetricGrid>
        <Metric label="Student records" value={access.students ? number(students.total) : EMPTY} detail={access.students ? 'Exact branch-filtered total' : 'Outside current responsibilities'} icon={Icons.cohort} loading={access.students && students.pending} />
        <Metric label="Teachers" value={access.teachers ? number(teachers.total) : EMPTY} detail={access.teachers ? 'Exact branch-filtered total' : 'Outside current responsibilities'} icon={Icons.user} loading={access.teachers && teachers.pending} />
        <Metric label="Groups" value={access.cohorts ? number(cohorts.total) : EMPTY} detail={access.cohorts ? 'Exact branch-filtered total' : 'Outside current responsibilities'} icon={Icons.cohort} loading={access.cohorts && cohorts.pending} />
        <Metric label="Recent attendance" value={access.intelligence ? percent(model.attendance) : EMPTY} detail={access.intelligence ? 'Defined branch-intelligence window' : 'Outside current responsibilities'} icon={Icons.check} tone={model.attendance != null && model.attendance < 85 ? 'warn' : 'success'} />
        <Metric label="Issued billing in view" value={access.branchInvoices ? money(billed) : EMPTY} detail={access.branchInvoices ? billed == null ? 'The loaded register cannot verify a zero total' : `${number(issuedRows.length)} issued invoices connected to current branch placements` : 'Outside current responsibilities'} icon={Icons.doc} tone="accent" loading={access.branchInvoices && invoices.pending} />
        <Metric label="Paid expenses" value={access.finance ? money(spent) : EMPTY} detail={access.finance ? spent == null ? 'The loaded register cannot verify a zero total' : 'Completed branch disbursements loaded' : 'Outside current responsibilities'} icon={Icons.trend} tone="warn" loading={access.finance && expenses.pending} />
      </MetricGrid>
      <CoverageNote states={[students, teachers, cohorts, invoices, expenses]}>People, groups, expenses, and invoices are branch-filtered. Billing follows each student’s current branch; loaded placement and money views are not immutable historical statements.</CoverageNote>
      <div className="br-overview-actions" aria-label="Branch quick links">
        {[
          ['students', 'Open students', Icons.cohort, access.students],
          ['teachers', 'Open teachers', Icons.user, access.teachers],
          ['groups', 'Open groups', Icons.cohort, access.cohorts],
          ['finance', 'Open finance', Icons.trend, access.finance],
        ].filter(([, , , allowed]) => allowed).map(([target, label, icon]) => <RouteLink to={`branches/${model.id}/${target}`} onNav={onNav} key={target}>{cloneElement(icon, { size: 16 })}<span>{label}</span>{cloneElement(Icons.chevR, { size: 14 })}</RouteLink>)}
      </div>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Learning capacity" title="Primary placements by group" description="Loaded primary student placements against recorded group capacity; additional memberships are not included." className="is-wide">
          {access.cohorts && access.students && students.complete ? <RankedBars max={100} formatter={percent} data={cohorts.rows.map((cohort) => {
            const enrolled = studentsByGroup.get(idKey(cohort.id)) || 0;
            const capacity = finite(cohort.capacity);
            return { id: cohort.id, label: cohort.name, value: capacity > 0 ? enrolled / capacity * 100 : null, detail: capacity != null ? `${enrolled} of ${capacity} seats` : `${enrolled} students · capacity not recorded` };
          }).filter((cohort) => cohort.value != null)} onSelect={(cohort) => onNav(`branches/${model.id}/groups/${cohort.id}/overview`)} /> : <ChartEmpty>{access.cohorts && access.students ? 'A complete student register is required before placement percentages are shown.' : 'Student and group relationships are required for this comparison.'}</ChartEmpty>}
        </ChartCard>
        <ChartCard eyebrow="Students" title="Enrollment status mix" description="Loaded branch records.">{access.students ? <DonutBreakdown data={studentMix} centerValue={number(students.rows.length)} centerLabel="students loaded" /> : <ChartEmpty>Student information is outside the current responsibilities.</ChartEmpty>}</ChartCard>
      </div>
      <div className="br-chart-grid">
        <ChartCard eyebrow="Faculty coverage" title="Groups per teacher" description="Primary and additional assignments in loaded branch groups." className="is-wide">
          {access.teachers && access.cohorts ? <RankedBars data={teachers.rows.map((teacher) => { const groupCount = groupsByTeacher.get(idKey(teacher.id)) || 0; return { id: teacher.id, label: recordName(teacher), value: groupCount > 0 || cohorts.complete ? groupCount : null, detail: teacher.department_name || 'Department not recorded' }; })} onSelect={(teacher) => onNav(`branches/${model.id}/teachers/${teacher.id}/overview`)} /> : <ChartEmpty>Teacher and group relationships are required for this comparison.</ChartEmpty>}
        </ChartCard>
        <ChartCard eyebrow="Recorded money" title="Billing and expenses in view" description="Operational estimate, not historical branch income, cash collection, or profit.">{access.branchInvoices ? <ComparisonBars formatter={money} data={[
          { label: 'Issued billing loaded', value: billed, color: 'var(--sf-primary)' },
          { label: 'Paid expenses', value: spent, color: 'var(--sf-warn)' },
        ]} /> : <ChartEmpty>Branch billing cannot be attributed without both student and group relationships.</ChartEmpty>}</ChartCard>
      </div>
      {access.cohorts && <RegisterSection eyebrow="Current delivery" title="Groups at a glance" description="Teacher, room, level, capacity, and loaded primary placements for this branch.">
        <DataTable label="Branch group overview" rows={cohorts.rows.slice(0, 12)} columns={[
          { label: 'Group', render: (cohort) => <RouteLink to={`branches/${model.id}/groups/${cohort.id}/overview`} onNav={onNav}>{cohort.name}</RouteLink> },
          { label: 'Level', render: (cohort) => cohort.level || EMPTY },
          { label: 'Teacher', render: (cohort) => cohort.primary_teacher_name || 'Not assigned' },
          { label: 'Room', render: (cohort) => cohort.default_room_name || 'Not assigned' },
          { label: 'Students', render: (cohort) => students.complete ? number(studentsByGroup.get(idKey(cohort.id)) || 0) : EMPTY },
          { label: 'Capacity', render: (cohort) => number(cohort.capacity) },
          { label: 'Status', render: (cohort) => <StatusPill value={cohort.is_archived ? 'archived' : 'active'} /> },
        ]} />
      </RegisterSection>}
    </>
  );
}

export function BranchesPage({ user, route, onNav }) {
  const routed = workspaceRoute(route);
  const rawBranchId = routed.segments[0] === 'branches' ? routed.segments[1] : null;
  const branchId = /^[1-9]\d*$/.test(rawBranchId || '') ? rawBranchId : null;
  const nested = Boolean(branchId);
  const section = nested ? routed.segments[2] || 'overview' : null;
  const tail = nested ? routed.segments.slice(3) : [];
  const studentDirectory = section === 'students' && tail[0] === 'directory';
  const studentDetailId = section === 'students' && /^[1-9]\d*$/.test(tail[0] || '') ? tail[0] : null;
  const teacherDirectory = section === 'teachers' && tail[0] === 'directory';
  const teacherDetailId = section === 'teachers' && /^[1-9]\d*$/.test(tail[0] || '') ? tail[0] : null;
  const groupDetailId = section === 'groups' && /^[1-9]\d*$/.test(tail[0] || '') ? tail[0] : null;
  const examDetailId = section === 'exams' && tail[0] === 'exams' && /^[1-9]\d*$/.test(tail[1] || '') ? tail[1] : null;
  const delegatedStudentView = studentDirectory || Boolean(studentDetailId);
  const delegatedTeacherView = teacherDirectory || Boolean(teacherDetailId);
  const delegatedGroupView = Boolean(groupDetailId);
  const delegatedExamView = Boolean(examDetailId);
  const delegatedView = delegatedStudentView || delegatedTeacherView || delegatedGroupView || delegatedExamView;
  const capabilities = useMemo(() => effectiveCapabilities(user), [user]);
  const can = useCallback(
    (permission) => capabilities == null || hasCapability(capabilities, permission),
    [capabilities],
  );
  const access = useMemo(() => ({
    org: can('org:read'),
    intelligence: can('intelligence:read'),
    students: can('students:read'),
    teachers: can('teachers:read'),
    cohorts: can('cohorts:read'),
    finance: can('finance:read'),
    branchInvoices: can('finance:read'),
    invoiceAttribution: can('finance:read') && can('students:read') && can('cohorts:read'),
    schedule: can('schedule:read'),
    meetings: can('schedule:read') || can('meeting:write'),
    attendance: can('attendance:read'),
    parents: can('parents:read'),
    assignments: can('assignments:read'),
    content: can('content:read'),
    printing: can('printing:read'),
    academics: can('academics:read'),
  }), [can]);
  const studentDirectoryAllowed = access.students && access.cohorts && access.teachers && access.org;
  const studentDetailAllowed = studentDirectoryAllowed && access.parents && access.attendance && access.academics && access.finance && access.intelligence;
  const teacherDirectoryAllowed = access.teachers && access.cohorts && access.students && access.org;
  const teacherDetailAllowed = access.teachers && access.cohorts && access.students && access.intelligence
    && (tail[1] !== 'compensation' || access.finance);
  const groupDetailBaseAllowed = access.cohorts;
  const overview = nested && section === 'overview';
  const needsStudents = (!nested || overview || ['students', 'groups'].includes(section)) && !delegatedView;
  const needsTeachers = (!nested || overview || ['teachers', 'groups'].includes(section)) && !delegatedView;
  const needsCohorts = (!nested || overview || ['students', 'teachers', 'groups', 'exams', 'content'].includes(section)) && !delegatedView;
  const needsFinance = (!nested || overview || section === 'finance') && !delegatedView;

  const branchContextNav = useCallback((target, options) => {
    const rawTarget = String(target || '');
    const [path, query = ''] = rawTarget.split('?', 2);
    const suffix = query ? `?${query}` : '';
    let contextual = path;
    const legacyStudentMatch = path.match(/^students\/directory\/([1-9]\d*)(?:\/(.*))?$/);
    const legacyTeacherMatch = path.match(/^teachers\/directory\/([1-9]\d*)(?:\/(.*))?$/);
    const groupMatch = path.match(/^groups\/([1-9]\d*)(?:\/(.*))?$/);
    const studentMatch = path.match(/^students\/([1-9]\d*)(?:\/(.*))?$/);
    const teacherMatch = path.match(/^teachers\/([1-9]\d*)(?:\/(.*))?$/);
    if (legacyStudentMatch) contextual = `branches/${branchId}/students/${legacyStudentMatch[1]}/${legacyStudentMatch[2] || 'overview'}`;
    else if (legacyTeacherMatch) contextual = `branches/${branchId}/teachers/${legacyTeacherMatch[1]}/${legacyTeacherMatch[2] || 'overview'}`;
    else if (groupMatch) contextual = `branches/${branchId}/groups/${groupMatch[1]}/${groupMatch[2] || 'overview'}`;
    else if (studentMatch) contextual = `branches/${branchId}/students/${studentMatch[1]}/${studentMatch[2] || 'overview'}`;
    else if (teacherMatch) contextual = `branches/${branchId}/teachers/${teacherMatch[1]}/${teacherMatch[2] || 'overview'}`;
    else if (path === 'exams/exams') contextual = `branches/${branchId}/exams`;
    onNav(`${contextual}${suffix}`, options);
  }, [branchId, onNav]);

  const branches = useWorkspaceData('/api/v1/org/branches/', PAGE_100, { enabled: !nested && access.org });
  const branchDetail = useWorkspaceData(
    nested ? `/api/v1/org/branches/${branchId}/` : null,
    undefined,
    { enabled: nested && access.org, staleTime: 5 * 60_000 },
  );
  useWorkspaceTitle(
    nested && !studentDetailId && !teacherDetailId && !groupDetailId && !examDetailId
      ? branchDetail.data?.name
      : '',
    'Branches',
    section || 'directory',
  );
  const signals = useWorkspaceData('/api/v1/intelligence/branches/', PAGE_100, { enabled: (!nested || overview) && access.intelligence });
  const students = useWorkspaceData('/api/v1/students/', nested ? { ...PAGE_100, branch: branchId } : PAGE_100, { enabled: needsStudents && access.students });
  const teachers = useWorkspaceData('/api/v1/teachers/', nested ? { ...PAGE_100, branch: branchId } : PAGE_100, { enabled: needsTeachers && access.teachers });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', nested ? { ...PAGE_100, branch: branchId } : PAGE_100, { enabled: needsCohorts && access.cohorts });
  const invoices = useWorkspaceData('/api/v1/finance/invoices/', nested ? { ...PAGE_100, branch: branchId } : PAGE_100, { enabled: needsFinance && (nested ? access.branchInvoices : access.invoiceAttribution) });
  const expenses = useWorkspaceData('/api/v1/finance/expenses/', nested ? { ...PAGE_100, branch: branchId } : PAGE_100, { enabled: needsFinance && access.finance });
  const exams = useWorkspaceData('/api/v1/academics/exams/', PAGE_100, { enabled: nested && section === 'exams' && !delegatedExamView && access.academics });
  const meetings = useWorkspaceData('/api/v1/meetings/', { ...PAGE_100, branch: branchId }, { enabled: nested && section === 'meetings' && access.meetings });
  const departments = useWorkspaceData('/api/v1/org/departments/', { ...PAGE_100, branch: branchId }, { enabled: nested && section === 'content' && access.org });
  const libraries = useWorkspaceData('/api/v1/content/libraries/', PAGE_100, { enabled: nested && section === 'content' && access.content });
  const printJobs = useWorkspaceData('/api/v1/printing/jobs/', { ...PAGE_100, branch: branchId }, { enabled: nested && section === 'printers' && access.printing });
  const printers = useWorkspaceData('/api/v1/printing/printers/', { ...PAGE_100, branch: branchId }, { enabled: nested && section === 'printers' && access.printing });
  const agents = useWorkspaceData('/api/v1/printing/agents/', { ...PAGE_100, branch: branchId }, { enabled: nested && section === 'printers' && access.printing });
  const contextualStudent = useWorkspaceData(
    studentDetailId ? `/api/v1/students/${studentDetailId}/` : null,
    undefined,
    { enabled: Boolean(studentDetailId) && access.students },
  );
  const contextualTeacher = useWorkspaceData(
    teacherDetailId ? `/api/v1/teachers/${teacherDetailId}/` : null,
    undefined,
    { enabled: Boolean(teacherDetailId) && access.teachers },
  );
  const contextualGroup = useWorkspaceData(
    groupDetailId ? `/api/v1/cohorts/${groupDetailId}/` : null,
    undefined,
    { enabled: Boolean(groupDetailId) && access.cohorts },
  );
  const contextualExam = useWorkspaceData(
    examDetailId ? `/api/v1/academics/exams/${examDetailId}/` : null,
    undefined,
    { enabled: Boolean(examDetailId) && access.academics },
  );
  const contextualExamCohortId = relationKey(contextualExam.data?.cohort);
  const contextualExamCohort = useWorkspaceData(
    contextualExamCohortId ? `/api/v1/cohorts/${contextualExamCohortId}/` : null,
    undefined,
    { enabled: Boolean(examDetailId && contextualExamCohortId) && access.cohorts },
  );

  const models = useMemo(() => branchModels({
    branches: branches.rows,
    signals: signals.rows,
    students: students.rows,
    teachers: teachers.rows,
    cohorts: cohorts.rows,
    invoices: invoices.rows,
    expenses: expenses.rows,
  }), [branches.rows, cohorts.rows, expenses.rows, invoices.rows, signals.rows, students.rows, teachers.rows]);

  if (!rawBranchId) {
    const directoryStates = [branches, signals, students, teachers, cohorts, invoices, expenses];
    const directoryRefreshStates = [
      ...(access.org ? [branches] : []),
      ...(access.intelligence ? [signals] : []),
      ...(access.students ? [students] : []),
      ...(access.teachers ? [teachers] : []),
      ...(access.cohorts ? [cohorts] : []),
      ...(access.invoiceAttribution ? [invoices] : []),
      ...(access.finance ? [expenses] : []),
    ];
    if (!models.length && (branches.pending || signals.pending)) {
      return <div className="ex-page br-page"><EmptyState title="Preparing branch comparisons" body="The organization view is being assembled from the information available to your role." icon={Icons.globe} /></div>;
    }
    if (!models.length && (branches.error || signals.error)) {
      return <div className="ex-page br-page"><EmptyState title="Branches could not be prepared" body="Refresh this view or return after your leadership scope is available." icon={Icons.flag} action={<button className="br-retry" type="button" onClick={() => directoryRefreshStates.forEach((state) => state.retry())}>Try again</button>} /></div>;
    }
    return <BranchDirectory models={models} states={directoryStates} refreshStates={directoryRefreshStates} access={access} onNav={onNav} />;
  }

  if (!branchId) {
    return <div className="ex-page br-page"><EmptyState title="This branch link is not valid" body="Return to the branch directory and choose a current branch workspace." icon={Icons.flag} action={<RouteLink className="br-retry" to="branches" onNav={onNav}>All branches</RouteLink>} /></div>;
  }

  if (access.org && branchDetail.error?.status === 404) {
    return <div className="ex-page br-page"><EmptyState title="This branch is not available" body="It may have been removed or may sit outside the current leadership scope. Return to the branch directory to choose a visible workspace." icon={Icons.shield} action={<RouteLink className="br-retry" to="branches" onNav={onNav}>All branches</RouteLink>} /></div>;
  }

  if (access.org && (branchDetail.error || branchDetail.paused) && branchDetail.data == null) {
    return <div className="ex-page br-page"><EmptyState title="This branch workspace could not be opened" body="The branch identity could not be verified, so no synthetic or broader information has been shown." icon={Icons.flag} action={<button className="br-retry" type="button" onClick={() => branchDetail.retry()}>Try again</button>} /></div>;
  }

  if (access.org && branchDetail.pending && branchDetail.data == null) {
    return <div className="ex-page br-page"><PageLoader label="Preparing this branch workspace…" /></div>;
  }

  const signal = signals.rows.find((row) => idKey(row.branch) === idKey(branchId));
  const branch = branchDetail.data || { id: branchId, name: signal?.name || `Branch ${branchId}` };

  if (delegatedView) {
    const allowed = delegatedStudentView
      ? studentDirectory ? studentDirectoryAllowed : studentDetailAllowed
      : delegatedTeacherView
        ? teacherDirectory ? teacherDirectoryAllowed : teacherDetailAllowed
        : delegatedGroupView
          ? groupDetailBaseAllowed
          : access.academics;
    const detailState = studentDetailId
      ? contextualStudent
      : teacherDetailId
        ? contextualTeacher
        : groupDetailId
          ? contextualGroup
        : examDetailId
          ? contextualExam
          : null;
    const delegatedStates = [branchDetail, detailState, examDetailId ? contextualExamCohort : null].filter(Boolean);
    const backRoute = `branches/${branchId}/${section}`;
    let delegateContent;
    let showDelegatedHeader = true;

    if (!allowed) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="The complete connected record is outside this scope"
          body="This detailed workspace combines several protected areas. It stays closed instead of issuing requests beyond the current responsibilities or presenting restricted panels as empty."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to the branch summary</RouteLink>}
        />
      );
    } else if (detailState?.pending || (examDetailId && contextualExamCohort.pending)) {
      delegateContent = <PageLoader label={`Preparing this ${section === 'groups' ? 'group' : section === 'exams' ? 'exam' : section.slice(0, -1)} record…`} />;
    } else if (detailState && (detailState.error || !detailState.data)) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This record is not available"
          body="It may have been removed or may sit outside the current leadership scope. No broader record has been substituted."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to this branch</RouteLink>}
        />
      );
    } else if (
      studentDetailId
      && relationKey(contextualStudent.data?.branch) !== idKey(branchId)
    ) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This student belongs to another branch"
          body="The record was not opened inside this branch workspace because its recorded branch does not match."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to branch students</RouteLink>}
        />
      );
    } else if (
      teacherDetailId
      && relationKey(contextualTeacher.data?.branch) !== idKey(branchId)
    ) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This teacher belongs to another branch"
          body="The record was not opened inside this branch workspace because its recorded branch does not match."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to branch teachers</RouteLink>}
        />
      );
    } else if (
      groupDetailId
      && relationKey(contextualGroup.data?.branch) !== idKey(branchId)
    ) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This group belongs to another branch"
          body="The group was not opened inside this branch workspace because its recorded branch does not match."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to branch groups</RouteLink>}
        />
      );
    } else if (examDetailId && (!access.cohorts || !contextualExamCohortId || contextualExamCohort.error || !contextualExamCohort.data)) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This exam cannot be verified for the branch"
          body="A verified group-to-branch relationship is required before an exam can appear inside a branch workspace."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to branch exams</RouteLink>}
        />
      );
    } else if (
      examDetailId
      && relationKey(contextualExamCohort.data?.branch) !== idKey(branchId)
    ) {
      delegateContent = (
        <EmptyState
          icon={Icons.shield}
          title="This exam belongs to another branch"
          body="The exam’s recorded group belongs to a different branch, so it was not opened in this workspace."
          action={<RouteLink className="br-retry" to={backRoute} onNav={onNav}>Back to branch exams</RouteLink>}
        />
      );
    } else {
      showDelegatedHeader = studentDirectory || teacherDirectory;
      delegateContent = (
        <Suspense fallback={<PageLoader label="Preparing the detailed workspace…" />}>
          {delegatedStudentView && <BranchStudentsWorkspace route={route} onNav={branchContextNav} user={user} branchId={branchId} />}
          {delegatedTeacherView && <BranchTeachersWorkspace route={route} onNav={branchContextNav} user={user} branchId={branchId} />}
          {delegatedGroupView && <BranchGroupsWorkspace route={route} onNav={branchContextNav} user={user} branchId={branchId} />}
          {delegatedExamView && <BranchExamsWorkspace route={route} onNav={branchContextNav} user={user} branchId={branchId} />}
        </Suspense>
      );
    }

    return (
      <div className="ex-page br-page br-workspace-page">
        {showDelegatedHeader && <BranchHeader branch={branch} section={section} states={delegatedStates} onNav={onNav} showFreshness={false} />}
        <div className="br-workspace-content" key={`${branchId}-${section}-${tail.join('-')}`}>{delegateContent}</div>
      </div>
    );
  }

  const model = branchModels({
    branches: [branch],
    signals: signal ? [signal] : [],
    students: students.rows,
    teachers: teachers.rows,
    cohorts: cohorts.rows,
    invoices: invoices.rows,
    expenses: expenses.rows,
  })[0];
  const cohortIds = new Set(cohorts.rows.map((cohort) => idKey(cohort.id)));
  const visibleStates = access.org ? [branchDetail] : [];
  if (overview) {
    if (access.intelligence) visibleStates.push(signals);
    if (access.students) visibleStates.push(students);
    if (access.teachers) visibleStates.push(teachers);
    if (access.cohorts) visibleStates.push(cohorts);
    if (access.branchInvoices) visibleStates.push(invoices);
    if (access.finance) visibleStates.push(expenses);
  }
  if (section === 'students' && access.students) visibleStates.push(students, ...(access.cohorts ? [cohorts] : []));
  if (section === 'teachers' && access.teachers) visibleStates.push(teachers, ...(access.cohorts ? [cohorts] : []));
  if (section === 'groups' && access.cohorts) visibleStates.push(cohorts, ...(access.students ? [students] : []));
  if (section === 'exams' && access.academics) visibleStates.push(exams, ...(access.cohorts ? [cohorts] : []));
  if (section === 'finance' && access.finance) visibleStates.push(...(access.branchInvoices ? [invoices] : []), expenses);
  if (section === 'meetings' && access.meetings) visibleStates.push(meetings);
  if (section === 'content' && access.content) visibleStates.push(libraries, ...(access.org ? [departments] : []), ...(access.cohorts ? [cohorts] : []));
  if (section === 'printers' && access.printing) visibleStates.push(printJobs, printers, agents);

  let content;
  if (section === 'overview') {
    content = <DataGate states={visibleStates} title="Branch overview"><BranchOverview model={model} students={students} teachers={teachers} cohorts={cohorts} invoices={invoices} expenses={expenses} access={access} onNav={onNav} /></DataGate>;
  } else if (section === 'students') {
    content = access.students ? <DataGate states={[students, ...(access.cohorts ? [cohorts] : [])]} title="Branch students"><StudentsSection state={students} cohorts={cohorts} branchId={branchId} canViewCohorts={access.cohorts} canOpenDirectory={studentDirectoryAllowed} canOpenDetails={studentDetailAllowed} canOpenGroups={groupDetailBaseAllowed} onNav={onNav} /></DataGate> : <AccessHold section="Student information" />;
  } else if (section === 'teachers') {
    content = access.teachers ? <DataGate states={[teachers, ...(access.cohorts ? [cohorts] : [])]} title="Branch teachers"><TeachersSection state={teachers} cohorts={cohorts} branchId={branchId} canViewCohorts={access.cohorts} canOpenDirectory={teacherDirectoryAllowed} canOpenDetails={teacherDetailAllowed} onNav={onNav} /></DataGate> : <AccessHold section="Teacher information" />;
  } else if (section === 'groups') {
    content = access.cohorts ? <DataGate states={[cohorts, ...(access.students ? [students] : [])]} title="Branch groups"><GroupsSection state={cohorts} students={students} branchId={branchId} canViewStudents={access.students} canOpenDetails={groupDetailBaseAllowed} onNav={onNav} /></DataGate> : <AccessHold section="Group information" />;
  } else if (section === 'exams') {
    content = access.academics && access.cohorts
      ? <DataGate states={[exams, cohorts]} title="Branch exams"><ExamsSection state={exams} cohortIds={cohortIds} branchId={branchId} onNav={onNav} /></DataGate>
      : access.academics
        ? <EmptyState icon={Icons.shield} title="Branch exam attribution cannot be verified" body="Group relationships are required before an assessment can be safely placed inside a branch workspace." />
        : <AccessHold section="Assessment information" />;
  } else if (section === 'finance') {
    content = access.finance ? <DataGate states={[expenses, ...(access.branchInvoices ? [invoices] : [])]} title="Branch finance"><FinanceSection invoices={invoices} expenses={expenses} canAttributeInvoices={access.branchInvoices} onNav={onNav} /></DataGate> : <AccessHold section="Financial information" />;
  } else if (section === 'meetings') {
    content = access.meetings ? <DataGate states={[meetings]} title="Branch meetings"><MeetingsSection state={meetings} onNav={onNav} /></DataGate> : <AccessHold section="Meeting information" />;
  } else if (section === 'content') {
    content = access.content && (access.org || access.cohorts) ? <DataGate states={[libraries, ...(access.org ? [departments] : []), ...(access.cohorts ? [cohorts] : [])]} title="Branch learning library"><ContentSection libraries={libraries} departments={departments} cohortIds={cohortIds} canViewDepartments={access.org} canViewCohorts={access.cohorts} onNav={onNav} /></DataGate> : access.content ? <EmptyState icon={Icons.shield} title="Branch library attribution cannot be verified" body="A group or department relationship is required before learning content can be safely placed inside a branch workspace." /> : <AccessHold section="Learning library" />;
  } else if (section === 'printers') {
    content = access.printing
      ? <DataGate states={[printJobs, printers, agents]} title="Branch print room"><PrintersSection jobs={printJobs} printers={printers} agents={agents} onNav={onNav} /></DataGate>
      : <AccessHold section="Print room" />;
  } else if (section === 'activity') {
    content = <ActivitySafetyHold branchName={branch.name || `Branch ${branchId}`} />;
  } else {
    content = <EmptyState title="This branch section is not available" body="Return to the branch overview and choose a current workspace section." icon={Icons.flag} action={<RouteLink className="br-retry" to={`branches/${branchId}/overview`} onNav={onNav}>Branch overview</RouteLink>} />;
  }

  return (
    <div className="ex-page br-page br-workspace-page">
      <BranchHeader branch={branch} section={section} states={visibleStates} onNav={onNav} showFreshness={visibleStates.length > 0} />
      <div className="br-workspace-content" key={`${branchId}-${section}`}>{content}</div>
    </div>
  );
}
