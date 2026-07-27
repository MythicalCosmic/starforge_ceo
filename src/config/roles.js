import { Icons } from '../components/Icons.jsx';
import { API_CONFIG } from '../api/config.js';
import { managementMembership } from './resolveRole.js';

const nav = (id, icon, grpKey, label, extra = {}) => ({
  id,
  icon,
  grpKey,
  label,
  labelKey: `nav.${id}`,
  ...extra,
});

const dashboard = nav('dash', Icons.home, 'main', 'Overview');
const account = nav('backendAccount', Icons.user, 'system', 'My account');
const settings = nav('settings', Icons.settings, 'system', 'Workspace preferences');

const coreManagement = [
  nav('backendPeople', Icons.cohort, 'people', 'People and cohorts'),
  nav('backendAttendance', Icons.check, 'people', 'Attendance oversight'),
  nav('backendAcademics', Icons.doc, 'people', 'Academic records'),
  nav('backendAssignments', Icons.folder, 'people', 'Assignments'),
  nav('backendScheduling', Icons.cal, 'ops', 'Meetings and scheduling'),
  nav('backendApprovals', Icons.check, 'ops', 'Approvals and ledger', { accent: 'var(--sf-warn)' }),
  nav('backendOperations', Icons.settings, 'ops', 'Operations center'),
  nav('backendIntelligence', Icons.trend, 'org', 'Intelligence center'),
  nav('backendReports', Icons.doc, 'org', 'Reports'),
  nav('backendAudit', Icons.shield, 'org', 'Audit trail'),
  nav('backendEngagement', Icons.bell, 'comms', 'Engagement'),
  nav('backendMessaging', Icons.chat, 'comms', 'Messaging directory'),
  nav('backendAI', Icons.ai, 'comms', 'AI governance'),
  nav('backendContent', Icons.folder, 'ops', 'Content and printing'),
  nav('backendPlacement', Icons.flag, 'people', 'Placement'),
  nav('backendRecognition', Icons.brand, 'people', 'Recognition and conduct'),
];

const directorOnly = [
  nav('backendOrganization', Icons.globe, 'org', 'Organization directory'),
  nav('backendFinance', Icons.trend, 'finance', 'Finance control', { accent: 'var(--sf-success)' }),
  nav('backendAccess', Icons.shield, 'system', 'Access administration'),
];

const ROLE_CFG = {
  ceo: {
    role: 'ceo',
    labelKey: 'roles.ceoLabel',
    consoleKey: 'roles.ceoConsole',
    whoRoleKey: 'roles.ceoWhoRole',
    accent: 'var(--sf-primary)',
    nav: [
      dashboard,
      coreManagement[0],
      directorOnly[0],
      ...coreManagement.slice(1, 5),
      directorOnly[1],
      ...coreManagement.slice(5),
      directorOnly[2],
      account,
      settings,
    ],
  },
  manager: {
    role: 'manager',
    labelKey: 'roles.managerLabel',
    consoleKey: 'roles.managerConsole',
    whoRoleKey: 'roles.managerWhoRole',
    accent: 'var(--sf-primary)',
    // This is the conservative department-head navigation. The backend
    // remains authoritative and individual tabs fail closed with 403.
    nav: [dashboard, ...coreManagement, account, settings],
  },
};

function displayName(user) {
  const fullName = String(user?.full_name || '').trim();
  if (fullName) return fullName;
  const composed = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return composed || String(user?.username || 'Management account');
}

export function roleConfigForUser(role, user) {
  const base = ROLE_CFG[role];
  if (!base) return null;
  const membership = managementMembership(user, role);
  return {
    ...base,
    nav: API_CONFIG.useMock ? [dashboard, settings] : base.nav,
    who: displayName(user),
    whoRole: membership?.account_type_name || '',
    defaultBranch: role === 'ceo' ? 'all' : membership?.branch ?? null,
  };
}

export function groupNav(navItems) {
  const groups = [];
  navItems.forEach((item) => {
    let group = groups.find((candidate) => candidate.grpKey === item.grpKey);
    if (!group) {
      group = { grpKey: item.grpKey, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups;
}
