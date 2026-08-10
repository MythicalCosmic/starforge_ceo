import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requests,
  summaryPending,
  summaryError,
  detailError,
  partialDetail,
  emptyAttendance,
  invalidMoney,
  branchesPending,
  branchesCapped,
  incompleteSnapshotAttendance,
  missingAllocations,
  unmappedBranchInvoice,
  cohortsCapped,
  wrongSnapshotCurrency,
  invalidSnapshotRate,
} = vi.hoisted(() => ({
  requests: [],
  summaryPending: { value: false },
  summaryError: { value: false },
  detailError: { value: false },
  partialDetail: { value: false },
  emptyAttendance: { value: false },
  invalidMoney: { value: false },
  branchesPending: { value: false },
  branchesCapped: { value: false },
  incompleteSnapshotAttendance: { value: false },
  missingAllocations: { value: false },
  unmappedBranchInvoice: { value: false },
  cohortsCapped: { value: false },
  wrongSnapshotCurrency: { value: false },
  invalidSnapshotRate: { value: false },
}));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path, params, options = {}) {
    requests.push({ path, params, options });
    const records = {
      '/api/v1/org/branches/': [{ id: 2, name: 'Central Campus' }],
      '/api/v1/org/branches/3/': [{ id: 3, name: 'Riverside Campus' }],
      '/api/v1/teachers/': [{ id: 9, full_name: 'Dilshod Rahimov', branch: 2 }],
      '/api/v1/cohorts/': [{ id: 11, name: 'North Stars', branch: 2, capacity: 20, primary_teacher: 9 }],
      '/api/v1/students/': [{ id: 44, status: 'active', branch: 2, current_cohort: 11, location: 'Tashkent' }],
      '/api/v1/attendance/records/': incompleteSnapshotAttendance.value
        ? [...Array.from({ length: 9 }, (_, index) => ({ id: index + 1, cohort: 11, status: 'present' })), { id: 10, cohort: 11, status: 'absent' }]
        : [],
      '/api/v1/finance/invoices/': invalidMoney.value
        ? [{ id: 71, status: 'issued', issue_date: '2026-07-01', cohort: 11, allocations: [] }]
        : wrongSnapshotCurrency.value
          ? [{ id: 76, status: 'issued', issue_date: '2026-07-01', cohort: 11, total_uzs: '1000', allocations: [] }]
        : missingAllocations.value
          ? [{ id: 74, status: 'issued', issue_date: '2026-07-01', cohort: 11, total_uzs: '1000' }]
          : unmappedBranchInvoice.value
            ? [{ id: 75, status: 'issued', issue_date: '2026-07-01', cohort: 120, total_uzs: '1000', outstanding_uzs: '1000' }]
            : [],
      '/api/v1/payments/': invalidMoney.value ? [{ id: 72, status: 'completed', paid_at: '2026-07-02' }] : [],
      '/api/v1/finance/expenses/': invalidMoney.value ? [{ id: 73, status: 'paid', created_at: '2026-07-03' }] : [],
    };
    const executive = {
      students: { total: 500, active: 486, blocked: 8, ungrouped: 35 },
      attendance: emptyAttendance.value
        ? { denominator: 0, attendance_rate_fraction: 0 }
        : invalidSnapshotRate.value
          ? { denominator: 450, attendance_rate_fraction: 2 }
        : incompleteSnapshotAttendance.value
          ? { denominator: 500, attendance_rate_fraction: null }
          : { denominator: 450, attendance_rate_fraction: 0.906 },
      finance: {
        billed: wrongSnapshotCurrency.value
          ? { amount_minor: 125_000_000, currency: 'USD' }
          : { amount_minor: 125_000_000, currency: 'UZS' },
        collected: { amount_minor: 100_000_000, currency: 'UZS' },
        outstanding_for_invoices_issued_in_window: { amount_minor: 25_000_000, currency: 'UZS' },
        overdue_invoice_count: 4,
        paid_expense: { amount_minor: 10_000_000, currency: 'UZS' },
      },
      warnings: [],
    };
    const rows = records[path] || [];
    const isSummary = path === '/api/v1/intelligence/executive-summary/';
    const isExact = /^\/api\/v1\/(?:org\/branches|teachers)\/\d+\/$/.test(path);
    const isPendingDirectory = path.startsWith('/api/v1/org/branches/') && branchesPending.value;
    const exactMissing = isExact && options.enabled && !rows.length && !isPendingDirectory;
    const detailPaths = [
      '/api/v1/students/',
      '/api/v1/finance/invoices/',
      '/api/v1/payments/',
      '/api/v1/finance/expenses/',
      '/api/v1/attendance/records/',
    ];
    const detailFailed = detailError.value && detailPaths.includes(path);
    const data = isPendingDirectory
      ? null
      : isSummary
      ? (summaryPending.value || summaryError.value ? null : executive)
      : detailFailed || exactMissing
        ? null
        : isExact ? rows[0] : { count: path === '/api/v1/org/branches/' && branchesCapped.value
          ? 150
          : path === '/api/v1/cohorts/' && cohortsCapped.value ? 150 : rows.length, results: rows };
    return {
      enabled: options.enabled ?? Boolean(path),
      data,
      rows: detailFailed || isPendingDirectory || isExact ? [] : rows,
      total: detailFailed || isPendingDirectory ? 0 : path === '/api/v1/org/branches/' && branchesCapped.value
        ? 150
        : path === '/api/v1/cohorts/' && cohortsCapped.value ? 150 : rows.length,
      pending: isPendingDirectory || (isSummary && summaryPending.value),
      loading: isPendingDirectory || (isSummary && summaryPending.value),
      paused: false,
      error: isSummary && summaryError.value
        ? { status: 404, message: 'Not available' }
        : detailFailed ? { status: 503, message: 'Unavailable' }
        : exactMissing ? { status: 404, message: 'Not found' } : null,
      complete: !detailFailed && !isPendingDirectory && !exactMissing &&
        !(path === '/api/v1/org/branches/' && branchesCapped.value) &&
        !(path === '/api/v1/cohorts/' && cohortsCapped.value) &&
        !(partialDetail.value && detailPaths.includes(path)),
      warnings: partialDetail.value && detailPaths.includes(path) ? ['More records exist'] : [],
      updatedAt: new Date('2026-08-02T00:00:00+05:00'),
      retry: vi.fn(),
    };
  },
}));

