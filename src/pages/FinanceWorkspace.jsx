import { cloneElement, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from '../components/Icons.jsx';
import { DeferredFilterInput } from '../components/PeopleWorkspacePrimitives.jsx';
import { UnloadedSelectionOption } from '../components/SelectionScopeOption.jsx';
import {
  ActionButton,
  CoverageBar,
  DetailGrid,
  DetailSection,
  FilterField,
  FilterPanel,
  LinkButton,
  RouteLink,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspacePagination,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessMoney, formatBusinessNumber, formatOrganizationDate, isValidDateInput } from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';
import '../styles/financial-academic-v4.css';
import '../styles/financial-academic-v5.css';

const SECTIONS = Object.freeze([
  { id: 'overview', label: 'Overview', description: 'Financial position and movement', icon: Icons.home },
  { id: 'debt', label: 'Debt students', description: 'Overdue tuition follow-up', icon: Icons.user },
  { id: 'invoices', label: 'Billing', description: 'Invoices and reasons', icon: Icons.doc },
  { id: 'payments', label: 'Collections', description: 'Payments received', icon: Icons.trend },
  { id: 'expenses', label: 'Spending', description: 'Expenses and approvals', icon: Icons.wallet },
  { id: 'refunds', label: 'Refunds', description: 'Controlled reversals', icon: Icons.shield },
  { id: 'cashier', label: 'Cashier', description: 'Shifts and reconciliation', icon: Icons.user },
  { id: 'loans', label: 'Staff loans', description: 'Employee loan lifecycle', icon: Icons.folder },
  { id: 'configuration', label: 'Setup', description: 'Fees and payment methods', icon: Icons.settings },
]);

const BILLABLE_INVOICE_STATUSES = new Set(['issued', 'partially_paid', 'paid', 'overdue']);
const PAYABLE_INVOICE_STATUSES = new Set(['issued', 'partially_paid', 'overdue']);
const REGISTER_PAGE_SIZE = 25;
const INVOICE_FILTER_STATUSES = Object.freeze(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void']);
const PAYMENT_FILTER_STATUSES = Object.freeze(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded']);
const EXPENSE_FILTER_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'paid']);
const REFUND_FILTER_STATUSES = Object.freeze(['requested', 'approved', 'sent_to_provider', 'completed', 'failed']);
const ALL_FINANCE_FILTER_STATUSES = Object.freeze([...new Set([
  ...INVOICE_FILTER_STATUSES,
  ...PAYMENT_FILTER_STATUSES,
  ...EXPENSE_FILTER_STATUSES,
  ...REFUND_FILTER_STATUSES,
])]);
const PAYMENT_PROVIDERS = Object.freeze(['cash', 'click', 'payme', 'uzum', 'bank_transfer']);
const ALLOCATION_FILTERS = Object.freeze(['auto', 'manual_review', 'allocated']);
const DEBT_AGING_FILTERS = Object.freeze(['1_7', '8_30', '31_60', '61_plus']);
const DEBT_ORDERING = Object.freeze(['-outstanding_uzs', 'outstanding_uzs', 'oldest_due_date', '-oldest_due_date', 'student_name', '-student_name']);

function normalizedStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasKnownStatuses(rows, choices, key = 'status') {
  return rows.every((row) => choices.includes(normalizedStatus(row?.[key])));
}

function relationId(value) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value.id : value;
  return /^\d+$/.test(String(candidate ?? '')) ? String(candidate) : null;
}

