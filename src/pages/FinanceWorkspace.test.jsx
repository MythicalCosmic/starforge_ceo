import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceRequests = vi.hoisted(() => []);
const mutationOptions = vi.hoisted(() => []);
const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() }));
const workspaceTitle = vi.hoisted(() => vi.fn());
const partialPaths = vi.hoisted(() => new Set());

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: vi.fn((options) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
}));

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => toast,
}));

vi.mock('../hooks/useWorkspaceTitle.js', () => ({ useWorkspaceTitle: workspaceTitle }));

const invoice = {
  id: 18,
  number: 'INV-2026-000018',
  student: 44,
  student_name: 'Mohira Olimova',
  cohort: 12,
  cohort_name: 'North Stars',
  fee_schedule_name: 'Monthly tuition',
  period: 'August 2026',
  total_uzs: '1250000',
  outstanding_uzs: '750000',
  issue_date: '2026-08-01',
  due_date: '2026-08-10',
  status: 'partially_paid',
  allocations: [],
  lines: [],
};

const readablePayment = {
  id: 9,
  branch: 2,
  branch_name: 'North Branch',
  invoice: 18,
  invoice_number: 'INV-2026-000018',
  student: 44,
  student_name: 'Mohira Olimova',
  payer: 71,
  payer_name: 'Aziza Olimova',
  cashier_shift: 81,
  cashier_name: 'Dilshod Karimov',
  provider: 'bank_transfer',
  amount_uzs: '500000',
  currency: 'UZS',
  status: 'completed',
  allocation_status: 'allocated',
  paid_at: '2026-08-01T10:00:00+05:00',
};

const barePayment = {
  id: 10,
  branch: 2,
  invoice: 18,
  student: 44,
  payer: 71,
  cashier_shift: 81,
  provider: 'cash',
  amount_uzs: '100000',
  currency: 'UZS',
  status: 'completed',
};

const expense = {
  id: 4,
  approval_request: 33,
  ledger_entry: 91,
  branch: 2,
  branch_name: 'North Branch',
  description: 'Classroom rent',
  category: 'rent',
  amount_uzs: '200000',
  status: 'approved',
  created_by: 501,
  created_by_name: 'Aziza Rahimova',
  approved_by: 502,
  approved_by_name: 'Demo Director',
  created_at: '2026-07-30T09:00:00+05:00',
  approved_at: '2026-07-31T10:00:00+05:00',
};

const refund = {
  id: 3,
  invoice: 18,
  payment_id: 9,
  ledger_entry: 92,
  requested_by: 501,
  approved_by: 502,
  reason: 'Schedule change',
  provider: 'cash',
  provider_refund_id: 'RF-2026-0003',
  amount_uzs: '550000',
  state: 'completed',
  provider_confirmed_at: '2026-08-01T12:00:00+05:00',
  created_at: '2026-08-01T11:00:00+05:00',
  updated_at: '2026-08-01T12:00:00+05:00',
};

const loan = {
  id: 6,
  kind: 'loan',
  branch: 2,
  requested_by: 501,
  decided_by: 502,
  disbursed_by: 503,
  ledger_entry: 93,
  title: 'Laptop advance',
  description: 'Teaching equipment',
  amount_uzs: '2400000.00',
  repaid_uzs: '400000.00',
  outstanding_uzs: '2000000.00',
  settled: false,
  status: 'disbursed',
  created_at: '2026-07-10T12:00:00+05:00',
  decided_at: '2026-07-11T09:00:00+05:00',
  disbursed_at: '2026-07-12T10:00:00+05:00',
};

