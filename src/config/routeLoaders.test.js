import { describe, expect, it, vi } from 'vitest';
import {
  allowsRoutePrefetch,
  createRoutePrefetcher,
  routeModuleIdsFor,
} from './routeLoaders.js';

describe('route module loading', () => {
  it('maps current and legacy routes to the smallest owning chunk', () => {
    expect(routeModuleIdsFor('students/directory')).toEqual(['students']);
    expect(routeModuleIdsFor('backendPeople/students/42')).toEqual(['students']);
    expect(routeModuleIdsFor('finance/invoices/9?status=issued')).toEqual(['finance']);
    expect(routeModuleIdsFor('crm/leads/9')).toEqual(['crm']);
    expect(routeModuleIdsFor('backendPayroll/periods/9')).toEqual(['payroll']);
    expect(routeModuleIdsFor('reports/library')).toEqual(['reports']);
    expect(routeModuleIdsFor('staff/42')).toEqual(['staff']);
    expect(routeModuleIdsFor('organization/departments/9')).toEqual(['departments']);
    expect(routeModuleIdsFor('organization/tasks/9')).toEqual(['tasks']);
    expect(routeModuleIdsFor('communications/forms/9')).toEqual(['forms']);
    expect(routeModuleIdsFor('backendMessaging/threads/9')).toEqual(['messaging']);
    expect(routeModuleIdsFor('missing/page')).toEqual([]);
  });

  it('adds a delegated branch chunk only when the nested route renders it', () => {
    expect(routeModuleIdsFor('branches/2/students')).toEqual(['branches']);
    expect(routeModuleIdsFor('branches/2/students/directory')).toEqual([
      'branches',
      'students',
    ]);
    expect(routeModuleIdsFor('branches/2/teachers/9/overview')).toEqual([
      'branches',
      'teachers',
    ]);
    expect(routeModuleIdsFor('branches/2/groups/4/attendance')).toEqual([
      'branches',
      'groups',
    ]);
    expect(routeModuleIdsFor('branches/2/exams/exams/7')).toEqual([
      'branches',
      'exams',
    ]);
  });

  it('respects reduced-data, slow-network, and offline preferences', () => {
    expect(allowsRoutePrefetch()).toBe(true);
    expect(allowsRoutePrefetch({ onLine: false })).toBe(false);
    expect(allowsRoutePrefetch({ connection: { saveData: true } })).toBe(false);
    expect(allowsRoutePrefetch({ connection: { effectiveType: 'slow-2g' } })).toBe(false);
    expect(allowsRoutePrefetch({ connection: { effectiveType: '4g' } })).toBe(true);
  });

  it('deduplicates repeated hover and focus intent and retries failures', async () => {
    const branches = vi.fn().mockResolvedValue({});
    const students = vi.fn()
      .mockRejectedValueOnce(new Error('temporary chunk failure'))
      .mockResolvedValue({});
    const prefetch = createRoutePrefetcher({
      modules: {
        branches: { load: branches },
        students: { load: students },
      },
      readNetwork: () => ({ onLine: true, connection: { effectiveType: '4g' } }),
    });

    await prefetch('branches/2/students/directory');
    await prefetch('branches/2/students/directory');
    await prefetch('branches/2/students/directory');

    expect(branches).toHaveBeenCalledOnce();
    expect(students).toHaveBeenCalledTimes(2);
  });

  it('does no work when the connection opts out', async () => {
    const load = vi.fn().mockResolvedValue({});
    const prefetch = createRoutePrefetcher({
      modules: { students: { load } },
      readNetwork: () => ({ connection: { saveData: true } }),
    });

    await expect(prefetch('students')).resolves.toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});
