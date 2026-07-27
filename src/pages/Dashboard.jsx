import { cloneElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { httpRequest } from '../api/http.js';
import { API_CONFIG } from '../api/config.js';
import { roleConfigForUser } from '../config/roles.js';
import { Icons } from '../components/Icons.jsx';

const PAGE_SIZE = Object.freeze({ page_size: 6 });
const SMALL_PAGE = Object.freeze({ page_size: 4 });

const LEADERSHIP_NOTES = Object.freeze([
  'Clarity is kindness, especially when the decision is difficult.',
  'Protect the team’s attention and the mission gains momentum.',
  'Quiet consistency compounds into extraordinary culture.',
  'The strongest organizations turn listening into an operating habit.',
  'A calm leader makes room for better decisions.',
]);

const DIRECTORY_GROUPS = Object.freeze({
  main: 'Overview',
  people: 'People and learning',
  org: 'Organization and insight',
  finance: 'Finance',
  ops: 'Operations',
  comms: 'Communication',
  system: 'Account and preferences',
});

const DIRECTORY_META = Object.freeze({
  backendPeople: 'Students, cohorts, teachers, and family records.',
  backendOrganization: 'Branches, departments, rooms, and organization structure.',
  backendAttendance: 'Attendance records, lesson activity, and punctuality.',
  backendAcademics: 'Exams, grades, subjects, and academic records.',
  backendAssignments: 'Assignments, submissions, deadlines, and grading.',
  backendScheduling: 'Meetings, availability, and day-to-day scheduling.',
  backendApprovals: 'Leadership approvals and accountable decisions.',
  backendFinance: 'Invoices, payments, expenses, and financial oversight.',
  backendOperations: 'Tasks, procurement, cover, and operational coordination.',
  backendIntelligence: 'Branch health, student risk, and decision signals.',
  backendReports: 'Leadership reports and scheduled delivery.',
  backendAudit: 'A clear record of important changes and actions.',
  backendEngagement: 'Campaigns, forms, announcements, and updates.',
  backendMessaging: 'People directory and communication channels.',
  backendAI: 'AI usage, guardrails, and leadership oversight.',
  backendContent: 'Learning content, documents, and printing.',
  backendPlacement: 'Student placement and level decisions.',
  backendRecognition: 'Recognition, conduct, and student milestones.',
  backendAccess: 'Leadership responsibilities and access administration.',
  backendAccount: 'Your profile, responsibilities, and account details.',
  settings: 'Appearance, language, and workspace comfort.',
});

function useExecutiveData(path, params) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    data: null,
    pagination: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    if (!path) {
      setState({
        data: null,
        pagination: null,
        loading: false,
        error: null,
        updatedAt: null,
      });
      return undefined;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));

    httpRequest('GET', path, { params, signal: controller.signal, withMeta: true })
      .then((response) => {
        if (!controller.signal.aborted) {
          setState({
            data: response?.data ?? null,
            pagination: response?.pagination ?? null,
            loading: false,
            error: null,
            updatedAt: new Date(),
          });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, loading: false, error }));
        }
      });

    return () => controller.abort();
  }, [params, path, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, retry };
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function reportedCount(value) {
  if (value == null || Array.isArray(value)) return null;
  return finiteNumber(value?.count ?? value?.total ?? value?.unread_count);
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ratioPercent(value, total) {
  const numerator = finiteNumber(value);
  const denominator = finiteNumber(total);
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return clamp((numerator / denominator) * 100);
}

function ratePercent(value) {
  const number = finiteNumber(value);
  if (number == null || number < 0) return null;
  return clamp(number <= 1 ? number * 100 : number);
}

function formatNumber(value) {
  const number = finiteNumber(value);
  return number == null ? '—' : number.toLocaleString();
}

function formatDecimal(value) {
  const number = finiteNumber(value);
  if (number == null) return '—';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: number % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatPercent(value) {
  const number = finiteNumber(value);
  if (number == null) return '—';
  return `${number.toLocaleString(undefined, {
    minimumFractionDigits: number % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNoticeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function firstNameFrom(user) {
  const given = String(user?.first_name || '').trim();
  if (given) return given;
  const full = String(user?.full_name || '').trim();
  return full ? full.split(/\s+/)[0] : '';
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function iconWithSize(icon, size = 18) {
  return icon ? cloneElement(icon, { size }) : null;
}

function riskMeta(level) {
  const value = String(level || '').toLowerCase();
  if (value === 'high') return { key: 'high', label: 'Immediate', tone: 'danger', weight: 3 };
  if (value === 'medium') return { key: 'medium', label: 'Watch', tone: 'warn', weight: 2 };
  if (value === 'low') return { key: 'low', label: 'Monitor', tone: 'success', weight: 1 };
  return { key: 'other', label: 'Review', tone: 'neutral', weight: 0 };
}

function studentName(item) {
  return String(item?.name || item?.full_name || '').trim() || 'Unnamed student';
}

function branchName(item) {
  return String(item?.name || '').trim() || 'Unnamed branch';
}

function average(values) {
  const numbers = values.map(finiteNumber).filter((value) => value != null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function weightedAttendance(branches) {
  const rows = branches
    .map((branch) => ({
      attendance: ratePercent(branch.attendance_rate),
      students: finiteNumber(branch.active_students),
    }))
    .filter((branch) => branch.attendance != null);

  if (!rows.length) return null;
  const weighted = rows.filter((branch) => branch.students != null && branch.students > 0);
  if (!weighted.length) return average(rows.map((branch) => branch.attendance));
  const totalStudents = weighted.reduce((sum, branch) => sum + branch.students, 0);
  return weighted.reduce(
    (sum, branch) => sum + branch.attendance * branch.students,
    0,
  ) / totalStudents;
}

function LoadingRows({ rows = 4, compact = false }) {
  return (
    <div className={`ld-loading${compact ? ' is-compact' : ''}`} role="status" aria-label="Preparing this view">
      {Array.from({ length: rows }, (_, index) => (
        <div className="ld-loading-row" key={index}>
          <i />
          <span>
            <b />
            <b />
          </span>
          <em />
        </div>
      ))}
    </div>
  );
}

function StateMessage({
  icon = Icons.brand,
  title,
  body,
  action,
  actionLabel = 'Try again',
  compact = false,
}) {
  return (
    <div className={`ld-state${compact ? ' is-compact' : ''}`}>
      <span>{iconWithSize(icon, 21)}</span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action && (
        <button type="button" className="ld-link-button" onClick={action}>
          {actionLabel}
          {iconWithSize(Icons.chevR, 14)}
        </button>
      )}
    </div>
  );
}

function EndpointState({ state, restrictedTitle, emptyTitle, emptyBody, icon }) {
  if (state.loading && state.data == null) return <LoadingRows />;
  if (state.error && state.data == null) {
    const restricted = state.error.status === 403;
    return (
      <StateMessage
        icon={restricted ? Icons.shield : Icons.flag}
        title={restricted ? restrictedTitle : 'This view needs another moment'}
        body={
          restricted
            ? 'Your current responsibilities do not include this information.'
            : 'We could not bring this information into focus. The rest of your dashboard remains available.'
        }
        action={restricted ? null : state.retry}
      />
    );
  }
  if (emptyTitle) {
    return <StateMessage icon={icon} title={emptyTitle} body={emptyBody} />;
  }
  return null;
}

function StaleNote({ state }) {
  if (!state.error || state.data == null) return null;
  return (
    <div className="ld-stale">
      <span>{iconWithSize(Icons.flag, 14)} Showing the most recent available view.</span>
      <button type="button" onClick={state.retry}>Refresh</button>
    </div>
  );
}

function unavailableByDesign(state) {
  return state.error?.status === 403 || state.error?.status === 404;
}

function Section({
  eyebrow,
  title,
  description,
  action,
  children,
  className = '',
  state,
}) {
  return (
    <section className={`ld-section ${className}`.trim()}>
      <header className="ld-section-head">
        <div>
          {eyebrow && <span className="ld-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {state && <StaleNote state={state} />}
      <div className="ld-section-body">{children}</div>
    </section>
  );
}

function OpenButton({ children, onClick }) {
  return (
    <button type="button" className="ld-link-button" onClick={onClick}>
      {children}
      {iconWithSize(Icons.chevR, 14)}
    </button>
  );
}

function CompactHeader({
  role,
  user,
  title,
  busy,
  hasError,
  updatedAt,
  onRefresh,
  onNav,
}) {
  const today = useMemo(() => new Date(), []);
  const firstName = firstNameFrom(user);
  const actions = role === 'ceo'
    ? [
        ['backendIntelligence', 'Intelligence', Icons.trend],
        ['backendFinance', 'Finance', Icons.trend],
        ['backendReports', 'Reports', Icons.doc],
      ]
    : [
        ['backendPeople', 'People', Icons.cohort],
        ['backendAttendance', 'Attendance', Icons.check],
        ['backendOperations', 'Operations', Icons.settings],
      ];

  return (
    <header className="ld-header">
      <div className="ld-header-copy">
        <span className="ld-eyebrow">{role === 'ceo' ? 'Executive workspace' : 'Management workspace'}</span>
        <h1>
          {greetingFor(today)}
          {firstName ? `, ${firstName}` : ''}.
        </h1>
        <p>{title} · {formatDate(today)}</p>
      </div>
      <div className="ld-header-tools">
        <div className="ld-header-shortcuts" aria-label="Quick actions">
          {actions.map(([id, label, icon]) => (
            <button type="button" key={id} onClick={() => onNav(id)}>
              {iconWithSize(icon, 15)}
              {label}
            </button>
          ))}
        </div>
        <div className="ld-refresh-block">
          <span className={`ld-readiness${hasError ? ' has-warning' : ''}`}>
            <i />
            {busy ? 'Refreshing overview' : hasError ? 'Some areas need attention' : 'Overview ready'}
          </span>
          <button type="button" className="ld-refresh" onClick={onRefresh} disabled={busy}>
            <span className={busy ? 'is-spinning' : ''}>{iconWithSize(Icons.trend, 16)}</span>
            {busy ? 'Refreshing' : 'Refresh'}
          </button>
          {updatedAt && !busy && <small>Last successful update {formatTime(updatedAt)}</small>}
        </div>
      </div>
    </header>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  tone = 'primary',
  progress = null,
  loading = false,
  unavailable = false,
}) {
  return (
    <article className={`ld-metric ld-tone-${tone}`}>
      <div className="ld-metric-head">
        <span>{iconWithSize(icon, 17)}</span>
        <p>{label}</p>
      </div>
      {loading ? (
        <div className="ld-metric-loading"><i /><i /></div>
      ) : (
        <>
          <strong className={unavailable ? 'is-unavailable' : ''}>{value}</strong>
          <small>{description}</small>
          {progress != null && (
            <span
              className="ld-progress"
              role="progressbar"
              aria-label={label}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(progress)}
            >
              <i style={{ width: `${clamp(progress)}%` }} />
            </span>
          )}
        </>
      )}
    </article>
  );
}

function StudentPulse({ state, stats, total, withCohort, withoutCohort, blocked, coverage, onNav }) {
  const ready = state.data != null;
  return (
    <Section
      eyebrow="Student snapshot"
      title="People and enrollment pulse"
      description="A concise view of the students currently within your leadership scope."
      action={<OpenButton onClick={() => onNav('backendPeople')}>Open people</OpenButton>}
      state={state}
      className="ld-student-pulse"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Student information is outside your current responsibilities"
        />
      ) : (
        <div className="ld-pulse-content">
          <div className="ld-coverage-summary">
            <div className="ld-coverage-value">
              <span>Cohort coverage</span>
              <strong>{formatPercent(coverage)}</strong>
              <p>
                {withCohort == null || total == null
                  ? 'Placement details are not available yet.'
                  : `${formatNumber(withCohort)} of ${formatNumber(total)} students are currently placed.`}
              </p>
            </div>
            <div className="ld-coverage-bar" aria-label="Cohort coverage">
              <span style={{ width: `${coverage ?? 0}%` }} />
            </div>
            <div className="ld-coverage-key">
              <span><i className="is-placed" /> Placed <b>{formatNumber(withCohort)}</b></span>
              <span><i className="is-waiting" /> Waiting <b>{formatNumber(withoutCohort)}</b></span>
            </div>
          </div>
          <dl className="ld-pulse-list">
            <div>
              <dt>Total students</dt>
              <dd>{formatNumber(total)}</dd>
              <small>Records visible to you</small>
            </div>
            <div>
              <dt>Placed in cohorts</dt>
              <dd>{formatNumber(withCohort)}</dd>
              <small>Current cohort assignments</small>
            </div>
            <div>
              <dt>Awaiting placement</dt>
              <dd>{formatNumber(withoutCohort)}</dd>
              <small>Students without a cohort</small>
            </div>
            <div>
              <dt>Enrollment holds</dt>
              <dd>{formatNumber(blocked)}</dd>
              <small>Records requiring clearance</small>
            </div>
          </dl>
          {stats?.updated_at && (
            <span className="ld-source-date">Snapshot updated {formatNoticeTime(stats.updated_at)}</span>
          )}
        </div>
      )}
    </Section>
  );
}

function PriorityQueue({ actions, loading, incomplete, onNav }) {
  return (
    <Section
      eyebrow="Today’s focus"
      title="Leadership queue"
      description="The clearest follow-ups found in the information currently available."
      className="ld-queue"
    >
      {loading && !actions.length ? (
        <LoadingRows rows={4} compact />
      ) : !actions.length ? (
        <StateMessage
          compact
          icon={incomplete ? Icons.flag : Icons.check}
          title={incomplete ? 'A complete check is still in progress' : 'Your immediate queue is clear'}
          body={
            incomplete
              ? 'Refresh the overview to complete the remaining signals.'
              : 'No urgent follow-ups appear in the current view.'
          }
        />
      ) : (
        <div className="ld-queue-list">
          {actions.map((action) => (
            <button
              type="button"
              className={`ld-queue-item ld-tone-${action.tone}`}
              key={action.key}
              onClick={() => onNav(action.route)}
            >
              <span className="ld-queue-icon">{iconWithSize(action.icon, 18)}</span>
              <span>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </span>
              <b>{action.value}</b>
              {iconWithSize(Icons.chevR, 16)}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function BranchPerformance({ state, branches, averageScore, attendance, onNav }) {
  const ready = state.data != null;
  return (
    <Section
      eyebrow="Organization pulse"
      title="Branch performance"
      description="A comparable view of score, attendance, student volume, and attention signals."
      action={<OpenButton onClick={() => onNav('backendIntelligence')}>Open intelligence</OpenButton>}
      state={state}
      className="ld-branches"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Branch insight is outside your current responsibilities"
        />
      ) : !branches.length ? (
        <EndpointState
          state={state}
          emptyTitle="No branch signals yet"
          emptyBody="Branch performance will appear here as information becomes available."
          icon={Icons.brand}
        />
      ) : (
        <>
          <div className="ld-branch-summary">
            <span><small>Branches in view</small><strong>{formatNumber(branches.length)}</strong></span>
            <span><small>Average score</small><strong>{formatDecimal(averageScore)}</strong></span>
            <span><small>Visible attendance</small><strong>{formatPercent(attendance)}</strong></span>
            <span>
              <small>Students represented</small>
              <strong>{formatNumber(branches.reduce(
                (sum, branch) => sum + (finiteNumber(branch.active_students) ?? 0),
                0,
              ))}</strong>
            </span>
          </div>
          <div className="ld-branch-table" role="table" aria-label="Branch performance">
            <div className="ld-branch-table-head" role="row">
              <span role="columnheader">Branch</span>
              <span role="columnheader">Students</span>
              <span role="columnheader">Attendance</span>
              <span role="columnheader">Attention</span>
              <span role="columnheader">Score</span>
            </div>
            {branches.map((branch, index) => {
              const branchAttendance = ratePercent(branch.attendance_rate);
              const score = finiteNumber(branch.score);
              const rank = finiteNumber(branch.rank) ?? index + 1;
              return (
                <div
                  className="ld-branch-table-row"
                  role="row"
                  key={branch.branch ?? `${branchName(branch)}-${index}`}
                >
                  <span className="ld-branch-identity" role="cell">
                    <i>{rank}</i>
                    <b>{branchName(branch)}</b>
                  </span>
                  <span className="ld-branch-cell" role="cell">
                    <small>Students</small>
                    <strong>{formatNumber(branch.active_students)}</strong>
                  </span>
                  <span className="ld-branch-cell has-bar" role="cell">
                    <small>Attendance</small>
                    <strong>{formatPercent(branchAttendance)}</strong>
                    {branchAttendance != null && <i><b style={{ width: `${branchAttendance}%` }} /></i>}
                  </span>
                  <span className="ld-branch-cell" role="cell">
                    <small>Attention</small>
                    <strong>{formatNumber(branch.at_risk)}</strong>
                  </span>
                  <span className="ld-branch-score" role="cell">
                    <small>Score</small>
                    <strong>{formatDecimal(score)}</strong>
                    {score != null && <i><b style={{ width: `${clamp(score)}%` }} /></i>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}

function operatingTitle(item, fallback) {
  return String(
    item?.title
      || item?.name
      || item?.subject
      || item?.topic
      || item?.request_type
      || item?.invoice_number
      || '',
  ).trim() || fallback;
}

function OperatingCard({ state, label, icon, route, fallbackTitle, onNav }) {
  const rows = rowsFrom(state.data);
  const total = finiteNumber(state.pagination?.total) ?? reportedCount(state.data);
  const value = total ?? rows.length;
  const countLabel = total == null
    ? `${formatNumber(rows.length)} shown in this view`
    : `${formatNumber(total)} in your scope`;

  return (
    <article className="ld-operating-card">
      <header>
        <span>{iconWithSize(icon, 17)}</span>
        <p>{label}</p>
        <button type="button" aria-label={`Open ${label}`} onClick={() => onNav(route)}>
          {iconWithSize(Icons.chevR, 15)}
        </button>
      </header>
      {state.loading && state.data == null ? (
        <div className="ld-operating-loading"><i /><i /><i /></div>
      ) : state.error && state.data == null ? (
        <div className="ld-operating-unavailable">
          <strong>—</strong>
          <span>
            {unavailableByDesign(state)
              ? 'Not included in your current view'
              : 'Needs another moment'}
          </span>
          {!unavailableByDesign(state) && (
            <button type="button" onClick={state.retry}>Try again</button>
          )}
        </div>
      ) : (
        <>
          <div className="ld-operating-count">
            <strong>{formatNumber(value)}</strong>
            <span>{countLabel}</span>
          </div>
          <div className="ld-operating-preview">
            {rows.slice(0, 2).map((item, index) => (
              <span key={item.id ?? `${fallbackTitle}-${index}`}>
                <i />
                {operatingTitle(item, fallbackTitle)}
              </span>
            ))}
            {!rows.length && (
              <p>
                {value > 0
                  ? 'Open this workspace to review the items.'
                  : 'Nothing is waiting in this view.'}
              </p>
            )}
          </div>
        </>
      )}
      <StaleNote state={state} />
    </article>
  );
}

function OperatingDay({
  role,
  approvals,
  tasks,
  meetings,
  invoices,
  unreadState,
  onNav,
}) {
  const cards = [
    {
      key: 'approvals',
      state: approvals,
      label: 'Approval requests',
      icon: Icons.check,
      route: 'backendApprovals',
      fallbackTitle: 'Approval request',
    },
    {
      key: 'tasks',
      state: tasks,
      label: 'Operational tasks',
      icon: Icons.settings,
      route: 'backendOperations',
      fallbackTitle: 'Operational task',
    },
    {
      key: 'meetings',
      state: meetings,
      label: 'Upcoming meetings',
      icon: Icons.cal,
      route: 'backendScheduling',
      fallbackTitle: 'Upcoming meeting',
    },
    {
      key: 'updates',
      state: unreadState,
      label: 'Unread updates',
      icon: Icons.bell,
      route: 'backendEngagement',
      fallbackTitle: 'Leadership update',
    },
  ];
  if (role === 'ceo') {
    cards.splice(3, 0, {
      key: 'invoices',
      state: invoices,
      label: 'Finance records',
      icon: Icons.trend,
      route: 'backendFinance',
      fallbackTitle: 'Finance record',
    });
  }

  return (
    <Section
      eyebrow="Operating day"
      title="Work moving across the organization"
      description="Focused views of approvals, tasks, meetings, and other work within your responsibilities."
      className="ld-operating-day"
    >
      <div className={`ld-operating-grid${role === 'ceo' ? ' has-five' : ''}`}>
        {cards.map((card) => (
          <OperatingCard {...card} onNav={onNav} key={card.key} />
        ))}
      </div>
    </Section>
  );
}

function RiskComposition({ state, risks, totalRisk, onNav }) {
  const ready = state.data != null;
  const counts = risks.reduce(
    (result, item) => {
      result[riskMeta(item.level).key] += 1;
      return result;
    },
    { high: 0, medium: 0, low: 0, other: 0 },
  );
  const visible = risks.length;
  const segments = [
    ['high', 'Immediate', 'danger'],
    ['medium', 'Watch', 'warn'],
    ['low', 'Monitor', 'success'],
    ['other', 'Review', 'neutral'],
  ];

  return (
    <Section
      eyebrow="Student care"
      title="Risk composition"
      description="The balance of follow-up levels in the current student view."
      action={<OpenButton onClick={() => onNav('backendIntelligence')}>Review insight</OpenButton>}
      state={state}
      className="ld-risk-composition"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Student insight is outside your current responsibilities"
        />
      ) : !risks.length ? (
        <StateMessage
          icon={Icons.check}
          title="No configured risk signals"
          body="No students currently match the follow-up rules in your view."
        />
      ) : (
        <div className="ld-risk-body">
          <div className="ld-risk-total">
            <span>Priority records</span>
            <strong>{formatNumber(totalRisk)}</strong>
            <small>{formatNumber(visible)} shown in this view</small>
          </div>
          <div
            className="ld-risk-bar"
            aria-label={`${counts.high} immediate, ${counts.medium} watch, ${counts.low} monitor, ${counts.other} review`}
          >
            {segments.map(([key, , tone]) => (
              counts[key] > 0 && (
                <span
                  className={`ld-risk-${tone}`}
                  key={key}
                  style={{ width: `${(counts[key] / visible) * 100}%` }}
                />
              )
            ))}
          </div>
          <div className="ld-risk-key">
            {segments.map(([key, label, tone]) => (
              <div key={key}>
                <i className={`ld-risk-${tone}`} />
                <span>{label}</span>
                <strong>{counts[key]}</strong>
              </div>
            ))}
          </div>
          <p className="ld-context-note">
            Composition reflects only the records currently visible on this dashboard.
          </p>
        </div>
      )}
    </Section>
  );
}

function PrioritizedStudents({ state, risks, onNav }) {
  const ready = state.data != null;
  const prioritized = useMemo(
    () => [...risks].sort((left, right) => {
      const levelDifference = riskMeta(right.level).weight - riskMeta(left.level).weight;
      if (levelDifference) return levelDifference;
      return (finiteNumber(right.score) ?? 0) - (finiteNumber(left.score) ?? 0);
    }),
    [risks],
  );

  return (
    <Section
      eyebrow="Prioritized follow-up"
      title="Students needing attention"
      description="Highest-priority records first, with the signals available for review."
      action={<OpenButton onClick={() => onNav('backendIntelligence')}>Review all</OpenButton>}
      state={state}
      className="ld-priority-students"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Student insight is outside your current responsibilities"
        />
      ) : !prioritized.length ? (
        <StateMessage
          icon={Icons.check}
          title="No students in the follow-up list"
          body="Students will appear here when they match a configured care signal."
        />
      ) : (
        <div className="ld-student-list">
          {prioritized.map((item, index) => {
            const meta = riskMeta(item.level);
            const flags = Array.isArray(item.flags) ? item.flags.length : null;
            return (
              <button
                type="button"
                className="ld-student-row"
                key={item.student ?? `${studentName(item)}-${index}`}
                onClick={() => onNav('backendIntelligence')}
              >
                <span className={`ld-student-avatar ld-tone-${meta.tone}`}>
                  {studentName(item).charAt(0).toUpperCase()}
                </span>
                <span className="ld-student-copy">
                  <strong>{studentName(item)}</strong>
                  <small>
                    {item.cohort ? `Cohort ${item.cohort}` : 'Cohort not shown'}
                    {flags != null ? ` · ${flags} signal${flags === 1 ? '' : 's'}` : ''}
                  </small>
                </span>
                <span className={`ld-level ld-level-${meta.tone}`}>{meta.label}</span>
                <span className="ld-student-score">
                  <small>Score</small>
                  <b>{formatDecimal(item.score)}</b>
                </span>
                {iconWithSize(Icons.chevR, 15)}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function EnrollmentCoverage({
  state,
  total,
  withCohort,
  withoutCohort,
  blocked,
  coverage,
  onNav,
}) {
  const ready = state.data != null;
  const holdRate = ratioPercent(blocked, total);
  return (
    <Section
      eyebrow="Enrollment health"
      title="Cohort coverage and holds"
      description="Placement coverage and student records that may need an operational decision."
      action={<OpenButton onClick={() => onNav('backendPeople')}>Manage enrollment</OpenButton>}
      state={state}
      className="ld-enrollment"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Enrollment information is outside your current responsibilities"
        />
      ) : (
        <div className="ld-enrollment-layout">
          <div className="ld-enrollment-meter">
            <div>
              <span>Current placement coverage</span>
              <strong>{formatPercent(coverage)}</strong>
            </div>
            <div className="ld-enrollment-track">
              <i className="is-placed" style={{ width: `${coverage ?? 0}%` }} />
              <i className="is-waiting" style={{ width: `${coverage == null ? 0 : 100 - coverage}%` }} />
            </div>
            <p>
              {coverage == null
                ? 'Coverage cannot be calculated from the information available.'
                : `${formatNumber(withCohort)} students are placed and ${formatNumber(withoutCohort)} are awaiting a cohort.`}
            </p>
          </div>
          <div className="ld-enrollment-cards">
            <article>
              <span>{iconWithSize(Icons.check, 17)}</span>
              <small>Placed</small>
              <strong>{formatNumber(withCohort)}</strong>
              <p>{formatPercent(coverage)} of students in scope</p>
            </article>
            <article>
              <span>{iconWithSize(Icons.cohort, 17)}</span>
              <small>Awaiting cohort</small>
              <strong>{formatNumber(withoutCohort)}</strong>
              <p>{formatPercent(coverage == null ? null : 100 - coverage)} of students in scope</p>
            </article>
            <article>
              <span>{iconWithSize(Icons.shield, 17)}</span>
              <small>Enrollment holds</small>
              <strong>{formatNumber(blocked)}</strong>
              <p>{formatPercent(holdRate)} of students in scope</p>
            </article>
          </div>
        </div>
      )}
    </Section>
  );
}

function BranchLoad({ role, state, branches, onNav }) {
  const ready = state.data != null;
  const destination = role === 'ceo' ? 'backendOrganization' : 'backendIntelligence';
  const maxStudents = Math.max(
    ...branches.map((branch) => finiteNumber(branch.active_students) ?? 0),
    0,
  );

  return (
    <Section
      eyebrow="Student distribution"
      title="Visible branch load"
      description="Active student volume across the branches represented in this view."
      action={
        <OpenButton onClick={() => onNav(destination)}>
          {role === 'ceo' ? 'Open organization' : 'Open intelligence'}
        </OpenButton>
      }
      state={state}
      className="ld-branch-load"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Branch distribution is outside your current responsibilities"
        />
      ) : !branches.length ? (
        <StateMessage
          icon={Icons.globe}
          title="No branch distribution yet"
          body="Student distribution will appear when branch information is available."
        />
      ) : (
        <div className="ld-load-list">
          {branches.map((branch, index) => {
            const students = finiteNumber(branch.active_students);
            const width = students != null && maxStudents > 0 ? (students / maxStudents) * 100 : 0;
            return (
              <div className="ld-load-row" key={branch.branch ?? `${branchName(branch)}-${index}`}>
                <span>
                  <strong>{branchName(branch)}</strong>
                  <small>{formatNumber(students)} active students</small>
                </span>
                <i><b style={{ width: `${width}%` }} /></i>
                <strong>{formatNumber(students)}</strong>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Updates({ state, notices, unread, unreadScope, onNav }) {
  const ready = state.data != null;
  return (
    <Section
      eyebrow="Leadership inbox"
      title="Recent updates"
      description={`${formatNumber(unread)} unread update${unread === 1 ? '' : 's'} ${unreadScope}.`}
      action={<OpenButton onClick={() => onNav('backendEngagement')}>Open inbox</OpenButton>}
      state={state}
      className="ld-updates"
    >
      {!ready ? (
        <EndpointState
          state={state}
          restrictedTitle="Updates are outside your current responsibilities"
        />
      ) : !notices.length ? (
        <StateMessage
          icon={Icons.bell}
          title="Your inbox is clear"
          body="New leadership updates will appear here when they arrive."
        />
      ) : (
        <div className="ld-update-grid">
          {notices.map((notice, index) => {
            const isUnread = !notice.read_at && !notice.is_read;
            const time = formatNoticeTime(notice.created_at || notice.sent_at || notice.updated_at);
            return (
              <article className={`ld-update${isUnread ? ' is-unread' : ''}`} key={notice.id ?? index}>
                <span className="ld-update-icon">{iconWithSize(Icons.bell, 16)}</span>
                <div>
                  <div className="ld-update-title">
                    <strong>{notice.title || notice.event_type || 'Leadership update'}</strong>
                    {isUnread && <i>New</i>}
                  </div>
                  <p>{notice.body || notice.message || 'Open this update to see the details.'}</p>
                  {time && <time>{time}</time>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function ManagementDirectory({ role, user, onNav }) {
  const configuration = useMemo(() => roleConfigForUser(role, user), [role, user]);
  const grouped = useMemo(() => {
    const groups = [];
    (configuration?.nav || [])
      .filter((item) => item.id !== 'dash')
      .forEach((item) => {
        let group = groups.find((candidate) => candidate.key === item.grpKey);
        if (!group) {
          group = {
            key: item.grpKey,
            label: DIRECTORY_GROUPS[item.grpKey] || 'Workspace',
            items: [],
          };
          groups.push(group);
        }
        group.items.push(item);
      });
    return groups;
  }, [configuration]);
  const total = grouped.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="ld-directory">
      <header className="ld-directory-head">
        <div>
          <span className="ld-eyebrow">Management directory</span>
          <h2>Every leadership workspace</h2>
          <p>
            A complete, role-appropriate directory for moving from insight to action.
          </p>
        </div>
        <span className="ld-directory-count">{formatNumber(total)} workspaces</span>
      </header>
      <div className="ld-directory-groups">
        {grouped.map((group) => (
          <section className="ld-directory-group" key={group.key}>
            <header>
              <h3>{group.label}</h3>
              <span>{formatNumber(group.items.length)}</span>
            </header>
            <div className="ld-directory-grid">
              {group.items.map((item) => (
                <button type="button" className="ld-directory-item" key={item.id} onClick={() => onNav(item.id)}>
                  <span className="ld-directory-icon">{iconWithSize(item.icon, 19)}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{DIRECTORY_META[item.id] || 'Open this leadership workspace.'}</small>
                  </span>
                  {iconWithSize(Icons.chevR, 16)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function LeadershipFooter() {
  const [noteIndex, setNoteIndex] = useState(-1);
  const reveal = () => setNoteIndex((current) => (current + 1) % LEADERSHIP_NOTES.length);
  return (
    <footer className="ld-footer">
      <button type="button" onClick={reveal} aria-label="Reveal a quiet leadership note">
        {iconWithSize(Icons.brand, 16)}
        <span>{noteIndex < 0 ? 'A quiet leadership note' : LEADERSHIP_NOTES[noteIndex]}</span>
      </button>
      <p>Clear information. Thoughtful action.</p>
    </footer>
  );
}

function TrustedDataPlaceholder({ role, user }) {
  const name = firstNameFrom(user);
  return (
    <div className="ld-dashboard">
      <section className="ld-private-view">
        <span>{iconWithSize(Icons.shield, 24)}</span>
        <div>
          <p>{name ? `Welcome, ${name}` : role === 'ceo' ? 'Welcome, leader' : 'Welcome, manager'}</p>
          <h1>Your leadership view begins with trusted information.</h1>
          <div>
            Organization figures remain private until you enter with your authorized management account.
            This workspace never fills gaps with invented business values.
          </div>
        </div>
      </section>
    </div>
  );
}

function LeadershipDashboard({ role, user, onNav }) {
  const { t } = useTranslation();
  const studentStats = useExecutiveData('/api/v1/students/stats/');
  const branchRanking = useExecutiveData('/api/v1/intelligence/branches/', PAGE_SIZE);
  const risk = useExecutiveData('/api/v1/intelligence/risk/', PAGE_SIZE);
  const notifications = useExecutiveData('/api/v1/notifications/', PAGE_SIZE);
  const unreadSummary = useExecutiveData('/api/v1/notifications/unread-count/');
  const approvals = useExecutiveData('/api/v1/approvals/requests/', SMALL_PAGE);
  const tasks = useExecutiveData('/api/v1/tasks/', SMALL_PAGE);
  const meetings = useExecutiveData('/api/v1/meetings/upcoming/', SMALL_PAGE);
  const invoices = useExecutiveData(
    role === 'ceo' ? '/api/v1/finance/invoices/' : null,
    SMALL_PAGE,
  );

  const stats = studentStats.data || {};
  const branches = useMemo(() => rowsFrom(branchRanking.data), [branchRanking.data]);
  const risks = useMemo(() => rowsFrom(risk.data), [risk.data]);
  const notices = useMemo(() => rowsFrom(notifications.data), [notifications.data]);

  const total = finiteNumber(stats.total);
  const withCohort = finiteNumber(stats.with_cohort);
  const withoutCohort = finiteNumber(stats.without_cohort);
  const blocked = finiteNumber(stats.blocked);
  const coverage = ratioPercent(withCohort, total);
  const branchScore = average(branches.map((branch) => branch.score));
  const attendance = weightedAttendance(branches);
  const reportedRisk =
    finiteNumber(risk.pagination?.total) ?? reportedCount(risk.data);
  const totalRisk = risk.data == null ? null : reportedRisk ?? risks.length;
  const highRisk = risks.filter((item) => riskMeta(item.level).key === 'high').length;
  const reportedUnread = finiteNumber(
    unreadSummary.data?.unread_count
      ?? unreadSummary.data?.count
      ?? notifications.data?.unread_count
      ?? notifications.data?.unread,
  );
  const unread = reportedUnread ?? notices.filter((item) => !item.read_at && !item.is_read).length;
  const unreadScope = reportedUnread == null ? 'in the latest view' : 'across your inbox';

  const states = [
    studentStats,
    branchRanking,
    risk,
    notifications,
    unreadSummary,
    approvals,
    tasks,
    meetings,
    invoices,
  ];
  const busy = states.some((state) => state.loading);
  const hasError = states.some(
    (state) => Boolean(state.error) && !unavailableByDesign(state),
  );
  const updatedAt = states
    .map((state) => state.updatedAt)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

  const queue = useMemo(() => {
    const items = [];
    if (highRisk > 0) {
      items.push({
        key: 'risk',
        label: 'Immediate student follow-ups',
        detail: 'Review the highest-priority student signals.',
        value: formatNumber(highRisk),
        route: 'backendIntelligence',
        icon: Icons.flag,
        tone: 'danger',
      });
    }
    if (withoutCohort != null && withoutCohort > 0) {
      items.push({
        key: 'cohort',
        label: 'Cohort placement',
        detail: 'Students are waiting for cohort assignment.',
        value: formatNumber(withoutCohort),
        route: 'backendPeople',
        icon: Icons.cohort,
        tone: 'warn',
      });
    }
    if (blocked != null && blocked > 0) {
      items.push({
        key: 'holds',
        label: 'Enrollment holds',
        detail: 'Student records currently need clearance.',
        value: formatNumber(blocked),
        route: 'backendPeople',
        icon: Icons.shield,
        tone: 'danger',
      });
    }
    if (unread > 0 && notifications.data != null) {
      items.push({
        key: 'updates',
        label: 'Unread leadership updates',
        detail: `Recent messages waiting ${unreadScope}.`,
        value: formatNumber(unread),
        route: 'backendEngagement',
        icon: Icons.bell,
        tone: 'primary',
      });
    }
    return items;
  }, [blocked, highRisk, notifications.data, unread, unreadScope, withoutCohort]);

  const retryStudentStats = studentStats.retry;
  const retryBranchRanking = branchRanking.retry;
  const retryRisk = risk.retry;
  const retryNotifications = notifications.retry;
  const retryUnreadSummary = unreadSummary.retry;
  const retryApprovals = approvals.retry;
  const retryTasks = tasks.retry;
  const retryMeetings = meetings.retry;
  const retryInvoices = invoices.retry;
  const refreshAll = useCallback(() => {
    retryStudentStats();
    retryBranchRanking();
    retryRisk();
    retryNotifications();
    retryUnreadSummary();
    retryApprovals();
    retryTasks();
    retryMeetings();
    retryInvoices();
  }, [
    retryApprovals,
    retryBranchRanking,
    retryInvoices,
    retryMeetings,
    retryNotifications,
    retryRisk,
    retryStudentStats,
    retryTasks,
    retryUnreadSummary,
  ]);

  const statsUnavailable = Boolean(studentStats.error && studentStats.data == null);
  const branchesUnavailable = Boolean(branchRanking.error && branchRanking.data == null);
  const riskUnavailable = Boolean(risk.error && risk.data == null);
  const updatesUnavailable = Boolean(notifications.error && notifications.data == null);

  return (
    <div className="ld-dashboard">
      <CompactHeader
        role={role}
        user={user}
        title={role === 'ceo' ? t('dash.titleCeo') : t('dash.titleManager')}
        busy={busy}
        hasError={hasError}
        updatedAt={updatedAt}
        onRefresh={refreshAll}
        onNav={onNav}
      />

      <section className="ld-metrics" aria-label="Leadership metrics">
        <MetricCard
          label="Students in scope"
          value={formatNumber(total)}
          description={statsUnavailable ? 'Select refresh to try again.' : 'Student records visible to you.'}
          icon={Icons.cohort}
          loading={studentStats.loading && studentStats.data == null}
          unavailable={statsUnavailable}
        />
        <MetricCard
          label="Cohort coverage"
          value={formatPercent(coverage)}
          description={
            statsUnavailable
              ? 'Select refresh to try again.'
              : `${formatNumber(withCohort)} placed · ${formatNumber(withoutCohort)} waiting`
          }
          icon={Icons.check}
          tone="success"
          progress={coverage}
          loading={studentStats.loading && studentStats.data == null}
          unavailable={statsUnavailable || coverage == null}
        />
        <MetricCard
          label="Visible attendance"
          value={formatPercent(attendance)}
          description={branchesUnavailable ? 'Select refresh to try again.' : 'Student-weighted across visible branches.'}
          icon={Icons.cal}
          progress={attendance}
          loading={branchRanking.loading && branchRanking.data == null}
          unavailable={branchesUnavailable || attendance == null}
        />
        <MetricCard
          label="Enrollment holds"
          value={formatNumber(blocked)}
          description={statsUnavailable ? 'Select refresh to try again.' : 'Records currently needing clearance.'}
          icon={Icons.shield}
          tone={blocked > 0 ? 'danger' : 'success'}
          loading={studentStats.loading && studentStats.data == null}
          unavailable={statsUnavailable}
        />
        <MetricCard
          label={reportedRisk == null ? 'Priority signals shown' : 'Priority follow-ups'}
          value={formatNumber(totalRisk)}
          description={
            riskUnavailable
              ? 'Select refresh to try again.'
              : reportedRisk == null
                ? `${formatNumber(highRisk)} immediate · ${formatNumber(risks.length)} shown`
                : `${formatNumber(highRisk)} immediate in this view.`
          }
          icon={Icons.flag}
          tone={highRisk > 0 ? 'danger' : 'success'}
          loading={risk.loading && risk.data == null}
          unavailable={riskUnavailable}
        />
        <MetricCard
          label="Unread updates"
          value={formatNumber(unread)}
          description={updatesUnavailable ? 'Select refresh to try again.' : `Waiting ${unreadScope}.`}
          icon={Icons.bell}
          tone={unread > 0 ? 'warn' : 'success'}
          loading={notifications.loading && notifications.data == null}
          unavailable={updatesUnavailable}
        />
      </section>

      <div className="ld-balanced-grid ld-pulse-grid">
        <StudentPulse
          state={studentStats}
          stats={stats}
          total={total}
          withCohort={withCohort}
          withoutCohort={withoutCohort}
          blocked={blocked}
          coverage={coverage}
          onNav={onNav}
        />
        <PriorityQueue actions={queue} loading={busy} incomplete={hasError} onNav={onNav} />
      </div>

      <BranchPerformance
        state={branchRanking}
        branches={branches}
        averageScore={branchScore}
        attendance={attendance}
        onNav={onNav}
      />

      <OperatingDay
        role={role}
        approvals={approvals}
        tasks={tasks}
        meetings={meetings}
        invoices={invoices}
        unreadState={unreadSummary}
        onNav={onNav}
      />

      <div className="ld-balanced-grid ld-risk-grid">
        <RiskComposition
          state={risk}
          risks={risks}
          totalRisk={totalRisk}
          onNav={onNav}
        />
        <PrioritizedStudents state={risk} risks={risks} onNav={onNav} />
      </div>

      <div className="ld-balanced-grid ld-enrollment-grid">
        <EnrollmentCoverage
          state={studentStats}
          total={total}
          withCohort={withCohort}
          withoutCohort={withoutCohort}
          blocked={blocked}
          coverage={coverage}
          onNav={onNav}
        />
        <BranchLoad role={role} state={branchRanking} branches={branches} onNav={onNav} />
      </div>

      <Updates
        state={notifications}
        notices={notices}
        unread={unread}
        unreadScope={unreadScope}
        onNav={onNav}
      />

      <ManagementDirectory role={role} user={user} onNav={onNav} />
      <LeadershipFooter />
    </div>
  );
}

export function DashboardPage({ role, user, onNav }) {
  return API_CONFIG.useMock
    ? <TrustedDataPlaceholder role={role} user={user} />
    : <LeadershipDashboard role={role} user={user} onNav={onNav} />;
}