function finiteAmount(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^[+]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function finiteSignedAmount(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function num(value) {
  return finiteAmount(value) ?? 0;
}

function total(rows, key) {
  let sum = 0;
  for (const row of rows) {
    const amount = finiteAmount(typeof key === 'function' ? key(row) : row?.[key]);
    if (amount == null) return null;
    sum += amount;
  }
  return sum;
}

function invoiceAllocated(invoice) {
  if (!Array.isArray(invoice?.allocations)) return null;
  return total(invoice.allocations, (row) => row.amount_uzs ?? row.amount);
}

function invoiceBalance(invoice) {
  if (invoice?.outstanding_uzs !== undefined && invoice?.outstanding_uzs !== null && invoice?.outstanding_uzs !== '') {
    const supplied = finiteAmount(invoice.outstanding_uzs);
    return supplied == null ? null : Math.max(0, supplied);
  }
  const issued = finiteAmount(invoice?.total_uzs);
  const allocated = invoiceAllocated(invoice);
  if (issued == null || allocated == null) return null;
  if (allocated > issued) return null;
  return issued - allocated;
}

function paymentIntentKey() {
  return globalThis.crypto?.randomUUID?.() || `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value) {
  const parsed = finiteAmount(value);
  return parsed == null ? '—' : formatBusinessMoney(parsed, 'UZS') || '—';
}

function signedMoney(value) {
  const parsed = finiteSignedAmount(value);
  return parsed == null ? '—' : formatBusinessMoney(parsed, 'UZS') || '—';
}

function id(value) {
  return /^\d+$/.test(String(value || '')) ? String(value) : null;
}

function inDates(value, from, to) {
  if (!from && !to) return true;
  const date = String(value || '').slice(0, 10);
  if (!isValidDateInput(date)) return false;
  return (!from || date >= from) && (!to || date <= to);
}

function boundedTextParam(params, key, maxLength) {
  return String(params.get(key) || '').trim().slice(0, maxLength);
}

function choiceParam(params, key, choices) {
  const value = String(params.get(key) || '');
  return choices.includes(value) ? value : '';
}

function idParam(params, key) {
  const value = String(params.get(key) || '');
  return /^\d{1,20}$/.test(value) ? value : '';
}

function dateParam(params, key) {
  const value = String(params.get(key) || '');
  return isValidDateInput(value) ? value : '';
}

function queryFilters(params, statusChoices = ALL_FINANCE_FILTER_STATUSES) {
  return {
    from: dateParam(params, 'from'),
    to: dateParam(params, 'to'),
    branch: idParam(params, 'branch'),
    status: choiceParam(params, 'status', statusChoices),
    cohort: idParam(params, 'cohort'),
    student: idParam(params, 'student'),
    fee: idParam(params, 'fee'),
    q: boundedTextParam(params, 'q', 120),
    provider: choiceParam(params, 'provider', PAYMENT_PROVIDERS),
    allocation: choiceParam(params, 'allocation', ALLOCATION_FILTERS),
    category: boundedTextParam(params, 'category', 80),
    teacher: idParam(params, 'teacher'),
    aging: choiceParam(params, 'aging', DEBT_AGING_FILTERS),
    minimum: boundedTextParam(params, 'minimum', 24),
    ordering: choiceParam(params, 'ordering', DEBT_ORDERING),
  };
}

function queryPage(params) {
  const raw = String(params.get('page') || '');
  if (!/^\d{1,6}$/.test(raw)) return 1;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function filterParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([name, value]) => value && params.set(name, value));
  return params;
}

function changeFilter(filters, key, value, base, onNav, options) {
  const next = filterParams({ ...filters, [key]: value });
  onNav(next.toString() ? `${base}?${next}` : base, { scroll: false, ...options });
}

function registerRoute(base, filters, page) {
  const params = filterParams(filters);
  if (page > 1) params.set('page', String(page));
  return params.toString() ? `${base}?${params}` : base;
}

function registerPageInfo(state, requestedPage) {
  const positiveInteger = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d+$/.test(String(value).trim())) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const pageSize = positiveInteger(state.pagination?.page_size) || REGISTER_PAGE_SIZE;
  const pagesFromResponse = positiveInteger(state.pagination?.pages);
  const total = finiteAmount(state.total);
  const totalKnown = state.totalKnown !== false && total !== null && Number.isSafeInteger(total);
  const pages = pagesFromResponse
    ? pagesFromResponse
    : totalKnown
      ? Math.max(1, Math.ceil(total / pageSize))
      : Math.max(1, requestedPage);
  const responsePage = positiveInteger(state.pagination?.page);
  const reportedPage = Number.isSafeInteger(responsePage) && responsePage > 0 ? responsePage : requestedPage;
  return {
    current: Math.min(pages, Math.max(1, reportedPage)),
    pages,
    outOfRange: totalKnown && requestedPage > pages,
  };
}

function PaginatedRegister({ state, requestedPage, filters, base, label, onNav, emptyTitle, children }) {
  const pageInfo = registerPageInfo(state, requestedPage);
  const ready = !state.pending && !state.error && !state.paused && state.data != null;
  const canonicalRoute = registerRoute(base, filters, pageInfo.pages);

  useEffect(() => {
    if (ready && pageInfo.outOfRange) {
      onNav(canonicalRoute, { replace: true, scroll: false });
    }
  }, [canonicalRoute, onNav, pageInfo.outOfRange, ready]);

  if (ready && pageInfo.outOfRange) {
    return <WorkspaceState state={{ ...state, pending: true }} />;
  }

  return <>
    <WorkspaceState
      state={state}
      empty={!state.rows.length}
      emptyTitle={state.complete || state.total === 0 ? emptyTitle : `No ${label} are visible on this loaded page`}
      emptyBody={state.complete || state.total === 0 ? 'Try adjusting the filters.' : 'Coverage is incomplete, so this is not treated as an empty register.'}
    >{children}</WorkspaceState>
    <WorkspacePagination
      label={label}
      page={pageInfo.current}
      pages={pageInfo.pages}
      total={state.total}
      loading={state.loading}
      onPage={(nextPage) => onNav(registerRoute(base, filters, nextPage), { scroll: false })}
    />
  </>;
}

function mutationMessage(error, fallback) {
  return userFacingError(error, { fallback });
}

function FinanceReportActions({ filters, onNav, canWrite }) {
  const toast = useToast();
  const report = useMutation({
    mutationFn: (format) => httpRequest('POST', '/api/v1/reports/runs/', { body: { report_key: 'finance', format, params: { branch_id: filters.branch ? Number(filters.branch) : undefined, date_from: filters.from || undefined, date_to: filters.to || undefined } } }),
    onSuccess: (run) => {
      toast.info('The finance report is being prepared.', { title: 'Report started' });
      onNav(`reports/runs/${run.id}`);
    },
    onError: (error) => toast.danger(mutationMessage(error, 'The report could not be started.'), { title: 'Report not started' }),
  });
  return <div className="fw-report-actions"><ActionButton onClick={() => window.print()}>{cloneElement(Icons.doc, { size: 14 })} Print</ActionButton>{canWrite && <><ActionButton disabled={report.isPending} onClick={() => report.mutate('xlsx')}>Export XLSX</ActionButton><ActionButton disabled={report.isPending} onClick={() => report.mutate('pdf')}>Export PDF</ActionButton></>}</div>;
}

function useFinanceSources(filters = {}, requested = [], registerPages = {}) {
  const enabled = (source) => requested.includes(source);
  const paginationFor = (source) => registerPages[source]
    ? { page_size: REGISTER_PAGE_SIZE, page: registerPages[source] }
    : { page_size: 100 };
  const registerWindow = {
    branch: filters.branch || undefined,
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
  };
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: filters.branch || undefined }, { enabled: enabled('cohorts') });
  const invoices = useWorkspaceData('/api/v1/finance/invoices/', { ...paginationFor('invoices'), ...registerWindow, status: filters.status || undefined, cohort: filters.cohort || undefined, student: filters.student || undefined, fee_schedule: filters.fee || undefined, search: filters.q || undefined }, { enabled: enabled('invoices') });
  const payments = useWorkspaceData('/api/v1/payments/', { ...paginationFor('payments'), ...registerWindow, provider: filters.provider || undefined, status: filters.status || undefined, allocation_status: filters.allocation || undefined }, { enabled: enabled('payments') });
  const expenses = useWorkspaceData('/api/v1/finance/expenses/', { ...paginationFor('expenses'), ...registerWindow, status: filters.status || undefined, category: filters.category || undefined }, { enabled: enabled('expenses') });
  const refunds = useWorkspaceData('/api/v1/finance/refunds/', { ...paginationFor('refunds'), ...registerWindow, state: filters.status || undefined, provider: filters.provider || undefined }, { enabled: enabled('refunds') });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: enabled('branches') });
  const students = useWorkspaceData('/api/v1/students/', { page_size: 100, branch: filters.branch || undefined }, { enabled: enabled('students') });
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: 100, branch: filters.branch || undefined }, { enabled: enabled('teachers') });
  const debt = useWorkspaceData('/api/v1/finance/debt-students/', {
    page_size: registerPages.debt ? REGISTER_PAGE_SIZE : 6,
    page: registerPages.debt || undefined,
    branch: filters.branch || undefined,
    cohort: filters.cohort || undefined,
    teacher: filters.teacher || undefined,
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    search: filters.q || undefined,
    aging: filters.aging || undefined,
    minimum_outstanding: filters.minimum || undefined,
    ordering: filters.ordering || undefined,
  }, { enabled: enabled('debt') });
  return { cohorts, invoices, payments, expenses, refunds, branches, students, teachers, debt };
}

function humanLabel(value, fallback = 'Not recorded') {
  const normalized = String(value || '').trim().replaceAll('_', ' ');
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function combinedState(...states) {
  const sources = states.filter(Boolean);
  return {
    pending: sources.some((state) => state.pending),
    paused: sources.some((state) => state.paused),
    error: sources.find((state) => state.error)?.error || null,
    rows: [],
    data: sources.every((state) => state.data != null) ? {} : null,
    complete: sources.length > 0 && sources.every((state) => state.complete === true),
    retry: () => Promise.all(sources.map((state) => state.retry?.()).filter(Boolean)),
  };
}

function stateValue(state, value, formatter = money) {
  if (state.pending) return '…';
  if (state.error || state.paused) return '—';
  if (state.complete !== true) return '—';
  return formatter(value) || '—';
}

function stateDescription(state, ready, pending = 'Preparing the current register…') {
  if (state.pending) return pending;
  if (state.error || state.paused) return 'Current register unavailable';
  if (state.complete !== true) return 'Complete register coverage is required before this total is stated.';
  return ready;
}

function FinanceCoverage({ registers }) {
  const entries = [
    ['invoices', registers.invoices],
    ['payments', registers.payments],
    ['refunds', registers.refunds],
    ['expenses', registers.expenses],
  ];
  const pending = entries.filter(([, state]) => state.pending && !state.rows.length);
  const unavailable = entries.filter(([, state]) => (state.error || state.paused || state.data == null) && !state.rows.length && !state.pending);
  const partial = entries.filter(([, state]) => state.complete !== true && !state.pending && !unavailable.some(([, unavailableState]) => unavailableState === state));
  const complete = entries.every(([, state]) => state.complete === true && state.data != null && !state.error && !state.paused);
  const updated = entries
    .map(([, state]) => state.updatedAt)
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  const registerSummary = entries
    .map(([label, state]) => `${formatBusinessNumber(state.rows.length)} ${label}`)
    .join(' · ');
  const title = pending.length
    ? 'Preparing financial coverage'
    : unavailable.length
      ? 'Some financial registers are unavailable'
      : partial.length
        ? 'Financial coverage is partial'
        : 'Financial coverage complete';
  const detail = unavailable.length
    ? `${unavailable.map(([label]) => label).join(', ')} unavailable; affected totals remain withheld.`
    : partial.length
      ? `${registerSummary}. Breakdowns remain limited to loaded records.`
      : pending.length
        ? 'Totals remain withheld until their source registers are ready.'
        : registerSummary;

  return (
    <div className={`fw-coverage${complete ? '' : ' is-partial'}`} role="status" aria-label="Financial register coverage">
      <span>{cloneElement(complete ? Icons.check : pending.length ? Icons.trend : Icons.flag, { size: 13 })}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      {updated && <time>{formatOrganizationDate(updated)}</time>}
    </div>
  );
}

function percent(value) {
  return Number.isFinite(value) ? `${value.toLocaleString('en', { maximumFractionDigits: 1 })}%` : '—';
}

function DebtAging({ days }) {
  const parsed = Number(days);
  const tone = !Number.isFinite(parsed) ? 'unknown' : parsed > 60 ? 'critical' : parsed > 30 ? 'high' : parsed > 7 ? 'medium' : 'recent';
  return <span className={`fa5-aging is-${tone}`}>{Number.isFinite(parsed) ? `${formatBusinessNumber(parsed)} days` : 'Age unavailable'}</span>;
}

function FinanceMetricRail({ metrics }) {
  return <section className="fa5-metric-rail" aria-label="Financial position">{metrics.map((metric) => <article className={metric.tone ? `is-${metric.tone}` : ''} key={metric.label}>
    <span>{metric.label}</span>
    <strong>{metric.value}</strong>
    <small>{metric.detail}</small>
  </article>)}</section>;
}

function DebtPreview({ state, onNav }) {
  const summary = state.pagination?.summary;
  const exactTotal = finiteAmount(summary?.total_outstanding_uzs);
  return <section className="fa5-panel fa5-debt-preview">
    <header>
      <div><h2>Students who need payment follow-up</h2><p>Past-due tuition only. Open a student to review the invoices behind the balance.</p></div>
      <LinkButton to="finance/debt" onNav={onNav} tone="primary">Open debt register</LinkButton>
    </header>
    <div className="fa5-debt-summary">
      <span><small>Outstanding now</small><strong>{state.pending ? '…' : exactTotal == null ? '—' : money(exactTotal)}</strong></span>
      <span><small>Students / groups</small><strong>{state.pending ? '…' : summary ? formatBusinessNumber(summary.student_groups) : formatBusinessNumber(state.total)}</strong></span>
      <span><small>Overdue invoices</small><strong>{state.pending ? '…' : summary ? formatBusinessNumber(summary.overdue_invoice_count) : '—'}</strong></span>
      <span><small>As of</small><strong>{summary?.as_of ? formatOrganizationDate(summary.as_of, { dateOnly: true }) : 'Current view'}</strong></span>
    </div>
    <WorkspaceState state={state} empty={!state.rows.length} emptyTitle="No overdue tuition in this scope" emptyBody="Every currently visible monthly payment is settled or not yet due.">
      <div className="fa5-debt-list">{state.rows.map((row) => <RouteLink key={row.id} to={`students/directory/${row.student}/finance`} onNav={onNav}>
        <span className="fa5-person-mark" aria-hidden="true">{String(row.student_name || 'S').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
        <span><strong>{row.student_name || row.student_id || 'Student'}</strong><small>{row.cohort_name || 'No group'} · {row.teacher_name || 'Teacher not assigned'}</small></span>
        <DebtAging days={row.days_overdue} />
        <span><strong>{money(row.outstanding_uzs)}</strong><small>{formatBusinessNumber(row.overdue_invoice_count)} overdue invoice{Number(row.overdue_invoice_count) === 1 ? '' : 's'}</small></span>
        {cloneElement(Icons.chevR, { size: 15 })}
      </RouteLink>)}</div>
    </WorkspaceState>
  </section>;
}

function MovementLedger({ rows, states, onNav }) {
  const state = combinedState(...states);
  return <section className="fa5-panel fa5-movement">
    <header>
      <div><h2>Recent money movement</h2><p>A single chronological trail across billing, collections, spending, and refunds.</p></div>
      <div className="fa5-register-links">
        <RouteLink to="finance/invoices" onNav={onNav}>Latest invoices</RouteLink>
        <RouteLink to="finance/payments" onNav={onNav}>Latest payments</RouteLink>
        <RouteLink to="finance/expenses" onNav={onNav}>Latest expenses</RouteLink>
        <RouteLink to="finance/refunds" onNav={onNav}>Latest refunds</RouteLink>
      </div>
    </header>
    <WorkspaceState state={state} empty={!rows.length} emptyTitle="No financial movement in this period" emptyBody="Change the selected dates or branch to review another period.">
      <div className="fa5-movement-list">{rows.map((row) => <RouteLink key={`${row.kind}-${row.id}`} to={row.to} onNav={onNav}>
        <span className={`fa5-movement-kind is-${row.kind}`}>{cloneElement(row.icon, { size: 15 })}</span>
        <span><strong>{row.title}</strong><small>{row.kindLabel} · {row.detail}</small></span>
        <time>{formatOrganizationDate(row.date, { dateOnly: true }) || 'Date unavailable'}</time>
        <span className={row.amount < 0 ? 'is-negative' : ''}>{signedMoney(row.amount)}</span>
        <StatusPill value={row.status} />
        {cloneElement(Icons.chevR, { size: 15 })}
      </RouteLink>)}</div>
    </WorkspaceState>
  </section>;
}

function FinanceOverview({ route, onNav }) {
  const routed = workspaceRoute(route);
  const filters = queryFilters(routed.params, []);
  const source = useFinanceSources(filters, ['cohorts', 'invoices', 'payments', 'expenses', 'refunds', 'branches', 'debt']);
  const invoices = source.invoices.rows.filter((row) => inDates(row.issue_date || row.created_at, filters.from, filters.to));
  const payments = source.payments.rows.filter((row) => inDates(row.paid_at || row.created_at, filters.from, filters.to));
  const expenses = source.expenses.rows.filter((row) => inDates(row.created_at, filters.from, filters.to));
  const refunds = source.refunds.rows.filter((row) => inDates(row.created_at, filters.from, filters.to));
  const invoiceStatesKnown = hasKnownStatuses(invoices, INVOICE_FILTER_STATUSES);
  const paymentStatesKnown = hasKnownStatuses(payments, PAYMENT_FILTER_STATUSES);
  const expenseStatesKnown = hasKnownStatuses(expenses, EXPENSE_FILTER_STATUSES);
  const refundStatesKnown = hasKnownStatuses(refunds, REFUND_FILTER_STATUSES, 'state');
  const issuedInvoices = invoiceStatesKnown
    ? invoices.filter((row) => BILLABLE_INVOICE_STATUSES.has(normalizedStatus(row.status)))
    : [];
  const billedEvidence = invoiceStatesKnown ? total(issuedInvoices, 'total_uzs') : null;
  const grossCollectedEvidence = paymentStatesKnown
    ? total(payments.filter((row) => normalizedStatus(row.status) === 'completed'), 'amount_uzs')
    : null;
  const completedRefundsEvidence = refundStatesKnown
    ? total(refunds.filter((row) => normalizedStatus(row.state) === 'completed'), 'amount_uzs')
    : null;
  const netCollectedEvidence = grossCollectedEvidence == null || completedRefundsEvidence == null
    ? null
    : grossCollectedEvidence - completedRefundsEvidence;
  const spentEvidence = expenseStatesKnown
    ? total(expenses.filter((row) => normalizedStatus(row.status) === 'paid'), 'amount_uzs')
    : null;
  const commitmentsEvidence = expenseStatesKnown
    ? total(expenses.filter((row) => normalizedStatus(row.status) === 'approved'), 'amount_uzs')
    : null;
  const outstandingEvidence = invoiceStatesKnown ? total(issuedInvoices, invoiceBalance) : null;
  const billed = source.invoices.complete ? billedEvidence : null;
  const grossCollected = source.payments.complete ? grossCollectedEvidence : null;
  const completedRefunds = source.refunds.complete ? completedRefundsEvidence : null;
  const netCollected = source.payments.complete && source.refunds.complete ? netCollectedEvidence : null;
  const spent = source.expenses.complete ? spentEvidence : null;
  const commitments = source.expenses.complete ? commitmentsEvidence : null;
  const outstanding = source.invoices.complete ? outstandingEvidence : null;
  const billingMovementReady = source.invoices.complete
    && billedEvidence != null
    && issuedInvoices.every((invoice) => isValidDateInput(String(invoice.issue_date || invoice.created_at || '').slice(0, 10)));
  const months = (() => {
    if (!billingMovementReady) return [];
    const map = new Map();
    issuedInvoices.forEach((invoice) => {
      const key = String(invoice.issue_date || invoice.created_at || '').slice(0, 7);
      map.set(key, (map.get(key) || 0) + finiteAmount(invoice.total_uzs));
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value }));
  })();
  const branchIds = new Set(source.branches.rows.map((branch) => relationId(branch.id)).filter(Boolean));
  const cohortBranches = new Map(source.cohorts.rows.map((cohort) => [relationId(cohort.id), relationId(cohort.branch)]).filter(([cohortId, scopedBranchId]) => cohortId && scopedBranchId));
  const invoiceBranch = (invoice) => {
    const direct = relationId(invoice.branch);
    const throughCohort = cohortBranches.get(relationId(invoice.cohort));
    if (direct && throughCohort && direct !== throughCohort) return null;
    const resolved = direct || throughCohort || (filters.branch || null);
    return resolved && branchIds.has(resolved) ? resolved : null;
  };
  const attributedInvoices = issuedInvoices.map((invoice) => ({ invoice, branchId: invoiceBranch(invoice) }));
  const branchComparisonReady = source.branches.complete
    && source.cohorts.complete
    && source.invoices.complete
    && billedEvidence != null
    && attributedInvoices.every((item) => item.branchId);
  const comparedBranches = filters.branch
    ? source.branches.rows.filter((branch) => relationId(branch.id) === filters.branch)
    : source.branches.rows;
  const branchRows = branchComparisonReady ? comparedBranches.map((branch) => {
    const branchKey = relationId(branch.id);
    const rows = attributedInvoices.filter((item) => item.branchId === branchKey).map((item) => item.invoice);
    return { id: branch.id, label: branch.name, value: total(rows, 'total_uzs'), detail: `${rows.length} issued invoices` };
  }) : [];
  const collectionsState = combinedState(source.payments, source.refunds);
  const branchState = combinedState(source.branches, source.cohorts, source.invoices);
  const collectionRate = billed != null && billed > 0 && netCollected != null ? (netCollected / billed) * 100 : null;
  const operatingMovement = netCollected != null && spent != null ? netCollected - spent : null;
  const movementRows = [
    ...invoices.map((row) => ({ id: row.id, kind: 'invoice', kindLabel: 'Invoice', icon: Icons.doc, title: row.student_name || row.number || 'Invoice', detail: row.number || row.fee_schedule_name || row.period || 'Billing record', amount: finiteAmount(row.total_uzs), date: row.issue_date || row.created_at, status: row.status, to: `finance/invoices/${row.id}` })),
    ...payments.map((row) => ({ id: row.id, kind: 'payment', kindLabel: 'Payment', icon: Icons.trend, title: row.student_name || humanLabel(row.provider, 'Payment received'), detail: humanLabel(row.provider, 'Payment method'), amount: finiteAmount(row.amount_uzs), date: row.paid_at || row.created_at, status: row.status, to: `finance/payments/${row.id}` })),
    ...expenses.map((row) => ({ id: row.id, kind: 'expense', kindLabel: 'Expense', icon: Icons.wallet, title: row.description || humanLabel(row.category, 'Expense'), detail: row.branch_name || humanLabel(row.category), amount: finiteAmount(row.amount_uzs) == null ? null : -finiteAmount(row.amount_uzs), date: row.paid_at || row.created_at, status: row.status, to: `finance/expenses/${row.id}` })),
    ...refunds.map((row) => ({ id: row.id, kind: 'refund', kindLabel: 'Refund', icon: Icons.shield, title: row.reason || 'Refund request', detail: humanLabel(row.provider, 'Provider'), amount: finiteAmount(row.amount_uzs) == null ? null : -finiteAmount(row.amount_uzs), date: row.created_at, status: row.state, to: `finance/refunds/${row.id}` })),
  ].filter((row) => id(row.id)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 12);
  const maxBranchValue = branchRows.reduce((maximum, row) => Math.max(maximum, finiteAmount(row.value) || 0), 0);
  const filterCount = Object.values(filters).filter(Boolean).length;
  return <>
    <FilterPanel title="Finance period" activeCount={filterCount} actions={<ActionButton tone="ghost" onClick={() => onNav('finance/overview')}>Clear</ActionButton>}>
      <FilterField label="From"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, 'finance/overview', onNav)} /></FilterField>
      <FilterField label="To"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, 'finance/overview', onNav)} /></FilterField>
      <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, 'finance/overview', onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={source.branches.rows} label="branch" />{source.branches.rows.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></FilterField>
    </FilterPanel>
    <FinanceCoverage registers={source} />
    <FinanceMetricRail metrics={[
      { label: 'Issued billing', value: stateValue(source.invoices, billed), detail: stateDescription(source.invoices, billed == null ? 'One or more invoice amounts are unavailable, or a lifecycle state is invalid' : `${issuedInvoices.length} issued invoices`) },
      { label: 'Net collections', value: stateValue(collectionsState, netCollected, signedMoney), detail: stateDescription(collectionsState, netCollected == null ? 'One or more collection or refund amounts are unavailable, or a lifecycle state is invalid' : `${percent(collectionRate)} of issued billing`) },
      { label: 'Outstanding balance', value: stateValue(source.invoices, outstanding), detail: stateDescription(source.invoices, outstanding == null ? 'One or more invoice balances are unavailable' : 'Open invoice value after allocations'), tone: outstanding > 0 ? 'danger' : '' },
      { label: 'Operating movement', value: stateValue(combinedState(collectionsState, source.expenses), operatingMovement, signedMoney), detail: stateDescription(combinedState(collectionsState, source.expenses), operatingMovement == null ? 'Collections or expense evidence is incomplete' : 'Net collections less paid expenses') },
    ]} />
    <div className="fa5-primary-grid">
      <DebtPreview state={source.debt} onNav={onNav} />
      <section className="fa5-panel fa5-position-panel">
        <header><div><h2>What changed the position</h2><p>Supporting figures for the selected scope.</p></div></header>
        <div className="fa5-position-list">
          <div><span>Paid expenses</span><strong>{stateValue(source.expenses, spent)}</strong><small>{stateDescription(source.expenses, spent == null ? 'One or more paid expense amounts are unavailable' : 'Completed disbursements')}</small></div>
          <div><span>Approved commitments</span><strong>{stateValue(source.expenses, commitments)}</strong><small>{stateDescription(source.expenses, commitments == null ? 'One or more approved amounts are unavailable' : 'Approved, not yet paid')}</small></div>
          <div><span>Completed refunds</span><strong>{stateValue(source.refunds, completedRefunds)}</strong><small>{stateDescription(source.refunds, completedRefunds == null ? 'One or more completed refund amounts are unavailable' : 'Already deducted from collections')}</small></div>
          <div><span>Gross collected</span><strong>{stateValue(source.payments, grossCollected)}</strong><small>{stateDescription(source.payments, 'Completed payments before refunds')}</small></div>
        </div>
      </section>
    </div>
    <MovementLedger rows={movementRows} states={[source.invoices, source.payments, source.expenses, source.refunds]} onNav={onNav} />
    <div className="fa5-secondary-grid">
      <section className="fa5-panel fa5-period-panel">
        <header><div><h2>Billing by month</h2><p>{billingMovementReady ? 'Discrete issue months · verified UZS totals' : 'Movement is withheld until invoice coverage, dates, lifecycle states, and amounts are complete.'}</p></div></header>
        {months.length ? <div className="fa5-period-list">{months.slice(-8).map((row) => <div key={row.label}><span>{row.label}</span><strong>{money(row.value)}</strong></div>)}</div> : <div className="fa5-quiet-empty">No verified monthly movement is available.</div>}
      </section>
      <section className="fa5-panel fa5-branch-panel">
        <header><div><h2>Branch billing comparison</h2><p>{branchComparisonReady ? 'Verified invoice attribution for this scope.' : 'Comparison is withheld until every issued invoice can be matched to a visible branch.'}</p></div></header>
        <WorkspaceState state={branchState} empty={branchComparisonReady && !branchRows.length} emptyTitle="No branch billing in this period">
          <div className="fa5-branch-list">{branchRows.slice(0, 8).map((branch) => <button type="button" key={branch.id} onClick={() => onNav(`branches/${branch.id}/finance`)}>
            <span><strong>{branch.label}</strong><small>{branch.detail}</small></span><b>{money(branch.value)}</b><i style={{ '--fa5-fill': `${maxBranchValue > 0 ? ((finiteAmount(branch.value) || 0) / maxBranchValue) * 100 : 0}%` }} />
          </button>)}</div>
        </WorkspaceState>
      </section>
    </div>
  </>;
}

function DebtStudents({ route, onNav }) {
  const routed = workspaceRoute(route);
  const filters = queryFilters(routed.params, []);
  const page = queryPage(routed.params);
  const base = 'finance/debt';
  const source = useFinanceSources(filters, ['debt', 'cohorts', 'branches', 'teachers'], { debt: page });
  const summary = source.debt.pagination?.summary;
  const totalOutstanding = finiteAmount(summary?.total_outstanding_uzs);
  const averageDebt = totalOutstanding != null && Number(summary?.student_groups) > 0
    ? totalOutstanding / Number(summary.student_groups)
    : null;
  const activeCount = Object.values(filters).filter(Boolean).length;
  return <>
    <section className="fa5-section-intro">
      <div><h2>Debt students</h2><p>Every row is a student and course group with at least one past-due invoice and a positive unpaid balance.</p></div>
      <RouteLink to="finance/invoices?status=overdue" onNav={onNav}>Review overdue invoices{cloneElement(Icons.chevR, { size: 15 })}</RouteLink>
    </section>
    <div className="fa5-debt-register-summary" aria-label="Debt register summary">
      <span><small>Outstanding</small><strong>{source.debt.pending ? '…' : totalOutstanding == null ? '—' : money(totalOutstanding)}</strong></span>
      <span><small>Students / groups</small><strong>{source.debt.pending ? '…' : formatBusinessNumber(summary?.student_groups ?? source.debt.total)}</strong></span>
      <span><small>Overdue invoices</small><strong>{source.debt.pending ? '…' : summary ? formatBusinessNumber(summary.overdue_invoice_count) : '—'}</strong></span>
      <span><small>Average balance</small><strong>{source.debt.pending ? '…' : averageDebt == null ? '—' : money(averageDebt)}</strong></span>
    </div>
    <FilterPanel title="Debt filters" activeCount={activeCount} advancedCount={['from', 'to', 'aging', 'minimum', 'ordering'].filter((key) => filters[key]).length} actions={<ActionButton tone="ghost" onClick={() => onNav(base)}>Clear all</ActionButton>} primary={<>
      <FilterField label="Student" wide><DeferredFilterInput type="search" maxLength={120} value={filters.q} placeholder="Name or student ID" onCommit={(value) => changeFilter(filters, 'q', value, base, onNav, { replace: true })} /></FilterField>
      <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, base, onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={source.branches.rows} label="branch" />{source.branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Group"><select value={filters.cohort} onChange={(event) => changeFilter(filters, 'cohort', event.target.value, base, onNav)}><option value="">All groups</option><UnloadedSelectionOption value={filters.cohort} options={source.cohorts.rows} label="group" />{source.cohorts.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Teacher"><select value={filters.teacher} onChange={(event) => changeFilter(filters, 'teacher', event.target.value, base, onNav)}><option value="">All teachers</option><UnloadedSelectionOption value={filters.teacher} options={source.teachers.rows} label="teacher" />{source.teachers.rows.map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></FilterField>
    </>}>
      <FilterField label="Due from"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, base, onNav)} /></FilterField>
      <FilterField label="Due to"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, base, onNav)} /></FilterField>
      <FilterField label="Age"><select value={filters.aging} onChange={(event) => changeFilter(filters, 'aging', event.target.value, base, onNav)}><option value="">Any overdue age</option><option value="1_7">1–7 days</option><option value="8_30">8–30 days</option><option value="31_60">31–60 days</option><option value="61_plus">61+ days</option></select></FilterField>
      <FilterField label="Minimum balance"><input type="number" inputMode="numeric" min="0" step="1000" value={filters.minimum} placeholder="Any amount" onChange={(event) => changeFilter(filters, 'minimum', event.target.value, base, onNav)} /></FilterField>
      <FilterField label="Sort by"><select value={filters.ordering} onChange={(event) => changeFilter(filters, 'ordering', event.target.value, base, onNav)}><option value="">Highest balance first</option><option value="outstanding_uzs">Lowest balance first</option><option value="oldest_due_date">Oldest debt first</option><option value="-oldest_due_date">Newest debt first</option><option value="student_name">Student A–Z</option><option value="-student_name">Student Z–A</option></select></FilterField>
    </FilterPanel>
    <PaginatedRegister state={source.debt} requestedPage={page} filters={filters} base={base} label="debt students" onNav={onNav} emptyTitle="No students match this debt view">
      <WorkspaceTable label="Debt students" rows={source.debt.rows} rowLabel={(row) => row.student_name || row.student_id} columns={[
        { key: 'student_name', label: 'Student', render: (row) => <span className="fw-person-cell"><strong><RouteLink to={`students/directory/${row.student}/finance`} onNav={onNav}>{row.student_name || 'Student'}</RouteLink></strong><small>{row.student_id || `Record ${row.student}`}</small></span> },
        { key: 'cohort_name', label: 'Group', render: (row) => <span className="fw-person-cell"><strong>{row.cohort_name || 'No group recorded'}</strong><small>{row.branch_name || 'Branch unavailable'}</small></span> },
        { key: 'teacher_name', label: 'Teacher', render: (row) => row.teacher_name || 'Not assigned' },
        { key: 'oldest_due_date', label: 'Oldest due', render: (row) => <span className="fw-person-cell"><strong>{formatOrganizationDate(row.oldest_due_date, { dateOnly: true })}</strong><small>Latest {formatOrganizationDate(row.latest_due_date, { dateOnly: true })}</small></span> },
        { key: 'days_overdue', label: 'Age', render: (row) => <DebtAging days={row.days_overdue} /> },
        { key: 'overdue_invoice_count', label: 'Invoices', render: (row) => formatBusinessNumber(row.overdue_invoice_count) },
        { key: 'outstanding_uzs', label: 'Outstanding', render: (row) => <strong className="fa5-debt-amount">{money(row.outstanding_uzs)}</strong> },
      ]} onOpen={(row) => onNav(`students/directory/${row.student}/finance`)} />
    </PaginatedRegister>
  </>;
}

function InvoiceList({ route, onNav }) {
  const routed = workspaceRoute(route);
  const filters = queryFilters(routed.params, INVOICE_FILTER_STATUSES);
  const page = queryPage(routed.params);
  const source = useFinanceSources(filters, ['cohorts', 'invoices', 'branches', 'students'], { invoices: page });
  const base = 'finance/invoices';
  const fees = useWorkspaceData('/api/v1/finance/fee-schedules/', { page_size: 100 });
  const visible = source.invoices.rows.filter((invoice) => inDates(invoice.issue_date || invoice.created_at, filters.from, filters.to));
  return <>
    <FilterPanel title="Invoice filters" activeCount={Object.values(filters).filter(Boolean).length} advancedCount={['cohort', 'student', 'fee', 'from', 'to'].filter((key) => filters[key]).length} actions={<ActionButton tone="ghost" onClick={() => onNav(base)}>Clear</ActionButton>} primary={<>
      <FilterField label="Invoice search" wide><DeferredFilterInput type="search" maxLength={120} value={filters.q} placeholder="Invoice number" onCommit={(value) => changeFilter(filters, 'q', value, base, onNav, { replace: true })} /></FilterField>
      <FilterField label="Status"><select value={filters.status} onChange={(event) => changeFilter(filters, 'status', event.target.value, base, onNav)}><option value="">All statuses</option>{INVOICE_FILTER_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></FilterField>
      <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, base, onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={source.branches.rows} label="branch" />{source.branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
    </>}>
      <FilterField label="Group"><select value={filters.cohort} onChange={(event) => changeFilter(filters, 'cohort', event.target.value, base, onNav)}><option value="">All groups</option><UnloadedSelectionOption value={filters.cohort} options={source.cohorts.rows} label="group" />{source.cohorts.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Student"><select value={filters.student} onChange={(event) => changeFilter(filters, 'student', event.target.value, base, onNav)}><option value="">All students</option><UnloadedSelectionOption value={filters.student} options={source.students.rows} label="student" />{source.students.rows.map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></FilterField>
      <FilterField label="Fee schedule"><select value={filters.fee} onChange={(event) => changeFilter(filters, 'fee', event.target.value, base, onNav)}><option value="">All schedules</option><UnloadedSelectionOption value={filters.fee} options={fees.rows} label="fee schedule" />{fees.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Issued from"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, base, onNav)} /></FilterField>
      <FilterField label="Issued to"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, base, onNav)} /></FilterField>
    </FilterPanel>
    <CoverageBar state={source.invoices} label="invoices" filtered />
    <PaginatedRegister state={source.invoices} requestedPage={page} filters={filters} base={base} label="invoices" onNav={onNav} emptyTitle="No invoices match this view"><WorkspaceTable label="Invoices" rows={visible} columns={[
      { key: 'number', label: 'Invoice' }, { key: 'student_name', label: 'Student' }, { key: 'cohort_name', label: 'Group' },
      { key: 'fee_schedule_name', label: 'Reason / schedule' }, { key: 'period', label: 'Period' },
      { key: 'total_uzs', label: 'Total', render: (row) => money(row.total_uzs) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
      { key: 'due_date', label: 'Due', render: (row) => formatOrganizationDate(row.due_date, { dateOnly: true }) },
    ]} onOpen={(row) => onNav(`finance/invoices/${row.id}`)} /></PaginatedRegister>
  </>;
}

function InvoiceDetail({ invoiceId, onNav, canPay }) {
  const invoice = useWorkspaceData(`/api/v1/finance/invoices/${invoiceId}/`);
  const data = invoice.data;
  useWorkspaceTitle(data?.number, 'Finance', `invoice-${invoiceId}`);
  const allocated = invoiceAllocated(data);
  const balance = invoiceBalance(data);
  const allocations = Array.isArray(data?.allocations) ? data.allocations : null;
  const studentId = relationId(data?.student);
  const cohortId = relationId(data?.cohort);
  const canRecord = canPay && PAYABLE_INVOICE_STATUSES.has(normalizedStatus(data?.status)) && balance > 0;
  return <WorkspaceState state={invoice} empty={!data}>{data && <><WorkspaceHeader eyebrow="Invoice" title={data.number} description={`${data.student_name || 'Student'} · ${data.period || 'Billing period'}`} actions={<><LinkButton to="finance/invoices" onNav={onNav}>Back</LinkButton>{canRecord && <LinkButton to={`finance/payments/new?invoice=${data.id}&amount=${balance}`} onNav={onNav} tone="primary">Record cash payment</LinkButton>}<ActionButton onClick={() => window.print()}>Print</ActionButton></>} />
    <div className="fw-summary-grid"><div className="fw-summary-card"><span>Invoice total</span><strong>{money(data.total_uzs)}</strong><small>UZS</small></div><div className="fw-summary-card"><span>Allocated</span><strong>{money(allocated)}</strong><small>{allocations ? `${allocations.length} allocations` : 'Allocation register unavailable'}</small></div><div className="fw-summary-card"><span>Unallocated balance</span><strong>{money(balance)}</strong><small>{balance == null ? 'Balance evidence is incomplete' : 'Invoice value less allocations'}</small></div><div className="fw-summary-card"><span>Status</span><strong><StatusPill value={data.status} /></strong><small>Due {formatOrganizationDate(data.due_date, { dateOnly: true })}</small></div></div>
    <DetailSection eyebrow="Connected record" title="Student and billing context"><DetailGrid columns={4} fields={[
      { label: 'Student', value: studentId && String(data.student_name || '').trim() ? <RouteLink to={`students/directory/${studentId}/finance`} onNav={onNav}>{data.student_name}</RouteLink> : data.student_name },
      { label: 'Group', value: cohortId && String(data.cohort_name || '').trim() ? <RouteLink to={`groups/${cohortId}/finance`} onNav={onNav}>{data.cohort_name}</RouteLink> : data.cohort_name },
      { label: 'Fee schedule', value: data.fee_schedule_name }, { label: 'Period', value: data.period },
      { label: 'Created by', value: data.created_by_name }, { label: 'Created', value: formatOrganizationDate(data.created_at) },
    ]} /></DetailSection>
    <DetailSection eyebrow="Invoice reasons" title="Line items"><WorkspaceTable label="Invoice line items" rows={data.lines || []} columns={[
      { key: 'description', label: 'Reason' }, { key: 'line_type', label: 'Type', render: (row) => <StatusPill value={row.line_type} /> },
      { key: 'quantity', label: 'Quantity' }, { key: 'unit_price_uzs', label: 'Unit price', render: (row) => money(row.unit_price_uzs) }, { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) },
    ]} /></DetailSection>
    <DetailSection eyebrow="Collections" title="Payment allocations"><WorkspaceTable label="Payment allocations" rows={allocations || []} empty={allocations ? 'No allocations recorded.' : 'Allocation records are unavailable.'} columns={[
      { key: 'payment_id', label: 'Payment', render: (row) => relationId(row.payment_id) ? <RouteLink to={`finance/payments/${relationId(row.payment_id)}`} onNav={onNav}>Payment {relationId(row.payment_id)}</RouteLink> : '—' },
      { key: 'amount_uzs', label: 'Allocated amount', render: (row) => money(row.amount_uzs ?? row.amount) }, { key: 'created_at', label: 'Allocated', render: (row) => formatOrganizationDate(row.created_at) },
    ]} /></DetailSection>
  </>}</WorkspaceState>;
}

function CashPaymentForm({ route, onNav }) {
  const params = workspaceRoute(route).params;
  const invoices = useWorkspaceData('/api/v1/finance/invoices/', { page_size: 100 });
  const [invoiceId, setInvoiceId] = useState(params.get('invoice') || '');
  const [amount, setAmount] = useState(params.get('amount') || '');
  const [intentKey, setIntentKey] = useState(paymentIntentKey);
  const [error, setError] = useState('');
  const toast = useToast();
  const eligibleInvoices = invoices.rows.filter((row) => PAYABLE_INVOICE_STATUSES.has(normalizedStatus(row.status)) && invoiceBalance(row) > 0);
  const selectedInvoice = eligibleInvoices.find((row) => String(row.id) === String(invoiceId));
  const remaining = invoiceBalance(selectedInvoice);
  const enteredAmount = num(amount);
  const validAmount = Boolean(selectedInvoice) && enteredAmount > 0 && enteredAmount <= remaining;
  const mutation = useMutation({ mutationFn: () => httpRequest('POST', '/api/v1/payments/cash/', { body: { invoice: Number(invoiceId), amount_uzs: amount }, idempotencyKey: intentKey }), onSuccess: (payment) => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Cash payment recorded and linked to the invoice.'); onNav(`finance/payments/${payment.id}`); }, onError: (failure) => { const message = mutationMessage(failure, 'The payment could not be recorded.'); setError(message); toast.danger(message, { title: 'Payment not recorded' }); } });
  const chooseInvoice = (nextId) => {
    const selected = eligibleInvoices.find((row) => String(row.id) === nextId);
    setInvoiceId(nextId);
    setAmount(selected ? String(invoiceBalance(selected)) : '');
    setIntentKey(paymentIntentKey());
    setError('');
  };
  const changeAmount = (nextAmount) => {
    setAmount(nextAmount);
    setIntentKey(paymentIntentKey());
    setError('');
  };
  return <div className="fw-page"><WorkspaceHeader eyebrow="Cash collection" title="Record a cash payment" description="Cashier identity is taken from the authenticated account and cannot be typed or spoofed. Retrying the same submission safely reuses one collection key." actions={<LinkButton to="finance/payments" onNav={onNav}>Cancel</LinkButton>} /><form className="fw-form" onSubmit={(event) => { event.preventDefault(); if (!validAmount) { const message = 'Enter an amount greater than zero and no higher than the invoice balance.'; setError(message); toast.warning(message, { title: 'Check the payment' }); return; } mutation.mutate(); }}>{error && <div className="fw-form-error">{error}</div>}<section className="fw-form-section"><header><h2>Payment connection</h2><p>Select an issued invoice and record up to its remaining unallocated balance. The signed-in cashier is recorded automatically.</p></header><label className="is-wide">Invoice<select required disabled={mutation.isPending} value={invoiceId} onChange={(event) => chooseInvoice(event.target.value)}><option value="">Select invoice</option>{eligibleInvoices.map((row) => <option value={row.id} key={row.id}>{row.number} · {row.student_name} · {money(invoiceBalance(row))} remaining</option>)}</select></label><label>Amount (UZS)<input required type="number" inputMode="decimal" min="0.01" max={remaining || undefined} step="0.01" disabled={mutation.isPending || !selectedInvoice} value={amount} onChange={(event) => changeAmount(event.target.value)} /></label>{selectedInvoice && <div className="fw-data-note is-wide">Remaining before this payment: {money(remaining)}. Partial payments are allowed; overpayments are blocked.</div>}</section><div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={mutation.isPending || !validAmount}>{mutation.isPending ? 'Recording…' : 'Record payment'}</ActionButton></div></form></div>;
}

function PaymentList({ route, onNav, canPay }) {
  const params = workspaceRoute(route).params;
  const filters = queryFilters(params, PAYMENT_FILTER_STATUSES);
  const page = queryPage(params);
  const base = 'finance/payments';
  const payments = useWorkspaceData('/api/v1/payments/', { page_size: REGISTER_PAGE_SIZE, page, branch: filters.branch || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined, provider: filters.provider || undefined, status: filters.status || undefined, allocation_status: filters.allocation || undefined });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 });
  return <><FilterPanel title="Payment filters" activeCount={Object.values(filters).filter(Boolean).length} advancedCount={['provider', 'allocation'].filter((key) => filters[key]).length} actions={<><ActionButton tone="ghost" onClick={() => onNav(base)}>Clear</ActionButton>{canPay && <LinkButton to="finance/payments/new" onNav={onNav} tone="primary" icon={Icons.trend}>Record cash payment</LinkButton>}</>} primary={<>
    <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, 'finance/payments', onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={branches.rows} label="branch" />{branches.rows.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></FilterField>
    <FilterField label="From"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, 'finance/payments', onNav)} /></FilterField>
    <FilterField label="To"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, 'finance/payments', onNav)} /></FilterField>
    <FilterField label="Status"><select value={filters.status} onChange={(event) => changeFilter(filters, 'status', event.target.value, 'finance/payments', onNav)}><option value="">All statuses</option>{PAYMENT_FILTER_STATUSES.map((item) => <option value={item} key={item}>{item}</option>)}</select></FilterField>
  </>}>
    <FilterField label="Provider"><select value={filters.provider} onChange={(event) => changeFilter(filters, 'provider', event.target.value, 'finance/payments', onNav)}><option value="">All providers</option>{PAYMENT_PROVIDERS.map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></FilterField>
    <FilterField label="Allocation"><select value={filters.allocation} onChange={(event) => changeFilter(filters, 'allocation', event.target.value, 'finance/payments', onNav)}><option value="">Any allocation</option><option value="auto">Automatic</option><option value="manual_review">Manual review</option><option value="allocated">Allocated</option></select></FilterField>
  </FilterPanel><CoverageBar state={payments} label="payments" filtered /><PaginatedRegister state={payments} requestedPage={page} filters={filters} base={base} label="payments" onNav={onNav} emptyTitle="No payments match this view"><WorkspaceTable label="Payments" rows={payments.rows} columns={[
    { key: 'provider', label: 'Provider', render: (row) => humanLabel(row.provider) }, { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
    { key: 'allocation_status', label: 'Allocation', render: (row) => <StatusPill value={row.allocation_status} /> }, { key: 'paid_at', label: 'Paid', render: (row) => formatOrganizationDate(row.paid_at) },
  ]} onOpen={(row) => onNav(`finance/payments/${row.id}`)} /></PaginatedRegister></>;
}

function PaymentDetail({ paymentId, onNav }) {
  const payment = useWorkspaceData(`/api/v1/payments/${paymentId}/`);
  const data = payment.data;
  useWorkspaceTitle(data ? `Payment ${data.id}` : '', 'Finance', `payment-${paymentId}`);
  const relationship = (label, idKey, nameKey, routeForId) => {
    const readable = String(data?.[nameKey] || '').trim();
    if (!readable) return null;
    const recordId = id(data?.[idKey]);
    return {
      label,
      value: recordId ? <RouteLink to={routeForId(recordId)} onNav={onNav}>{readable}</RouteLink> : readable,
    };
  };
  const relationships = [
    relationship('Invoice', 'invoice', 'invoice_number', (recordId) => `finance/invoices/${recordId}`),
    relationship('Student', 'student', 'student_name', (recordId) => `students/directory/${recordId}/finance`),
    relationship('Family contact', 'payer', 'payer_name', (recordId) => `people/parents/${recordId}`),
    relationship('Cashier', 'cashier_shift', 'cashier_name', (recordId) => `finance/cashier/${recordId}`),
    relationship('Branch at payment', 'branch', 'branch_name', (recordId) => `branches/${recordId}/finance`),
  ].filter(Boolean);
  return <WorkspaceState state={payment} empty={!data}>{data && <><WorkspaceHeader eyebrow="Payment" title={`Payment ${data.id}`} description={`${humanLabel(data.provider, 'Payment provider')} · ${money(data.amount_uzs)}`} actions={<LinkButton to="finance/payments" onNav={onNav}>Back</LinkButton>} /><DetailSection eyebrow="Collection record" title="Payment details"><DetailGrid columns={3} fields={[
    { label: 'Provider', value: humanLabel(data.provider) }, { label: 'Amount', value: money(data.amount_uzs) }, { label: 'Currency', value: data.currency },
    { label: 'Status', value: <StatusPill value={data.status} /> }, { label: 'Allocation status', value: <StatusPill value={data.allocation_status} /> }, { label: 'Paid at', value: formatOrganizationDate(data.paid_at) },
    { label: 'Provider transaction', value: data.provider_txn_id }, { label: 'Account reference', value: data.account_ref },
    { label: 'Created', value: formatOrganizationDate(data.created_at) }, { label: 'Updated', value: formatOrganizationDate(data.updated_at) },
  ]} /></DetailSection>{relationships.length > 0 && <DetailSection eyebrow="Connected records" title="Verified payment relationships"><DetailGrid columns={3} fields={relationships} /></DetailSection>}<div className="fw-data-note">Connected records appear only when this payment includes a readable relationship. Bare identifiers remain unlinked so this view never guesses who or what they represent.</div></>}</WorkspaceState>;
}

function CashierShiftDetail({ shiftId, onNav }) {
  const shift = useWorkspaceData(`/api/v1/finance/cashier-shifts/${shiftId}/`);
  const data = shift.data;
  useWorkspaceTitle(data?.cashier_name, 'Finance', `cashier-shift-${shiftId}`);
  const branchId = id(data?.branch);
  const branchName = String(data?.branch_name || '').trim();
  const branch = branchName && branchId
    ? <RouteLink to={`branches/${branchId}/finance`} onNav={onNav}>{branchName}</RouteLink>
    : branchName || null;
  return <WorkspaceState state={shift} empty={!data}>{data && <><WorkspaceHeader eyebrow="Cashier shift" title={data.cashier_name || 'Cashier shift'} description={`${humanLabel(data.status)} · ${formatOrganizationDate(data.opened_at) || 'Opening time not recorded'}`} actions={<LinkButton to="finance/cashier" onNav={onNav}>Back</LinkButton>} /><DetailSection eyebrow="Controlled collection" title="Shift details"><DetailGrid columns={3} fields={[
    { label: 'Cashier', value: data.cashier_name }, { label: 'Branch', value: branch }, { label: 'Status', value: <StatusPill value={data.status} /> },
    { label: 'Opened', value: formatOrganizationDate(data.opened_at) }, { label: 'Closed', value: formatOrganizationDate(data.closed_at) },
    { label: 'Opening cash', value: money(data.opening_cash_uzs) }, { label: 'Discrepancy', value: signedMoney(data.discrepancy_uzs) },
  ]} /></DetailSection></>}</WorkspaceState>;
}

function ExpenseForm({ onNav }) {
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 });
  const [form, setForm] = useState({ branch: '', description: '', amount_uzs: '', category: '' });
  const [error, setError] = useState('');
  const toast = useToast();
  const mutation = useMutation({ mutationFn: () => httpRequest('POST', '/api/v1/finance/expenses/', { body: { ...form, branch: Number(form.branch) } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Expense submitted to the controlled approval flow.'); onNav('finance/expenses'); }, onError: (failure) => { const message = mutationMessage(failure, 'The expense could not be submitted.'); setError(message); toast.danger(message, { title: 'Expense not submitted' }); } });
  return <div className="fw-page"><WorkspaceHeader eyebrow="Expense commitment" title="Create an expense" description="Record what the education center needs to pay. Approval and disbursement remain separate, accountable steps." actions={<LinkButton to="finance/expenses" onNav={onNav}>Cancel</LinkButton>} /><form className="fw-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>{error && <div className="fw-form-error">{error}</div>}<section className="fw-form-section"><header><h2>Expense request</h2><p>The signed-in person is recorded automatically; do not type a cashier identity.</p></header><label>Branch<select required value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })}><option value="">Select branch</option>{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Category<input maxLength="80" value={form.category} placeholder="Rent, utilities, supplies…" onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label className="is-wide">Description<textarea required maxLength="255" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Amount (UZS)<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount_uzs} onChange={(event) => setForm({ ...form, amount_uzs: event.target.value })} /></label></section><div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit expense'}</ActionButton></div></form></div>;
}

function ExpenseList({ route, onNav, canCreate }) {
  const params = workspaceRoute(route).params;
  const filters = queryFilters(params, EXPENSE_FILTER_STATUSES);
  const page = queryPage(params);
  const base = 'finance/expenses';
  const expenses = useWorkspaceData('/api/v1/finance/expenses/', { page_size: REGISTER_PAGE_SIZE, page, branch: filters.branch || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined, status: filters.status || undefined, category: filters.category || undefined });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 });
  return <><FilterPanel title="Expense filters" activeCount={Object.values(filters).filter(Boolean).length} advancedCount={filters.category ? 1 : 0} actions={<><ActionButton tone="ghost" onClick={() => onNav(base)}>Clear</ActionButton>{canCreate && <LinkButton to="finance/expenses/new" onNav={onNav} tone="primary" icon={Icons.flag}>Create expense</LinkButton>}</>} primary={<>
    <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, 'finance/expenses', onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={branches.rows} label="branch" />{branches.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
    <FilterField label="From"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, 'finance/expenses', onNav)} /></FilterField>
    <FilterField label="To"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, 'finance/expenses', onNav)} /></FilterField>
    <FilterField label="Status"><select value={filters.status} onChange={(event) => changeFilter(filters, 'status', event.target.value, 'finance/expenses', onNav)}><option value="">All statuses</option>{EXPENSE_FILTER_STATUSES.map((item) => <option value={item} key={item}>{item}</option>)}</select></FilterField>
  </>}>
    <FilterField label="Category"><DeferredFilterInput maxLength={80} value={filters.category} onCommit={(value) => changeFilter(filters, 'category', value, 'finance/expenses', onNav, { replace: true })} /></FilterField>
  </FilterPanel><CoverageBar state={expenses} label="expenses" filtered /><PaginatedRegister state={expenses} requestedPage={page} filters={filters} base={base} label="expenses" onNav={onNav} emptyTitle="No expenses match this view"><WorkspaceTable label="Expenses" rows={expenses.rows} columns={[
    { key: 'description', label: 'Expense', render: (row) => id(row.id) ? <RouteLink className="fw-finance-record-link" to={`finance/expenses/${row.id}`} onNav={onNav}>{row.description || `Expense ${row.id}`}</RouteLink> : row.description },
    { key: 'category', label: 'Category' }, { key: 'branch_name', label: 'Branch' },
    { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
    { key: 'created_by_name', label: 'Requested by' }, { key: 'created_at', label: 'Created', render: (row) => formatOrganizationDate(row.created_at) },
  ]} rowLabel="description" onOpen={(row) => onNav(`finance/expenses/${row.id}`)} /></PaginatedRegister></>;
}

function ExpenseDetail({ expenseId, onNav }) {
  const expense = useWorkspaceData(`/api/v1/finance/expenses/${expenseId}/`);
  const data = expense.data;
  const title = String(data?.description || '').trim() || `Expense ${expenseId}`;
  const branchId = id(data?.branch);
  const branchName = String(data?.branch_name || '').trim();
  const branch = branchId && branchName
    ? <RouteLink to={`branches/${branchId}/finance`} onNav={onNav}>{branchName}</RouteLink>
    : branchName || null;
  useWorkspaceTitle(data ? title : '', 'Finance', `expense-${expenseId}`);

  return <WorkspaceState state={expense} empty={!data} emptyTitle="Expense record unavailable" emptyBody="Return to the expense register and choose another record.">{data && <div className="fw-record-detail">
    <WorkspaceHeader eyebrow="Expense" title={title} description={`${humanLabel(data.category, 'Uncategorized expense')} · ${money(data.amount_uzs)}`} actions={<><LinkButton to="finance/expenses" onNav={onNav}>Back to expenses</LinkButton><ActionButton onClick={() => window.print()}>Print</ActionButton></>} />
    <div className="fw-summary-grid is-record-metrics">
      <div className="fw-summary-card"><span>Committed amount</span><strong>{money(data.amount_uzs)}</strong><small>Recorded expense value</small></div>
      <div className="fw-summary-card"><span>Current status</span><strong><StatusPill value={data.status} /></strong><small>{formatOrganizationDate(data.approved_at) || 'No approval time recorded'}</small></div>
      <div className="fw-summary-card"><span>Payment method</span><strong>{data.payment_method_name || '—'}</strong><small>{data.paid_at ? `Paid ${formatOrganizationDate(data.paid_at)}` : 'Not recorded as paid'}</small></div>
      <div className="fw-summary-card"><span>Branch</span><strong>{branch || '—'}</strong><small>Recorded responsibility</small></div>
    </div>
    <DetailSection eyebrow="Commitment record" title="Expense details"><DetailGrid columns={3} fields={[
      { label: 'Description', value: data.description, wide: true },
      { label: 'Category', value: humanLabel(data.category) },
      { label: 'Branch', value: branch },
      { label: 'Amount', value: money(data.amount_uzs) },
      { label: 'Status', value: <StatusPill value={data.status} /> },
      { label: 'Payment method', value: data.payment_method_name },
      { label: 'Created', value: formatOrganizationDate(data.created_at) },
      { label: 'Approved', value: formatOrganizationDate(data.approved_at) },
      { label: 'Paid', value: formatOrganizationDate(data.paid_at) },
    ]} /></DetailSection>
    <DetailSection eyebrow="Accountability" title="Approval and payment trail" description="Names are shown exactly as recorded on this expense."><DetailGrid columns={3} fields={[
      { label: 'Requested by', value: data.created_by_name },
      { label: 'Approved by', value: data.approved_by_name },
      { label: 'Paid by', value: data.paid_by_name },
      { label: 'Rejection reason', value: data.reject_reason, wide: true },
      { label: 'Approval record', value: id(data.approval_request) ? `#${data.approval_request}` : null },
      { label: 'Financial entry', value: id(data.ledger_entry) ? `#${data.ledger_entry}` : null },
    ]} /></DetailSection>
    <div className="fw-data-note">Branch navigation appears only when this expense includes both a branch identity and a readable branch name. Staff names remain plain text unless a matching staff profile is available.</div>
  </div>}</WorkspaceState>;
}

