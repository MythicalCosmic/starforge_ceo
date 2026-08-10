import { formatBusinessMoney, formatBusinessNumber } from './formatters.js';

function finite(value) {
  if (value == null || (typeof value !== 'string' && typeof value !== 'number')) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  if (typeof normalized === 'string' && !/^[+]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function money(value) {
  return formatBusinessMoney(value, 'UZS') || '—';
}

function readable(state) {
  return Boolean(state && !state.pending && !state.error && !state.paused && state.data !== null);
}

function completeSum(rows, getter) {
  let total = 0;
  for (const row of rows) {
    const value = finite(getter(row));
    if (value == null) return null;
    total += value;
  }
  return total;
}

function invoiceAllocated(invoice) {
  if (!Array.isArray(invoice?.allocations)) return null;
  return completeSum(invoice.allocations, (row) => row?.amount_uzs ?? row?.amount);
}

function invoiceBalance(invoice) {
  if (invoice?.outstanding_uzs !== undefined && invoice?.outstanding_uzs !== null && invoice?.outstanding_uzs !== '') {
    const supplied = finite(invoice.outstanding_uzs);
    return supplied == null ? null : Math.max(0, supplied);
  }
  const total = finite(invoice?.total_uzs);
  const allocated = invoiceAllocated(invoice);
  return total == null || allocated == null || allocated > total ? null : total - allocated;
}

function unavailableBrief() {
  return {
    headline: 'Finance information is temporarily unavailable',
    body: 'Billing and collection records could not be verified in the current view, so I cannot state a financial position.',
    bullets: ['No zero or complete conclusion is drawn while the supporting information is unavailable.'],
    actions: [{ label: 'Review finance', to: 'finance/overview' }],
  };
}

export function financeBrief(context) {
  const invoiceReady = readable(context.invoices);
  const paymentReady = readable(context.payments);
  if (!invoiceReady && !paymentReady) return unavailableBrief();

  const invoiceStates = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'];
  const paymentStates = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'];
  const invoiceLifecycleComplete = invoiceReady && context.invoices.rows.every((item) => invoiceStates.includes(typeof item.status === 'string' ? item.status.trim().toLowerCase() : ''));
  const paymentLifecycleComplete = paymentReady && context.payments.rows.every((item) => paymentStates.includes(typeof item.status === 'string' ? item.status.trim().toLowerCase() : ''));
  const invoices = invoiceLifecycleComplete ? context.invoices.rows
    .filter((item) => ['issued', 'partially_paid', 'paid', 'overdue'].includes(item.status.trim().toLowerCase())) : [];
  const completedPayments = paymentLifecycleComplete ? context.payments.rows
    .filter((item) => item.status.trim().toLowerCase() === 'completed') : [];
  const billedEvidence = invoiceLifecycleComplete ? completeSum(invoices, (item) => item?.total_uzs) : null;
  const balances = invoiceLifecycleComplete ? invoices.map((item) => invoiceBalance(item)) : [];
  const balanceEvidence = invoiceLifecycleComplete && balances.every((value) => value != null)
    ? balances.reduce((sum, value) => sum + value, 0)
    : null;
  const collectedEvidence = paymentLifecycleComplete ? completeSum(completedPayments, (item) => item?.amount_uzs) : null;
  const invoiceCoverageComplete = invoiceReady && context.invoices.complete;
  const paymentCoverageComplete = paymentReady && context.payments.complete;
  const billed = invoiceCoverageComplete ? billedEvidence : null;
  const outstanding = invoiceCoverageComplete ? balanceEvidence : null;
  const collected = paymentCoverageComplete ? collectedEvidence : null;
  const outstandingRows = invoiceCoverageComplete && balanceEvidence != null
    ? invoices.filter((item, index) => balances[index] > 0)
    : null;
  const invoiceLifecycleIncomplete = invoiceReady && !invoiceLifecycleComplete;
  const paymentLifecycleIncomplete = paymentReady && !paymentLifecycleComplete;
  const invoiceAmountIncomplete = invoiceReady && invoiceLifecycleComplete && (billedEvidence == null || balanceEvidence == null);
  const paymentAmountIncomplete = paymentReady && paymentLifecycleComplete && collectedEvidence == null;
  const amountEvidenceIncomplete = invoiceAmountIncomplete || paymentAmountIncomplete || invoiceLifecycleIncomplete || paymentLifecycleIncomplete;
  const body = [];

  if (!invoiceReady) {
    body.push('Collection information is visible, but the invoice register is unavailable, so billed value and outstanding exposure remain unstated.');
  } else {
    if (invoiceLifecycleIncomplete) {
      body.push('Invoice lifecycle evidence is incomplete, so billed value remains unstated.');
    } else if (billedEvidence == null) {
      body.push('Issued invoice amount evidence is incomplete, so billed value remains unstated.');
    } else if (!invoiceCoverageComplete) {
      body.push('The invoice register is partial, so issued billing remains unstated.');
    } else {
      body.push(`${money(billed)} is represented by issued invoices in the loaded register.`);
    }

    if (invoiceLifecycleIncomplete) {
      body.push('Invoice lifecycle evidence is incomplete, so outstanding exposure and the open-invoice count remain unstated.');
    } else if (balanceEvidence == null) {
      body.push('Invoice balance or allocation amount evidence is incomplete, so outstanding exposure and the open-invoice count remain unstated.');
    } else if (!invoiceCoverageComplete) {
      body.push('The invoice register is partial, so outstanding exposure and the open-invoice count remain unstated.');
    } else {
      body.push(`${money(outstanding)} remains after recorded payment allocations.`);
    }
  }

  if (!paymentReady) {
    body.push('The payment register is unavailable, so completed collections remain unstated.');
  } else if (paymentLifecycleIncomplete) {
    body.push('Payment lifecycle evidence is incomplete, so completed collections remain unstated.');
  } else if (collectedEvidence == null) {
    body.push('Completed payment amount evidence is incomplete, so collected value remains unstated.');
  } else if (!paymentCoverageComplete) {
    body.push('The payment register is partial, so completed collections remain unstated.');
  } else {
    body.push(`${money(collected)} is represented by completed payments in the loaded register.`);
  }

  const bullets = [];
  if (invoiceAmountIncomplete || paymentAmountIncomplete) {
    bullets.push('One or more required money amounts are missing or invalid; no zero has been inferred for affected measures.');
  }
  if (invoiceLifecycleIncomplete || paymentLifecycleIncomplete) {
    bullets.push('One or more lifecycle states are missing or invalid; affected finance conclusions remain unstated.');
  }
  bullets.push(invoiceReady && paymentReady && context.invoices.complete && context.payments.complete
    ? 'The register rows cover the complete current result set; any field-level gaps are called out separately.'
    : 'This is a partial or temporarily incomplete view; use the Finance report export for an authoritative period close.');

  return {
    headline: 'Collections and exposure',
    body: body.join(' '),
    metrics: [
      { label: 'Issued billing', value: money(billed) },
      { label: 'Completed collections', value: money(collected) },
      { label: 'Open invoices', value: outstandingRows == null ? '—' : formatBusinessNumber(outstandingRows.length) },
    ],
    bullets,
    actions: [{ label: 'Review finance', to: 'finance/overview' }, { label: 'Open invoices', to: 'finance/invoices' }],
    amountEvidenceIncomplete,
  };
}
