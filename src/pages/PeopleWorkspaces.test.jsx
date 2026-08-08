import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceCalls = vi.hoisted(() => []);
const directoryMetadata = vi.hoisted(() => ({ students: null, teachers: null }));
const unavailablePaths = vi.hoisted(() => new Set());
const partialPaths = vi.hoisted(() => new Set());
const omittedTeacherEvidence = vi.hoisted(() => ({ cohort: false, signal: false }));
const teacherSignalOverride = vi.hoisted(() => ({ value: null }));
const studentInvoices = vi.hoisted(() => []);
const attendanceOverride = vi.hoisted(() => ({ rows: null }));
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), danger: vi.fn() }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../context/ToastContext.jsx', () => ({ useToast: () => toast }));

const student = {
  id: 44,
  student_id: 'DEMO-44',
  username: 'mohira',
  full_name: 'Mohira Olimova',
  first_name: 'Mohira',
  last_name: 'Olimova',
  status: 'accepted',
  branch: 2,
  branch_name: 'Central Campus',
  current_cohort: 7,
  current_cohort_name: 'North Stars',
  academic_level: 'Intermediate',
  enrollment_date: '2026-01-10',
  is_active: true,
  is_blocked: false,
};

const cohort = {
  id: 7,
  name: 'North Stars',
  branch: 2,
  branch_name: 'Central Campus',
  department_name: 'English',
  level: 'Intermediate',
  primary_teacher: 9,
  primary_teacher_name: 'Dilshod Rahimov',
  start_date: '2026-01-10',
  end_date: '2026-12-20',
  capacity: 18,
};

const teacher = {
  id: 9,
  username: 'dilshod',
  full_name: 'Dilshod Rahimov',
  branch: 2,
  branch_name: 'Central Campus',
  department_name: 'English',
  subjects: ['English', 'Academic writing'],
  hire_date: '2024-08-15',
  is_active: true,
  is_substitute: false,
};

vi.mock('../hooks/useWorkspaceData.js', () => ({
  downloadSpreadsheet: vi.fn(),
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path, params, options = {}) {
    const enabled = options.enabled ?? Boolean(path);
    workspaceCalls.push({ path, params, enabled });
    if (unavailablePaths.has(path)) {
      return {
        data: null,
        rows: [],
        total: 0,
        pagination: null,
        loading: false,
        pending: false,
        paused: false,
        error: { status: 503 },
        complete: false,
        retry: vi.fn(),
      };
    }
    let data = { count: 0, results: [] };
    if (path === '/api/v1/students/') data = { count: 1, results: [student] };
    if (path === '/api/v1/students/44/') data = student;
    if (path === '/api/v1/students/44/events/') data = {
      count: 1,
      results: [{
        id: 901,
        from_status: 'application',
        to_status: 'accepted',
        reason_code: 'application_reviewed',
        note: 'Leadership review completed.',
        created_at: '2026-01-10T10:00:00+05:00',
      }],
    };
    if (path === '/api/v1/teachers/') data = { count: 1, results: [teacher] };
    if (path === '/api/v1/teachers/9/') data = teacher;
    if (path === '/api/v1/cohorts/') data = omittedTeacherEvidence.cohort
      ? { count: 205, results: [{ ...cohort, id: 71, name: 'Another group', primary_teacher: 71 }] }
      : { count: 1, results: [cohort] };
    if (path === '/api/v1/cohorts/7/') data = cohort;
    if (path === '/api/v1/org/branches/') data = { count: 1, results: [{ id: 2, name: 'Central Campus' }] };
    if (path === '/api/v1/org/departments/') data = { count: 1, results: [{ id: 3, name: 'English' }] };
    if (path === '/api/v1/intelligence/teachers/') data = teacherSignalOverride.value
      ? { count: 1, results: [teacherSignalOverride.value] }
      : omittedTeacherEvidence.signal
      ? { count: 205, results: [{ teacher: 71, engagement_score: 82, lessons_delivered: 8, students_reached: 12 }] }
      : { count: 1, results: [{ teacher: 9, engagement_score: 91.7, lessons_delivered: 12, students_reached: 18 }] };
    if (path === '/api/v1/attendance/records/') {
      const results = attendanceOverride.rows || [{ id: 1, lesson: 81, lesson_title: 'Reading workshop', lesson_starts_at: '2026-07-01T09:00:00+05:00', cohort: 7, cohort_name: 'North Stars', teacher: 9, teacher_name: 'Dilshod Rahimov', status: 'present' }];
      data = { count: results.length, results };
    }
    if (path === '/api/v1/finance/invoices/') data = { count: studentInvoices.length, results: studentInvoices };
    const rows = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
    const metadata = path === '/api/v1/students/'
      ? directoryMetadata.students
      : path === '/api/v1/teachers/'
        ? directoryMetadata.teachers
        : null;
    return {
      data,
      rows,
      total: Number(metadata?.total ?? data.count ?? rows.length),
      pagination: metadata,
      loading: false,
      pending: false,
      paused: false,
      error: null,
      complete: enabled && !metadata && !partialPaths.has(path),
      retry: vi.fn(),
    };
  },
}));