function RefundList({ route, onNav }) {
  const params = workspaceRoute(route).params;
  const filters = queryFilters(params, REFUND_FILTER_STATUSES);
  const page = queryPage(params);
  const base = 'finance/refunds';
  const refunds = useWorkspaceData('/api/v1/finance/refunds/', { page_size: REGISTER_PAGE_SIZE, page, branch: filters.branch || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined, state: filters.status || undefined, provider: filters.provider || undefined });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 });
  return <><FilterPanel title="Refund filters" activeCount={Object.values(filters).filter(Boolean).length} advancedCount={filters.provider ? 1 : 0} actions={<ActionButton tone="ghost" onClick={() => onNav(base)}>Clear</ActionButton>} primary={<>
    <FilterField label="Branch"><select value={filters.branch} onChange={(event) => changeFilter(filters, 'branch', event.target.value, 'finance/refunds', onNav)}><option value="">All branches</option><UnloadedSelectionOption value={filters.branch} options={branches.rows} label="branch" />{branches.rows.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></FilterField>
    <FilterField label="From"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter(filters, 'from', event.target.value, 'finance/refunds', onNav)} /></FilterField>
    <FilterField label="To"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter(filters, 'to', event.target.value, 'finance/refunds', onNav)} /></FilterField>
    <FilterField label="State"><select value={filters.status} onChange={(event) => changeFilter(filters, 'status', event.target.value, 'finance/refunds', onNav)}><option value="">All states</option>{REFUND_FILTER_STATUSES.map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></FilterField>
  </>}>
    <FilterField label="Provider"><select value={filters.provider} onChange={(event) => changeFilter(filters, 'provider', event.target.value, 'finance/refunds', onNav)}><option value="">All providers</option>{PAYMENT_PROVIDERS.map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></FilterField>
  </FilterPanel><div className="fw-data-note">Refunds remain controlled requests until approved and confirmed.</div><CoverageBar state={refunds} label="refunds" filtered /><PaginatedRegister state={refunds} requestedPage={page} filters={filters} base={base} label="refunds" onNav={onNav} emptyTitle="No refunds match this view"><WorkspaceTable label="Refunds" rows={refunds.rows} columns={[
    { key: 'reason', label: 'Refund', render: (row) => id(row.id) ? <RouteLink className="fw-finance-record-link" to={`finance/refunds/${row.id}`} onNav={onNav}>{row.reason || `Refund ${row.id}`}</RouteLink> : row.reason },
    { key: 'invoice', label: 'Invoice' }, { key: 'provider', label: 'Provider' },
    { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) }, { key: 'state', label: 'State', render: (row) => <StatusPill value={row.state} /> },
    { key: 'created_at', label: 'Requested', render: (row) => formatOrganizationDate(row.created_at) },
  ]} rowLabel={(row) => row.reason || `Refund ${row.id}`} onOpen={(row) => onNav(`finance/refunds/${row.id}`)} /></PaginatedRegister></>;
}

