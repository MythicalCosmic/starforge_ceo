export const DISPLAY_LOCALE = 'en';
export const ORGANIZATION_TIME_ZONE = 'Asia/Tashkent';
const PRIMARY_CURRENCY = 'UZS';

const DEFAULT_FORMATTING = Object.freeze({
  locale: DISPLAY_LOCALE,
  timeZone: ORGANIZATION_TIME_ZONE,
  currency: PRIMARY_CURRENCY,
});

let activeFormatting = { ...DEFAULT_FORMATTING };

function supportedLocale(value) {
  const candidate = String(value || '').trim().replaceAll('_', '-');
  if (!candidate || candidate.length > 35) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(candidate);
    return canonical || null;
  } catch {
    return null;
  }
}

function supportedTimeZone(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return null;
  }
}

function supportedCurrency(value) {
  const candidate = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(candidate)) return null;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: candidate }).format(0);
    return candidate;
  } catch {
    return null;
  }
}

// /users/me/ is the authoritative source for organization presentation
// defaults. Invalid or absent values fail safely to the release defaults so a
// damaged bootstrap cannot crash every date or money value in the workspace.
export function configureBusinessFormatting(profile = {}) {
  activeFormatting = {
    locale: supportedLocale(profile.organization_locale) || DEFAULT_FORMATTING.locale,
    timeZone: supportedTimeZone(profile.organization_timezone) || DEFAULT_FORMATTING.timeZone,
    currency: supportedCurrency(profile.primary_currency) || DEFAULT_FORMATTING.currency,
  };
  return businessFormatting();
}

export function resetBusinessFormatting() {
  activeFormatting = { ...DEFAULT_FORMATTING };
}

export function businessFormatting() {
  return { ...activeFormatting };
}

export function formatOrganizationDate(value, { dateOnly = false } = {}) {
  if (!value) return '';
  const isoDate = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const parsed = new Date(isoDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(activeFormatting.locale, isoDate
    ? { dateStyle: 'medium', timeZone: 'UTC' }
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: activeFormatting.timeZone,
        timeZoneName: 'short',
      }).format(parsed);
}

export function formatOrganizationTime(value, { includeTimeZone = true } = {}) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(activeFormatting.locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: activeFormatting.timeZone,
    ...(includeTimeZone ? { timeZoneName: 'short' } : {}),
  }).format(parsed);
}

export function organizationHour(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const hour = new Intl.DateTimeFormat(activeFormatting.locale, {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: activeFormatting.timeZone,
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
    timeZone: activeFormatting.timeZone,
  }).formatToParts(parsed);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function zonedParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: activeFormatting.timeZone,
  }).formatToParts(value);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

// Produce an explicit ISO offset for API endpoints that accept datetimes rather
// than organization-calendar dates. The small convergence loop handles DST and
// non-whole-hour zones without borrowing the travelling browser's timezone.
export function organizationDateTimeInput(isoDate, { endOfDay = false } = {}) {
  if (!isValidDateInput(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const desired = {
    year,
    month,
    day,
    hour: endOfDay ? 23 : 0,
    minute: endOfDay ? 59 : 0,
    second: endOfDay ? 59 : 0,
  };
  const desiredUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  let instant = desiredUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const visible = zonedParts(new Date(instant));
    const visibleUtc = Date.UTC(
      visible.year,
      visible.month - 1,
      visible.day,
      visible.hour,
      visible.minute,
      visible.second,
    );
    const adjustment = desiredUtc - visibleUtc;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  const resolved = zonedParts(new Date(instant));
  if (Object.keys(desired).some((key) => desired[key] !== resolved[key])) return '';
  const offsetMinutes = (desiredUtc - instant) / 60_000;
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) return '';
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${isoDate}T${time}${offset}`;
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
  return new Intl.NumberFormat(activeFormatting.locale, options).format(number);
}

export function formatBusinessMoney(value, currency = activeFormatting.currency) {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return '';
  const resolvedCurrency = supportedCurrency(currency);
  if (!resolvedCurrency) return '';
  const formatter = new Intl.NumberFormat(activeFormatting.locale, {
    style: 'currency',
    currency: resolvedCurrency,
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  // ECMA-402 accepts a decimal string as an exact mathematical value. Keeping
  // it as a string avoids the IEEE-754 rounding that would corrupt valid
  // backend Decimal values above Number.MAX_SAFE_INTEGER.
  try {
    return formatter.format(raw);
  } catch {
    return '';
  }
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
