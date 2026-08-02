import { describe, expect, it } from 'vitest';
import { managementMembership, resolveRole } from './resolveRole.js';
import { managementScopeSummary, roleConfigForUser } from './roles.js';

const profile = (memberships, principalKind = 'staff') => ({
  principal_kind: principalKind,
  role_memberships: memberships,
});

const membership = (slug, options = {}) => ({
  id: options.id || slug,
  account_type: options.accountType ?? 1,
  account_type_name: options.name || slug,
  account_type_slug: slug,
  account_kind: options.kind || 'staff',
  branch: options.branch ?? null,
  revoked_at: options.revokedAt ?? null,
});

describe('management role resolution', () => {
  it('maps an active director membership to the CEO console', () => {
    const user = profile([membership('director')]);

    expect(resolveRole(user)).toBe('ceo');
    expect(managementMembership(user, 'ceo')?.account_type_slug).toBe('director');
  });

  it('gives director precedence when a person has multiple management memberships', () => {
    const user = profile([membership('head_of_dept'), membership('director')]);

    expect(resolveRole(user)).toBe('ceo');
  });

  it('maps a department-head membership to the manager console', () => {
    expect(resolveRole(profile([membership('head_of_dept', { branch: 7 })]))).toBe('manager');
  });

  it('keeps organization-wide directories, finance, and access out of manager navigation', () => {
    const user = profile([membership('head_of_dept', { branch: 7 })]);
    const routeIds = roleConfigForUser('manager', user).nav.map((item) => item.id);

    expect(routeIds).toContain('students');
    expect(routeIds).toContain('operations');
    expect(routeIds).toContain('decisions');
    expect(routeIds).toContain('content');
    expect(routeIds).not.toContain('organization');
    expect(routeIds).not.toContain('finance');
    expect(routeIds).not.toContain('access');
  });

  it('fails closed when the released permission field is present but malformed', () => {
    const user = {
      ...profile([membership('head_of_dept', { branch: 7 })]),
      effective_permissions: 'students:read',
    };
    const routeIds = roleConfigForUser('manager', user).nav.map((item) => item.id);

    expect(routeIds).toContain('overview');
    expect(routeIds).not.toContain('students');
    expect(routeIds).not.toContain('intelligence');
  });

  it('summarizes multiple manager scopes without implying one campus', () => {
    const user = {
      ...profile([
        membership('head_of_dept', { id: 'one', branch: 1 }),
        membership('head_of_dept', { id: 'two', branch: 2 }),
      ]),
      scopes: [
        { branch: { id: 1, name: 'Central Campus' }, department: null },
        { branch: { id: 2, name: 'Riverside Campus' }, department: null },
      ],
    };

    expect(managementScopeSummary('manager', user)).toMatchObject({
      id: 'assigned-scopes',
      name: '2 assigned leadership scopes',
      count: 2,
    });
  });

  it('does not promote ordinary or custom staff account types', () => {
    expect(resolveRole(profile([membership('accountant')]))).toBeNull();
    expect(resolveRole(profile([membership('regional_coordinator', { accountType: 44 })]))).toBeNull();
  });

  it('rejects revoked, inactive, or wrong-kind management memberships', () => {
    expect(
      resolveRole(profile([membership('director', { revokedAt: '2026-07-01T00:00:00Z' })])),
    ).toBeNull();
    expect(resolveRole(profile([membership('director', { kind: 'teacher' })]))).toBeNull();
    expect(
      resolveRole({
        ...profile([membership('head_of_dept')]),
        is_active: false,
      }),
    ).toBeNull();
  });

  it('fails closed for non-staff principals and missing memberships', () => {
    expect(resolveRole(profile([membership('director')], 'teacher'))).toBeNull();
    expect(resolveRole(profile([]))).toBeNull();
  });
});
