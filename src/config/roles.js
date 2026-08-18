import { Icons } from '../components/Icons.jsx';
import { effectiveCapabilities, hasCapability } from '../lib/permissions.js';
import { managementMembership, managementMemberships } from './resolveRole.js';

const nav = (id, icon, grpKey, label, extra = {}) => ({
  id,
  path: id,
  icon,
  grpKey,
  label,
  labelKey: `nav.${id}`,
  ...extra,
});

const overview = nav('overview', Icons.home, 'main', 'Overview');
const tasks = nav('tasks', Icons.check, 'main', 'Tasks', {
  capabilities: ['tasks:read'],
  app: 'staff_tasks',
});
const branches = nav('branches', Icons.globe, 'main', 'Branches', {
  capabilities: ['org:read', 'intelligence:read'],
  app: 'org',
});
const students = nav('students', Icons.cohort, 'people', 'Students', {
  capabilities: ['students:read'],
  app: 'students',
});
const teachers = nav('teachers', Icons.user, 'people', 'Teachers', {
  capabilities: ['teachers:read'],
  app: 'teachers',
});
const staff = nav('staff', Icons.shield, 'people', 'Staff & HR', {
  capabilities: ['users:read'],
  app: ['org', 'users'],
});
const groups = nav('groups', Icons.cohort, 'people', 'Groups', {
  capabilities: ['cohorts:read'],
  app: 'cohorts',
});
const exams = nav('exams', Icons.doc, 'people', 'Exams', {
  capabilities: ['academics:read'],
  app: 'academics',
});
const people = nav('people', Icons.cohort, 'people', 'People & cohorts', {
  capabilities: ['students:read', 'cohorts:read', 'teachers:read', 'parents:read', 'users:read'],
  app: ['students', 'cohorts', 'teachers', 'parents', 'users'],
  primary: false,
});
const attendance = nav('attendance', Icons.check, 'people', 'Attendance', {
  capabilities: ['attendance:read'],
  app: 'attendance',
  primary: false,
  hidden: true,
});
const academics = nav('academics', Icons.doc, 'people', 'Academic records', {
  capabilities: ['academics:read'],
  app: 'academics',
  primary: false,
});
const assignments = nav('assignments', Icons.folder, 'people', 'Assignments', {
  capabilities: ['assignments:read'],
  app: 'assignments',
  primary: false,
  hidden: true,
});
const placement = nav('placement', Icons.flag, 'people', 'Placement', {
  capabilities: ['placement:read'],
  app: 'placement',
});
const crm = nav('crm', Icons.flag, 'people', 'Admissions CRM', {
  capabilities: ['crm:read'],
});
const recognition = nav('recognition', Icons.brand, 'people', 'Recognition & conduct', {
  capabilities: ['achievements:read', 'rewards:read', 'card:read', 'compliance:read', 'penalty:read'],
  app: ['achievements', 'rewards', 'cards', 'compliance'],
});
const schedule = nav('schedule', Icons.cal, 'operations', 'Schedule', {
  capabilities: ['schedule:read', 'meeting:write'],
  app: ['schedule', 'meetings'],
});
const organization = nav('organization', Icons.globe, 'operations', 'Organization', {
  capabilities: ['org:read', 'users:read'],
  app: ['org', 'users'],
});
const departments = nav('departments', Icons.globe, 'operations', 'Departments', {
  capabilities: ['org:read'],
  app: 'org',
});
const operations = nav('operations', Icons.settings, 'operations', 'Operations', {
  capabilities: ['cover:read', 'procurement:read', 'loan:read'],
  app: ['covers', 'procurement', 'loans'],
});
const decisions = nav('decisions', Icons.check, 'operations', 'Decisions', {
  accent: 'var(--sf-warn)',
  capabilities: ['approvals:read', 'ledger:read'],
  app: 'approvals',
});
const content = nav('content', Icons.folder, 'operations', 'Content & print', {
  capabilities: ['content:read', 'printing:read'],
  app: ['content', 'printing'],
});
const intelligence = nav('intelligence', Icons.trend, 'insights', 'Leadership intelligence', {
  capabilities: ['intelligence:read'],
  app: 'intelligence',
});
const reports = nav('reports', Icons.doc, 'insights', 'Reports', {
  capabilities: ['reports:read'],
  app: 'reports',
});
const audit = nav('audit', Icons.shield, 'insights', 'Activity history', {
  capabilities: ['audit:read'],
  app: 'audit',
});
const engagement = nav('engagement', Icons.bell, 'comms', 'Community engagement', {
  capabilities: ['campaign:read', 'forms:read', 'notifications:read', 'notifications:write'],
  app: ['campaigns', 'forms', 'notifications'],
});
const messaging = nav('messaging', Icons.chat, 'comms', 'Messages & contacts', {
  capabilities: ['messaging:read'],
  app: 'messaging',
});
const forms = nav('forms', Icons.flag, 'comms', 'Forms & surveys', {
  capabilities: ['forms:read'],
  app: 'forms',
});
const finance = nav('finance', Icons.trend, 'finance', 'Finance', {
  accent: 'var(--sf-success)',
  capabilities: ['finance:read', 'payments:read', 'sale:read'],
  app: ['finance', 'payments', 'sales'],
});
const payroll = nav('payroll', Icons.doc, 'finance', 'Payroll', {
  accent: 'var(--sf-success)',
  capabilities: ['compensation:read'],
});
const starAI = nav('star-ai', Icons.ai, 'main', 'StarAI', {
  capabilities: ['ai:read'],
  app: ['ai', 'intelligence'],
});
const access = nav('access', Icons.shield, 'governance', 'Access & roles', {
  capabilities: ['access:read'],
  app: 'access',
});
const capabilityCenter = nav('capabilities', Icons.settings, 'governance', 'Management actions');
const account = nav('account', Icons.user, 'system', 'My account', { hidden: true });
const settings = nav('settings', Icons.settings, 'system', 'Workspace preferences', {
  hidden: true,
});

