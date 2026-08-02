import { describe, expect, it } from 'vitest';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatGender,
  formatOrganizationDate,
  fractionToPercent,
  isValidDateInput,
  organizationDateInput,
  shiftDateInput,
  toFiniteBusinessNumber,
} from './formatters.js';

describe('executive format contracts', () => {
  it('accepts fraction boundaries and rejects percent-shaped values', () => {
    expect(fractionToPercent(0)).toBe(0);
    expect(fractionToPercent(1)).toBe(100);
    expect(fractionToPercent(100)).toBeNull();
    expect(fractionToPercent(null)).toBeNull();
    expect(fractionToPercent('')).toBeNull();
    expect(fractionToPercent(undefined)).toBeNull();
    expect(fractionToPercent(false)).toBeNull();
    expect(fractionToPercent(true)).toBeNull();
  });

  it('never coerces booleans or non-scalar values into business quantities', () => {
    expect(toFiniteBusinessNumber(false)).toBeNull();
    expect(toFiniteBusinessNumber(true)).toBeNull();
    expect(toFiniteBusinessNumber([])).toBeNull();
    expect(toFiniteBusinessNumber('   ')).toBeNull();
    expect(formatBusinessNumber(false)).toBe('');
    expect(formatBusinessNumber(true)).toBe('');
    expect(formatBusinessNumber('12.5')).toBe('12.5');
  });

  it('formats large integer money without binary rounding', () => {
    expect(formatBusinessMoney('9007199254740993', 'UZS'))
      .toContain('9,007,199,254,740,993');
  });

  it('keeps date-only values on their written calendar day', () => {
    expect(formatOrganizationDate('2026-07-31', { dateOnly: true }))
      .toContain('Jul 31, 2026');
  });

  it('turns stored gender codes into readable labels', () => {
    expect(formatGender('f')).toBe('Female');
    expect(formatGender('m')).toBe('Male');
    expect(formatGender('')).toBe('');
  });

  it('derives date inputs in the organization timezone instead of UTC', () => {
    expect(organizationDateInput(new Date('2026-07-31T23:30:00Z'))).toBe('2026-08-01');
    expect(shiftDateInput('2026-08-01', -29)).toBe('2026-07-03');
  });

  it('rejects impossible calendar inputs before shifting them', () => {
    expect(isValidDateInput('2024-02-29')).toBe(true);
    expect(isValidDateInput('2026-02-29')).toBe(false);
    expect(isValidDateInput('2026-02-31')).toBe(false);
    expect(isValidDateInput('2026-99-99')).toBe(false);
    expect(isValidDateInput('0000-01-01')).toBe(false);
    expect(() => shiftDateInput('2026-99-99', -29)).not.toThrow();
    expect(shiftDateInput('2026-99-99', -29)).toBe('');
  });
});