function RefundDetail({ refundId, onNav }) {
  const refund = useWorkspaceData(`/api/v1/finance/refunds/${refundId}/`);
  const data = refund.data;
  const title = `Refund ${data?.id || refundId}`;
  const invoiceId = id(data?.invoice);
  useWorkspaceTitle(data ? title : '', 'Finance', `refund-${refundId}`);

  return <WorkspaceState state={refund} empty={!data} emptyTitle="Refund record unavailable" emptyBody="Return to the refund register and choose another record.">{data && <div className="fw-record-detail">
    <WorkspaceHeader eyebrow="Refund" title={title} description={`${humanLabel(data.provider, 'Provider not recorded')} · ${data.reason || 'Reason not recorded'}`} actions={<><LinkButton to="finance/refunds" onNav={onNav}>Back to refunds</LinkButton><ActionButton onClick={() => window.print()}>Print</ActionButton></>} />
    <div className="fw-summary-grid is-record-metrics">
      <div className="fw-summary-card"><span>Refund amount</span><strong>{money(data.amount_uzs)}</strong><small>Requested return value</small></div>
      <div className="fw-summary-card"><span>Current state</span><strong><StatusPill value={data.state} /></strong><small>Controlled refund lifecycle</small></div>
      <div className="fw-summary-card"><span>Provider</span><strong>{humanLabel(data.provider)}</strong><small>{data.provider_refund_id || 'No provider reference recorded'}</small></div>
      <div className="fw-summary-card"><span>Confirmed</span><strong>{data.provider_confirmed_at ? 'Yes' : '—'}</strong><small>{formatOrganizationDate(data.provider_confirmed_at) || 'No confirmation time recorded'}</small></div>
    </div>
    <DetailSection eyebrow="Reversal record" title="Refund details"><DetailGrid columns={3} fields={[
      { label: 'Reason', value: data.reason, wide: true },
      { label: 'Amount', value: money(data.amount_uzs) },
      { label: 'State', value: <StatusPill value={data.state} /> },
      { label: 'Provider', value: humanLabel(data.provider) },
      { label: 'Provider refund reference', value: data.provider_refund_id },
      { label: 'Provider confirmed', value: formatOrganizationDate(data.provider_confirmed_at) },
      { label: 'Requested', value: formatOrganizationDate(data.created_at) },
      { label: 'Last updated', value: formatOrganizationDate(data.updated_at) },
    ]} /></DetailSection>
    <DetailSection eyebrow="Connected billing" title="Verified and recorded references"><DetailGrid columns={3} fields={[
      { label: 'Invoice', value: invoiceId ? <RouteLink to={`finance/invoices/${invoiceId}`} onNav={onNav}>Open invoice {invoiceId}</RouteLink> : null },
      { label: 'Payment reference', value: id(data.payment_id) ? `#${data.payment_id}` : null },
      { label: 'Financial entry', value: id(data.ledger_entry) ? `#${data.ledger_entry}` : null },
      { label: 'Requested by record', value: id(data.requested_by) ? `#${data.requested_by}` : null },
      { label: 'Approved by record', value: id(data.approved_by) ? `#${data.approved_by}` : null },
    ]} /></DetailSection>
    <div className="fw-data-note">The invoice is a verified billing relationship. Payment and staff references remain unlinked because this refund does not include readable identities for those records.</div>
  </div>}</WorkspaceState>;
}

