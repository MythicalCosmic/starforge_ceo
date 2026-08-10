import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceMode = vi.hoisted(() => ({ failed: false, aiFailed: false }));
const workspaceCalls = vi.hoisted(() => []);

vi.mock('../hooks/useWorkspaceData.js', () => ({
  useWorkspaceData(path, params, options = {}) {
    workspaceCalls.push({ path, params, enabled: options.enabled ?? true });
    if (workspaceMode.failed && ['/api/v1/students/', '/api/v1/finance/invoices/'].includes(path)) {
      return { data: null, rows: [], total: 0, pending: false, error: { status: 503 }, paused: false, complete: false };
    }
    if (workspaceMode.aiFailed && path === '/api/v1/ai/requests/') {
      return { data: null, rows: [], total: 0, pending: false, error: { status: 503, code: 'service_unavailable' }, paused: false, complete: false, retry: vi.fn() };
    }
    const rowsByPath = {
      '/api/v1/org/branches/': [{ id: 2, name: 'North Branch' }],
      '/api/v1/students/': [{ id: 44, full_name: 'Mohira Olimova', branch: 2 }],
      '/api/v1/teachers/': [{ id: 7, full_name: 'Jasur Tursunov', branch: 2 }],
      '/api/v1/cohorts/': [{ id: 12, name: 'North Stars', branch: 2 }],
      '/api/v1/finance/invoices/': [],
      '/api/v1/payments/': [],
      '/api/v1/intelligence/risk/': [],
    };
    const rows = rowsByPath[path] || [];
    return { data: { count: rows.length, results: rows }, rows, total: rows.length, pending: false, error: null, paused: false, complete: true };
  },
}));

import { financeBrief } from '../lib/starAIFinanceBrief.js';
import { createLeadershipReply, StarAIPage } from './StarAIWorkspace.jsx';

function register(rows, complete = true) {
  return {
    data: { count: rows.length, results: rows },
    rows,
    total: rows.length,
    pending: false,
    error: null,
    paused: false,
    complete,
  };
}

function financeContext({ invoices = [], payments = [], invoicesComplete = true, paymentsComplete = true } = {}) {
  return {
    invoices: register(invoices, invoicesComplete),
    payments: register(payments, paymentsComplete),
  };
}

function metric(brief, label) {
  return brief.metrics.find((item) => item.label === label)?.value;
}

function leadershipContext(overrides = {}) {
  return {
    branches: register([{ id: 2, name: 'North Branch' }]),
    students: register([{ id: 44, branch: 2 }]),
    teachers: register([{ id: 7, branch: 2, full_name: 'Jasur Tursunov' }]),
    cohorts: register([{ id: 12, branch: 2, primary_teacher: 7 }]),
    invoices: register([]),
    payments: register([]),
    risks: register([]),
    ...overrides,
  };
}