const loanRepayment = {
  id: 61,
  loan: 6,
  branch: 2,
  payment_method: 7,
  ledger_entry: 94,
  recorded_by: 503,
  amount_uzs: '400000.00',
  note: 'Payroll repayment',
  created_at: '2026-08-01T14:00:00+05:00',
};

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path, params) {
    workspaceRequests.push({ path, params });
    const records = {
      '/api/v1/org/branches/': [{ id: 2, name: 'North Branch' }],
      '/api/v1/cohorts/': [{ id: 12, name: 'North Stars', branch: 2 }],
      '/api/v1/finance/invoices/': [invoice],
      '/api/v1/payments/': [readablePayment],
      '/api/v1/finance/expenses/': [expense],
      '/api/v1/finance/refunds/': [refund],
      '/api/v1/loans/': [loan],
      '/api/v1/loans/6/repayments/': [loanRepayment],
      '/api/v1/finance/fee-schedules/': [{
        id: 71,
        name: 'Assessment fee',
        amount_uzs: '250000',
        billing_period: 'one_time',
        due_day_of_month: 10,
        is_active: true,
      }],
      '/api/v1/finance/payment-methods/': [{ id: 72, name: 'Bank transfer', slug: 'bank-transfer', is_active: true }],
    };
    if (/\/999\/(?:repayments\/)?$/.test(path)) {
      return {
        data: null,
        rows: [],
        total: 0,
        pagination: null,
        loading: false,
        pending: false,
        paused: false,
        error: { status: 500, message: 'database serializer traceback' },
        complete: false,
        retry: vi.fn(),
      };
    }
    const detail = path === '/api/v1/finance/invoices/18/'
      ? invoice
      : path === '/api/v1/payments/9/'
        ? readablePayment
        : path === '/api/v1/payments/10/'
          ? barePayment
          : path === '/api/v1/finance/cashier-shifts/81/'
            ? { id: 81, branch: 2, branch_name: 'North Branch', cashier_name: 'Dilshod Karimov', status: 'closed' }
            : path === '/api/v1/finance/expenses/4/'
              ? expense
              : path === '/api/v1/finance/refunds/3/'
                ? refund
                : path === '/api/v1/loans/6/'
                  ? loan
                  : null;
    const rows = detail ? [] : records[path] || [];
    const paginated = ['/api/v1/finance/invoices/', '/api/v1/payments/', '/api/v1/finance/expenses/', '/api/v1/finance/refunds/'].includes(path) && params?.page;
    const pagination = paginated ? { total: 76, page: Number(params.page), page_size: Number(params.page_size), pages: 4 } : null;
    return {
      data: detail || { count: rows.length, results: rows },
      rows,
      total: pagination?.total ?? rows.length,
      pagination,
      loading: false,
      pending: false,
      paused: false,
      error: null,
      complete: !pagination && !partialPaths.has(path),
      retry: vi.fn(),
    };
  },
}));

import { FinancePage } from './FinanceWorkspace.jsx';

const director = { effective_permissions: ['*:*'] };

