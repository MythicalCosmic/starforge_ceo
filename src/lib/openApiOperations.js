import { hasCapability } from './permissions.js';

export const WRITE_METHODS = Object.freeze(['post', 'put', 'patch', 'delete']);

const READ_TAG_PERMISSIONS = Object.freeze({
  access: 'access:read',
  achievements: 'achievements:read',
  academics: 'academics:read',
  ai: 'ai:read',
  approvals: 'approvals:read',
  assignments: 'assignments:read',
  attendance: 'attendance:read',
  audit: 'audit:read',
  campaigns: 'campaign:read',
  cards: 'card:read',
  cohorts: 'cohorts:read',
  content: 'content:read',
  cover: 'cover:read',
  crm: 'crm:read',
  finance: 'finance:read',
  forms: 'forms:read',
  intelligence: 'intelligence:read',
  loans: 'loan:read',
  meetings: 'meeting:write',
  messaging: 'messaging:read',
  notifications: 'notifications:read',
  org: 'org:read',
  parents: 'parents:read',
  payments: 'payments:read',
  payroll: 'compensation:read',
  placement: 'placement:read',
  printing: 'printing:read',
  procurement: 'procurement:read',
  reports: 'reports:read',
  rewards: 'rewards:read',
  rulebook: 'compliance:read',
  sales: 'sale:read',
  schedule: 'schedule:read',
  students: 'students:read',
  tasks: 'tasks:read',
  teachers: 'teachers:read',
  users: 'users:read',
});

const TAG_PERMISSIONS = Object.freeze({
  access: 'access:write',
  achievements: 'achievements:write',
  academics: 'academics:write',
  ai: 'ai:write',
  approvals: 'approvals:write',
  assignments: 'assignments:write',
  attendance: 'attendance:write',
  campaigns: 'campaign:write',
  cards: 'card:write',
  cohorts: 'cohorts:write',
  content: 'content:write',
  cover: 'cover:write',
  crm: 'crm:write',
  finance: 'finance:write',
  forms: 'forms:write',
  loans: 'loan:write',
  meetings: 'meeting:write',
  messaging: 'messaging:write',
  notifications: 'notifications:write',
  org: 'org:write',
  parents: 'parents:write',
  payments: 'payments:write',
  payroll: 'compensation:write',
  placement: 'placement:write',
  printing: 'printing:write',
  procurement: 'procurement:write',
  reports: 'reports:write',
  rewards: 'rewards:write',
  rulebook: 'compliance:write',
  sales: 'sale:write',
  schedule: 'schedule:write',
  students: 'students:write',
  tasks: 'tasks:write',
  teachers: 'teachers:write',
  users: 'users:write',
});

// Authentication, current-account, and branch-agent protocols have dedicated
// experiences with additional safety context. Principal-facing workflow
// actions (RSVP, mark read, acknowledge, track a view) deliberately remain in
// the action inventory: leaders are still valid participants in those flows.
const NON_MANAGEMENT_PATHS = Object.freeze([
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/printing\/agent(?:\/|$)/,
  /^\/api\/v1\/users\/me\/$/,
  /^\/api\/v1\/users\/(?:devices|sessions)\//,
]);

// The legacy schema generator describes one permission per callback, so a
// mixed GET/POST callback can incorrectly advertise its first `*:read` check
// for every unsafe method. These narrow rules mirror the executable handlers
// until those remaining callbacks receive explicit per-operation contracts.
const PATH_PERMISSION_RULES = Object.freeze([
  [/^\/api\/v1\/org\/staff(?:\/|$)/, 'users:write'],
  [/^\/api\/v1\/org\/settings\/$/, 'organization_settings:write'],
  [/^\/api\/v1\/org\/system\/apps\/$/, 'system:write'],
  [/^\/api\/v1\/rulebook\/penalties\/$/, 'penalty:write'],
  [/^\/api\/v1\/notifications\/(?:preferences|read-all|\{[^}]+\}\/read)\/$/, 'notifications:read'],
  [/^\/api\/v1\/messaging\/threads\/\{[^}]+\}\/(?:read|preferences)\/$/, 'messaging:read'],
]);

// These POSTs intentionally create a principal-scoped response/export/read
// effect under a read grant. Do not upgrade them to the tag's write grant.
const READ_AUTHORIZED_WRITES = Object.freeze([
  /^\/api\/v1\/content\/files\/\{[^}]+\}\/track-view\/$/,
  /^\/api\/v1\/finance\/students\/\{[^}]+\}\/statement\/$/,
  /^\/api\/v1\/payments\/\{[^}]+\}\/receipt\/$/,
  /^\/api\/v1\/payroll\/periods\/\{[^}]+\}\/exports\/$/,
  /^\/api\/v1\/forms\/\{[^}]+\}\/submit\/$/,
  /^\/api\/v1\/tasks\/\{[^}]+\}\/transition\/$/,
]);

