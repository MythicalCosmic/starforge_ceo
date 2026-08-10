import { describe, expect, it } from 'vitest';
import {
  appForApiPath,
  isServiceUnavailable,
  normalizeAppStatuses,
  resolveAppAvailability,
} from './appAvailability.js';

describe('application availability contract', () => {
  it('maps managed API mounts without guessing unknown services', () => {
    expect(appForApiPath('/api/v1/academics/exams/')).toBe('academics');
    expect(appForApiPath('/api/v1/rulebook/rules/')).toBe('compliance');
    expect(appForApiPath('/api/v1/crm/leads/')).toBeNull();
  });

  it('blocks a disabled app and degrades a composite when only one app is down', () => {
    const statuses = normalizeAppStatuses([
      { app: 'campaigns', status: 'disabled', warnings: ['turned off'] },
      { app: 'forms', status: 'up', warnings: [] },
    ]);
    expect(resolveAppAvailability('campaigns', statuses, { known: true }).status).toBe('disabled');
    expect(resolveAppAvailability(['campaigns', 'forms'], statuses, { known: true }).status).toBe('degraded');
  });

  it('does not falsely certify an app omitted by the backend registry', () => {
    const statuses = normalizeAppStatuses([{ app: 'academics', status: 'up' }]);
    expect(resolveAppAvailability('payroll', statuses, { known: true })).toMatchObject({
      known: false,
      status: 'unknown',
    });
  });

  it('recognizes the backend isolation response precisely', () => {
    expect(isServiceUnavailable({ status: 503, code: 'service_unavailable' })).toBe(true);
    expect(isServiceUnavailable({ status: 503, code: 'temporarily_unavailable' })).toBe(false);
  });
});