describe('Finance workspace redesign', () => {
  beforeEach(() => {
    workspaceRequests.length = 0;
    mutationOptions.length = 0;
    workspaceTitle.mockClear();
    partialPaths.clear();
    Object.values(toast).forEach((spy) => spy.mockClear());
    invoice.total_uzs = '1250000';
    invoice.outstanding_uzs = '750000';
    invoice.allocations = [];
    invoice.status = 'partially_paid';
    invoice.cohort = 12;
    invoice.issue_date = '2026-08-01';
    delete invoice.branch;
    readablePayment.amount_uzs = '500000';
    readablePayment.status = 'completed';
    expense.amount_uzs = '200000';
    expense.status = 'approved';
    refund.amount_uzs = '550000';
    refund.state = 'completed';
  });

  it('keeps the overview as a long decision-to-record page', () => {
    const html = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);

    expect(html).toContain('Recent money movement');
    expect(html).toContain('Latest invoices');
    expect(html).toContain('Latest payments');
    expect(html).toContain('Latest expenses');
    expect(html).toContain('Latest refunds');
    expect(html).toContain('Discrete issue months');
    expect(html).toContain('Financial coverage complete');
    expect(html.match(/class="fw-coverage/g)).toHaveLength(1);
    expect(html).toContain('-UZS');
  });

  it('does not present missing invoice or allocation amounts as genuine zeroes', () => {
    invoice.total_uzs = null;
    invoice.outstanding_uzs = null;
    invoice.allocations = [{ amount_uzs: null }];

    const overview = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);
    const detail = renderToStaticMarkup(<FinancePage route="finance/invoices/18" onNav={vi.fn()} user={director} />);

    expect(overview).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(overview).toContain('One or more invoice amounts are unavailable');
    expect(overview).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(detail).toContain('<span>Invoice total</span><strong>—</strong>');
    expect(detail).toContain('<span>Allocated</span><strong>—</strong>');
    expect(detail).toContain('<span>Unallocated balance</span><strong>—</strong>');
  });

  it('withholds collection, refund, and commitment totals when an amount is invalid', () => {
    readablePayment.amount_uzs = null;
    refund.amount_uzs = 'not-a-number';
    expense.amount_uzs = undefined;

    const html = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);

    expect(html).toContain('<span>Net collections</span><strong>—</strong>');
    expect(html).toContain('One or more collection or refund amounts are unavailable');
    expect(html).toContain('<span>Approved commitments</span><strong>—</strong>');
    expect(html).toContain('<span>Completed refunds</span><strong>—</strong>');
  });

  it('withholds totals, movement, and branch billing when an overview register is capped', () => {
    partialPaths.add('/api/v1/finance/invoices/');

    const html = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);

    expect(html).toContain('Financial coverage is partial');
    expect(html).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(html).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(html).toContain('Complete register coverage is required before this total is stated.');
    expect(html).toContain('Movement is withheld until invoice coverage, dates, lifecycle states, and amounts are complete.');
    expect(html).toContain('Comparison is withheld until every issued invoice can be matched to a visible branch.');
    expect(html).not.toContain('aria-label="Aug 26: UZS');
  });

  it('rejects boolean money and unknown lifecycle states instead of inferring zero', () => {
    invoice.total_uzs = true;
    invoice.outstanding_uzs = false;
    invoice.status = { unexpected: true };
    readablePayment.amount_uzs = true;

    const html = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);

    expect(html).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(html).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(html).toContain('<span>Net collections</span><strong>—</strong>');
    expect(html).toContain('invoice amounts are unavailable, or a lifecycle state is invalid');
    expect(html).not.toContain('<span>Issued billing</span><strong>UZS\u00a00</strong>');
  });

  it('withholds an impossible derived balance and an unsafe branch attribution', () => {
    invoice.total_uzs = '100';
    invoice.outstanding_uzs = null;
    invoice.allocations = [{ amount_uzs: '150' }];
    invoice.cohort = 999;

    const overview = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);
    const detail = renderToStaticMarkup(<FinancePage route="finance/invoices/18" onNav={vi.fn()} user={director} />);

    expect(overview).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(overview).toContain('Comparison is withheld until every issued invoice can be matched to a visible branch.');
    expect(detail).toContain('<span>Unallocated balance</span><strong>—</strong>');
    expect(detail).toContain('Balance evidence is incomplete');
  });

  it('does not label an omitted allocation register as zero allocations', () => {
    delete invoice.allocations;
    invoice.outstanding_uzs = null;

    const html = renderToStaticMarkup(<FinancePage route="finance/invoices/18" onNav={vi.fn()} user={director} />);

    expect(html).toContain('Allocation register unavailable');
    expect(html).toContain('Allocation records are unavailable.');
    expect(html).not.toContain('>0 allocations<');
  });

  it('uses progressive invoice filters and keeps connected record links routable', () => {
    const list = renderToStaticMarkup(<FinancePage route="finance/invoices?branch=2&student=44" onNav={vi.fn()} user={director} />);
    expect(list).toContain('<details class="fw-filter-disclosure"');
    expect(list).toContain('1 active');

    const detail = renderToStaticMarkup(<FinancePage route="finance/invoices/18" onNav={vi.fn()} user={director} />);
    expect(detail).toContain('href="/students/directory/44/finance"');
    expect(detail).toContain('href="/groups/12/finance"');
  });

  it('translates payment providers and billing periods in management registers', () => {
    const payments = renderToStaticMarkup(<FinancePage route="finance/payments" onNav={vi.fn()} user={director} />);
    const configuration = renderToStaticMarkup(<FinancePage route="finance/configuration" onNav={vi.fn()} user={director} />);

    expect(payments).toContain('Bank Transfer');
    expect(payments).not.toContain('>bank_transfer<');
    expect(configuration).toContain('One Time');
    expect(configuration).not.toContain('>one_time<');
  });

  it('uses the loan service fields instead of inventing an employee or balance', () => {
    const html = renderToStaticMarkup(<FinancePage route="finance/loans" onNav={vi.fn()} user={director} />);

    expect(html).toContain('Laptop advance');
    expect(html).toContain('Teaching equipment');
    expect(html).toContain('Repaid');
    expect(html).toContain('Outstanding');
    expect(html).toContain('2,000,000');
    expect(html).not.toContain('<th>Employee</th>');
  });

  it('makes expense, refund, and loan registers and overview previews openable', () => {
    const overview = renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);
    expect(overview).toContain('href="/finance/expenses/4"');
    expect(overview).toContain('href="/finance/refunds/3"');

    const expenses = renderToStaticMarkup(<FinancePage route="finance/expenses" onNav={vi.fn()} user={director} />);
    expect(expenses).toContain('aria-label="Open Classroom rent"');
    expect(expenses).toContain('class="fw-finance-record-link"');
    expect(expenses).toContain('href="/finance/expenses/4"');

    const refunds = renderToStaticMarkup(<FinancePage route="finance/refunds" onNav={vi.fn()} user={director} />);
    expect(refunds).toContain('aria-label="Open Schedule change"');
    expect(refunds).toContain('class="fw-finance-record-link"');
    expect(refunds).toContain('href="/finance/refunds/3"');

    const loans = renderToStaticMarkup(<FinancePage route="finance/loans" onNav={vi.fn()} user={director} />);
    expect(loans).toContain('aria-label="Open Laptop advance"');
    expect(loans).toContain('class="fw-finance-record-link"');
    expect(loans).toContain('href="/finance/loans/6"');
  });

  it('renders dedicated safe detail pages from verified finance endpoints', () => {
    const expenseHtml = renderToStaticMarkup(<FinancePage route="finance/expenses/4" onNav={vi.fn()} user={director} />);
    expect(expenseHtml.match(/<h1>/g)).toHaveLength(1);
    expect(expenseHtml).toContain('<h1>Classroom rent</h1>');
    expect(expenseHtml).toContain('Approval and payment trail');
    expect(expenseHtml).toContain('href="/branches/2/finance"');
    expect(workspaceTitle).toHaveBeenCalledWith('Classroom rent', 'Finance', 'expense-4');

    const refundHtml = renderToStaticMarkup(<FinancePage route="finance/refunds/3" onNav={vi.fn()} user={director} />);
    expect(refundHtml.match(/<h1>/g)).toHaveLength(1);
    expect(refundHtml).toContain('<h1>Refund 3</h1>');
    expect(refundHtml).toContain('href="/finance/invoices/18"');
    expect(refundHtml).not.toContain('href="/finance/payments/9"');
    expect(refundHtml).toContain('Payment reference');
    expect(workspaceTitle).toHaveBeenCalledWith('Refund 3', 'Finance', 'refund-3');

    const loanHtml = renderToStaticMarkup(<FinancePage route="finance/loans/6" onNav={vi.fn()} user={director} />);
    expect(loanHtml.match(/<h1>/g)).toHaveLength(1);
    expect(loanHtml).toContain('<h1>Laptop advance</h1>');
    expect(loanHtml).toContain('Recorded repayments');
    expect(loanHtml).toContain('Payroll repayment');
    expect(loanHtml).not.toContain('href="/branches/2/finance"');
    expect(workspaceTitle).toHaveBeenCalledWith('Laptop advance', 'Finance', 'loan-6');

    expect(workspaceRequests.map(({ path }) => path)).toEqual(expect.arrayContaining([
      '/api/v1/finance/expenses/4/',
      '/api/v1/finance/refunds/3/',
      '/api/v1/loans/6/',
      '/api/v1/loans/6/repayments/',
    ]));
  });

  it('keeps transport details out of failed numeric finance routes', () => {
    ['finance/expenses/999', 'finance/refunds/999', 'finance/loans/999'].forEach((route) => {
      const html = renderToStaticMarkup(<FinancePage route={route} onNav={vi.fn()} user={director} />);

      expect(html).toContain('This view could not be opened');
      expect(html).toContain('Please try again');
      expect(html).not.toContain('database');
      expect(html).not.toContain('serializer');
      expect(html).not.toContain('traceback');
    });
  });

  it('uses URL-backed server pagination for every primary finance register without counting page as a filter', () => {
    const routes = [
      ['finance/invoices?status=issued&page=3', '/api/v1/finance/invoices/'],
      ['finance/payments?status=completed&page=3', '/api/v1/payments/'],
      ['finance/expenses?status=approved&page=3', '/api/v1/finance/expenses/'],
      ['finance/refunds?status=completed&page=3', '/api/v1/finance/refunds/'],
    ];

    routes.forEach(([route, path]) => {
      workspaceRequests.length = 0;
      const html = renderToStaticMarkup(<FinancePage route={route} onNav={vi.fn()} user={director} />);
      const request = workspaceRequests.find((item) => item.path === path);

      expect(request?.params).toMatchObject({ page: 3, page_size: 25 });
      expect(html).toContain('1 active');
      expect(html).toContain('Page 3 of 4');
      expect(html).toContain('aria-current="page"');
    });
  });

  it('bounds pasted finance URL text and rejects malformed register filters before requests', () => {
    const longQuery = 'i'.repeat(500);
    renderToStaticMarkup(<FinancePage route={`finance/invoices?q=${longQuery}&branch=invalid&status=completed&from=2026-02-31`} onNav={vi.fn()} user={director} />);
    const invoiceRequest = workspaceRequests.find((item) => item.path === '/api/v1/finance/invoices/');

    expect(invoiceRequest.params.search).toBe('i'.repeat(120));
    expect(invoiceRequest.params.branch).toBeUndefined();
    expect(invoiceRequest.params.status).toBeUndefined();
    expect(invoiceRequest.params.date_from).toBeUndefined();

    workspaceRequests.length = 0;
    renderToStaticMarkup(<FinancePage route={`finance/expenses?category=${'c'.repeat(500)}&status=issued`} onNav={vi.fn()} user={director} />);
    const expenseRequest = workspaceRequests.find((item) => item.path === '/api/v1/finance/expenses/');

    expect(expenseRequest.params.category).toBe('c'.repeat(80));
    expect(expenseRequest.params.status).toBeUndefined();
  });

  it('keeps unknown numeric invoice relationships visible while requesting their exact scope', () => {
    const html = renderToStaticMarkup(<FinancePage route="finance/invoices?branch=901&cohort=902&student=903&fee=904" onNav={vi.fn()} user={director} />);
    const request = workspaceRequests.find((call) => call.path === '/api/v1/finance/invoices/');

    expect(request.params).toMatchObject({ branch: '901', cohort: '902', student: '903', fee_schedule: '904' });
    expect(html).toContain('<option value="901" selected="">Selected branch is outside this menu</option>');
    expect(html).toContain('<option value="902" selected="">Selected group is outside this menu</option>');
    expect(html).toContain('<option value="903" selected="">Selected student is outside this menu</option>');
    expect(html).toContain('<option value="904" selected="">Selected fee schedule is outside this menu</option>');
    expect(html).not.toContain('<option value="" selected="">All branches</option>');
    expect(html).not.toContain('<option value="" selected="">All groups</option>');
    expect(html).not.toContain('<option value="" selected="">All students</option>');
    expect(html).not.toContain('<option value="" selected="">All schedules</option>');
  });

  it('withholds a false empty conclusion while an out-of-range page is being canonicalized', () => {
    const html = renderToStaticMarkup(<FinancePage route="finance/invoices?status=issued&page=99" onNav={vi.fn()} user={director} />);

    expect(html).toContain('fw-state is-loading');
    expect(html).not.toContain('No invoices match this view');
    expect(html).not.toContain('99 active');
  });

  it('links only payment relationships that include direct readable fields', () => {
    const readable = renderToStaticMarkup(<FinancePage route="finance/payments/9" onNav={vi.fn()} user={director} />);

    expect(readable).toContain('href="/finance/invoices/18"');
    expect(readable).toContain('href="/students/directory/44/finance"');
    expect(readable).toContain('href="/people/parents/71"');
    expect(readable).toContain('href="/finance/cashier/81"');
    expect(readable).toContain('href="/branches/2/finance"');
    expect(readable).toContain('Bank Transfer');

    const cashier = renderToStaticMarkup(<FinancePage route="finance/cashier/81" onNav={vi.fn()} user={director} />);
    expect(cashier).toContain('Shift details');
    expect(cashier).toContain('Dilshod Karimov');
    expect(cashier).toContain('href="/branches/2/finance"');

    const bare = renderToStaticMarkup(<FinancePage route="finance/payments/10" onNav={vi.fn()} user={director} />);
    expect(bare).not.toContain('href="/finance/invoices/18"');
    expect(bare).not.toContain('href="/students/directory/44/finance"');
    expect(bare).not.toContain('href="/people/parents/71"');
    expect(bare).not.toContain('href="/finance/cashier/81"');
    expect(bare).not.toContain('href="/branches/2/finance"');
    expect(bare).toContain('Bare identifiers remain unlinked');
  });

  it('turns every finance action failure into safe leadership copy and a toast instead of exposing transport detail', () => {
    renderToStaticMarkup(<FinancePage route="finance/overview" onNav={vi.fn()} user={director} />);
    mutationOptions[0].onError({ status: 503, message: 'database connection trace' });

    expect(toast.danger).toHaveBeenCalledWith(
      'Live information is temporarily unavailable. Your records remain protected.',
      { title: 'Report not started' },
    );
    expect(toast.danger.mock.calls[0][0]).not.toContain('database');

    mutationOptions.length = 0;
    toast.danger.mockClear();
    renderToStaticMarkup(<FinancePage route="finance/payments/new" onNav={vi.fn()} user={director} />);
    mutationOptions[0].onError({ status: 500, message: 'payment serializer stack trace' });
    expect(toast.danger).toHaveBeenCalledWith(
      'The payment could not be recorded.',
      { title: 'Payment not recorded' },
    );
    expect(toast.danger.mock.calls[0][0]).not.toContain('serializer');

    mutationOptions.length = 0;
    toast.danger.mockClear();
    renderToStaticMarkup(<FinancePage route="finance/expenses/new" onNav={vi.fn()} user={director} />);
    mutationOptions[0].onError({ status: 500, message: 'expense database traceback' });
    expect(toast.danger).toHaveBeenCalledWith(
      'The expense could not be submitted.',
      { title: 'Expense not submitted' },
    );
    expect(toast.danger.mock.calls[0][0]).not.toContain('database');
  });
});
