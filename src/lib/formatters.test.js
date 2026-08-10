import { afterEach, describe, expect, it } from 'vitest';
import {
  businessFormatting,
  configureBusinessFormatting,
  formatBusinessMoney,
  formatBusinessNumber,
  formatGender,
  formatOrganizationDate,
  fractionToPercent,
  isValidDateInput,
  organizationDateInput,
  organizationDateTimeInput,
  resetBusinessFormatting,
  shiftDateInput,
  toFiniteBusinessNumber,
} from './formatters.js';

afterEach(() => resetBusinessFormatting());

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
    expect(formatBusinessMoney('9007199254740993.50', 'UZS'))
      .toContain('9,007,199,254,740,993.5');
    expect(formatBusinessMoney('9007199254740993.50', 'UZS'))
      .not.toContain('9,007,199,254,740,994');
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

  it('uses validated organization presentation defaults from the session bootstrap', () => {
    configureBusinessFormatting({
      organization_locale: 'de_DE',
      organization_timezone: 'Pacific/Kiritimati',
      primary_currency: 'EUR',
    });

    expect(businessFormatting()).toEqual({
      locale: 'de-DE',
      timeZone: 'Pacific/Kiritimati',
      currency: 'EUR',
    });
    expect(organizationDateInput(new Date('2026-07-31T11:30:00Z'))).toBe('2026-08-01');
    expect(organizationDateTimeInput('2026-08-01')).toBe('2026-08-01T00:00:00+14:00');
    expect(organizationDateTimeInput('2026-08-01', { endOfDay: true }))
      .toBe('2026-08-01T23:59:59+14:00');
    expect(formatBusinessMoney('1250.50')).toContain('EUR');
    expect(formatBusinessMoney('1250.50', 'UZS')).toContain('UZS');
  });

  it('falls back safely when bootstrap formatting values are malformed', () => {
    configureBusinessFormatting({
      organization_locale: 'not a locale!',
      organization_timezone: 'Outside/Reality',
      primary_currency: 'bad-value',
    });

    expect(businessFormatting()).toEqual({
      locale: 'en',
      timeZone: 'Asia/Tashkent',
      currency: 'UZS',
    });
    expect(() => formatOrganizationDate('2026-08-01T00:00:00Z')).not.toThrow();
  });

  it('uses the correct offset on both sides of an organization DST change', () => {
    configureBusinessFormatting({ organization_timezone: 'America/New_York' });

    expect(organizationDateTimeInput('2026-03-08'))
      .toBe('2026-03-08T00:00:00-05:00');
    expect(organizationDateTimeInput('2026-03-08', { endOfDay: true }))
      .toBe('2026-03-08T23:59:59-04:00');
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
