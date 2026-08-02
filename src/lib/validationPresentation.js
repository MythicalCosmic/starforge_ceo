const TECHNICAL_TEXT = /(?:traceback|exception|stack\s*trace|sql|database|postgres|django|\/api\/|syntax\s+error|select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from)/i;

export function readableFieldName(value) {
  const field = String(value || '').trim().replace(/[_-]+/g, ' ');
  if (!field) return 'Record';
  return field.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
}

export function readableValidationText(value, fallback = 'Review this value.') {
  if (typeof value !== 'string') return fallback;
  const message = value.replace(/\s+/g, ' ').trim();
  if (!message || message.length > 240 || TECHNICAL_TEXT.test(message)) return fallback;
  return message;
}

export function readableValidationDetails(error, { limit = 25 } = {}) {
  const errors = error?.errors;
  if (!errors || typeof errors !== 'object') return [];
  const rows = Array.isArray(errors.rows) ? errors.rows : null;
  if (rows) {
    return rows.slice(0, limit).map((row) => {
      const rowNumber = Number.isInteger(Number(row?.row)) && Number(row.row) > 0 ? Number(row.row) : '—';
      return `Row ${rowNumber}: ${readableValidationText(row?.error, 'Review this result row.')}`;
    });
  }
  return Object.entries(errors).flatMap(([field, value]) => {
    const messages = Array.isArray(value) ? value : [value];
    return messages.slice(0, 5).map((message) => `${readableFieldName(field)}: ${readableValidationText(message)}`);
  }).slice(0, limit);
}
