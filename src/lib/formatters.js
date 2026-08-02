export const DISPLAY_LOCALE = 'en';
// The pinned backend release operates in this zone. The bootstrap contract now
// requests an organization_timezone field so this can become tenant-specific.
export const ORGANIZATION_TIME_ZONE = 'Asia/Tashkent';

export function formatOrganizationDate(value, { dateOnly = false } = {}) {
  if (!value) return '';
  const isoDate = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const parsed = new Date(isoDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, isoDate
    ? { dateStyle: 'medium', timeZone: 'UTC' }
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: ORGANIZATION_TIME_ZONE,
        timeZoneName: 'short',
      }).format(parsed);
}

export function formatOrganizationTime(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ORGANIZATION_TIME_ZONE,
    timeZoneName: 'short',
  }).format(parsed);
}

export function organizationHour(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const hour = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: ORGANIZATION_TIME_ZONE,
  }).formatToParts(parsed).find((part) => part.type === 'hour')?.value;
  const numeric = Number(hour);
  return Number.isInteger(numeric) ? numeric : null;
}

export function organizationDateInput(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: ORGANIZATION_TIME_ZONE,
  }).formatToParts(parsed);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isValidDateInput(value) {
  const input = String(value || '');
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const parsed = new Date(`${input}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === input;
}

export function shiftDateInput(isoDate, amount) {
  if (!isValidDateInput(isoDate) || !Number.isInteger(amount)) return '';
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  if (!Number.isFinite(parsed.getTime())) return '';
  const shifted = parsed.toISOString().slice(0, 10);
  return isValidDateInput(shifted) ? shifted : '';
}

export function toFiniteBusinessNumber(value) {
  if (typeof value === 'boolean' || value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function formatBusinessNumber(value, options = {}) {
  const number = toFiniteBusinessNumber(value);
  if (number == null) return '';
  return new Intl.NumberFormat(DISPLAY_LOCALE, options).format(number);
}

export function formatBusinessMoney(value, currency = 'UZS') {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return '';
  const formatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (/^[+-]?\d+$/.test(raw)) {
    try {
      return formatter.format(BigInt(raw));
    } catch {
      // Older engines can still format the safe numeric representation below.
    }
  }
  const number = Number(raw);
  return Number.isFinite(number) ? formatter.format(number) : '';
}

export function fractionToPercent(value) {
  const number = toFiniteBusinessNumber(value);
  if (number == null || number < 0 || number > 1) return null;
  return number * 100;
}

export function formatGender(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'Male';
  if (normalized === 'f' || normalized === 'female') return 'Female';
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}