function LoanList({ onNav }) {
  const state = useWorkspaceData('/api/v1/loans/', { page_size: 100 });
  return <><div className="fw-data-note">These are staff loan approval records. The current service provides the request and repayment position, but not a readable employee name, so this register does not guess one from an account number.</div><CoverageBar state={state} label="loans" /><WorkspaceState state={state} empty={!state.rows.length}><WorkspaceTable label="loans" rows={state.rows} columns={[
    { key: 'title', label: 'Loan request', render: (row) => <span className="fw-person-cell"><strong>{id(row.id) ? <RouteLink className="fw-finance-record-link" to={`finance/loans/${row.id}`} onNav={onNav}>{row.title || `Staff loan ${row.id}`}</RouteLink> : row.title || 'Staff loan'}</strong><small>{row.description || 'No description recorded'}</small></span> },
    { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) }, { key: 'repaid_uzs', label: 'Repaid', render: (row) => money(row.repaid_uzs) },
    { key: 'outstanding_uzs', label: 'Outstanding', render: (row) => money(row.outstanding_uzs) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
    { key: 'created_at', label: 'Created', render: (row) => formatOrganizationDate(row.created_at) },
  ]} rowLabel="title" onOpen={(row) => onNav(`finance/loans/${row.id}`)} /></WorkspaceState></>;
}

