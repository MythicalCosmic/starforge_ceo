import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerScenario } = vi.hoisted(() => ({ registerScenario: { value: 'ready' } }));

vi.mock('../hooks/useWorkspaceTitle.js', () => ({ useWorkspaceTitle: vi.fn() }));

const branches = [
  { id: 2, name: 'Central Campus', address: '12 Amir Temur Avenue', timezone: 'Asia/Tashkent', is_active: true, max_students: 240, max_teachers: 30 },
  { id: 3, name: 'Riverside Campus', address: '8 River Road', timezone: 'Asia/Tashkent', is_active: true, max_students: 180, max_teachers: 24 },
];
const signals = [
  { branch: 2, name: 'Central Campus', active_students: 6, attendance_rate: 0.875, avg_grade_pct: 74, at_risk: 1, at_risk_rate: 0.167, score: 79.6, rank: 2 },
  { branch: 3, name: 'Riverside Campus', active_students: 6, attendance_rate: 0.9, avg_grade_pct: 78, at_risk: 0, at_risk_rate: 0, score: 84, rank: 1 },
];
const students = [
  { id: 8, full_name: 'Aziza Karimova', status: 'active', branch: 2, current_cohort: 11 },
  { id: 9, full_name: 'Bekzod Saidov', status: 'active', branch: 3, current_cohort: 12 },
];
const teachers = [
  { id: 4, full_name: 'Dilshod Rahimov', branch: 2 },
  { id: 5, full_name: 'Kamola Ergasheva', branch: 3 },
];
const cohorts = [
  { id: 11, name: 'Nova B1', branch: 2, capacity: 18, primary_teacher: 4 },
  { id: 12, name: 'Horizon B1', branch: 3, capacity: 18, primary_teacher: 5 },
];
const invoices = [
  { id: 20, student: 8, cohort: 11, status: 'issued', total_uzs: '1250000.00', outstanding_uzs: '1250000.00' },
  { id: 21, student: 9, cohort: 12, status: 'paid', total_uzs: '1250000.00', outstanding_uzs: '0.00' },
];
const expenses = [
  { id: 3, branch: 2, status: 'paid', amount_uzs: '400000.00' },
  { id: 4, branch: 3, status: 'paid', amount_uzs: '300000.00' },
];
const exams = [
  { id: 30, cohort: 11, title: 'Progress review', subject: 7, subject_name: 'English', is_published: true },
];

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path) {
    const controlled = [
      '/api/v1/intelligence/branches/',
      '/api/v1/students/',
      '/api/v1/teachers/',
      '/api/v1/cohorts/',
      '/api/v1/finance/invoices/',
      '/api/v1/finance/expenses/',
      '/api/v1/academics/exams/',
    ].includes(path);
    if (controlled && registerScenario.value === 'pending') {
      return { data: null, rows: [], total: 0, pending: true, paused: false, error: null, complete: false, warnings: [], updatedAt: null, retry: vi.fn() };
    }
    if (controlled && registerScenario.value === 'partial-empty') {
      return { data: { count: 150, results: [] }, rows: [], total: 150, pending: false, paused: false, error: null, complete: false, warnings: ['More records exist'], updatedAt: 1, retry: vi.fn() };
    }
    if (controlled && registerScenario.value === 'complete-empty') {
      return { data: { count: 0, results: [] }, rows: [], total: 0, pending: false, paused: false, error: null, complete: true, warnings: [], updatedAt: 1, retry: vi.fn() };
    }
    let rows = [];
    let data;
    let total;
    let complete = true;
    let warnings = [];
    if (path === '/api/v1/org/branches/') {
      rows = registerScenario.value === 'missing-capacity'
        ? [branches[0], { ...branches[1], max_students: null }]
        : branches;
      if (registerScenario.value === 'partial-branches') {
        rows = branches.slice(0, 1);
        total = 2;
        complete = false;
        warnings = ['More branches exist'];
      }
    }
    else if (path === '/api/v1/org/branches/2/') data = branches[0];
    else if (path === '/api/v1/intelligence/branches/') rows = registerScenario.value === 'invalid-signals'
      ? [{ ...signals[0], score: 140, attendance_rate: 2, avg_grade_pct: -5, at_risk_rate: -1, active_students: -10 }]
      : signals;
    else if (path === '/api/v1/students/') rows = students;
    else if (path === '/api/v1/teachers/') rows = teachers;
    else if (path === '/api/v1/cohorts/') {
      rows = registerScenario.value === 'missing-capacity'
        ? [{ ...cohorts[0], capacity: null }, cohorts[1]]
        : cohorts;
      if (registerScenario.value === 'partial-groups') {
        rows = [cohorts[0]];
        total = 2;
        complete = false;
        warnings = ['More groups exist'];
      }
    } else if (path === '/api/v1/finance/invoices/') {
      if (registerScenario.value === 'invalid-money') {
        rows = [{ id: 20, student: 8, cohort: 11, status: 'issued', total_uzs: false, outstanding_uzs: null, allocations: [] }];
      } else if (registerScenario.value === 'negative-money') {
        rows = [{ id: 20, student: 8, cohort: 11, status: 'issued', total_uzs: '-1250000', outstanding_uzs: '-1250000', allocations: [] }];
      } else if (registerScenario.value === 'missing-allocations') {
        rows = [{ id: 20, student: 8, cohort: 11, status: 'issued', total_uzs: '1250000.00', outstanding_uzs: null }];
      } else if (registerScenario.value === 'unattributed-invoice') {
        rows = [{ id: 22, student: 999, cohort: 999, status: 'issued', total_uzs: '1750000.00', outstanding_uzs: '1750000.00' }];
      } else {
        rows = invoices;
      }
    } else if (path === '/api/v1/finance/expenses/') {
      rows = registerScenario.value === 'unattributed-expense'
        ? [{ id: 5, branch: null, status: 'paid', amount_uzs: '500000.00' }]
        : registerScenario.value === 'invalid-money'
          ? [{ id: 3, branch: 2, status: 'paid', amount_uzs: { value: 400000 } }]
          : expenses;
    } else if (path === '/api/v1/academics/exams/') {
      rows = registerScenario.value === 'missing-subject'
        ? [{ ...exams[0], subject: null, subject_name: '   ' }]
        : exams;
    }
    total ??= rows.length;
    if (data === undefined) data = { count: total, results: rows };
    return { data, rows, total, pending: false, paused: false, error: null, complete, warnings, updatedAt: 1, retry: vi.fn() };
  },
}));

