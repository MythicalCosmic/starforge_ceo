import { describe, expect, it } from 'vitest';
import {
  groupCapabilities,
  normalizeCapabilityCodes,
  presentCapability,
} from './capabilityPresentation.js';

describe('capability presentation', () => {
  it('turns backend capability codes into plain-language, grouped actions', () => {
    const groups = groupCapabilities([
      'approvals:disburse',
      'approvals:read',
      'compensation:disburse',
      'finance:read',
      'ledger:read',
      'loan:collect',
      'notifications:read',
      'payments:write',
      'procurement:read',
      'sale:refund',
      'tasks:read',
      'wallet:write',
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'Finance & accounting',
      'Approvals & purchasing',
      'Sales & refunds',
      'Payroll & staff support',
      'Tasks & operations',
      'Communication',
    ]);
    expect(groups.flatMap((group) => group.items).map((item) => item.title)).toEqual(expect.arrayContaining([
      'Release approved payouts',
      'Release payroll payments',
      'Record loan repayments',
      'Issue sale refunds',
      'Manage student wallet balances',
      'View financial records',
    ]));
  });

  it('deduplicates codes and gives future backend resources a readable fallback', () => {
    expect(normalizeCapabilityCodes(['rooms:archive', 'rooms:archive', '', null])).toEqual(['rooms:archive']);
    expect(presentCapability('rooms:archive')).toMatchObject({
      title: 'Archive rooms',
      description: 'Can perform this supported action for rooms.',
      areaLabel: 'Additional access',
    });
  });

  it('explains protected owner access without exposing the wildcard as the main label', () => {
    expect(presentCapability('*:*')).toMatchObject({
      title: 'Full organization access',
      areaLabel: 'Organization & access',
    });
  });
});
