export function isMissing(value) {
  return value === undefined || value === null || value === '';
}

export function statusTone(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const tokens = new Set(normalized.split('_').filter(Boolean));
  const hasToken = (words) => words.some((word) => tokens.has(word));

  // Negative and transitional states take precedence so "unpaid" cannot be
  // mistaken for "paid", or "incomplete" for "complete".
  if (
    (normalized.startsWith('not_') && normalized !== 'not_applicable') ||
    hasToken([
      'absent',
      'blocked',
      'cancelled',
      'canceled',
      'denied',
      'disabled',
      'error',
      'expired',
      'failed',
      'failure',
      'high',
      'inactive',
      'incomplete',
      'invalid',
      'overdue',
      'rejected',
      'revoked',
      'unpaid',
      'unsent',
    ])
  ) {
    return 'danger';
  }
  if (
    hasToken([
      'awaiting',
      'draft',
      'medium',
      'partial',
      'partially',
      'pending',
      'processing',
      'queued',
      'review',
      'scheduled',
      'watch',
      'warning',
    ]) ||
    normalized === 'in_progress'
  ) {
    return 'warn';
  }
  if (
    hasToken([
      'active',
      'approved',
      'complete',
      'completed',
      'done',
      'good',
      'paid',
      'present',
      'published',
      'sent',
      'success',
      'valid',
    ])
  ) {
    return 'success';
  }
  return 'primary';
}