import { studentStatusPresentation } from '../lib/peoplePresentation.js';
import { StudentsPage } from './StudentsWorkspace.jsx';
import { TeachersPage } from './TeachersWorkspace.jsx';

const user = { effective_permissions: ['*:*'] };

describe('People workspace redesign', () => {
  beforeEach(() => {
    workspaceCalls.splice(0);
    directoryMetadata.students = null;
    directoryMetadata.teachers = null;
    unavailablePaths.clear();
    partialPaths.clear();
    omittedTeacherEvidence.cohort = false;
    omittedTeacherEvidence.signal = false;
    teacherSignalOverride.value = null;
    studentInvoices.splice(0);
    attendanceOverride.rows = null;
  });

  it('uses product language for student lifecycle states', () => {
    expect(studentStatusPresentation('accepted')).toEqual({ label: 'Ready for placement', tone: 'warn' });
    expect(studentStatusPresentation('withdrawn').label).toBe('No longer enrolled');
  });

  it('keeps advanced student filters behind an accessible disclosure until active', () => {
    const collapsed = renderToStaticMarkup(<StudentsPage route="students/directory" onNav={vi.fn()} user={user} />);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain('Joined after');
    expect(collapsed).toContain('Ready for placement');

    const expanded = renderToStaticMarkup(<StudentsPage route="students/directory?blocked=true" onNav={vi.fn()} user={user} />);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('Joined after');
    expect(expanded).toContain('1 advanced filters active');
  });

  it('prioritizes student cards and links every available relationship', () => {
    const html = renderToStaticMarkup(<StudentsPage route="students/directory" onNav={vi.fn()} user={user} />);
    expect(html).toContain('fw-person-card is-student');
    expect(html).toContain('href="#/students/44/overview"');
    expect(html).toContain('href="#/branches/2/overview"');
    expect(html).toContain('href="#/groups/7/overview"');
    expect(html).toContain('href="#/teachers/9/overview"');
  });

  it('requests and exposes the URL-backed student page without counting it as a filter', () => {
    directoryMetadata.students = { total: 73, page: 2, page_size: 24, pages: 4 };
    const html = renderToStaticMarkup(<StudentsPage route="students/directory?status=active&page=2" onNav={vi.fn()} user={user} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/students/');

    expect(request.params).toMatchObject({ page: 2, page_size: 24, status: 'active' });
    expect(html).toContain('aria-label="students pages"');
    expect(html).toContain('73 students');
    expect(html).toContain('Page 2 of 4');
    expect(html).toContain('Download this page');
    expect(html).toContain('1 of 73 students loaded');
    expect(html).toContain('The register total is exact; cards and downloads contain only this page.');
  });

  it('bounds student and teacher URL text before requests and rejects malformed typed filters', () => {
    const longSearch = 's'.repeat(500);
    const longLocation = 'l'.repeat(500);
    renderToStaticMarkup(<StudentsPage route={`students/directory?q=${longSearch}&location=${longLocation}&branch=invalid&status=unknown&joined_after=2026-02-31`} onNav={vi.fn()} user={user} />);
    const studentRequest = workspaceCalls.find((call) => call.path === '/api/v1/students/');

    expect(studentRequest.params.search).toBe('s'.repeat(120));
    expect(studentRequest.params.location).toBe('l'.repeat(160));
    expect(studentRequest.params.branch).toBeUndefined();
    expect(studentRequest.params.status).toBeUndefined();
    expect(studentRequest.params.joined_after).toBeUndefined();

    workspaceCalls.splice(0);
    renderToStaticMarkup(<TeachersPage route={`teachers/directory?q=${longSearch}&subject=${longLocation}&branch=invalid&active=maybe&hired_after=not-a-date`} onNav={vi.fn()} user={user} />);
    const teacherRequest = workspaceCalls.find((call) => call.path === '/api/v1/teachers/');

    expect(teacherRequest.params.search).toBe('s'.repeat(120));
    expect(teacherRequest.params.subject).toBe('l'.repeat(100));
    expect(teacherRequest.params.branch).toBeUndefined();
    expect(teacherRequest.params.is_active).toBeUndefined();
    expect(teacherRequest.params.hired_after).toBeUndefined();
  });

  it('keeps unknown numeric student relationship filters visible while requesting their exact scope', () => {
    const html = renderToStaticMarkup(<StudentsPage route="students/directory?branch=990&cohort=991&teacher=992" onNav={vi.fn()} user={user} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/students/');

    expect(request.params).toMatchObject({ branch: '990', cohort: '991', teacher: '992' });
    expect(html).toContain('<option value="990" selected="">Selected branch is outside this menu</option>');
    expect(html).toContain('<option value="991" selected="">Selected group is outside this menu</option>');
    expect(html).toContain('<option value="992" selected="">Selected teacher is outside this menu</option>');
    expect(html).not.toContain('<option value="" selected="">All branches</option>');
    expect(html).not.toContain('<option value="" selected="">All groups</option>');
    expect(html).not.toContain('<option value="" selected="">All teachers</option>');
  });

  it('keeps unknown numeric teacher relationship filters visible while requesting their exact scope', () => {
    const html = renderToStaticMarkup(<TeachersPage route="teachers/directory?branch=880&department=881" onNav={vi.fn()} user={user} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/teachers/');

    expect(request.params).toMatchObject({ branch: '880', department: '881' });
    expect(html).toContain('<option value="880" selected="">Selected branch is outside this menu</option>');
    expect(html).toContain('<option value="881" selected="">Selected department is outside this menu</option>');
    expect(html).not.toContain('<option value="" selected="">All branches</option>');
    expect(html).not.toContain('<option value="" selected="">All departments</option>');
  });

  it('does not present a stale out-of-range student bookmark as an empty directory', () => {
    directoryMetadata.students = { total: 73, page: 99, page_size: 24, pages: 4 };
    const html = renderToStaticMarkup(<StudentsPage route="students/directory?page=99" onNav={vi.fn()} user={user} />);

    expect(html).toContain('Loading students');
    expect(html).not.toContain('No records match this view');
    expect(html).not.toContain('aria-label="students pages"');
  });

  it('renders a linked student profile with horizontal record navigation', () => {
    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);
    expect(html).toContain('fw-workspace-tabs');
    expect(html).toContain('fw-record-placement');
    expect(html).toContain('ready for placement');
    expect(html).not.toContain('>accepted<');
    expect(html).toContain('href="#/branches/2/overview"');
    expect(html).toContain('href="#/groups/7/overview"');
    expect(html).toContain('href="#/teachers/9/overview"');
  });

  it('translates enrollment event codes into readable history copy', () => {
    const html = renderToStaticMarkup(<StudentsPage route="students/44/enrollment" onNav={vi.fn()} user={user} />);

    expect(html).toContain('Application Reviewed');
    expect(html).not.toContain('application_reviewed');
  });

  it('does not turn unavailable student evidence into zero grades or zero money', () => {
    unavailablePaths.add('/api/v1/attendance/records/');
    unavailablePaths.add('/api/v1/academics/grades/');
    unavailablePaths.add('/api/v1/finance/invoices/');

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('Attendance information is unavailable');
    expect(html).toContain('Learning information is unavailable');
    expect(html).toContain('Billing information is unavailable');
    expect(html).not.toContain('UZS');
  });

  it('does not turn a complete invoice register with incomplete amounts into confident totals', () => {
    studentInvoices.push(
      {
        id: 501,
        number: 'INV-MISSING-TOTAL',
        status: 'issued',
        total_uzs: null,
        outstanding_uzs: '0',
        allocations: [],
      },
      {
        id: 502,
        number: 'INV-MISSING-ALLOCATION',
        status: 'issued',
        total_uzs: '90000',
        outstanding_uzs: null,
        allocations: [{}],
      },
      {
        id: 503,
        number: 'INV-INVALID-ALLOCATION',
        status: 'issued',
        total_uzs: 100000,
        allocations: [{ amount_uzs: 'not-an-amount' }],
      },
    );

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('One or more invoice amounts are unavailable');
    expect(html).toContain('One or more balances are unavailable');
    expect(html).not.toContain('UZS');
  });

  it('withholds student money totals when invoice coverage is capped', () => {
    studentInvoices.push({ id: 510, number: 'INV-PARTIAL', status: 'issued', total_uzs: '125000', outstanding_uzs: '125000', allocations: [] });
    partialPaths.add('/api/v1/finance/invoices/');

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(html).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(html).toContain('Complete invoice coverage is required before this total is stated');
    expect(html).not.toContain('<span>Issued billing</span><strong>UZS');
  });

  it('rejects malformed student invoice values and over-allocation', () => {
    studentInvoices.push(
      { id: 511, number: 'INV-BOOLEAN', status: 'issued', total_uzs: true, outstanding_uzs: false, allocations: [] },
      { id: 512, number: 'INV-OVERALLOCATED', status: 'issued', total_uzs: '100', allocations: [{ amount_uzs: '150' }] },
    );

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(html).toContain('<span>Outstanding balance</span><strong>—</strong>');
    expect(html).toContain('One or more invoice amounts are unavailable');
    expect(html).toContain('One or more balances are unavailable');
    expect(html).not.toContain('<span>Issued billing</span><strong>UZS\u00a00</strong>');
  });

  it('withholds student finance conclusions for an unknown invoice lifecycle state', () => {
    studentInvoices.push({ id: 513, number: 'INV-UNKNOWN', status: { raw: 'issued' }, total_uzs: '100', outstanding_uzs: '100', allocations: [] });

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('One or more invoice lifecycle states are unavailable');
    expect(html).toContain('<span>Issued billing</span><strong>—</strong>');
    expect(html).not.toContain('<span>Issued billing</span><strong>UZS\u00a00</strong>');
  });

  it('excludes unknown and excused attendance states from the percentage denominator', () => {
    attendanceOverride.rows = [
      { id: 1, status: ' Present ' },
      { id: 2, status: 'absent' },
      { id: 3, status: 'excused' },
      { id: 4, status: { malformed: true } },
    ];

    const html = renderToStaticMarkup(<StudentsPage route="students/44/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('<span>Visible attendance</span><strong>50%</strong>');
    expect(html).toContain('2 recognized non-excused outcomes from 4 loaded');
    expect(html).not.toContain('<span>Visible attendance</span><strong>25%</strong>');
  });

  it('shows unavailable student invoice cells without breaking finance relationships or genuine zero', () => {
    studentInvoices.push(
      {
        id: 501,
        number: 'INV-MISSING-TOTAL',
        status: 'issued',
        total_uzs: null,
        outstanding_uzs: '0',
        allocations: [],
        cohort: 7,
        cohort_name: 'North Stars',
      },
      {
        id: 502,
        number: 'INV-MISSING-ALLOCATION',
        status: 'issued',
        total_uzs: '90000',
        outstanding_uzs: null,
        allocations: [{ amount_uzs: '' }],
      },
      {
        id: 503,
        number: 'INV-INVALID-ALLOCATION',
        status: 'issued',
        total_uzs: '100000',
        allocations: [{ amount: 'NaN' }],
      },
      {
        id: 504,
        number: 'INV-NUMERIC-ZERO',
        status: 'paid',
        total_uzs: 0,
        outstanding_uzs: 0,
        allocations: [],
      },
    );

    const html = renderToStaticMarkup(<StudentsPage route="students/44/finance" onNav={vi.fn()} user={user} />);
    const invoiceRows = [...html.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((match) => match[0]);
    const missingTotalRow = invoiceRows.find((row) => row.includes('INV-MISSING-TOTAL'));
    const missingAllocationRow = invoiceRows.find((row) => row.includes('INV-MISSING-ALLOCATION'));
    const invalidAllocationRow = invoiceRows.find((row) => row.includes('INV-INVALID-ALLOCATION'));
    const numericZeroRow = invoiceRows.find((row) => row.includes('INV-NUMERIC-ZERO'));

    expect(html).toContain('4 of 4 invoices loaded');
    expect(missingTotalRow).toContain('href="#/finance/invoices/501"');
    expect(missingTotalRow).toContain('href="#/groups/7/overview"');
    expect(missingTotalRow).toContain('<td data-label="Total">—</td>');
    expect(missingTotalRow).toContain('<td data-label="Balance">UZS');
    expect(missingAllocationRow).toContain('<td data-label="Balance">—</td>');
    expect(invalidAllocationRow).toContain('<td data-label="Balance">—</td>');
    expect(numericZeroRow.match(/UZS/g)).toHaveLength(2);
  });

  it('links attendance rows to the lesson, group, and teacher records', () => {
    const html = renderToStaticMarkup(<StudentsPage route="students/44/attendance" onNav={vi.fn()} user={user} />);
    expect(html).toContain('href="#/schedule/lessons/81"');
    expect(html).toContain('href="#/groups/7/overview"');
    expect(html).toContain('href="#/teachers/9/overview"');
  });

  it('makes teacher workload cards primary and progressively reveals secondary filters', () => {
    const html = renderToStaticMarkup(<TeachersPage route="teachers/directory" onNav={vi.fn()} user={user} />);
    expect(html).toContain('fw-person-card is-teacher');
    expect(html).toContain('Current workload');
    expect(html).toContain('href="#/teachers/9/overview"');
    expect(html).toContain('href="#/groups/7/overview"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Teaching arrangement');

    const expanded = renderToStaticMarkup(<TeachersPage route="teachers/directory?substitute=false" onNav={vi.fn()} user={user} />);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('Teaching arrangement');
  });

  it('uses compensation authority, not customer-finance authority, for pay filters and payout controls', () => {
    const financeOnly = { effective_permissions: ['teachers:read', 'finance:read'] };
    const financeHtml = renderToStaticMarkup(<TeachersPage route="teachers/directory?salary=monthly" onNav={vi.fn()} user={financeOnly} />);
    const financeRequest = workspaceCalls.find((call) => call.path === '/api/v1/teachers/');

    expect(financeRequest.params.salary_type).toBeUndefined();
    expect(financeHtml).not.toContain('Pay profile');

    workspaceCalls.splice(0);
    const compensationReader = { effective_permissions: ['teachers:read', 'compensation:read'] };
    const compensationHtml = renderToStaticMarkup(<TeachersPage route="teachers/directory?salary=monthly" onNav={vi.fn()} user={compensationReader} />);
    const compensationRequest = workspaceCalls.find((call) => call.path === '/api/v1/teachers/');

    expect(compensationRequest.params.salary_type).toBe('monthly');
    expect(compensationHtml).toContain('Pay profile');

    workspaceCalls.splice(0);
    const writeHtml = renderToStaticMarkup(<TeachersPage route="teachers/9/compensation" onNav={vi.fn()} user={{ effective_permissions: ['teachers:read', 'compensation:read', 'compensation:write'] }} />);
    expect(writeHtml).toContain('Authoritative payout rule');
    expect(writeHtml).toContain('Save payout rule');
    expect(workspaceCalls.filter((call) => call.enabled && call.path === '/api/v1/teachers/9/payout-policy/')).toHaveLength(1);
  });

  it('requests and exposes the URL-backed teacher page with an honest page-only export', () => {
    directoryMetadata.teachers = { total: 49, page: 3, page_size: 24, pages: 3 };
    const html = renderToStaticMarkup(<TeachersPage route="teachers/directory?branch=2&page=3" onNav={vi.fn()} user={user} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/teachers/');

    expect(request.params).toMatchObject({ page: 3, page_size: 24, branch: '2' });
    expect(html).toContain('aria-label="teachers pages"');
    expect(html).toContain('49 teachers');
    expect(html).toContain('Page 3 of 3');
    expect(html).toContain('Download this page');
  });

  it('links teacher profiles back to branch, groups, and students', () => {
    const html = renderToStaticMarkup(<TeachersPage route="teachers/9/groups" onNav={vi.fn()} user={user} />);
    expect(html).toContain('fw-workspace-tabs');
    expect(html).toContain('href="#/branches/2/overview"');
    expect(html).toContain('href="#/groups/7/overview"');
    expect(html).toContain('href="#/students/44/overview"');
    expect(html).toContain('ready for placement');
    expect(html).not.toContain('>accepted<');
  });

  it('does not turn unavailable teacher relationships into zero workload', () => {
    unavailablePaths.add('/api/v1/cohorts/');
    unavailablePaths.add('/api/v1/students/');
    unavailablePaths.add('/api/v1/intelligence/teachers/');

    const html = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);

    expect(html).toContain('Group information is unavailable');
    expect(html).toContain('Student reach is unavailable');
    expect(html).toContain('Teaching activity is unavailable');
    expect(html).not.toContain('>0</strong>');
  });

  it('does not infer zero groups or no assignments from a partial cohort relationship register', () => {
    partialPaths.add('/api/v1/cohorts/');

    const knownRelationship = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);
    expect(knownRelationship).toContain('<span>Groups</span><strong>—</strong><small>Group assignment coverage is incomplete</small>');
    expect(knownRelationship).not.toContain('<span>Groups</span><strong>1</strong>');

    omittedTeacherEvidence.cohort = true;

    const directory = renderToStaticMarkup(<TeachersPage route="teachers/directory" onNav={vi.fn()} user={user} />);
    const overview = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);
    const groups = renderToStaticMarkup(<TeachersPage route="teachers/9/groups" onNav={vi.fn()} user={user} />);

    expect(directory).toContain('<strong>—</strong><span>Groups</span>');
    expect(directory).toContain('Group assignment coverage is incomplete');
    expect(directory).not.toContain('No current group assignments');
    expect(overview).toContain('<span>Groups</span><strong>—</strong><small>Group assignment coverage is incomplete</small>');
    expect(groups).toContain('Group assignment coverage is incomplete; no conclusion is available.');
    expect(groups).not.toContain('No current group assignments.');
  });

  it('uses an exact teacher intelligence row under partial coverage but never infers absence when that row is missing', () => {
    partialPaths.add('/api/v1/intelligence/teachers/');

    const exact = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);
    expect(exact).toContain('<span>Lessons delivered</span><strong>12</strong>');
    expect(exact).toContain('<span>Attendance engagement</span><strong>91.7%</strong>');

    omittedTeacherEvidence.signal = true;
    const absentFromPartial = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);
    expect(absentFromPartial).toContain('<span>Lessons delivered</span><strong>—</strong><small>Teaching activity coverage is incomplete</small>');
    expect(absentFromPartial).toContain('<span>Attendance engagement</span><strong>—</strong><small>Engagement coverage is incomplete</small>');
    expect(absentFromPartial).not.toContain('No recent delivery signal recorded');
    expect(absentFromPartial).not.toContain('No recent engagement signal recorded');
  });

  it('withholds impossible teacher percentages and negative delivery counts', () => {
    teacherSignalOverride.value = {
      teacher: 9,
      engagement_score: 150,
      attendance_rate: -1,
      lessons_delivered: -3,
      students_reached: false,
      marks_sampled: {},
    };

    const overview = renderToStaticMarkup(<TeachersPage route="teachers/9/overview" onNav={vi.fn()} user={user} />);
    const activity = renderToStaticMarkup(<TeachersPage route="teachers/9/activity" onNav={vi.fn()} user={user} />);

    expect(overview).toContain('<span>Attendance engagement</span><strong>—</strong>');
    expect(overview).toContain('<span>Lessons delivered</span><strong>—</strong>');
    expect(activity).not.toContain('150%');
    expect(activity).not.toContain('-3 lessons');
  });
});
