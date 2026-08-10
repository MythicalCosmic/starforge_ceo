import { Icons } from '../components/Icons.jsx';
import { hasCapability } from '../lib/permissions.js';

export const BRANCH_WORKSPACE_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Branch overview', group: 'Branch', icon: Icons.home, app: 'org' },
  { id: 'students', label: 'Students', group: 'People & learning', icon: Icons.cohort, destination: 'students', capabilities: ['students:read'], app: 'students' },
  { id: 'teachers', label: 'Teachers', group: 'People & learning', icon: Icons.user, destination: 'teachers', capabilities: ['teachers:read'], app: 'teachers' },
  { id: 'groups', label: 'Groups', group: 'People & learning', icon: Icons.cohort, destination: 'groups', capabilities: ['cohorts:read'], app: 'cohorts' },
  { id: 'exams', label: 'Exams', group: 'People & learning', icon: Icons.doc, destination: 'exams', capabilities: ['academics:read'], app: 'academics' },
  { id: 'finance', label: 'Finance', group: 'Business', icon: Icons.trend, destination: 'finance', capabilities: ['finance:read'], app: 'finance' },
  { id: 'meetings', label: 'Meetings', group: 'Operations', icon: Icons.cal, destination: 'schedule', capabilities: ['schedule:read', 'meeting:write'], app: 'meetings' },
  { id: 'content', label: 'Learning library', group: 'Operations', icon: Icons.folder, destination: 'content', capabilities: ['content:read'], app: 'content' },
  { id: 'printers', label: 'Print room', group: 'Operations', icon: Icons.doc, destination: 'content', capabilities: ['printing:read'], app: 'printing' },
  { id: 'activity', label: 'Activity history', group: 'Assurance', icon: Icons.shield, destination: 'audit', capabilities: ['audit:read'], app: 'audit', safetyHold: true },
]);

export function branchWorkspaceRoute(route) {
  const path = String(route || '').split('?', 1)[0];
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'branches' || !/^[1-9]\d*$/.test(segments[1] || '')) return null;
  return {
    branchId: segments[1],
    section: segments[2] || 'overview',
    tail: segments.slice(3),
  };
}

export function availableBranchSections(cfg, capabilities = null) {
  const allowed = new Set((cfg?.destinations || cfg?.nav || []).map((item) => item.id));
  return BRANCH_WORKSPACE_SECTIONS.filter((item) => {
    if (item.destination && !allowed.has(item.destination)) return false;
    if (capabilities == null || !item.capabilities?.length) return true;
    return item.capabilities.some((permission) => hasCapability(capabilities, permission));
  });
}