describe('StarAI verified briefing layout', () => {
  beforeEach(() => {
    workspaceMode.failed = false;
    workspaceMode.aiFailed = false;
    workspaceCalls.length = 0;
  });

  it('uses bounded evidence briefings instead of pretending to be a free-form chat', () => {
    const html = renderToStaticMarkup(<StarAIPage user={{ id: 1, username: 'admin' }} onNav={vi.fn()} />);

    expect(html).toContain('ai-brief-workspace');
    expect(html).toContain('Truthful by design');
    expect(html).toContain('Verified leadership brief');
    expect(html).toContain('3 people and group records loaded');
    expect(html).not.toContain('role="log"');
    expect(html).not.toContain('ai-composer');
    expect(html).not.toContain('ai-history');
    expect(html).not.toContain('class="fw-head"');
  });

  it('marks unavailable evidence as partial instead of presenting confident zeroes', () => {
    workspaceMode.failed = true;
    const html = renderToStaticMarkup(<StarAIPage user={{ id: 1, username: 'admin' }} onNav={vi.fn()} />);

    expect(html).toContain('partial coverage');
    expect(html).toContain('<dt>Students</dt><dd>—</dd>');
    expect(html).toContain('<dt>Invoices loaded</dt><dd>—</dd>');
    expect(html).not.toContain('0 people and group records ready');
  });

  it('closes the briefing surface when the backend AI app is disabled', () => {
    workspaceMode.aiFailed = true;
    const html = renderToStaticMarkup(<StarAIPage user={{ id: 1, username: 'admin' }} onNav={vi.fn()} />);

    expect(html).toContain('StarAI is turned off');
    expect(html).toContain('No records were requested and no changes were made');
    expect(html).not.toContain('What needs a closer look?');
  });

  it('does not request leadership registers outside the exact permission set', () => {
    renderToStaticMarkup(
      <StarAIPage
        user={{
          id: 4,
          username: 'scoped-manager',
          effective_permissions: ['ai:read', 'students:read'],
        }}
        onNav={vi.fn()}
      />,
    );

    const enabledByPath = Object.fromEntries(
      workspaceCalls.map((call) => [call.path, call.enabled]),
    );
    expect(enabledByPath['/api/v1/students/']).toBe(true);
    expect(enabledByPath['/api/v1/org/branches/']).toBe(false);
    expect(enabledByPath['/api/v1/teachers/']).toBe(false);
    expect(enabledByPath['/api/v1/cohorts/']).toBe(false);
    expect(enabledByPath['/api/v1/finance/invoices/']).toBe(false);
    expect(enabledByPath['/api/v1/payments/']).toBe(false);
    expect(enabledByPath['/api/v1/intelligence/risk/']).toBe(false);
    expect(enabledByPath['/api/v1/ai/requests/']).toBe(true);
  });

  it('leaves issued billing unstated when an invoice total is missing', () => {
    const brief = financeBrief(financeContext({
      invoices: [{
        id: 71,
        status: 'issued',
        total_uzs: null,
        outstanding_uzs: '450000',
        allocations: [],
      }],
    }));

    expect(metric(brief, 'Issued billing')).toBe('—');
    expect(metric(brief, 'Open invoices')).toBe('1');
    expect(brief.body).toContain('Issued invoice amount evidence is incomplete');
    expect(brief.body).not.toContain('UZS 0 is represented by issued invoices');
    expect(brief.bullets).toContain('One or more required money amounts are missing or invalid; no zero has been inferred for affected measures.');
  });

  it('does not infer a zero balance or open-invoice count from invalid allocations', () => {
    const brief = financeBrief(financeContext({
      invoices: [{
        id: 72,
        status: 'partially_paid',
        total_uzs: '900000',
        allocations: [{ amount_uzs: 'not-a-number' }],
      }],
    }));

    expect(metric(brief, 'Issued billing')).not.toBe('—');
    expect(metric(brief, 'Open invoices')).toBe('—');
    expect(brief.body).toContain('Invoice balance or allocation amount evidence is incomplete');
    expect(brief.body).not.toContain('UZS 0 remains after recorded payment allocations');
  });

  it('leaves collections unstated when a completed payment amount is missing', () => {
    const brief = financeBrief(financeContext({
      payments: [{ id: 73, status: 'completed', amount_uzs: null }],
    }));

    expect(metric(brief, 'Completed collections')).toBe('—');
    expect(brief.body).toContain('Completed payment amount evidence is incomplete');
    expect(brief.body).not.toContain('UZS 0 is represented by completed payments');
  });

  it('preserves verified zeroes but withholds totals from capped registers', () => {
    const zeroBrief = financeBrief(financeContext({
      invoices: [{ id: 74, status: 'issued', total_uzs: '0', outstanding_uzs: '0', allocations: [] }],
      payments: [{ id: 75, status: 'completed', amount_uzs: 0 }],
    }));

    expect(metric(zeroBrief, 'Issued billing')).not.toBe('—');
    expect(metric(zeroBrief, 'Completed collections')).not.toBe('—');
    expect(metric(zeroBrief, 'Open invoices')).toBe('0');
    expect(zeroBrief.amountEvidenceIncomplete).toBe(false);

    const partialBrief = financeBrief(financeContext({
      invoices: [{ id: 76, status: 'issued', total_uzs: '900000', outstanding_uzs: '900000', allocations: [] }],
      payments: [{ id: 77, status: 'completed', amount_uzs: '400000' }],
      invoicesComplete: false,
      paymentsComplete: false,
    }));

    expect(metric(partialBrief, 'Issued billing')).toBe('—');
    expect(metric(partialBrief, 'Completed collections')).toBe('—');
    expect(metric(partialBrief, 'Open invoices')).toBe('—');
    expect(partialBrief.body).toContain('invoice register is partial');
    expect(partialBrief.body).toContain('payment register is partial');
  });

  it('rejects boolean, negative, and overallocated finance evidence', () => {
    const brief = financeBrief(financeContext({
      invoices: [
        { id: 78, status: 'issued', total_uzs: true, outstanding_uzs: false, allocations: [] },
        { id: 79, status: 'issued', total_uzs: '100', allocations: [{ amount_uzs: '150' }] },
      ],
      payments: [{ id: 80, status: 'completed', amount_uzs: '-1' }],
    }));

    expect(metric(brief, 'Issued billing')).toBe('—');
    expect(metric(brief, 'Completed collections')).toBe('—');
    expect(metric(brief, 'Open invoices')).toBe('—');
    expect(brief.bullets).toContain('One or more required money amounts are missing or invalid; no zero has been inferred for affected measures.');
    expect(brief.body).not.toContain('UZS\u00a00 remains');
  });

  it('does not infer zeroes when finance lifecycle states are malformed', () => {
    const brief = financeBrief(financeContext({
      invoices: [{ id: 81, status: { raw: 'issued' }, total_uzs: '100', outstanding_uzs: '100', allocations: [] }],
      payments: [{ id: 82, status: null, amount_uzs: '100' }],
    }));

    expect(metric(brief, 'Issued billing')).toBe('—');
    expect(metric(brief, 'Completed collections')).toBe('—');
    expect(metric(brief, 'Open invoices')).toBe('—');
    expect(brief.body).toContain('Invoice lifecycle evidence is incomplete');
    expect(brief.body).toContain('Payment lifecycle evidence is incomplete');
    expect(brief.bullets).toContain('One or more lifecycle states are missing or invalid; affected finance conclusions remain unstated.');
  });

  it('does not rank teacher workload or clear risk signals from partial registers', () => {
    const teacherReply = createLeadershipReply('teacher capacity', leadershipContext({ cohorts: register([], false) }), '', '');
    const riskReply = createLeadershipReply('student risks', leadershipContext({ risks: register([], false) }), '', '');

    expect(teacherReply.headline).toBe('Teaching capacity cannot be ranked yet');
    expect(teacherReply.body).toContain('partial or unavailable');
    expect(teacherReply.body).not.toContain('No teacher-to-group assignments');
    expect(riskReply.headline).toBe('Student attention signals are temporarily unavailable');
    expect(riskReply.body).toContain('cannot conclude that there are no student concerns');
    expect(riskReply.body).not.toContain('No student risk signals');
  });

  it('withholds branch ranking when ownership relationships or coverage are incomplete', () => {
    const missingOwnership = createLeadershipReply('compare branches', leadershipContext({
      students: register([{ id: 44, branch: null }]),
    }), '', '');
    const partialPeople = createLeadershipReply('compare branches', leadershipContext({
      students: register([{ id: 44, branch: 2 }], false),
    }), '', '');

    expect(missingOwnership.headline).toBe('Branch comparison needs clearer ownership');
    expect(missingOwnership.body).toContain('no branch is ranked');
    expect(partialPeople.headline).toBe('Branch comparison is temporarily unavailable');
    expect(partialPeople.body).toContain('partial or unavailable');
  });
});
