import { BACKEND_CATALOG } from '../api/catalog.js';
import { effectiveCapabilities, hasCapability } from '../lib/permissions.js';
import { BackendModule } from './BackendModule.jsx';

const view = (source, id = source.id, label = source.label) =>
  Object.freeze({ ...source, id, label });

// A few catalog views inherit prose-level module descriptions rather than a
// machine-readable grant. Give every shared directory an explicit boundary so
// a partial capability response cannot accidentally make it visible.
const EXPLICIT_PERMISSIONS = Object.freeze({
  'backendPeople.students': 'students:read',
  'backendPeople.cohorts': 'cohorts:read',
  'backendPeople.teachers': 'teachers:read',
  'backendScheduling.meetings': 'schedule:read meeting:write',
  'backendScheduling.upcomingMeetings': 'schedule:read meeting:write',
  'backendEngagement.notifications': 'notifications:read',
});

const find = (moduleId, tabId) => {
  const source = BACKEND_CATALOG[moduleId];
  const tab = source.tabs.find((item) => item.id === tabId);
  if (!tab) throw new Error(`Missing management view: ${moduleId}.${tabId}`);
  return {
    ...tab,
    permission:
      EXPLICIT_PERMISSIONS[`${moduleId}.${tabId}`] ||
      tab.permission ||
      source.permission,
  };
};

const executiveModule = ({ title, eyebrow, description, tabs }) =>
  Object.freeze({
    title,
    eyebrow,
    description,
    tabs: Object.freeze(tabs),
  });

const catalogModule = (moduleId, presentation) => {
  const source = BACKEND_CATALOG[moduleId];
  return executiveModule({
    title: presentation.title || source.title,
    eyebrow: presentation.eyebrow || source.eyebrow,
    description: presentation.description || source.description,
    tabs: source.tabs.map((tab) => view(
      find(moduleId, tab.id),
      tab.id,
      presentation.tabLabels?.[tab.id] || tab.label,
    )),
  });
};