function LoanDetail({ loanId, onNav }) {
  const loan = useWorkspaceData(`/api/v1/loans/${loanId}/`);
  const data = loan.data;
  const repayments = useWorkspaceData(`/api/v1/loans/${loanId}/repayments/`, {}, { enabled: Boolean(data) });
  const title = String(data?.title || '').trim() || `Staff loan ${loanId}`;
  useWorkspaceTitle(data ? title : '', 'Finance', `loan-${loanId}`);

  return <WorkspaceState state={loan} empty={!data} emptyTitle="Loan record unavailable" emptyBody="Return to the staff-loan register and choose another record.">{data && <div className="fw-record-detail">
    <WorkspaceHeader eyebrow="Staff loan" title={title} description={data.description || 'No purpose description recorded'} actions={<><LinkButton to="finance/loans" onNav={onNav}>Back to staff loans</LinkButton><ActionButton onClick={() => window.print()}>Print</ActionButton></>} />
    <div className="fw-summary-grid is-record-metrics">
      <div className="fw-summary-card"><span>Original amount</span><strong>{money(data.amount_uzs)}</strong><small>Requested loan value</small></div>
      <div className="fw-summary-card"><span>Repaid</span><strong>{money(data.repaid_uzs)}</strong><small>Recorded repayments</small></div>
      <div className="fw-summary-card"><span>Outstanding</span><strong>{money(data.outstanding_uzs)}</strong><small>{data.outstanding_uzs == null ? 'Available after disbursement' : data.settled ? 'Loan is settled' : 'Amount still due'}</small></div>
      <div className="fw-summary-card"><span>Status</span><strong><StatusPill value={data.status} /></strong><small>{data.settled ? 'Settled' : 'Current approval state'}</small></div>
    </div>
    <DetailSection eyebrow="Loan position" title="Request and lifecycle"><DetailGrid columns={3} fields={[
      { label: 'Purpose', value: data.description, wide: true },
      { label: 'Status', value: <StatusPill value={data.status} /> },
      { label: 'Original amount', value: money(data.amount_uzs) },
      { label: 'Repaid', value: money(data.repaid_uzs) },
      { label: 'Outstanding', value: money(data.outstanding_uzs) },
      { label: 'Settled', value: data.outstanding_uzs == null ? null : data.settled ? 'Yes' : 'No' },
      { label: 'Created', value: formatOrganizationDate(data.created_at) },
      { label: 'Decision recorded', value: formatOrganizationDate(data.decided_at) },
      { label: 'Disbursed', value: formatOrganizationDate(data.disbursed_at) },
    ]} /></DetailSection>
    <DetailSection eyebrow="Accountability" title="Recorded ownership references" description="Numeric account references are not presented as employee profiles."><DetailGrid columns={3} fields={[
      { label: 'Branch record', value: id(data.branch) ? `#${data.branch}` : null },
      { label: 'Requested by record', value: id(data.requested_by) ? `#${data.requested_by}` : null },
      { label: 'Decided by record', value: id(data.decided_by) ? `#${data.decided_by}` : null },
      { label: 'Disbursed by record', value: id(data.disbursed_by) ? `#${data.disbursed_by}` : null },
      { label: 'Financial entry', value: id(data.ledger_entry) ? `#${data.ledger_entry}` : null },
    ]} /></DetailSection>
    <DetailSection eyebrow="Repayment history" title="Recorded repayments" description="Every row is taken from this loan's dedicated repayment register."><WorkspaceState state={repayments} empty={!repayments.rows.length} emptyTitle="No repayments recorded" emptyBody="Repayments will appear here after money is received."><WorkspaceTable label="Loan repayments" rows={repayments.rows} columns={[
      { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) },
      { key: 'created_at', label: 'Recorded', render: (row) => formatOrganizationDate(row.created_at) },
      { key: 'note', label: 'Note' },
      { key: 'payment_method', label: 'Payment method record', render: (row) => id(row.payment_method) ? `#${row.payment_method}` : '—' },
      { key: 'recorded_by', label: 'Recorded by reference', render: (row) => id(row.recorded_by) ? `#${row.recorded_by}` : '—' },
    ]} /></WorkspaceState></DetailSection>
    <div className="fw-data-note">Branch and staff references remain unlinked until the loan record includes readable names. This view never turns an account number into a guessed person.</div>
  </div>}</WorkspaceState>;
}

