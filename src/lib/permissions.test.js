import { describe, expect, it } from 'vitest';
import {
  declaredPermissions,
  canUseCapability,
  effectiveCapabilities,
  effectiveCapabilitiesForBranch,
  hasCapability,
  hasDeclaredAccess,
} from './permissions.js';

describe('effective permission presentation', () => {
  it('uses a legacy fallback only when the new field is truly absent', () => {
    expect(effectiveCapabilities({ id: 1 })).toBeNull();
    expect(effectiveCapabilities({ effective_permissions: null })).toEqual([]);
    expect(effectiveCapabilities({ effective_permissions: 'students:read' })).toEqual([]);
  });

  it('recognizes exact, resource-wide, and global grants', () => {
    expect(hasCapability(['students:read'], 'students:read')).toBe(true);
    expect(hasCapability(['students:*'], 'students:read')).toBe(true);
    expect(hasCapability(['*:*'], 'finance:read')).toBe(true);
    expect(hasCapability(['students:read'], 'finance:read')).toBe(false);
  });

  it('resolves disjoint branch grants without borrowing from the tenant union', () => {
    const user = {
      effective_permissions: ['students:read', 'finance:read'],
      scopes: [
        {
          branch: { id: 1, name: 'North' },
          department: null,
          effective_permissions: ['finance:read'],
        },
        {
          branch: { id: 2, name: 'South' },
          department: null,
          effective_permissions: ['students:read'],
        },
      ],
    };

    expect(effectiveCapabilitiesForBranch(user, 1)).toEqual(['finance:read']);
    expect(effectiveCapabilitiesForBranch(user, '2')).toEqual(['students:read']);
    expect(effectiveCapabilitiesForBranch(user, '')).toEqual(user.effective_permissions);
    expect(effectiveCapabilitiesForBranch({ ...user, scopes: null }, 1)).toEqual([]);
  });

  it('keeps legacy accounts usable but fails closed for declared malformed grants', () => {
    expect(canUseCapability({ id: 1 }, 'teachers:write')).toBe(true);
    expect(canUseCapability({ effective_permissions: ['teachers:write'] }, 'teachers:write')).toBe(true);
    expect(canUseCapability({ effective_permissions: null }, 'teachers:write')).toBe(false);
  });

  it('extracts declared grants from legacy prose and authorizes any supported grant', () => {
    expect(declaredPermissions('students:read; finance events require finance:read'))
      .toEqual(['students:read', 'finance:read']);
    expect(hasDeclaredAccess('schedule:read meeting:write', new Set(['meeting:write'])))
      .toBe(true);
    expect(hasDeclaredAccess('finance:read', new Set(['teachers:read'])))
      .toBe(false);
  });
});
