import { describe, expect, it } from 'vitest';
import { declaredPermissions } from '../lib/permissions.js';
import { managementModuleFor } from './backendPages.jsx';

function teacherView(module) {
  return module.tabs.find((tab) => ['directory', 'teachers'].includes(tab.id));
}

describe('restored management page boundaries', () => {
  it('keeps all 112 catalog views reachable through complete workspaces', () => {
    const routeIds = [
      'account',
      'people',
      'organization',
      'schedule',
      'messaging',
      'ai-governance',
      'attendance',
      'academics',
      'assignments',
      'intelligence',
      'decisions',
      'crm',
      'finance',
      'payroll',
      'reports',
      'audit',
      'operations',
      'engagement',
      'content',
      'placement',
      'recognition',
      'access',
    ];
    const tabs = routeIds.flatMap((moduleId) =>
      managementModuleFor(moduleId, 'ceo', {
        effective_permissions: ['*:*'],
      }).tabs);

    expect(tabs).toHaveLength(112);
  });

  it('adds explicit grants to shared people directories', () => {
    const module = managementModuleFor('people', 'ceo', {
      effective_permissions: ['students:read'],
    });

    expect(module.tabs.find((tab) => tab.id === 'students').permission).toBe('students:read');
    expect(module.tabs.find((tab) => tab.id === 'cohorts').permission).toBe('cohorts:read');
    expect(module.tabs.find((tab) => tab.id === 'teachers').permission).toBe('teachers:read');
  });

  it('gives every restored tab a parsed grant or an explicit authenticated-only status', () => {
    const authenticatedOnly = new Set([
      'account.profile',
      'account.devices',
      'engagement.unreadCount',
      'recognition.pendingRules',
    ]);
    const routeIds = [
      'account', 'people', 'organization', 'schedule', 'messaging',
      'ai-governance', 'attendance', 'academics', 'assignments',
      'intelligence', 'decisions', 'crm', 'finance', 'payroll', 'reports', 'audit',
      'operations', 'engagement', 'content', 'placement', 'recognition', 'access',
    ];

    routeIds.forEach((moduleId) => {
      managementModuleFor(moduleId, 'ceo', {}).tabs.forEach((tab) => {
        const key = `${moduleId}.${tab.id}`;
        const parsed = declaredPermissions(tab.permission);
        expect(
          parsed.length > 0 || authenticatedOnly.has(key),
          `${key} has no enforceable presentation grant`,
        ).toBe(true);
      });
    });
  });

  it.each(['people', 'teachers'])(
    'removes compensation from the %s view without compensation access',
    (moduleId) => {
      const tab = teacherView(managementModuleFor(moduleId, 'ceo', {
        effective_permissions: ['teachers:read'],
      }));

      expect(tab.detail.map((field) => field.key)).not.toContain('salary_type');
      expect((tab.related || []).map((relation) => relation.id)).not.toContain('payoutPolicy');
    },
  );

  it('does not mistake customer-finance access for staff-compensation access', () => {
    const tab = teacherView(managementModuleFor('people', 'manager', {
      effective_permissions: ['teachers:read', 'finance:read'],
    }));

    expect(tab.detail.map((field) => field.key)).not.toContain('salary_type');
    expect((tab.related || []).map((relation) => relation.id)).not.toContain('payoutPolicy');
  });

  it('retains compensation metadata for any role with the explicit scoped grant', () => {
    const tab = teacherView(managementModuleFor('people', 'ceo', {
      effective_permissions: ['teachers:read', 'compensation:read'],
    }));

    expect(tab.detail.map((field) => field.key)).toContain('salary_type');
    expect((tab.related || []).map((relation) => relation.id)).toContain('payoutPolicy');
    expect((tab.related || []).find((relation) => relation.id === 'payoutPolicy').permission).toBe('compensation:read');
  });

  it('does not hide a manager whose effective grants explicitly include compensation', () => {
    const tab = teacherView(managementModuleFor('people', 'manager', {
      effective_permissions: ['teachers:read', 'compensation:read'],
    }));

    expect(tab.detail.map((field) => field.key)).toContain('salary_type');
    expect((tab.related || []).map((relation) => relation.id)).toContain('payoutPolicy');
  });

  it('exposes CRM and payroll only when their dedicated grants are present', () => {
    const crmReader = managementModuleFor('crm', 'manager', {
      effective_permissions: ['crm:read'],
    });
    const compensationReader = managementModuleFor('payroll', 'manager', {
      effective_permissions: ['compensation:read'],
    });

    expect(crmReader.tabs.map((tab) => tab.path)).toContain('/api/v1/crm/leads/');
    expect(compensationReader.tabs.map((tab) => tab.path)).toContain('/api/v1/payroll/periods/');
    expect(compensationReader.tabs.flatMap((tab) => tab.related || []).map((relation) => relation.path))
      .not.toContain('/api/v1/payroll/periods/{id}/run/');
  });
});