// The complete business catalog remains route-backed. Students and teachers
// also receive dedicated, more focused entry points because those records are
// used most often by leadership.
const MODULES = Object.freeze({
  account: catalogModule('backendAccount', {}),

  students: executiveModule({
    title: 'Students',
    eyebrow: 'Enrollment and family care',
    description: 'Find a student quickly, understand their current placement, and review the family context that supports them.',
    tabs: [
      view(find('backendPeople', 'students'), 'directory', 'Student directory'),
      view(find('backendPeople', 'birthdays'), 'birthdays', 'Upcoming birthdays'),
      view(find('backendPeople', 'studentStats'), 'snapshot', 'Enrollment snapshot'),
      view(find('backendPeople', 'studentComparison'), 'trend', 'Enrollment trend'),
      view(find('backendPeople', 'cohorts'), 'cohorts', 'Cohorts'),
      view(find('backendPeople', 'parents'), 'families', 'Families'),
      view(find('backendPeople', 'guardians'), 'guardians', 'Guardians'),
      view(find('backendPeople', 'pickups'), 'pickups', 'Pickup permissions'),
    ],
  }),

  managerStudents: executiveModule({
    title: 'Students',
    eyebrow: 'Enrollment and placement',
    description: 'Find a student quickly and review enrollment within your assigned leadership scope.',
    tabs: [
      view(find('backendPeople', 'students'), 'directory', 'Student directory'),
      view(find('backendPeople', 'birthdays'), 'birthdays', 'Upcoming birthdays'),
      view(find('backendPeople', 'studentStats'), 'snapshot', 'Enrollment snapshot'),
      view(find('backendPeople', 'studentComparison'), 'trend', 'Enrollment trend'),
      view(find('backendPeople', 'cohorts'), 'cohorts', 'Cohorts'),
    ],
  }),

  teachers: executiveModule({
    title: 'Teachers',
    eyebrow: 'Faculty directory and delivery',
    description: 'Review faculty responsibilities, availability, and recent teaching activity without turning operational signals into employee ratings.',
    tabs: [
      view(find('backendPeople', 'teachers'), 'directory', 'Teacher directory'),
      view(find('backendIntelligence', 'teachers'), 'activity', 'Teaching activity'),
    ],
  }),

  managerTeachers: executiveModule({
    title: 'Teachers',
    eyebrow: 'Faculty directory and delivery',
    description: 'Review faculty responsibilities, availability, and recent teaching activity within your assigned leadership scope.',
    tabs: [
      view(find('backendPeople', 'teachers'), 'directory', 'Teacher directory'),
      view(find('backendIntelligence', 'teachers'), 'activity', 'Teaching activity'),
    ],
  }),

  people: catalogModule('backendPeople', {
    title: 'People & cohorts',
    eyebrow: 'Community directory',
    description: 'Review students, teachers, families, cohorts, and the supporting directories available to your role.',
    tabLabels: {
      users: 'Team account directory',
      studentStats: 'Student snapshot',
      studentComparison: 'Enrollment trend',
      enrollmentReasons: 'Enrollment reasons',
      teacherTypes: 'Teacher types',
    },
  }),
  attendance: catalogModule('backendAttendance', {
    title: 'Attendance',
    eyebrow: 'Daily learning continuity',
    description: 'Review attendance records and follow up on patterns that need leadership attention.',
  }),
  academics: catalogModule('backendAcademics', {
    title: 'Academic records',
    eyebrow: 'Learning outcomes',
    description: 'Review assessments, grades, transcripts, subjects, and the definitions that support consistent academic records.',
  }),
  assignments: catalogModule('backendAssignments', {
    title: 'Assignments',
    eyebrow: 'Teaching workflow',
    description: 'Monitor assignments, deadlines, submissions, and grading progress across the organization.',
  }),
  placement: catalogModule('backendPlacement', {
    title: 'Placement',
    eyebrow: 'Admissions assessment',
    description: 'Review placement tests, attempts, scoring, and proposed cohort decisions.',
  }),
  crm: catalogModule('backendCRM', {
    title: 'Admissions CRM',
    eyebrow: 'Pipeline and follow-through',
    description: 'Review leads, ownership, follow-ups, acquisition context, and duplicate candidates within the exact CRM scope returned by the service.',
    tabLabels: {
      followUps: 'Follow-up register',
      campaigns: 'Acquisition campaigns',
      duplicates: 'Duplicate candidates',
    },
  }),
  recognition: catalogModule('backendRecognition', {
    title: 'Recognition & conduct',
    eyebrow: 'Culture and safeguards',
    description: 'Review achievements, rewards, cards, conduct rules, and penalties in one accountable record.',
  }),
  schedule: catalogModule('backendScheduling', {
    title: 'Schedule',
    eyebrow: 'Time and coordination',
    description: 'Review meetings, lessons, academic periods, time slots, and the rules that shape delivery.',
  }),
  organization: catalogModule('backendOrganization', {
    title: 'Organization',
    eyebrow: 'Structure and locations',
    description: 'Review branches, departments, spaces, team accounts, transfers, and organization-wide settings.',
    tabLabels: {
      staff: 'Team accounts',
      settings: 'Center settings',
      systemApps: 'Workspace availability',
    },
  }),
  operations: catalogModule('backendOperations', {
    title: 'Operations',
    eyebrow: 'Cross-team delivery',
    description: 'Review priority work, lesson cover, procurement, staff loans, and shared operating responsibilities.',
    tabLabels: {
      loans: 'Staff loans',
      roleGrades: 'Responsibility levels',
      coverPool: 'Open cover pool',
    },
  }),
  decisions: catalogModule('backendApprovals', {
    title: 'Decisions',
    eyebrow: 'Accountable follow-through',
    description: 'Review requests that need a decision and the permanent record of decisions already made.',
  }),
  managerDecisions: executiveModule({
    title: 'Decisions',
    eyebrow: 'Accountable follow-through',
    description: 'Review requests that need attention within your assigned responsibilities.',
    tabs: [view(find('backendApprovals', 'requests'), 'requests', 'Approval queue')],
  }),
  content: catalogModule('backendContent', {
    title: 'Content & print',
    eyebrow: 'Knowledge operations',
    description: 'Review learning libraries, courses, files, published materials, and the print work that supports classrooms.',
    tabLabels: {
      modules: 'Course sections',
      lessons: 'Lesson content',
      'print-jobs': 'Print work',
      agents: 'Print connections',
    },
  }),
  intelligence: catalogModule('backendIntelligence', {
    title: 'Leadership intelligence',
    eyebrow: 'Transparent signals',
    description: 'Review explainable student, branch, family, and teaching signals together with their methodology.',
  }),
  reports: catalogModule('backendReports', {
    title: 'Reports',
    eyebrow: 'Decision support',
    description: 'Browse available reports and review completed or scheduled reporting work.',
  }),
  audit: catalogModule('backendAudit', {
    title: 'Activity history',
    eyebrow: 'Governance',
    description: 'Trace important actions and changes across the organization in a clear chronological record.',
  }),
  engagement: catalogModule('backendEngagement', {
    title: 'Community engagement',
    eyebrow: 'Outreach and updates',
    description: 'Review campaigns, forms, notices, preferences, and reusable communication templates.',
    tabLabels: {
      doNotContact: 'Contact restrictions',
      notificationTemplates: 'Notice templates',
      notificationPreferences: 'My notice preferences',
      unreadCount: 'Unread overview',
    },
  }),
  messaging: catalogModule('backendMessaging', {
    title: 'Messages & contacts',
    eyebrow: 'Direct communication',
    description: 'Review conversation threads and the contacts available within your leadership scope.',
  }),
  finance: catalogModule('backendFinance', {
    title: 'Finance',
    eyebrow: 'Financial stewardship',
    description: 'Review billing, income, expenses, refunds, cashier activity, payment methods, and daily reconciliation.',
    tabLabels: {
      shifts: 'Cashier shifts',
      paymentMethods: 'Payment methods',
      payments: 'Partner payments',
      providerConfigs: 'Payment partners',
      reconciliation: 'Daily reconciliation',
      sales: 'Sales records',
    },
  }),
  payroll: catalogModule('backendPayroll', {
    title: 'Payroll',
    eyebrow: 'Compensation oversight',
    description: 'Review immutable payroll evidence and adjustments only when the current session has the dedicated compensation grant.',
    tabLabels: {
      periods: 'Payroll periods',
      adjustments: 'Compensation adjustments',
    },
  }),
  'ai-governance': catalogModule('backendAI', {
    title: 'Responsible AI',
    eyebrow: 'Use and oversight',
    description: 'Review assistant requests, approved budgets, and adoption across each business area.',
    tabLabels: {
      requests: 'Assistant requests',
      usage: 'Usage overview',
    },
  }),
  access: catalogModule('backendAccess', {
    title: 'Access & roles',
    eyebrow: 'Responsible access',
    description: 'Review account types, responsibility assignments, exceptional access, and effective role boundaries.',
    tabLabels: {
      assignments: 'Responsibilities',
      overrides: 'Access exceptions',
      rolePermissions: 'Role boundaries',
      permissionCatalogue: 'Capability directory',
    },
  }),
});

