import { describe, expect, it } from 'vitest';
import { isMissing, statusTone } from './resourcePresentation.js';

describe('resource presentation', () => {
  it('does not mistake negative status prefixes for successful states', () => {
    for (const value of ['unpaid', 'inactive', 'invalid', 'incomplete', 'unsent']) {
      expect(statusTone(value), value).toBe('danger');
    }
  });

  it('keeps transitional and successful states distinct', () => {
    expect(statusTone('partially_paid')).toBe('warn');
    expect(statusTone('pending_approval')).toBe('warn');
    expect(statusTone('paid')).toBe('success');
    expect(statusTone('active')).toBe('success');
  });

  it('treats nullish and empty API values as missing without hiding zero', () => {
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(null)).toBe(true);
    expect(isMissing('')).toBe(true);
    expect(isMissing(0)).toBe(false);
    expect(isMissing(false)).toBe(false);
  });
});