import { ExecutiveDashboardPage } from './ExecutiveDashboard.jsx';

describe('executive dashboard snapshot', () => {
  beforeEach(() => {
    requests.splice(0);
    summaryPending.value = false;
    summaryError.value = false;
    detailError.value = false;
    partialDetail.value = false;
    emptyAttendance.value = false;
    invalidMoney.value = false;
    branchesPending.value = false;
    branchesCapped.value = false;
    incompleteSnapshotAttendance.value = false;
    missingAllocations.value = false;
    unmappedBranchInvoice.value = false;
    cohortsCapped.value = false;
    wrongSnapshotCurrency.value = false;
    invalidSnapshotRate.value = false;
  });

  it('uses one exact snapshot for headline totals and avoids redundant money registers', () => {
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?range=custom&from=2026-05-01&to=2026-08-02&branch=2"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    );

    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    expect(summary.params).toEqual({ branch: '2', date_from: '2026-05-01', date_to: '2026-08-02' });
    expect(summary.options.enabled).toBe(true);
    const attendance = requests.find((request) => request.path === '/api/v1/attendance/records/');
    expect(attendance.params).toMatchObject({
      date_from: '2026-05-01T00:00:00+05:00',
      date_to: '2026-08-02T23:59:59+05:00',
    });
    ['/api/v1/students/stats/', '/api/v1/payments/', '/api/v1/finance/expenses/'].forEach((path) => {
      expect(requests.find((request) => request.path === path)?.options.enabled).toBe(false);
    });
    expect(html).toContain('486');
    expect(html).toContain('90.6%');
    expect(html).toContain('Exact management snapshot');
    expect(html).toContain('Headline student, attendance, and money totals share one permission-pruned management snapshot');
  });

  it('does not relabel the UZS ledger when the tenant presentation currency differs', () => {
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview"
        onNav={vi.fn()}
        user={{ first_name: 'Demo', primary_currency: 'EUR' }}
      />,
    );

    expect(html).toContain('Issued billing in view</span><strong>UZS\u00a01,250,000</strong>');
    expect(html).not.toContain('Issued billing in view</span><strong>EUR');
  });

  it('disables the organization snapshot when a teacher filter needs relationship-scoped detail', () => {
    renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?teacher=9"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    );

    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    expect(summary.options.enabled).toBe(false);
  });

  it('bounds shared custom links to the supported 366-day inclusive window', () => {
    renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?range=custom&from=2020-01-01&to=2026-08-02"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    );

    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    expect(summary.params.date_from).toBe('2025-08-02');
    expect(summary.params.date_to).toBe('2026-08-02');
  });

  it('rejects impossible custom dates before they reach any data request', () => {
    expect(() => renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?range=custom&from=2026-01-01&to=2026-99-99"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    )).not.toThrow();

    const serializedRequests = JSON.stringify(requests);
    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    expect(serializedRequests).not.toContain('2026-99-99');
    expect(summary.params.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.params.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to visible organization defaults for hostile preset and branch values', () => {
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?range=garbage&branch=garbage"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    );

    const serializedRequests = JSON.stringify(requests);
    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    const teachers = requests.find((request) => request.path === '/api/v1/teachers/');
    expect(serializedRequests).not.toContain('garbage');
    expect(summary.params.branch).toBeUndefined();
    expect(teachers.params.branch).toBeUndefined();
    expect(html).toContain('Last 90 days');
    expect(html).toContain('All branches');
  });

  it('does not start scoped reads before a direct branch selection is verified', () => {
    branchesPending.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage
        route="overview?branch=2"
        onNav={vi.fn()}
        user={{ first_name: 'Demo' }}
      />,
    );

    const teachers = requests.find((request) => request.path === '/api/v1/teachers/');
    expect(teachers.params.branch).toBeUndefined();
    expect(teachers.options.enabled).toBe(false);
    const exactBranch = requests.find((request) => request.path === '/api/v1/org/branches/2/');
    expect(exactBranch.options.enabled).toBe(true);
    requests.filter((request) => !['/api/v1/org/branches/', '/api/v1/org/branches/2/', '/api/v1/teachers/', ''].includes(request.path))
      .forEach((request) => expect(request.options.enabled).toBe(false));
    expect(JSON.stringify(requests)).not.toContain('"branch":"2"');
    expect(html).toContain('Checking selected branch…');
    expect(html).toContain('Verifying the selected branch and teacher');
    expect(html).not.toContain('Exact management snapshot');
  });

  it('verifies a valid selected branch outside the capped directory with an exact read', () => {
    branchesCapped.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview?branch=3" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(requests.find((request) => request.path === '/api/v1/org/branches/3/')?.options.enabled).toBe(true);
    const summary = requests.find((request) => request.path === '/api/v1/intelligence/executive-summary/');
    expect(summary.options.enabled).toBe(true);
    expect(summary.params.branch).toBe('3');
    expect(html).toContain('Riverside Campus');
    expect(html).not.toContain('Checking selected branch…');
  });

  it('defers row-heavy chart registers until the headline snapshot settles', () => {
    summaryPending.value = true;
    renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    const deferredPaths = [
      '/api/v1/students/',
      '/api/v1/students/comparison/',
      '/api/v1/intelligence/branches/',
      '/api/v1/intelligence/teachers/',
      '/api/v1/intelligence/risk/',
      '/api/v1/attendance/records/',
      '/api/v1/finance/invoices/',
    ];
    deferredPaths.forEach((path) => {
      expect(requests.find((request) => request.path === path)?.options.enabled).toBe(false);
    });
  });

  it('activates compatibility registers only when an older deployment lacks the snapshot', () => {
    summaryError.value = true;
    renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    ['/api/v1/students/stats/', '/api/v1/payments/', '/api/v1/finance/expenses/'].forEach((path) => {
      expect(requests.find((request) => request.path === path)?.options.enabled).toBe(true);
    });
  });

  it('never presents unavailable student or finance evidence as a confident zero', () => {
    summaryError.value = true;
    detailError.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Active students</span><strong>\u2014</strong>');
    expect(html).toContain('Issued billing in view</span><strong>\u2014</strong>');
    expect(html).toContain('Outstanding balance</span><strong>\u2014</strong>');
    expect(html).toContain('The consolidated invoice view is temporarily unavailable');
    expect(html).toContain('Attendance evidence is temporarily unavailable');
    expect(html).toContain('Billing-period detail is temporarily unavailable');
    expect(html).toContain('Student-to-group occupancy is temporarily unavailable');
    expect(html).toContain('Priority coverage is incomplete, so an all-clear cannot be confirmed.');
    expect(html).not.toContain('No priority exceptions are recorded');
    expect(html).not.toContain('Issued billing in view</span><strong>UZS\u00a00</strong>');
    expect(html).not.toContain('0 of 20 seats');
  });

  it('does not turn a zero-denominator attendance snapshot into zero percent', () => {
    emptyAttendance.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Visible attendance</span><strong>\u2014</strong>');
    expect(html).toContain('No non-excused marks are recorded in this range');
    expect(html).not.toContain('Visible attendance</span><strong>0%</strong>');
  });

  it('withholds an out-of-domain attendance fraction instead of showing 200 percent', () => {
    invalidSnapshotRate.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Visible attendance</span><strong>—</strong>');
    expect(html).toContain('The attendance rate is unavailable for 450 recorded outcomes');
    expect(html).not.toContain('Visible attendance</span><strong>200%');
  });

  it('never divides a loaded attendance numerator by an unrelated snapshot denominator', () => {
    incompleteSnapshotAttendance.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Visible attendance</span><strong>—</strong>');
    expect(html).toContain('The attendance rate is unavailable for 500 recorded outcomes');
    expect(html).toContain('Snapshot incomplete');
    expect(html).not.toContain('Visible attendance</span><strong>18%');
    expect(html).not.toContain('Visible attendance</span><strong>90%');
  });

  it('keeps branch-scoped invoices even when their cohort is outside a capped relationship page', () => {
    summaryError.value = true;
    cohortsCapped.value = true;
    unmappedBranchInvoice.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview?branch=2" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    const invoiceRequest = requests.find((request) => request.path === '/api/v1/finance/invoices/');
    expect(invoiceRequest.params.branch).toBe('2');
    expect(html).toContain('Issued billing in view</span><strong>UZS');
    expect(html).toContain('1,000');
    expect(html).toContain('Student-to-group occupancy coverage is incomplete');
    expect(html).not.toContain('Issued billing in view</span><strong>UZS\u00a00</strong>');
  });

  it('does not treat omitted invoice allocations as zero paid', () => {
    summaryError.value = true;
    missingAllocations.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Issued billing in view</span><strong>UZS');
    expect(html).toContain('Outstanding balance</span><strong>—</strong>');
    expect(html).not.toContain('Outstanding balance</span><strong>UZS\u00a01,000</strong>');
  });

  it('does not label a wrong-currency snapshot amount as exact UZS', () => {
    wrongSnapshotCurrency.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Issued billing in view</span><strong>UZS\u00a01,000</strong>');
    expect(html).toContain('Invoices issued in the selected reporting window</small><em>Complete current register</em>');
    expect(html).not.toContain('Issued billing in view</span><strong>UZS\u00a01,250,000</strong>');
  });

  it('does not infer zero money from records whose amounts are missing', () => {
    summaryError.value = true;
    invalidMoney.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Issued billing in view</span><strong>\u2014</strong>');
    expect(html).toContain('Outstanding balance</span><strong>\u2014</strong>');
    expect(html).toContain('Billing-period amounts are incomplete, so no zero-value trend has been inferred.');
    expect(html).not.toContain('Issued billing in view</span><strong>UZS\u00a00</strong>');
  });

  it('does not infer zero totals or zero-count charts from incomplete detail pages', () => {
    summaryError.value = true;
    partialDetail.value = true;
    const html = renderToStaticMarkup(
      <ExecutiveDashboardPage route="overview" onNav={vi.fn()} user={{ first_name: 'Demo' }} />,
    );

    expect(html).toContain('Issued billing in view</span><strong>\u2014</strong>');
    expect(html).toContain('Billing-period coverage is incomplete, so no zero-value trend has been inferred.');
    expect(html).toContain('Attendance coverage is incomplete, so zero-count group comparisons are not inferred.');
    expect(html).toContain('Priority coverage is incomplete, so an all-clear cannot be confirmed.');
    expect(html).not.toContain('No priority exceptions are recorded in the verified current view.');
    expect(html).not.toContain('Issued billing in view</span><strong>UZS\u00a00</strong>');
  });
});
