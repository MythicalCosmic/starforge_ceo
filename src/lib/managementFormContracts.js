const principal = Object.freeze({
  type: 'object',
  nullable: true,
  title: 'Owner',
  description: 'Choose an active staff member or teacher.',
  properties: {
    kind: { type: 'string', enum: ['staff', 'teacher'] },
    id: { type: 'integer', minimum: 1 },
  },
  required: ['kind', 'id'],
  'x-principal': true,
});

const CONTRACTS = Object.freeze({
  'post:/api/v1/org/branches/': {
    title: 'Create branch',
    description: 'Add a location with its contact details, timezone, and safe enrollment limits.',
    schema: {
      type: 'object',
      required: ['name', 'slug'],
      properties: {
        name: { type: 'string', title: 'Branch name', maxLength: 200 },
        slug: {
          type: 'string',
          title: 'Short code',
          maxLength: 100,
          description: 'Lowercase letters, numbers, and hyphens only—for example, chilanzar-campus.',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        },
        address: { type: 'string', title: 'Address', maxLength: 512 },
        phone: { type: 'string', title: 'Phone', maxLength: 32 },
        timezone: {
          type: 'string',
          title: 'Timezone',
          default: 'Asia/Tashkent',
          maxLength: 64,
          description: 'Use a standard timezone name such as Asia/Tashkent.',
        },
        max_students: { type: 'integer', title: 'Student capacity', minimum: 0 },
        max_teachers: { type: 'integer', title: 'Teacher capacity', minimum: 0 },
        is_active: { type: 'boolean', title: 'Open immediately', default: true },
      },
    },
  },
  'post:/api/v1/org/departments/': {
    title: 'Create department',
    description: 'Create a department inside one branch, set its operating budget, and optionally choose its lead.',
    schema: {
      type: 'object',
      required: ['branch', 'name', 'slug'],
      properties: {
        branch: {
          type: 'integer',
          title: 'Branch',
          minimum: 1,
          'x-lookup': 'branch',
        },
        name: { type: 'string', title: 'Department name', maxLength: 200 },
        slug: {
          type: 'string',
          title: 'Short code',
          maxLength: 100,
          description: 'Lowercase letters, numbers, and hyphens only—for example, english-studies.',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        },
        description: { type: 'string', title: 'Purpose and responsibilities', maxLength: 4000 },
        head: {
          type: 'integer',
          title: 'Department lead',
          minimum: 1,
          'x-lookup': 'teachers',
          description: 'Optional. Choose an active teacher from the same branch.',
        },
        budget: {
          type: 'number',
          title: 'Annual budget (UZS)',
          minimum: 0,
        },
        is_active: { type: 'boolean', title: 'Active immediately', default: true },
      },
    },
  },
  'post:/api/v1/org/rooms/': {
    title: 'Create room',
    description: 'Add a physical room and optionally make it the default space for a learning group.',
    workflow: 'create-room',
    schema: {
      type: 'object',
      required: ['branch', 'name'],
      properties: {
        branch: {
          type: 'integer',
          title: 'Branch',
          minimum: 1,
          'x-lookup': 'branch',
        },
        name: { type: 'string', title: 'Room name', maxLength: 100 },
        capacity: {
          type: 'integer',
          title: 'Capacity',
          minimum: 0,
          maximum: 32767,
          default: 0,
        },
        equipment: {
          type: 'array',
          title: 'Equipment',
          description: 'Enter one item per line, such as projector, whiteboard, or speakers.',
          items: { type: 'string', maxLength: 100 },
          maxItems: 64,
        },
        notes: { type: 'string', title: 'Room notes', maxLength: 4000 },
        is_active: { type: 'boolean', title: 'Available immediately', default: true },
        assignment_group: {
          type: 'integer',
          title: 'Learning group',
          minimum: 1,
          'x-lookup': 'cohorts',
          'x-client-only': true,
          description: 'Optional. This room becomes the group’s default teaching space.',
        },
        responsible_teacher: {
          type: 'integer',
          title: 'Responsible teacher',
          minimum: 1,
          'x-lookup': 'teachers',
          'x-client-only': true,
          'x-visible-when': { field: 'assignment_group', present: true },
          description: 'Optional. Also set the selected group’s lead teacher.',
        },
      },
    },
  },
  'post:/api/v1/achievements/': {
    title: 'Create achievement',
    description: 'Create a clear recognition badge for the whole organization or one learning group.',
    schema: {
      type: 'object',
      required: ['name', 'scope'],
      properties: {
        name: { type: 'string', title: 'Achievement name', maxLength: 120 },
        emoji: {
          type: 'string',
          title: 'Badge symbol',
          maxLength: 32,
          description: 'Use one short symbol, such as ⭐ or 🎯.',
        },
        description: {
          type: 'string',
          title: 'What it recognizes',
          maxLength: 1000,
        },
        scope: {
          type: 'string',
          title: 'Who can receive it',
          enum: ['global', 'group'],
          enumLabels: { global: 'Entire organization', group: 'One learning group' },
          default: 'global',
        },
        cohort: {
          type: 'integer',
          title: 'Learning group',
          minimum: 1,
          'x-lookup': 'cohorts',
          'x-visible-when': { field: 'scope', equals: 'group' },
        },
      },
    },
  },
});

const COPY = Object.freeze({
  'post:/api/v1/crm/leads/': {
    title: 'Add lead to admissions',
    description: 'Choose the student, pipeline stage, source, and accountable owner.',
  },
  'post:/api/v1/tasks/': {
    title: 'Create task',
    description: 'Set the outcome, owner, priority, scope, and deadline.',
  },
});

export const FIELD_LOOKUPS = Object.freeze({
  branch: { path: '/api/v1/org/branches/', label: 'name' },
  department: { path: '/api/v1/org/departments/', label: 'name', secondary: 'branch_name' },
  cohort: { path: '/api/v1/cohorts/', label: 'name', secondary: 'branch_name' },
  cohorts: { path: '/api/v1/cohorts/', label: 'name', secondary: 'branch_name' },
  teachers: { path: '/api/v1/teachers/', label: 'full_name', secondary: 'branch_name' },
  student: { path: '/api/v1/students/', label: 'full_name', secondary: 'public_id' },
  stage: { path: '/api/v1/crm/stages/', label: 'name' },
  source: { path: '/api/v1/crm/sources/', label: 'name' },
  campaign: { path: '/api/v1/crm/campaigns/', label: 'name' },
});

export const PRINCIPAL_LOOKUP = Object.freeze({
  path: '/api/v1/messaging/contacts/',
  label: 'display_name',
  secondary: 'role_label',
});

export function operationContract(operation) {
  return CONTRACTS[`${operation?.method}:${operation?.path}`] || null;
}

export function operationPresentation(operation) {
  const key = `${operation?.method}:${operation?.path}`;
  return CONTRACTS[key] || COPY[key] || null;
}

export function isPrincipalSchema(name, schema) {
  return Boolean(
    schema?.['x-principal'] ||
    (['owner', 'assignee_principal'].includes(name) && schema?.type === 'object' && schema?.properties?.kind && schema?.properties?.id),
  );
}

export function lookupForField(name, schema) {
  const key = schema?.['x-lookup'] || name;
  return FIELD_LOOKUPS[key] || null;
}

export function withPrincipalHint(name, schema) {
  return isPrincipalSchema(name, schema) ? { ...principal, ...schema, 'x-principal': true } : schema;
}