function CashierView({ onNav }) {
  const shifts = useWorkspaceData('/api/v1/finance/cashier-shifts/', { page_size: 100 });
  const reconciliation = useWorkspaceData('/api/v1/payments/reconciliation/');
  return <><div className="fw-summary-grid"><div className="fw-summary-card"><span>Paid today</span><strong>{stateValue(reconciliation, reconciliation.data?.total_paid_uzs)}</strong><small>{stateDescription(reconciliation, 'Daily reconciliation')}</small></div><div className="fw-summary-card"><span>Allocated today</span><strong>{stateValue(reconciliation, reconciliation.data?.total_allocated_uzs)}</strong><small>{stateDescription(reconciliation, 'Matched to invoices')}</small></div><div className="fw-summary-card"><span>Mismatches</span><strong>{stateValue(reconciliation, reconciliation.data?.mismatch_count, formatBusinessNumber)}</strong><small>{stateDescription(reconciliation, 'Needs review')}</small></div><div className="fw-summary-card"><span>Visible shifts</span><strong>{stateValue(shifts, shifts.total, formatBusinessNumber)}</strong><small>{stateDescription(shifts, 'Current register')}</small></div></div><CoverageBar state={shifts} label="cashier shifts" /><WorkspaceState state={shifts} empty={!shifts.rows.length}><WorkspaceTable label="Cashier shifts" rows={shifts.rows} columns={[
    { key: 'cashier_name', label: 'Cashier' }, { key: 'branch_name', label: 'Branch' }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
    { key: 'opened_at', label: 'Opened', render: (row) => formatOrganizationDate(row.opened_at) }, { key: 'closed_at', label: 'Closed', render: (row) => formatOrganizationDate(row.closed_at) },
    { key: 'opening_cash_uzs', label: 'Opening', render: (row) => money(row.opening_cash_uzs) }, { key: 'discrepancy_uzs', label: 'Discrepancy', render: (row) => signedMoney(row.discrepancy_uzs) },
  ]} onOpen={(row) => onNav(`finance/cashier/${row.id}`)} /></WorkspaceState></>;
}

