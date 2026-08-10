const MANAGED_STATUSES = new Set(['up', 'degraded', 'disabled', 'unavailable']);

// Mirrors core.availability.APP_MOUNTS in the backend. Keeping the mapping in
// one frontend module lets route gates and resource pages make the same
// decision without guessing from user-facing labels.
export const API_APP_MOUNTS = Object.freeze({
  auth: 'auth',
  users: 'users',
  org: 'org',
  students: 'students',
  parents: 'parents',
  teachers: 'teachers',
  cohorts: 'cohorts',
  schedule: 'schedule',
  attendance: 'attendance',
  academics: 'academics',
  assignments: 'assignments',
  content: 'content',
  printing: 'printing',
  finance: 'finance',
  payments: 'payments',
  notifications: 'notifications',
  ai: 'ai',
  audit: 'audit',
  reports: 'reports',
  approvals: 'approvals',
  rulebook: 'compliance',
  access: 'access',
  forms: 'forms',
  tasks: 'staff_tasks',
  messaging: 'messaging',
  intelligence: 'intelligence',
  achievements: 'achievements',
  rewards: 'rewards',
  cover: 'covers',
  loans: 'loans',
  procurement: 'procurement',
  campaigns: 'campaigns',
  sales: 'sales',
  meetings: 'meetings',
  placement: 'placement',
  cards: 'cards',
});

export function appForApiPath(path) {
  const match = String(path || '').match(/^\/api\/v1\/([^/?#]+)(?:\/|$)/);
  return match ? API_APP_MOUNTS[match[1]] || null : null;
}

export function normalizeAppStatuses(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  rows.forEach((row) => {
    const app = typeof row?.app === 'string' ? row.app.trim() : '';
    const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : '';
    if (!app || !MANAGED_STATUSES.has(status) || map.has(app)) return;
    map.set(app, {
      app,
      status,
      warnings: Array.isArray(row.warnings)
        ? row.warnings.filter((warning) => typeof warning === 'string' && warning.trim())
        : [],
    });
  });
  return map;
}

export function resolveAppAvailability(apps, statusMap, { known = false, checking = false } = {}) {
  const requested = [...new Set((Array.isArray(apps) ? apps : [apps])
    .filter((app) => typeof app === 'string' && app.trim())
    .map((app) => app.trim()))];
  if (!requested.length) return { known: false, checking: false, status: 'up', apps: [], warnings: [] };
  if (checking) return { known: false, checking: true, status: 'checking', apps: requested, warnings: [] };
  if (!known || !(statusMap instanceof Map)) {
    return { known: false, checking: false, status: 'unknown', apps: requested, warnings: [] };
  }

  const entries = requested.map((app) => statusMap.get(app)).filter(Boolean);
  // A backend may add a route before adding it to the availability registry.
  // Unknown apps stay request-driven instead of being falsely certified up.
  if (entries.length !== requested.length) {
    return { known: false, checking: false, status: 'unknown', apps: requested, warnings: [] };
  }

  const blocked = entries.filter((entry) => ['disabled', 'unavailable'].includes(entry.status));
  const warnings = [...new Set(entries.flatMap((entry) => entry.warnings))];
  if (blocked.length === entries.length) {
    const status = blocked.every((entry) => entry.status === 'disabled') ? 'disabled' : 'unavailable';
    return { known: true, checking: false, status, apps: requested, warnings };
  }
  if (blocked.length || entries.some((entry) => entry.status === 'degraded')) {
    return { known: true, checking: false, status: 'degraded', apps: requested, warnings };
  }
  return { known: true, checking: false, status: 'up', apps: requested, warnings: [] };
}

export function isServiceUnavailable(error) {
  return Number(error?.status) === 503 && error?.code === 'service_unavailable';
}
