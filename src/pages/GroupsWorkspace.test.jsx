import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceCalls = vi.hoisted(() => []);
const workspaceMode = vi.hoisted(() => ({
  paginatedGroups: false,
  emptyAttendance: false,
  partialFinance: false,
  partialMembers: false,
  partialAttendanceRecords: false,
  partialAttendanceDashboard: false,
}));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  downloadSpreadsheet: vi.fn(),
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return {
      segments: path.split('/').filter(Boolean),
      params: new URLSearchParams(query),
    };
  },
  useWorkspaceData(path, params, options = {}) {
    const enabled = options.enabled ?? Boolean(path);
    workspaceCalls.push({ path, params, enabled });
    const cohort = {
      id: 7,
      name: 'North Stars',
      branch: 2,
      branch_name: 'North Branch',
      department_name: 'English',
      level: 'Intermediate',
      capacity: 18,
      start_date: '2026-01-10',
      end_date: '2026-12-20',
      is_archived: false,
      created_at: '2026-01-01T10:00:00+05:00',
      ...(workspaceMode.cohortOverrides || {}),
    };
    const hasOverride = (name) => Object.prototype.hasOwnProperty.call(workspaceMode, name);
    const defaultMembers = { count: 1, results: [{ id: 1, student: 44, student_name: 'Mohira Olimova', start_date: '2026-01-01' }] };
    const defaultRecords = { count: 2, results: [
      { id: 1, student: 44, lesson: 101, status: 'present' },
      { id: 2, student: 44, lesson: 102, status: 'late' },
    ] };
    const defaultDashboard = { rate: 50, students: [{ student: 44, name: 'Mohira Olimova', present: 1, absent: 0, late: 1, excused: 0, total: 2, percent_present: 50 }] };
    let data;
    if (path === '/api/v1/cohorts/7/') data = cohort;
    else if (path === '/api/v1/cohorts/') {
      const groups = hasOverride('groupRows') ? workspaceMode.groupRows : [cohort];
      data = { count: groups.length, results: groups };
    } else if (path === '/api/v1/cohorts/7/members/') {
      data = hasOverride('membersData') ? workspaceMode.membersData : defaultMembers;
    } else if (path === '/api/v1/schedule/lessons/') {
      data = { count: 2, results: [
        { id: 101, title: 'June lesson', starts_at: '2026-06-12T10:00:00+05:00' },
        { id: 102, title: 'July lesson', starts_at: '2026-07-12T10:00:00+05:00' },
      ] };
    } else if (path === '/api/v1/attendance/records/') {
      data = hasOverride('attendanceRecordsData')
        ? workspaceMode.attendanceRecordsData
        : workspaceMode.emptyAttendance
          ? { count: 0, results: [] }
          : defaultRecords;
    } else if (path === '/api/v1/attendance/cohorts/7/dashboard/') {
      data = hasOverride('attendanceDashboardData')
        ? workspaceMode.attendanceDashboardData
        : workspaceMode.emptyAttendance
          ? { rate: 0, students: [] }
          : defaultDashboard;
    } else if (path === '/api/v1/finance/invoices/') {
      data = hasOverride('financeInvoicesData')
        ? workspaceMode.financeInvoicesData
        : workspaceMode.partialFinance
          ? { count: 10, results: [] }
          : { count: 0, results: [] };
    } else data = { count: 0, results: [] };
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : [];
    const paginatedGroups = path === '/api/v1/cohorts/' && workspaceMode.paginatedGroups;
    const partialFinance = path === '/api/v1/finance/invoices/' && workspaceMode.partialFinance;
    const partialMembers = path === '/api/v1/cohorts/7/members/' && workspaceMode.partialMembers;
    const partialAttendanceRecords = path === '/api/v1/attendance/records/' && workspaceMode.partialAttendanceRecords;
    const partialAttendanceDashboard = path === '/api/v1/attendance/cohorts/7/dashboard/' && workspaceMode.partialAttendanceDashboard;
    const embeddedTotal = data && !Array.isArray(data) ? data.count ?? data.total : null;
    return {
      data,
      rows,
      total: paginatedGroups ? 205 : embeddedTotal ?? rows.length,
      pagination: paginatedGroups
        ? { page: Number(params?.page) || 1, pages: 3, total: 205 }
        : hasOverride('paginationByPath')
          ? workspaceMode.paginationByPath[path] || null
          : null,
      loading: false,
      pending: false,
      paused: false,
      error: null,
      complete: enabled && !paginatedGroups && !partialFinance && !partialMembers && !partialAttendanceRecords && !partialAttendanceDashboard,
      retry: vi.fn(),
    };
  },
}));

import { GroupsPage } from './GroupsWorkspace.jsx';

