import { describe, expect, it } from 'vitest';
import { REGISTERED_PAGE_IDS } from '../App.jsx';
import { BACKEND_PAGE_ROUTE_IDS } from '../api/catalog.js';
import { roleConfigForUser } from './roles.js';
import { LEGACY_ROUTES } from './routes.js';

describe('leadership page registry', () => {
  const registered = new Set(REGISTERED_PAGE_IDS);

  it('has a page component for every configured CEO and manager destination', () => {
    ['ceo', 'manager'].forEach((role) => {
      roleConfigForUser(role, {}).destinations.forEach((item) => {
        expect(registered.has(item.id), `${role} route ${item.id} is not registered`).toBe(true);
      });
    });
  });

  it('restores a registered leadership route for every catalog module', () => {
    BACKEND_PAGE_ROUTE_IDS.forEach((formerId) => {
      const restored = LEGACY_ROUTES[formerId]?.target.split('/')[0];
      expect(restored, `${formerId} has no restored route`).toBeTruthy();
      expect(registered.has(restored), `${formerId} resolves to missing route ${restored}`).toBe(true);
    });
  });

  it('keeps the complete CEO workspace reachable while focusing primary navigation', () => {
    const config = roleConfigForUser('ceo', {});
    const visible = config.directoryNav;
    expect(visible.length).toBeGreaterThanOrEqual(24);
    expect(visible.map((item) => item.id)).toEqual(expect.arrayContaining([
      'branches',
      'groups',
      'exams',
      'staff',
      'departments',
      'tasks',
      'forms',
      'messaging',
      'star-ai',
      'content',
      'recognition',
      'crm',
      'operations',
      'finance',
      'payroll',
      'ai-governance',
      'access',
    ]));
    expect(config.primaryNav.map((item) => item.id)).not.toEqual(expect.arrayContaining([
      'attendance',
      'assignments',
    ]));
    expect(visible.map((item) => item.id)).not.toEqual(expect.arrayContaining([
      'attendance',
      'assignments',
    ]));
    expect(config.destinations.map((item) => item.id)).toEqual(expect.arrayContaining([
      'attendance',
      'assignments',
    ]));
  });
});