const coreManagement = [
  overview,
  tasks,
  branches,
  students,
  teachers,
  staff,
  groups,
  exams,
  people,
  attendance,
  academics,
  assignments,
  placement,
  crm,
  recognition,
  departments,
  schedule,
  operations,
  decisions,
  content,
  intelligence,
  reports,
  audit,
  engagement,
  messaging,
  forms,
  payroll,
  starAI,
  capabilityCenter,
];

const directorManagement = [
  overview,
  tasks,
  branches,
  students,
  teachers,
  staff,
  groups,
  exams,
  people,
  attendance,
  academics,
  assignments,
  placement,
  crm,
  recognition,
  organization,
  departments,
  schedule,
  operations,
  decisions,
  content,
  intelligence,
  reports,
  audit,
  engagement,
  messaging,
  forms,
  finance,
  payroll,
  starAI,
  access,
  capabilityCenter,
];

const ROLE_CFG = {
  ceo: {
    role: 'ceo',
    labelKey: 'roles.ceoLabel',
    consoleKey: 'roles.ceoConsole',
    whoRoleKey: 'roles.ceoWhoRole',
    accent: 'var(--sf-primary)',
    destinations: [...directorManagement, account, settings],
  },
  manager: {
    role: 'manager',
    labelKey: 'roles.managerLabel',
    consoleKey: 'roles.managerConsole',
    whoRoleKey: 'roles.managerWhoRole',
    accent: 'var(--sf-primary)',
    // This is the conservative department-head navigation. The service remains
    // authoritative and individual views fail closed when a grant is absent.
    destinations: [...coreManagement, account, settings],
  },
};

function displayName(user) {
  const fullName = String(user?.full_name || '').trim();
  if (fullName) return fullName;
  const composed = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return composed || String(user?.username || 'Management account');
}

function capabilityAwareNav(items, user) {
  const capabilities = effectiveCapabilities(user);
  if (!capabilities) return items;
  const capabilitySet = new Set(capabilities);
  return items.filter((item) =>
    !item.capabilities?.length || item.capabilities.some((permission) =>
      hasCapability(capabilitySet, permission)));
}

export function managementScopeSummary(role, user) {
  if (role === 'ceo') return { id: 'all', name: '', count: 0 };
  const memberships = managementMemberships(user, 'manager');
  const membership = memberships[0];
  const declaredScopes = Array.isArray(user?.scopes) ? user.scopes : [];
  const scopeCount = declaredScopes.length || memberships.length;
  const singleScope = declaredScopes.length === 1 ? declaredScopes[0] : null;
  const singleBranch = singleScope?.branch;
  const singleDepartment = singleScope?.department;
  const singleScopeName = [
    singleBranch?.name || membership?.branch_name,
    singleDepartment?.name || membership?.department_name,
  ].filter(Boolean).join(' · ');
  return {
    id: scopeCount > 1
      ? 'assigned-scopes'
      : singleBranch?.id ?? membership?.branch ?? 'membership',
    name: scopeCount > 1
      ? `${scopeCount.toLocaleString()} assigned leadership scopes`
      : singleScopeName || 'Assigned leadership scope',
    count: scopeCount,
  };
}

export function roleConfigForUser(role, user) {
  const base = ROLE_CFG[role];
  if (!base) return null;
  const membership = managementMembership(user, role);
  const scope = managementScopeSummary(role, user);
  const destinations = capabilityAwareNav(base.destinations, user);
  const primaryNav = destinations.filter((item) => item.primary !== false);
  const directoryNav = destinations.filter((item) => !item.hidden);
  return {
    ...base,
    // Routing is authorized from the complete destination registry. Visible
    // navigation is intentionally independent so moving Attendance or
    // Assignments into Groups never makes their routes disappear.
    destinations,
    primaryNav,
    directoryNav,
    nav: primaryNav,
    who: displayName(user),
    whoRole: membership?.account_type_name || '',
    defaultBranch: scope.id,
    defaultBranchName: scope.name,
  };
}

export function groupNav(navItems) {
  const groups = [];
  navItems.filter((item) => !item.hidden).forEach((item) => {
    let group = groups.find((candidate) => candidate.grpKey === item.grpKey);
    if (!group) {
      group = { grpKey: item.grpKey, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups;
}