function pathsThatWouldLoad() {
  return workspaceCalls.filter((call) => call.enabled).map((call) => call.path);
}

describe('Groups workspace capability boundaries', () => {
  beforeEach(() => {
    workspaceCalls.splice(0);
    workspaceMode.paginatedGroups = false;
    workspaceMode.emptyAttendance = false;
    workspaceMode.partialFinance = false;
    workspaceMode.partialMembers = false;
    workspaceMode.partialAttendanceRecords = false;
    workspaceMode.partialAttendanceDashboard = false;
    delete workspaceMode.cohortOverrides;
    delete workspaceMode.groupRows;
    delete workspaceMode.membersData;
    delete workspaceMode.attendanceRecordsData;
    delete workspaceMode.attendanceDashboardData;
    delete workspaceMode.financeInvoicesData;
    delete workspaceMode.paginationByPath;
  });

  it('keeps large group directories reachable through URL-backed pages', () => {
    workspaceMode.paginatedGroups = true;
    const html = renderToStaticMarkup(
      <GroupsPage route="groups?page=2" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );
    const groupCall = workspaceCalls.find((call) => call.path === '/api/v1/cohorts/');

    expect(groupCall.params).toMatchObject({ page: 2, page_size: 100 });
    expect(html).toContain('Page 2 of 3');
    expect(html).toContain('aria-label="groups page 3"');
    expect(html).toContain('Download current page spreadsheet');
    expect(html).toContain('aria-describedby="group-level-filter-help"');
    expect(html).toContain('Choose a branch or enter a search, then apply it to enable exact level filtering.');
  });

  it('describes every disabled exact-only filter without relying on a pointer tooltip', () => {
    workspaceMode.paginatedGroups = true;
    const html = renderToStaticMarkup(
      <GroupsPage route="groups?page=2" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('aria-describedby="group-level-filter-help"');
    expect(html).toContain('aria-describedby="group-teacher-filter-help"');
    expect(html).toContain('Choose a branch or enter a search, then apply it to enable exact teacher filtering.');
  });

  it('loads only group records and hides connected filters for a cohorts-only role', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="groups" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );

    expect(pathsThatWouldLoad()).toEqual(['/api/v1/cohorts/']);
    expect(html).not.toContain('All branches');
    expect(html).not.toContain('All teachers');
    expect(html).not.toContain('Student coverage');
    expect(html).not.toContain('Current students');
  });

  it('renders a safe overview for a direct restricted section without loading its sources', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );

    expect(pathsThatWouldLoad()).toEqual(['/api/v1/cohorts/7/']);
    expect(html).toContain('Operating details');
    expect(html).toContain('Recorded capacity');
    expect(html).not.toContain('Invoices and allocations');
    expect(html).not.toContain('Current and past members');
  });

  it('loads an allowed connected section without probing unrelated domains', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['cohorts:read', 'finance:read'] }} onNav={vi.fn()} />,
    );

    expect(pathsThatWouldLoad()).toEqual(['/api/v1/cohorts/7/', '/api/v1/finance/invoices/']);
    expect(html).toContain('Group finance');
    expect(html).toContain('Invoices and allocations');
    expect(html).not.toContain('Current and past members');
  });

  it('does not open connected records when a direct group URL belongs to another branch', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="branches/3/groups/7/finance" branchId="3" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(pathsThatWouldLoad()).toEqual(['/api/v1/cohorts/7/']);
    expect(html).toContain('outside the selected branch');
    expect(html).not.toContain('Invoices and allocations');
  });

  it('retains every section and loads only overview sources for a fully granted role', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(pathsThatWouldLoad()).toEqual(expect.arrayContaining([
      '/api/v1/cohorts/7/',
      '/api/v1/cohorts/7/members/',
      '/api/v1/cohorts/7/teachers/',
      '/api/v1/attendance/cohorts/7/dashboard/',
      '/api/v1/schedule/lessons/',
    ]));
    expect(pathsThatWouldLoad()).not.toContain('/api/v1/assignments/');
    expect(pathsThatWouldLoad()).not.toContain('/api/v1/academics/exams/');
    expect(pathsThatWouldLoad()).not.toContain('/api/v1/finance/invoices/');
    expect(html).toContain('Current and past members');
    expect(html).toContain('Read-only monthly record');
    expect(html).toContain('Assignments and homework');
    expect(html).toContain('Invoices and allocations');
  });

  it('shows multi-month attendance movement before the exact matrix', () => {
    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/attendance?from=2026-06-01&to=2026-07-31" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('Monthly recorded presence');
    expect(html).toContain('June 2026');
    expect(html).toContain('July 2026');
    expect(html).toContain('Attendance matrix');
    expect(html).toContain('aria-label="Attendance by student and lesson"');
    expect(html).toContain('role="region" tabindex="0" aria-label="Scrollable attendance matrix"');
    expect(html).toContain('aria-label="Student attendance summary, scrollable table"');
    expect(html).toContain('aria-label="Student attendance summary"');
    expect(html).toContain('tabindex="0"');
  });

  it('does not present a missing attendance sample as zero performance', () => {
    workspaceMode.emptyAttendance = true;

    const overview = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );
    const attendance = renderToStaticMarkup(
      <GroupsPage route="groups/7/attendance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(overview).toContain('No attendance outcomes recorded');
    expect(attendance).toContain('No attendance outcomes recorded');
    expect(overview).not.toContain('>0%</');
    expect(attendance).not.toContain('>0%</');
    expect(attendance).toContain('<span>Present</span><strong>0</strong><small>Recorded outcomes</small>');
    expect(attendance).toContain('<span>Absent</span><strong>0</strong><small>Recorded outcomes</small>');
  });

  it('withholds impossible attendance percentages and malformed outcome counts', () => {
    workspaceMode.attendanceDashboardData = {
      rate: 250,
      students: [{ student: 44, name: 'Mohira Olimova', present: true, absent: -1, late: 0, excused: 0, total: 2, percent_present: 250 }],
    };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/attendance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Group attendance</span><strong>—</strong>');
    expect(html).not.toContain('250%');
    expect(html).not.toContain('<td>true</td>');
    expect(html).not.toContain('<td>-1</td>');
  });

  it('does not present an incomplete empty invoice page as a zero financial position', () => {
    workspaceMode.partialFinance = true;

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('Loaded invoice coverage is incomplete; a zero position cannot be verified');
    expect(html).not.toContain('UZS 0');
  });

  it.each([
    ['omitted', undefined],
    ['null', null],
  ])('withholds a derived invoice balance when allocations are %s', (_label, allocations) => {
    const invoice = {
      id: 91,
      number: 'INV-EVIDENCE',
      student: 44,
      student_name: 'Mohira Olimova',
      total_uzs: 123,
      status: 'issued',
      issue_date: '2026-08-01',
      due_date: '2026-08-20',
      ...(_label === 'omitted' ? {} : { allocations }),
    };
    workspaceMode.financeInvoicesData = { count: 1, results: [invoice] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('UZS 123');
    expect(html).toContain('neither a valid reported balance nor complete allocation evidence');
    expect(html).not.toContain('UZS 0');
  });

  it('preserves a valid reported invoice balance without requiring allocation rows', () => {
    workspaceMode.financeInvoicesData = { count: 1, results: [{
      id: 92,
      number: 'INV-REPORTED',
      student: 44,
      student_name: 'Mohira Olimova',
      total_uzs: 123,
      outstanding_uzs: 77,
      allocations: null,
      status: 'issued',
      issue_date: '2026-08-01',
      due_date: '2026-08-20',
    }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('UZS 77');
    expect(html).toContain('UZS 46');
    expect(html).not.toContain('neither a valid reported balance nor complete allocation evidence');
  });

  it('preserves a genuine zero allocation total when the allocation array is explicitly empty', () => {
    workspaceMode.financeInvoicesData = { count: 1, results: [{
      id: 93,
      number: 'INV-UNALLOCATED',
      student: 44,
      student_name: 'Mohira Olimova',
      total_uzs: 123,
      allocations: [],
      status: 'issued',
      issue_date: '2026-08-01',
      due_date: '2026-08-20',
    }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('UZS 0');
    expect(html).toContain('UZS 123');
    expect(html).not.toContain('neither a valid reported balance nor complete allocation evidence');
  });

  it('withholds the whole derived balance when any allocation amount is missing', () => {
    workspaceMode.financeInvoicesData = { count: 1, results: [{
      id: 94,
      number: 'INV-MIXED',
      student: 44,
      student_name: 'Mohira Olimova',
      total_uzs: 123,
      allocations: [{ amount_uzs: 20 }, { amount_uzs: null }],
      status: 'issued',
      issue_date: '2026-08-01',
      due_date: '2026-08-20',
    }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('neither a valid reported balance nor complete allocation evidence');
    expect(html).not.toContain('UZS 103');
  });

  it('withholds negative and over-allocated invoice values instead of clamping them to zero', () => {
    workspaceMode.financeInvoicesData = { count: 2, results: [{
      id: 95,
      number: 'INV-NEGATIVE',
      total_uzs: -123,
      outstanding_uzs: -1,
      status: 'issued',
    }, {
      id: 96,
      number: 'INV-OVERALLOCATED',
      total_uzs: 100,
      allocations: [{ amount_uzs: 125 }],
      status: 'issued',
    }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/finance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('One or more invoices has no usable issued value');
    expect(html).toContain('neither a valid reported balance nor complete allocation evidence');
    expect(html).not.toContain('-UZS');
    expect(html).not.toContain('UZS 0');
  });

  it('uses an explicit membership count for utilization when only part of the roster is loaded', () => {
    workspaceMode.partialMembers = true;
    workspaceMode.membersData = { count: 12, results: [{ id: 1, student: 44, student_name: 'Mohira Olimova', start_date: '2026-01-01' }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Current students</span><strong>12</strong>');
    expect(html).toContain('<span>Capacity use</span><strong>66.7%</strong>');
    expect(html).toContain('1 current membership is loaded; the exact total is reported separately');
  });

  it('labels loaded memberships and withholds utilization when a partial roster has no declared total', () => {
    workspaceMode.partialMembers = true;
    workspaceMode.membersData = { results: [{ id: 1, student: 44, student_name: 'Mohira Olimova', start_date: '2026-01-01' }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Current students</span><strong>1 loaded</strong>');
    expect(html).toContain('<span>Capacity use</span><strong>—</strong>');
    expect(html).not.toContain('5.6%');
  });

  it.each([
    ['boolean', true],
    ['object', { value: 12 }],
  ])('does not coerce a %s membership total into a number', (_label, count) => {
    workspaceMode.membersData = { count, results: [{ id: 1, student: 44, student_name: 'Mohira Olimova', start_date: '2026-01-01' }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Current students</span><strong>1 loaded</strong>');
    expect(html).toContain('<span>Capacity use</span><strong>—</strong>');
  });

  it('shows no student attendance percentage when the student has zero outcomes', () => {
    workspaceMode.attendanceDashboardData = {
      rate: 0,
      students: [{ student: 44, name: 'Mohira Olimova', present: 0, absent: 0, late: 0, excused: 0, total: 0, percent_present: 0 }],
    };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/students" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<strong>—</strong><small>0 present · 0 absent</small>');
    expect(html).not.toContain('<strong>0%</strong>');
  });

  it('qualifies partial attendance status cards and withholds unverified zero counts', () => {
    workspaceMode.partialAttendanceRecords = true;
    workspaceMode.attendanceRecordsData = { count: 8, results: [{ id: 1, student: 44, lesson: 101, status: 'present' }] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/attendance" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Present</span><strong>1</strong><small>Loaded outcomes · partial register</small>');
    expect(html).toContain('<span>Absent</span><strong>—</strong><small>Loaded outcomes · partial register</small>');
    expect(html).toContain('Loaded 1 of 8 attendance records');
    expect(html).toContain('zero values are withheld until the register is complete');
  });

  it('withholds an empty attendance rate when the summary itself is incomplete', () => {
    workspaceMode.partialAttendanceDashboard = true;
    workspaceMode.attendanceDashboardData = { rate: 0, students: [] };

    const html = renderToStaticMarkup(
      <GroupsPage route="groups/7/overview" user={{ effective_permissions: ['*:*'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Attendance</span><strong>—</strong>');
    expect(html).toContain('Attendance summary coverage is incomplete; a zero rate cannot be verified');
  });

  it('withholds a mixed recorded-capacity aggregate instead of silently dropping missing values', () => {
    workspaceMode.groupRows = [
      { id: 7, name: 'North Stars', capacity: 18, is_archived: false },
      { id: 8, name: 'Unspecified Seats', capacity: null, is_archived: false },
    ];

    const html = renderToStaticMarkup(
      <GroupsPage route="groups" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Recorded capacity</span><strong>—</strong>');
    expect(html).toContain('One or more visible groups have no usable recorded capacity');
    expect(html).not.toContain('<span>Recorded capacity</span><strong>18</strong>');
  });

  it.each([
    ['boolean', true],
    ['object', { value: 18 }],
  ])('does not coerce a %s group capacity into a recorded seat count', (_label, capacity) => {
    workspaceMode.groupRows = [{ id: 7, name: 'North Stars', capacity, is_archived: false }];

    const html = renderToStaticMarkup(
      <GroupsPage route="groups" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Recorded capacity</span><strong>—</strong>');
    expect(html).toContain('One or more visible groups have no usable recorded capacity');
  });

  it('preserves a genuine complete zero recorded capacity', () => {
    workspaceMode.groupRows = [{ id: 7, name: 'North Stars', capacity: 0, is_archived: false }];

    const html = renderToStaticMarkup(
      <GroupsPage route="groups" user={{ effective_permissions: ['cohorts:read'] }} onNav={vi.fn()} />,
    );

    expect(html).toContain('<span>Recorded capacity</span><strong>0</strong>');
    expect(html).not.toContain('One or more visible groups have no usable recorded capacity');
  });
});
