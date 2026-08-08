const route = (target, preserveTail = true) => Object.freeze({ target, preserveTail });

// Former module URLs remain valid after adopting short, leadership-facing
// paths. A broad module keeps its tab and record tail so bookmarks continue to
// open the exact record that was requested.
export const LEGACY_ROUTES = Object.freeze({
  dash: route('overview', false),
  backendAccount: route('account'),
  backendPeople: route('people'),
  'backendPeople/students': route('students/directory'),
  'backendPeople/teachers': route('teachers/directory'),
  backendOrganization: route('organization'),
  backendScheduling: route('schedule'),
  backendMessaging: route('messaging'),
  backendAI: route('ai-governance'),
  backendAttendance: route('attendance'),
  backendAcademics: route('academics'),
  backendAssignments: route('assignments'),
  backendIntelligence: route('intelligence'),
  backendApprovals: route('decisions'),
  backendCRM: route('crm'),
  backendFinance: route('finance'),
  backendPayroll: route('payroll'),
  backendReports: route('reports'),
  backendAudit: route('audit'),
  backendOperations: route('operations'),
  backendEngagement: route('engagement'),
  backendContent: route('content'),
  backendPlacement: route('placement'),
  backendRecognition: route('recognition'),
  backendAccess: route('access'),

  // Compatibility with the short-lived consolidated workspaces. These links
  // resolve to the restored domain that owns the underlying information.
  learning: route('academics/exams', false),
  'learning/exams': route('academics/exams'),
  'learning/grades': route('academics/grades'),
  'learning/transcripts': route('academics/transcripts'),
  'learning/assignments': route('assignments/assignments'),
  'learning/submissions': route('assignments/submissions'),
  'learning/placement': route('placement/tests'),
  'learning/proposals': route('placement/proposals'),

  insights: route('intelligence/risk', false),
  'insights/student-risk': route('intelligence/risk'),
  'insights/branches': route('intelligence/branches'),
  'insights/families': route('intelligence/families'),
  'insights/reports': route('reports/library'),
  'insights/report-history': route('reports/runs'),
  'insights/report-schedule': route('reports/schedules'),

  communications: route('messaging/threads', false),
  'communications/conversations': route('messaging/threads'),
  'communications/contacts': route('messaging/contacts'),
  'communications/outreach': route('engagement/campaigns'),
  'communications/forms': route('engagement/forms'),
  'communications/notices': route('engagement/notifications'),

  governance: route('access/assignments', false),
  'governance/responsibilities': route('access/assignments'),
  'governance/exceptions': route('access/overrides'),
  'governance/role-boundaries': route('access/rolePermissions'),
  'governance/history': route('audit/events'),
  'governance/ai-budget': route('ai-governance/budget'),
  'governance/ai-usage': route('ai-governance/usage'),

  'organization/tasks': route('operations/tasks'),
  'organization/cover': route('operations/cover'),
  'organization/procurement': route('operations/procurement'),
  'schedule/upcoming': route('schedule/upcomingMeetings'),
});

export function resolveLegacySegments(segments) {
  const source = Array.isArray(segments) ? segments.filter(Boolean) : [];
  if (!source.length) return source;

  // A branch is one business object with one deep workspace. Keep the
  // organization directory as the discovery surface, but route its record
  // links into the dedicated branch environment instead of maintaining a
  // second, shallower profile for the same location.
  if (
    source[0] === 'organization' &&
    source[1] === 'branches' &&
    /^[1-9]\d*$/.test(String(source[2] || ''))
  ) {
    return ['branches', source[2], 'overview'];
  }

  const pair = source.slice(0, 2).join('/');
  const pairRoute = LEGACY_ROUTES[pair];
  if (pairRoute) {
    return [
      ...pairRoute.target.split('/'),
      ...(pairRoute.preserveTail ? source.slice(2) : []),
    ];
  }

  const baseRoute = LEGACY_ROUTES[source[0]];
  if (baseRoute) {
    return [
      ...baseRoute.target.split('/'),
      ...(baseRoute.preserveTail ? source.slice(1) : []),
    ];
  }

  return source;
}