function hasEffectivePermission(user, permission) {
  return hasCapability(effectiveCapabilities(user) || [], permission);
}

function withoutTeacherCompensation(module) {
  return {
    ...module,
    tabs: module.tabs.map((tab) => ['directory', 'teachers'].includes(tab.id)
      ? {
          ...tab,
          detail: (tab.detail || []).filter((field) => !['salary_type', 'rate'].includes(field.key)),
          related: (tab.related || []).filter((relation) => relation.id !== 'payoutPolicy'),
        }
      : tab),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function managementModuleFor(moduleId, role, user) {
  const scopedModuleId = role === 'manager' && ['students', 'teachers', 'decisions'].includes(moduleId)
    ? `manager${moduleId[0].toUpperCase()}${moduleId.slice(1)}`
    : moduleId;
  const roleModule = MODULES[scopedModuleId];
  const containsTeacherDirectory = ['teachers', 'people'].includes(moduleId);
  // Compensation is its own server-enforced capability.  Do not infer access
  // from a leadership label or from customer-finance authority: both would
  // either hide an authorized compensation operator or disclose staff pay to
  // the wrong account.
  const mayViewCompensation = hasEffectivePermission(user, 'compensation:read');
  return containsTeacherDirectory && !mayViewCompensation
    ? withoutTeacherCompensation(roleModule)
    : roleModule;
}

function ModulePage({ moduleId, role, route, onNav, user }) {
  const presentationModule = managementModuleFor(moduleId, role, user);

  return (
    <BackendModule
      module={presentationModule}
      basePath={moduleId}
      route={route}
      onNavigate={onNav}
      capabilities={effectiveCapabilities(user)}
    />
  );
}

export function AccountPage(props) {
  return <ModulePage {...props} moduleId="account" />;
}

export function StudentsPage(props) {
  return <ModulePage {...props} moduleId="students" />;
}

export function TeachersPage(props) {
  return <ModulePage {...props} moduleId="teachers" />;
}

export function PeoplePage(props) {
  return <ModulePage {...props} moduleId="people" />;
}

export function AttendancePage(props) {
  return <ModulePage {...props} moduleId="attendance" />;
}

export function AcademicsPage(props) {
  return <ModulePage {...props} moduleId="academics" />;
}

export function AssignmentsPage(props) {
  return <ModulePage {...props} moduleId="assignments" />;
}

export function PlacementPage(props) {
  return <ModulePage {...props} moduleId="placement" />;
}

export function CRMPage(props) {
  return <ModulePage {...props} moduleId="crm" />;
}

export function RecognitionPage(props) {
  return <ModulePage {...props} moduleId="recognition" />;
}

export function SchedulePage(props) {
  return <ModulePage {...props} moduleId="schedule" />;
}

export function OrganizationPage(props) {
  return <ModulePage {...props} moduleId="organization" />;
}

export function OperationsPage(props) {
  return <ModulePage {...props} moduleId="operations" />;
}

export function DecisionsPage(props) {
  return <ModulePage {...props} moduleId="decisions" />;
}

export function ContentPage(props) {
  return <ModulePage {...props} moduleId="content" />;
}

export function IntelligencePage(props) {
  return <ModulePage {...props} moduleId="intelligence" />;
}

export function ReportsPage(props) {
  return <ModulePage {...props} moduleId="reports" />;
}

export function AuditPage(props) {
  return <ModulePage {...props} moduleId="audit" />;
}

export function EngagementPage(props) {
  return <ModulePage {...props} moduleId="engagement" />;
}

export function MessagingPage(props) {
  return <ModulePage {...props} moduleId="messaging" />;
}

export function FinancePage(props) {
  return <ModulePage {...props} moduleId="finance" />;
}

export function PayrollPage(props) {
  return <ModulePage {...props} moduleId="payroll" />;
}

export function AIGovernancePage(props) {
  return <ModulePage {...props} moduleId="ai-governance" />;
}

export function AccessPage(props) {
  return <ModulePage {...props} moduleId="access" />;
}
