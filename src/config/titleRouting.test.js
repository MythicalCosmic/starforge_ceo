import { describe, expect, it } from 'vitest';
import {
  ownsFocusedWorkspaceTitle,
  shouldResolveLazyManagementTitle,
} from './titleRouting.js';

describe('workspace title ownership', () => {
  it.each([
    'students',
    'teachers',
    'groups',
    'exams',
    'finance',
    'branches',
    'account',
  ])('keeps cached %s record titles under the focused workspace', (routeId) => {
    expect(ownsFocusedWorkspaceTitle(routeId)).toBe(true);
    expect(shouldResolveLazyManagementTitle(routeId, true)).toBe(false);
  });

  it.each(['people', 'academics', 'content', 'reports', 'audit'])(
    'retains lazy management titles for nested %s routes',
    (routeId) => {
      expect(ownsFocusedWorkspaceTitle(routeId)).toBe(false);
      expect(shouldResolveLazyManagementTitle(routeId, true)).toBe(true);
    },
  );

  it('does not load the management catalog for top-level titles', () => {
    expect(shouldResolveLazyManagementTitle('people', false)).toBe(false);
    expect(shouldResolveLazyManagementTitle('overview', true)).toBe(false);
    expect(shouldResolveLazyManagementTitle('settings', true)).toBe(false);
  });

  it('leaves every management record title to the mounted detail page', () => {
    expect(shouldResolveLazyManagementTitle('schedule', true, true)).toBe(false);
    expect(shouldResolveLazyManagementTitle('content', true, true)).toBe(false);
    expect(shouldResolveLazyManagementTitle('schedule', true, false)).toBe(true);
  });
});
