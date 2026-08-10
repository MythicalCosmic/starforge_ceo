import { describe, expect, it } from 'vitest';
import {
  isManagementOperation,
  managementOperations,
  multipartContractForOperation,
  operationAllowed,
  operationPathMatches,
  permissionForOperation,
  readOperations,
  resolveOpenApiSchema,
} from './openApiOperations.js';

const schema = {
  openapi: '3.0.3',
  paths: {
    '/api/v1/crm/leads/': {
      get: {
        summary: 'GET leads',
        tags: ['crm'],
        description: 'Requires permission `crm:read`.',
      },
      post: {
        summary: 'Create a lead',
        tags: ['crm'],
        description: 'Requires permission `crm:write`.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadCreate' } } },
        },
      },
    },
    '/api/v1/crm/leads/{pk}/transition/': {
      parameters: [{ name: 'pk', in: 'path', required: true, schema: { type: 'integer' } }],
      post: { summary: 'Transition a lead', tags: ['crm'], description: 'Requires permission `crm:write`.' },
    },
    '/api/v1/auth/logout/': {
      post: { summary: 'Sign out', tags: ['auth'] },
    },
    '/api/v1/academics/exams/': {
      post: { summary: 'POST exam list', tags: ['academics'], description: 'Requires permission `academics:read`.' },
    },
    '/api/v1/forms/{pk}/submit/': {
      parameters: [{ name: 'pk', in: 'path', required: true, schema: { type: 'integer' } }],
      post: { summary: 'Submit form', tags: ['forms'], description: 'Requires permission `forms:read`.' },
    },
    '/api/v1/notifications/read-all/': {
      post: { summary: 'Mark notifications read', tags: ['notifications'] },
    },
    '/api/v1/students/import/': {
      post: {
        summary: 'Import students',
        tags: ['students'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      },
    },
  },
  components: {
    schemas: {
      LeadCreate: {
        type: 'object',
        required: ['student'],
        properties: { student: { type: 'integer' }, note: { type: 'string' } },
      },
    },
  },
};

describe('management OpenAPI operations', () => {
  it('enumerates every write and separates self-service protocols', () => {
    const all = managementOperations(schema, { includeNonManagement: true });
    expect(all).toHaveLength(7);
    expect(all.filter(isManagementOperation)).toHaveLength(6);
    expect(isManagementOperation(all.find((item) => item.path.includes('/auth/')))).toBe(false);
  });

  it('overrides inaccurate JSON metadata for the two multipart CSV workflows', () => {
    const importOperation = managementOperations(schema).find((item) => item.path === '/api/v1/students/import/');
    const contract = multipartContractForOperation(importOperation);
    expect(contract.fileField).toBe('file');
    expect(contract.schema.required).toEqual(['branch']);
  });

  it('enumerates read operations with read-specific capabilities', () => {
    const reads = readOperations(schema);
    expect(reads).toHaveLength(1);
    expect(reads[0].label).toBe('View Leads');
    expect(permissionForOperation(reads[0])).toBe('crm:read');
    expect(operationAllowed(reads[0], ['crm:read'])).toBe(true);
    expect(operationAllowed(reads[0], ['crm:write'])).toBe(false);
  });

  it('corrects legacy mixed-method permissions without breaking intentional read actions', () => {
    const operations = managementOperations(schema);
    const examCreate = operations.find((item) => item.path === '/api/v1/academics/exams/');
    const formSubmit = operations.find((item) => item.path.includes('/forms/'));
    const notificationRead = operations.find((item) => item.path.includes('/notifications/'));
    expect(permissionForOperation(examCreate)).toBe('academics:write');
    expect(permissionForOperation(formSubmit)).toBe('forms:read');
    expect(permissionForOperation(notificationRead)).toBe('notifications:read');
  });

  it('uses exact declared capabilities and wildcard grants', () => {
    const operation = managementOperations(schema).find((item) => item.path === '/api/v1/crm/leads/');
    expect(permissionForOperation(operation)).toBe('crm:write');
    expect(operationAllowed(operation, ['crm:read'])).toBe(false);
    expect(operationAllowed(operation, ['crm:*'])).toBe(true);
    expect(operationAllowed(operation, ['*:*'])).toBe(true);
  });

  it('matches collection and record actions without leaking other resources', () => {
    const operations = managementOperations(schema);
    expect(operations.filter((item) => operationPathMatches(item, '/api/v1/crm/leads/'))).toHaveLength(2);
    expect(operations.filter((item) => operationPathMatches(item, '/api/v1/crm/leads/', { collectionOnly: true }))).toHaveLength(1);
  });

  it('resolves component request schemas for typed forms', () => {
    const operation = managementOperations(schema).find((item) => item.path === '/api/v1/crm/leads/');
    const resolved = resolveOpenApiSchema(operation.requestSchema, schema);
    expect(resolved.required).toEqual(['student']);
    expect(resolved.properties.student.type).toBe('integer');
  });
});
