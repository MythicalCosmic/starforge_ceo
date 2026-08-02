import { resolveLegacySegments } from './routes.js';

export const loadManagementPages = () => import('../pages/backendPages.jsx');

const loadStudentsPage = () => import('../pages/StudentsWorkspace.jsx');
const loadTeachersPage = () => import('../pages/TeachersWorkspace.jsx');
const loadGroupsPage = () => import('../pages/GroupsWorkspace.jsx');
const loadExamsPage = () => import('../pages/ExamsWorkspace.jsx');
const loadFinancePage = () => import('../pages/FinanceWorkspace.jsx');

const moduleEntry = (load, exportName) => Object.freeze({ load, exportName });

export const ROUTE_MODULES = Object.freeze({
  overview: moduleEntry(
    () => import('../pages/ExecutiveDashboard.jsx'),
    'ExecutiveDashboardPage',
  ),
  settings: moduleEntry(() => import('../pages/Settings.jsx'), 'SettingsPage'),
  account: moduleEntry(() => import('../pages/AccountWorkspace.jsx'), 'AccountPage'),
  branches: moduleEntry(() => import('../pages/Branches.jsx'), 'BranchesPage'),
  students: moduleEntry(loadStudentsPage, 'StudentsPage'),
  teachers: moduleEntry(loadTeachersPage, 'TeachersPage'),
  groups: moduleEntry(loadGroupsPage, 'GroupsPage'),
  exams: moduleEntry(loadExamsPage, 'ExamsPage'),
  people: moduleEntry(loadManagementPages, 'PeoplePage'),
  attendance: moduleEntry(loadManagementPages, 'AttendancePage'),
  academics: moduleEntry(loadManagementPages, 'AcademicsPage'),
  assignments: moduleEntry(loadManagementPages, 'AssignmentsPage'),
  placement: moduleEntry(loadManagementPages, 'PlacementPage'),
  recognition: moduleEntry(loadManagementPages, 'RecognitionPage'),
  schedule: moduleEntry(loadManagementPages, 'SchedulePage'),
  organization: moduleEntry(loadManagementPages, 'OrganizationPage'),
  operations: moduleEntry(loadManagementPages, 'OperationsPage'),
  decisions: moduleEntry(loadManagementPages, 'DecisionsPage'),
  content: moduleEntry(loadManagementPages, 'ContentPage'),
  intelligence: moduleEntry(loadManagementPages, 'IntelligencePage'),
  reports: moduleEntry(loadManagementPages, 'ReportsPage'),
  audit: moduleEntry(loadManagementPages, 'AuditPage'),
  engagement: moduleEntry(loadManagementPages, 'EngagementPage'),
  messaging: moduleEntry(loadManagementPages, 'MessagingPage'),
  finance: moduleEntry(loadFinancePage, 'FinancePage'),
  'star-ai': moduleEntry(() => import('../pages/StarAIWorkspace.jsx'), 'StarAIPage'),
  'ai-governance': moduleEntry(loadManagementPages, 'AIGovernancePage'),
  access: moduleEntry(loadManagementPages, 'AccessPage'),
});

function routeSegments(target) {
  const path = String(target || '')
    .replace(/^#\/?/, '')
    .split('?', 1)[0];
  return resolveLegacySegments(path.split('/').filter(Boolean));
}

function branchDelegateModule(segments) {
  if (segments[0] !== 'branches' || !/^[1-9]\d*$/.test(segments[1] || '')) return null;

  const section = segments[2];
  const tail = segments.slice(3);
  if (section === 'students' && (tail[0] === 'directory' || /^[1-9]\d*$/.test(tail[0] || ''))) {
    return 'students';
  }
  if (section === 'teachers' && (tail[0] === 'directory' || /^[1-9]\d*$/.test(tail[0] || ''))) {
    return 'teachers';
  }
  if (section === 'groups' && /^[1-9]\d*$/.test(tail[0] || '')) return 'groups';
  if (
    section === 'exams'
    && tail[0] === 'exams'
    && /^[1-9]\d*$/.test(tail[1] || '')
  ) {
    return 'exams';
  }
  return null;
}

export function routeModuleIdsFor(target) {
  const segments = routeSegments(target);
  const routeId = segments[0];
  if (!ROUTE_MODULES[routeId]) return [];

  const delegateId = branchDelegateModule(segments);
  return delegateId ? [routeId, delegateId] : [routeId];
}

export function allowsRoutePrefetch(network = globalThis.navigator) {
  if (network?.onLine === false) return false;
  const connection = network?.connection;
  return !connection?.saveData && !/(^|-)2g$/.test(connection?.effectiveType || '');
}

export function createRoutePrefetcher({
  modules = ROUTE_MODULES,
  readNetwork = () => globalThis.navigator,
} = {}) {
  const warmed = new Map();

  return function prefetchRoute(target) {
    if (!allowsRoutePrefetch(readNetwork?.())) return Promise.resolve([]);

    const uniqueLoaders = new Set(
      routeModuleIdsFor(target)
        .map((routeId) => modules[routeId]?.load)
        .filter(Boolean),
    );
    const attempts = [...uniqueLoaders].map((load) => {
      if (warmed.has(load)) return warmed.get(load);
      const attempt = Promise.resolve().then(load);
      warmed.set(load, attempt);
      attempt.then(undefined, () => warmed.delete(load));
      return attempt;
    });

    // Intent prefetching is an optional optimization. A failed chunk request
    // must never become an unhandled rejection or prevent normal navigation
    // from retrying the lazy import.
    return Promise.allSettled(attempts);
  };
}

export const prefetchRoute = createRoutePrefetcher();
