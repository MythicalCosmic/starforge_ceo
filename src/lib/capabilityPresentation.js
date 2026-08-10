const AREA_DEFINITIONS = Object.freeze([
  { id: 'organization', label: 'Organization & access', description: 'Structure, user accounts, and access settings.' },
  { id: 'people', label: 'People & enrollment', description: 'Students, families, teachers, groups, and admissions.' },
  { id: 'learning', label: 'Teaching & learning', description: 'Lessons, assessments, attendance, and learning content.' },
  { id: 'finance', label: 'Finance & accounting', description: 'Financial records, payments, ledgers, cards, and wallets.' },
  { id: 'purchasing', label: 'Approvals & purchasing', description: 'Approval requests, payouts, and purchasing workflows.' },
  { id: 'sales', label: 'Sales & refunds', description: 'Sales records and controlled refund actions.' },
  { id: 'workforce', label: 'Payroll & staff support', description: 'Compensation, staff loans, rewards, and cover.' },
  { id: 'operations', label: 'Tasks & operations', description: 'Assigned work and operational requests.' },
  { id: 'communications', label: 'Communication', description: 'Messages, notifications, campaigns, forms, and meetings.' },
  { id: 'assurance', label: 'Reporting & assurance', description: 'Reports, risk insights, compliance, and audit history.' },
  { id: 'other', label: 'Additional access', description: 'Other actions supported by the service.' },
]);

const AREA_BY_ID = new Map(AREA_DEFINITIONS.map((area, index) => [area.id, { ...area, order: index }]));

const RESOURCE_DEFINITIONS = Object.freeze({
  access: { target: 'account types and access rules', area: 'organization' },
  academics: { target: 'academic records', area: 'learning' },
  achievements: { target: 'student achievements', area: 'learning' },
  ai: { target: 'Star AI tools and settings', area: 'assurance' },
  approvals: { target: 'approval requests', area: 'purchasing' },
  assignments: { target: 'assignments', area: 'learning' },
  attendance: { target: 'attendance records', area: 'learning' },
  audit: { target: 'audit history', area: 'assurance' },
  campaign: { target: 'communication campaigns', area: 'communications' },
  card: { target: 'student cards', area: 'finance' },
  cohorts: { target: 'groups', area: 'people' },
  compensation: { target: 'payroll and compensation', area: 'workforce' },
  compliance: { target: 'compliance rules', area: 'assurance' },
  content: { target: 'learning content', area: 'learning' },
  cover: { target: 'teacher cover requests', area: 'workforce' },
  crm: { target: 'admissions and customer records', area: 'people' },
  finance: { target: 'financial records', area: 'finance' },
  forms: { target: 'forms and surveys', area: 'communications' },
  intelligence: { target: 'risk insights', area: 'assurance' },
  ledger: { target: 'ledger entries', area: 'finance' },
  loan: { target: 'staff loans', area: 'workforce' },
  meeting: { target: 'staff meetings', area: 'communications' },
  messaging: { target: 'messages', area: 'communications' },
  notifications: { target: 'notifications', area: 'communications' },
  org: { target: 'branches, departments, rooms, and organization details', area: 'organization' },
  organization_settings: { target: 'organization settings', area: 'organization' },
  parents: { target: 'parent records', area: 'people' },
  payments: { target: 'payments', area: 'finance' },
  penalty: { target: 'penalties and demerits', area: 'workforce' },
  placement: { target: 'placement tests', area: 'learning' },
  printing: { target: 'print requests', area: 'operations' },
  procurement: { target: 'purchase requests', area: 'purchasing' },
  reports: { target: 'reports', area: 'assurance' },
  rewards: { target: 'staff rewards', area: 'workforce' },
  safeguarding: { target: 'safeguarding records', area: 'assurance' },
  sale: { target: 'sales', area: 'sales' },
  schedule: { target: 'schedules', area: 'learning' },
  students: { target: 'student records', area: 'people' },
  system: { target: 'system administration tools', area: 'organization' },
  tasks: { target: 'tasks', area: 'operations' },
  teachers: { target: 'teacher records', area: 'people' },
  users: { target: 'user accounts', area: 'organization' },
  wallet: { target: 'student wallets', area: 'finance' },
});