const READ_PATH_PERMISSION_RULES = Object.freeze([
  [/^\/api\/v1\/org\/settings\/$/, 'organization_settings:read'],
  [/^\/api\/v1\/org\/system\/apps\/$/, 'system:read'],
  [/^\/api\/v1\/cards\/wallets(?:\/|$)/, 'wallet:read'],
]);

const IRREVERSIBLE_WORDS = /\b(delete|remove|revoke|reject|disburse|pay|refund|void|send|publish|close|cancel|deactivate|merge|reverse|waive|approve|block)\b/i;

export function humanizeIdentifier(value) {
  return String(value || '')
    .replace(/[{}]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferredSpecialPermission(path, tag) {
  if (tag === 'cover' && /\/(?:assign|open-pool|reject)\/$/.test(path)) return 'cover:approve';
  if (tag === 'campaigns' && /\/send\/$/.test(path)) return 'campaign:send';
  if (tag === 'achievements' && /\/(?:approve|reject)\/$/.test(path)) return 'achievements:approve';
  if (tag === 'placement' && /\/(?:approve|reject|accept)\/$/.test(path)) return 'placement:approve';
  if (tag === 'finance' && /\/(?:approve|reject)\/$/.test(path)) return 'approvals:approve';
  if (tag === 'finance' && /\/pay\/$/.test(path)) return 'approvals:disburse';
  if (tag === 'sales' && /\/refund\/$/.test(path)) return 'sale:refund';
  return null;
}

export function permissionForOperation(operation) {
  const path = String(operation?.path || '');
  const method = String(operation?.method || '').toLowerCase();
  const description = String(operation?.description || '');
  const declared = description.match(/(?:Requires permission|Requires)\s+`?([a-z][\w-]*:(?:[\w*-]+))/i)?.[1];
  if (method === 'get') {
    const readPathRule = READ_PATH_PERMISSION_RULES.find(([pattern]) => pattern.test(path));
    if (readPathRule) return readPathRule[1];
    if (declared) return declared.toLowerCase();
    const tag = String(operation?.tag || '').toLowerCase();
    return READ_TAG_PERMISSIONS[tag] || null;
  }
  const pathRule = PATH_PERMISSION_RULES.find(([pattern]) => pattern.test(path));
  if (pathRule) return pathRule[1];
  if (declared && (!declared.toLowerCase().endsWith(':read') || READ_AUTHORIZED_WRITES.some((pattern) => pattern.test(path)))) {
    return declared.toLowerCase();
  }
  const tag = String(operation?.tag || '').toLowerCase();
  return inferredSpecialPermission(path, tag) || TAG_PERMISSIONS[tag] || null;
}

export function operationAllowed(operation, capabilities) {
  if (capabilities == null) return true;
  const permission = permissionForOperation(operation);
  if (!permission) return hasCapability(capabilities, '*:*');
  return hasCapability(capabilities, permission);
}

export function isManagementOperation(operation) {
  return Boolean(operation?.path) && !NON_MANAGEMENT_PATHS.some((pattern) => pattern.test(operation.path));
}

function genericSummary(operation) {
  const method = operation.method.toUpperCase();
  const segments = operation.path.split('/').filter(Boolean).slice(2);
  const literals = segments.filter((segment) => !segment.startsWith('{'));
  const action = literals.at(-1) || operation.tag || 'record';
  const parent = literals.at(-2);
  const hasCustomAction = segments.at(-1) && !segments.at(-1).startsWith('{') && operation.path.match(/\{[^}]+\}\/[\w-]+\/$/);
  if (hasCustomAction) return `${humanizeIdentifier(action)} ${humanizeIdentifier(parent || '')}`.trim();
  const subject = humanizeIdentifier(action).replace(/s$/i, '') || 'Record';
  if (method === 'GET') return `View ${humanizeIdentifier(action) || 'Data'}`;
  if (method === 'POST') return `Create ${subject}`;
  if (method === 'PUT') return `Replace ${subject}`;
  if (method === 'PATCH') return `Edit ${subject}`;
  return `Delete ${subject}`;
}

export function operationLabel(operation) {
  const summary = String(operation?.summary || '').trim();
  if (!summary || new RegExp(`^${operation.method}\\s`, 'i').test(summary)) return genericSummary(operation);
  return summary.replace(/\.$/, '');
}

export function operationRisk(operation) {
  if (operation?.method === 'delete') return 'destructive';
  return IRREVERSIBLE_WORDS.test(`${operationLabel(operation)} ${operation?.path || ''}`)
    ? 'sensitive'
    : 'standard';
}

export function multipartContractForOperation(operation) {
  const path = String(operation?.path || '');
  if (operation?.method !== 'post') return null;
  if (path === '/api/v1/students/import/') {
    return {
      fileField: 'file',
      accept: '.csv,text/csv',
      maxBytes: 2 * 1024 * 1024,
      schema: {
        type: 'object',
        required: ['branch'],
        properties: {
          branch: {
            type: 'integer',
            minimum: 1,
            title: 'Branch',
            description: 'The destination branch for every student in this CSV.',
          },
        },
      },
      help: 'Upload a UTF-8 CSV file. The service validates the whole file before importing it.',
    };
  }
  if (/^\/api\/v1\/academics\/exams\/\{[^}]+\}\/results\/import-csv\/$/.test(path)) {
    return {
      fileField: 'file',
      accept: '.csv,text/csv',
      maxBytes: 2 * 1024 * 1024,
      schema: { type: 'object', properties: {}, required: [] },
      help: 'Upload a UTF-8 CSV with student_id, score, and an optional note column.',
    };
  }
  return null;
}

function combinedParameters(pathItem, operation) {
  const parameters = [...(pathItem?.parameters || []), ...(operation?.parameters || [])];
  const seen = new Set();
  return parameters.filter((parameter) => {
    const key = `${parameter.in}:${parameter.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function managementOperations(schema, { includeNonManagement = false } = {}) {
  const rows = [];
  for (const [path, pathItem] of Object.entries(schema?.paths || {})) {
    for (const method of WRITE_METHODS) {
      const source = pathItem?.[method];
      if (!source) continue;
      const operation = {
        ...source,
        key: `${method}:${path}`,
        method,
        path,
        tag: source.tags?.[0] || path.split('/').filter(Boolean)[2] || 'other',
        parameters: combinedParameters(pathItem, source),
        requestSchema: source.requestBody?.content?.['application/json']?.schema || null,
        requestBodyRequired: source.requestBody?.required === true,
      };
      operation.permission = permissionForOperation(operation);
      operation.label = operationLabel(operation);
      operation.risk = operationRisk(operation);
      if (includeNonManagement || isManagementOperation(operation)) rows.push(operation);
    }
  }
  return rows.sort((left, right) =>
    left.tag.localeCompare(right.tag) || left.label.localeCompare(right.label) || left.path.localeCompare(right.path));
}

export function readOperations(schema) {
  const rows = [];
  for (const [path, pathItem] of Object.entries(schema?.paths || {})) {
    const source = pathItem?.get;
    if (!source) continue;
    const operation = {
      ...source,
      key: `get:${path}`,
      method: 'get',
      path,
      tag: source.tags?.[0] || path.split('/').filter(Boolean)[2] || 'other',
      parameters: combinedParameters(pathItem, source),
    };
    operation.permission = permissionForOperation(operation);
    operation.label = operationLabel(operation);
    rows.push(operation);
  }
  return rows.sort((left, right) =>
    left.tag.localeCompare(right.tag) || left.label.localeCompare(right.label) || left.path.localeCompare(right.path));
}

function referenceValue(schema, document) {
  if (!schema?.$ref || !schema.$ref.startsWith('#/')) return null;
  return schema.$ref
    .slice(2)
    .split('/')
    .reduce((value, part) => value?.[part.replaceAll('~1', '/').replaceAll('~0', '~')], document);
}

export function resolveOpenApiSchema(schema, document, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: 'object' };
    const referenced = referenceValue(schema, document);
    return resolveOpenApiSchema(referenced, document, new Set([...seen, schema.$ref]));
  }
  const variants = schema.allOf || schema.oneOf || schema.anyOf;
  if (Array.isArray(variants) && variants.length) {
    const resolved = variants.map((variant) => resolveOpenApiSchema(variant, document, seen)).filter(Boolean);
    if (schema.allOf) {
      return resolved.reduce((result, part) => ({
        ...result,
        ...part,
        properties: { ...(result.properties || {}), ...(part.properties || {}) },
        required: [...new Set([...(result.required || []), ...(part.required || [])])],
      }), { ...schema, allOf: undefined });
    }
    return { ...schema, ...resolved[0], variants: resolved };
  }
  return {
    ...schema,
    ...(schema.items ? { items: resolveOpenApiSchema(schema.items, document, seen) } : {}),
    ...(schema.properties ? {
      properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [
        key,
        resolveOpenApiSchema(value, document, seen) || value,
      ])),
    } : {}),
  };
}

export function operationPathMatches(operation, prefix, { collectionOnly = false } = {}) {
  if (!prefix || !operation.path.startsWith(prefix)) return false;
  if (!collectionOnly) return true;
  return !operation.parameters.some((parameter) => parameter.in === 'path');
}