import { BranchesPage } from './Branches.jsx';

describe('branch executive directory', () => {
  beforeEach(() => {
    registerScenario.value = 'ready';
  });

  it('makes branch cards and direct branch comparison the primary content', () => {
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('Choose a branch or make it the comparison focus');
    expect(html).toContain('Branch against branch');
    expect(html).toContain('Focus branch');
    expect(html).toContain('Comparator');
    expect(html).toContain('Central Campus');
    expect(html).toContain('Riverside Campus');
    expect(html).toContain('Issued billing attributed');
    expect(html).not.toContain('Location status');
  });

  it('preserves the nested branch workspace and return route', () => {
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/overview" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('Branch workspace');
    expect(html).toContain('All branches');
    expect(html).toContain('href="/branches"');
    expect(html).toContain('href="/branches/2/students"');
    expect(html).toContain('href="/branches/2/teachers"');
  });

  it('does not present pending comparison registers as verified zeros', () => {
    registerScenario.value = 'pending';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<dt>Active students</dt><dd>—</dd>');
    expect(html).toContain('<dt>Teachers loaded</dt><dd>—</dd>');
    expect(html).toContain('<dt>Groups loaded</dt><dd>—</dd>');
    expect(html).toContain('<dt>Issued billing attributed</dt><dd>—</dd>');
    expect(html).not.toContain('<dt>Active students</dt><dd>0</dd>');
  });

  it('does not infer per-branch or money zeros from incomplete empty pages', () => {
    registerScenario.value = 'partial-empty';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<dt>Active students</dt><dd>—</dd>');
    expect(html).toContain('<dt>Teachers loaded</dt><dd>—</dd>');
    expect(html).toContain('<dt>Groups loaded</dt><dd>—</dd>');
    expect(html).toContain('The loaded register is incomplete; a zero total cannot be verified');
    expect(html).not.toContain('<dt>Issued billing attributed</dt><dd>UZS\u00a00</dd>');
  });

  it('keeps a genuine zero when the complete registers are empty', () => {
    registerScenario.value = 'complete-empty';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<dt>Active students</dt><dd>0</dd>');
    expect(html).toContain('<dt>Teachers loaded</dt><dd>0</dd>');
    expect(html).toContain('<dt>Groups loaded</dt><dd>0</dd>');
    expect(html).toContain('<dt>Issued billing attributed</dt><dd>UZS\u00a00</dd>');
  });

  it('does not turn a missing invoice amount into attributed zero billing', () => {
    registerScenario.value = 'invalid-money';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<dt>Issued billing attributed</dt><dd>—</dd>');
    expect(html).toContain('<small>Issued billing in view</small><strong>—</strong>');
    expect(html).toContain('<small>Paid expenses loaded</small><strong>—</strong>');
  });

  it('withholds an inferred invoice balance when allocations are omitted', () => {
    registerScenario.value = 'missing-allocations';
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/finance" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Outstanding balance loaded</small><strong>—</strong>');
    expect(html).toContain('data-label="Balance" class=""><strong>—</strong>');
    expect(html).not.toContain('<small>Outstanding balance loaded</small><strong>UZS\u00a01,250,000</strong>');
  });

  it('does not normalize impossible negative invoice amounts into convincing money', () => {
    registerScenario.value = 'negative-money';
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/finance" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Issued billing in view</small><strong>—</strong>');
    expect(html).toContain('<small>Outstanding balance loaded</small><strong>—</strong>');
    expect(html).not.toContain('-UZS\u00a01,250,000');
  });

  it('withholds out-of-domain branch rates, scores, and counts', () => {
    registerScenario.value = 'invalid-signals';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).not.toContain('140');
    expect(html).not.toContain('200%');
    expect(html).not.toContain('-5%');
    expect(html).not.toContain('-10');
    expect(html).toContain('Recent learning evidence is incomplete');
  });

  it('keeps the organization invoice total but withholds branch comparisons when attribution is missing', () => {
    registerScenario.value = 'unattributed-invoice';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Issued billing in view</small><strong>UZS\u00a01,750,000</strong>');
    expect(html).toContain('1 issued invoice cannot be matched to a visible branch, so every per-branch billing comparison is withheld.');
    expect(html).toContain('Branch billing is withheld because at least one issued invoice cannot be matched to a visible branch.');
    expect(html.match(/<dt>Issued billing attributed<\/dt><dd>—<\/dd>/g)).toHaveLength(2);
  });

  it('withholds branch expense comparisons when a paid expense has no visible branch', () => {
    registerScenario.value = 'unattributed-expense';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Paid expenses loaded</small><strong>UZS\u00a0500,000</strong>');
    expect(html).toContain('1 paid expense cannot be matched to a visible branch, so every per-branch expense comparison is withheld.');
    expect(html).not.toContain('<dt>Paid expenses loaded</dt><dd>UZS\u00a0500,000</dd>');
  });

  it('does not add missing branch capacities into an apparently complete total', () => {
    registerScenario.value = 'missing-capacity';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('Complete capacity is unavailable because at least one branch has no recorded limit');
    expect(html).not.toContain('240 complete recorded branch student capacity');
  });

  it('withholds organization capacity while the branch register is partial', () => {
    registerScenario.value = 'partial-branches';
    const html = renderToStaticMarkup(<BranchesPage route="branches" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('Complete capacity is unavailable while the branch directory is partial');
    expect(html).not.toContain('240 complete recorded branch student capacity');
  });

  it('withholds group capacity and placement ratios when required evidence is incomplete', () => {
    registerScenario.value = 'partial-groups';
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/groups" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Recorded seats</small><strong>—</strong>');
    expect(html).toContain('Complete capacity is unavailable while the group register is partial');
    expect(html).toContain('<small>Primary placement ratio</small><strong>—</strong>');
  });

  it('does not treat a missing group capacity as zero or a partial sum', () => {
    registerScenario.value = 'missing-capacity';
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/groups" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Recorded seats</small><strong>—</strong>');
    expect(html).toContain('At least one group has no valid recorded capacity');
  });

  it('does not count blank exam subjects as a represented subject', () => {
    registerScenario.value = 'missing-subject';
    const html = renderToStaticMarkup(<BranchesPage route="branches/2/exams" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('<small>Subjects represented</small><strong>—</strong>');
    expect(html).toContain('No branch-linked exam has a recorded subject identifier');
    expect(html).toContain('No branch-linked exam has a recorded subject.');
    expect(html).not.toContain('<small>Subjects represented</small><strong>1</strong>');
  });
});
