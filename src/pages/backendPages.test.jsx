import { describe, expect, it } from 'vitest';
import { declaredPermissions } from '../lib/permissions.js';
import { managementModuleFor } from './backendPages.jsx';

function teacherView(module) {
  return module.tabs.find((tab) => ['directory', 'teachers'].includes(tab.id));
}

describe('restored management page boundaries', () => {
  it('keeps all 104 catalog views reachable through complete workspaces', () => {
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
      'finance',
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

    expect(tabs).toHaveLength(104);
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
      'intelligence', 'decisions', 'finance', 'reports', 'audit',
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
    'removes compensation from the %s view without finance access',
    (moduleId) => {
      const tab = teacherView(managementModuleFor(moduleId, 'ceo', {
        effective_permissions: ['teachers:read'],
      }));

      expect(tab.detail.map((field) => field.key)).not.toContain('salary_type');
      expect((tab.related || []).map((relation) => relation.id)).not.toContain('payoutPolicy');
    },
  );

  it('never exposes compensation to a scoped manager through presentation metadata', () => {
    const tab = teacherView(managementModuleFor('people', 'manager', {
      effective_permissions: ['teachers:read', 'finance:read'],
    }));

    expect(tab.detail.map((field) => field.key)).not.toContain('salary_type');
    expect((tab.related || []).map((relation) => relation.id)).not.toContain('payoutPolicy');
  });

  it('retains compensation metadata only for a director with the finance grant', () => {
    const tab = teacherView(managementModuleFor('people', 'ceo', {
      effective_permissions: ['teachers:read', 'finance:read'],
    }));

    expect(tab.detail.map((field) => field.key)).toContain('salary_type');
    expect((tab.related || []).map((relation) => relation.id)).toContain('payoutPolicy');
  });
});