function ConfigurationView() {
  const fees = useWorkspaceData('/api/v1/finance/fee-schedules/', { page_size: 100 });
  const methods = useWorkspaceData('/api/v1/finance/payment-methods/', { page_size: 100 });
  return <><DetailSection eyebrow="Tuition" title="Fee schedules"><WorkspaceState state={fees} empty={!fees.rows.length}><WorkspaceTable label="Fee schedules" rows={fees.rows} columns={[
    { key: 'name', label: 'Schedule' }, { key: 'cohort_name', label: 'Group' }, { key: 'amount_uzs', label: 'Amount', render: (row) => money(row.amount_uzs) },
    { key: 'billing_period', label: 'Period', render: (row) => humanLabel(row.billing_period) }, { key: 'due_day_of_month', label: 'Due day' }, { key: 'is_active', label: 'Status', render: (row) => <StatusPill value={row.is_active ? 'Active' : 'Inactive'} /> },
  ]} /></WorkspaceState></DetailSection><DetailSection eyebrow="Collection" title="Payment methods"><WorkspaceState state={methods} empty={!methods.rows.length}><WorkspaceTable label="Payment methods" rows={methods.rows} columns={[
    { key: 'name', label: 'Payment method' }, { key: 'slug', label: 'Code' }, { key: 'is_active', label: 'Status', render: (row) => <StatusPill value={row.is_active ? 'Active' : 'Inactive'} /> },
  ]} /></WorkspaceState></DetailSection></>;
}

export function FinancePage({ route, onNav, user }) {
  const routed = workspaceRoute(route);
  const relative = routed.segments.slice(1);
  const canPay = canUseCapability(user, 'payments:write');
  const canCreateExpense = canUseCapability(user, 'approvals:write');
  const canReport = canUseCapability(user, 'reports:write');
  if (relative[0] === 'payments' && relative[1] === 'new' && canPay) return <CashPaymentForm route={route} onNav={onNav} />;
  const paymentId = relative[0] === 'payments' ? id(relative[1]) : null;
  if (paymentId) return <div className="fw-page"><PaymentDetail paymentId={paymentId} onNav={onNav} /></div>;
  const cashierShiftId = relative[0] === 'cashier' ? id(relative[1]) : null;
  if (cashierShiftId) return <div className="fw-page"><CashierShiftDetail shiftId={cashierShiftId} onNav={onNav} /></div>;
  if (relative[0] === 'expenses' && relative[1] === 'new' && canCreateExpense) return <ExpenseForm onNav={onNav} />;
  const expenseId = relative[0] === 'expenses' ? id(relative[1]) : null;
  if (expenseId) return <div className="fw-page"><ExpenseDetail expenseId={expenseId} onNav={onNav} /></div>;
  const refundId = relative[0] === 'refunds' ? id(relative[1]) : null;
  if (refundId) return <div className="fw-page"><RefundDetail refundId={refundId} onNav={onNav} /></div>;
  const loanId = relative[0] === 'loans' ? id(relative[1]) : null;
  if (loanId) return <div className="fw-page"><LoanDetail loanId={loanId} onNav={onNav} /></div>;
  const invoiceId = relative[0] === 'invoices' ? id(relative[1]) : null;
  if (invoiceId) return <div className="fw-page"><InvoiceDetail invoiceId={invoiceId} onNav={onNav} canPay={canPay} /></div>;
  const section = SECTIONS.some((item) => item.id === relative[0]) ? relative[0] : 'overview';
  return <div className="fw-page fa5-workspace"><WorkspaceHeader eyebrow="Financial stewardship" title="Finance" description="See what was billed, what arrived, what remains unpaid, and which student accounts need follow-up—without leaving the financial trail." actions={<FinanceReportActions filters={queryFilters(routed.params)} onNav={onNav} canWrite={canReport} />} /><WorkspaceLayout navigation={<SectionNav label="Finance" items={SECTIONS} active={section} basePath="finance" onNav={onNav} />}>
    {section === 'overview' && <FinanceOverview route={route} onNav={onNav} />}
    {section === 'debt' && <DebtStudents route={route} onNav={onNav} />}
    {section === 'invoices' && <InvoiceList route={route} onNav={onNav} />}
    {section === 'payments' && <PaymentList route={route} onNav={onNav} canPay={canPay} />}
    {section === 'expenses' && <ExpenseList route={route} onNav={onNav} canCreate={canCreateExpense} />}
    {section === 'refunds' && <RefundList route={route} onNav={onNav} />}
    {section === 'cashier' && <CashierView onNav={onNav} />}
    {section === 'loans' && <LoanList onNav={onNav} />}
    {section === 'configuration' && <ConfigurationView />}
  </WorkspaceLayout></div>;
}