const EXACT_CAPABILITY_COPY = Object.freeze({
  '*:*': {
    area: 'organization',
    title: 'Full organization access',
    description: 'Can use every feature available to the organization owner.',
  },
  'access:*': {
    title: 'Manage all access settings',
    description: 'Can view and change account types, responsibilities, and access rules.',
  },
  'access:read': {
    title: 'View account types and access',
    description: 'Can review responsibilities, assignments, and their allowed actions.',
  },
  'access:write': {
    title: 'Manage responsibilities and access',
    description: 'Can assign or revoke responsibilities and update account types.',
  },
  'academics:catalogue': {
    title: 'Manage academic catalogues',
    description: 'Can maintain subjects, terms, assessment types, and related setup.',
  },
  'ai:manage': {
    title: 'Manage AI budgets and settings',
    description: 'Can change organization-level AI controls and spending limits.',
  },
  'approvals:approve': {
    title: 'Approve requests',
    description: 'Can give the management approval required by a request.',
  },
  'approvals:disburse': {
    title: 'Release approved payouts',
    description: 'Can complete a payout after the required approvals are in place.',
  },
  'assignments:submit': {
    title: 'Submit assignment work',
    description: 'Can submit work for an assigned learning activity.',
  },
  'campaign:send': {
    title: 'Send communication campaigns',
    description: 'Can release a prepared campaign to its approved recipients.',
  },
  'card:scan': {
    title: 'Scan student cards',
    description: 'Can use card scans in supported attendance or service workflows.',
  },
  'compensation:approve': {
    title: 'Approve payroll',
    description: 'Can approve a prepared compensation run before payment.',
  },
  'compensation:disburse': {
    title: 'Release payroll payments',
    description: 'Can complete payment for an approved compensation run.',
  },
  'compensation:run': {
    title: 'Prepare payroll runs',
    description: 'Can calculate and prepare a compensation period for review.',
  },
  'content:approve': {
    title: 'Approve learning content',
    description: 'Can provide the management approval required before publication.',
  },
  'content:publish': {
    title: 'Publish learning content',
    description: 'Can make approved learning content available to its audience.',
  },
  'cover:approve': {
    title: 'Approve teacher cover',
    description: 'Can approve or reject a proposed absence-cover arrangement.',
  },
  'finance:read_own': {
    title: 'View own financial records',
    description: 'Can review only financial records connected to their own account.',
  },
  'loan:collect': {
    title: 'Record loan repayments',
    description: 'Can collect and record a repayment against a staff loan.',
  },
  'meeting:write': {
    title: 'Schedule and manage staff meetings',
    description: 'Can create meetings and update their arrangements.',
  },
  'penalty:staff': {
    title: 'Manage staff penalties',
    description: 'Can apply supported disciplinary actions to staff records.',
  },
  'penalty:waive': {
    title: 'Waive penalties',
    description: 'Can remove a penalty through the controlled waiver workflow.',
  },
  'placement:approve': {
    title: 'Approve placement tests',
    description: 'Can approve a prepared placement test before it is used.',
  },
  'sale:refund': {
    title: 'Issue sale refunds',
    description: 'Can reverse an eligible sale through the refund workflow.',
  },
  'students:read_own_children': {
    title: 'View linked student records',
    description: 'Can review only students connected to their family account.',
  },
  'tasks:assign_any': {
    title: 'Assign tasks across staff levels',
    description: 'Can assign work without the normal responsibility-level restriction.',
  },
  'tasks:transition_any': {
    title: 'Update another assignee’s task status',
    description: 'Can move a task assigned to someone else through its workflow.',
  },
  'wallet:write': {
    title: 'Manage student wallet balances',
    description: 'Can record supported loads, charges, and wallet adjustments.',
  },
});

function words(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return words(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackResource(resource) {
  const label = words(resource).toLowerCase();
  if (!label) return 'supported records';
  return label.endsWith('s') ? label : `${label} records`;
}

function genericCapabilityCopy(verb, target) {
  if (verb === '*') {
    return {
      title: `Manage all ${target}`,
      description: `Can use every supported action for ${target}.`,
    };
  }
  if (verb === 'read') {
    return {
      title: `View ${target}`,
      description: `Can open and review ${target}.`,
    };
  }
  if (verb === 'write') {
    return {
      title: `Manage ${target}`,
      description: `Can create and update ${target}.`,
    };
  }
  if (verb === 'approve') {
    return {
      title: `Approve ${target}`,
      description: `Can approve eligible ${target} through the controlled workflow.`,
    };
  }
  return {
    title: `${titleCase(verb || 'Use')} ${target}`,
    description: `Can perform this supported action for ${target}.`,
  };
}

export function normalizeCapabilityCodes(capabilities) {
  if (!Array.isArray(capabilities)) return [];
  return [...new Set(capabilities
    .map((capability) => String(capability || '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function presentCapability(code) {
  const normalized = String(code || '').trim();
  const separator = normalized.indexOf(':');
  const resource = separator > 0 ? normalized.slice(0, separator) : '';
  const verb = separator > 0 ? normalized.slice(separator + 1) : '';
  const resourceDefinition = RESOURCE_DEFINITIONS[resource];
  const target = resourceDefinition?.target || fallbackResource(resource || normalized);
  const exact = EXACT_CAPABILITY_COPY[normalized];
  const copy = exact || genericCapabilityCopy(verb, target);
  const area = AREA_BY_ID.get(exact?.area || resourceDefinition?.area || 'other') || AREA_BY_ID.get('other');

  return {
    code: normalized,
    title: copy.title,
    description: copy.description,
    areaId: area.id,
    areaLabel: area.label,
    areaDescription: area.description,
    areaOrder: area.order,
  };
}

export function groupCapabilities(capabilities) {
  const groups = new Map();
  normalizeCapabilityCodes(capabilities).forEach((code) => {
    const item = presentCapability(code);
    const existing = groups.get(item.areaId) || {
      id: item.areaId,
      label: item.areaLabel,
      description: item.areaDescription,
      order: item.areaOrder,
      items: [],
    };
    existing.items.push(item);
    groups.set(item.areaId, existing);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => left.title.localeCompare(right.title)),
    }))
    .sort((left, right) => left.order - right.order);
}
