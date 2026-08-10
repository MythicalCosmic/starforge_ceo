import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceCalls = vi.hoisted(() => []);
const mutationOptions = vi.hoisted(() => []);
const httpRequest = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), danger: vi.fn() }));
const cohortRegister = vi.hoisted(() => ({ complete: true }));
const examResults = vi.hoisted(() => []);

vi.mock('../context/ToastContext.jsx', () => ({ useToast: () => toast }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: vi.fn((options) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
}));

vi.mock('../api/http.js', () => ({ httpRequest }));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path, params, options = {}) {
    const enabled = options.enabled ?? Boolean(path);
    workspaceCalls.push({ path, params, enabled });
    const exam = {
      id: 7,
      title: 'Spring assessment',
      subject: 3,
      subject_name: 'English',
      cohort: 12,
      cohort_name: 'North Stars',
      term: 5,
      term_name: 'Spring',
      exam_type: 2,
      exam_type_detail: { id: 2, name: 'Midterm' },
      exam_date: '2026-05-02',
      max_score: '100.00',
      weight: '1.000',
      is_published: false,
      published_at: null,
      version: 4,
      requires_republish: false,
    };
    let data = { count: 0, results: [] };
    if (path === '/api/v1/academics/exams/7/') data = exam;
    if (path === '/api/v1/academics/exams/9/') data = { ...exam, id: 9, title: 'Published assessment', is_published: true, published_at: '2026-05-03T05:00:00Z' };
    if (path === '/api/v1/academics/exams/8/') data = { ...exam, id: 8, title: 'Other branch assessment', cohort: 99, cohort_name: 'South Stars' };
    if (path === '/api/v1/cohorts/12/') data = { id: 12, name: 'North Stars', branch: 2 };
    if (path === '/api/v1/cohorts/77/') data = { id: 77, name: 'Evening Scholars', branch: 2 };
    if (path === '/api/v1/cohorts/99/') data = { id: 99, name: 'South Stars', branch: 3 };
    if (path === '/api/v1/cohorts/12/members/') data = [{ id: 1, student: 44, student_name: 'Mohira Olimova' }];
    if (path === '/api/v1/academics/exams/7/results/') data = { count: examResults.length, results: examResults };
    if (path === '/api/v1/academics/exams/7/readiness/') data = { exam: 7, version: 4, eligible: 1, graded: 1, missing: 0, excluded: 0, coverage_fraction: 1, ready: true, generated_at: '2026-05-02T08:00:00Z' };
    if (path === '/api/v1/academics/exams/7/history/') data = { count: 1, results: [{ id: 10, event_type: 'published', exam_version: 4, reason: '', actor_name: 'Amina Karimova', created_at: '2026-05-03T05:00:00Z' }] };
    if (path === '/api/v1/academics/exams/9/history/') data = { count: 1, results: [{ id: 11, event_type: 'published', exam_version: 4, reason: '', actor_name: 'Amina Karimova', created_at: '2026-05-03T05:00:00Z' }] };
    if (path === '/api/v1/academics/subjects/') data = { count: 1, results: [{ id: 3, code: 'ENG', name: 'English', description: 'Language', is_active: true }] };
    if (path === '/api/v1/cohorts/' && String(params?.branch || '') === '2') {
      data = { count: 1, results: [{ id: 12, name: 'North Stars' }] };
    }
    if (path === '/api/v1/academics/exams/') {
      data = {
        count: 2,
        results: [
          exam,
          { ...exam, id: 8, title: 'Other branch assessment', cohort: 99, cohort_name: 'South Stars' },
        ],
      };
    }
    const rows = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
    return {
      data,
      rows,
      total: rows.length,
      pending: false,
      paused: false,
      error: null,
      complete: enabled && (path !== '/api/v1/cohorts/' || cohortRegister.complete),
      retry: vi.fn(),
    };
  },
}));

import { ExamsPage } from './ExamsWorkspace.jsx';

function loadedPaths() {
  return workspaceCalls.filter((call) => call.enabled).map((call) => call.path);
}

describe('Exams route-backed workflows', () => {
  beforeEach(() => {
    workspaceCalls.splice(0);
    mutationOptions.splice(0);
    httpRequest.mockClear();
    cohortRegister.complete = true;
    examResults.splice(0);
    Object.values(toast).forEach((mock) => mock.mockClear());
  });

  it('routes an exam edit address to the editor instead of the detail page', () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/7/edit" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('Edit exam');
    expect(html).toContain('Exam definition');
    expect(loadedPaths()).toContain('/api/v1/academics/exams/7/results/');
  });

  it('uses a calendar-first overview and progressive register filters', () => {
    const overview = renderToStaticMarkup(<ExamsPage route="exams/overview" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);
    expect(overview).toContain('Recent assessment moments');
    expect(overview).toContain('href="/exams/exams/7"');

    const register = renderToStaticMarkup(<ExamsPage route="exams/exams?subject=3" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);
    expect(register).toContain('<details class="fw-filter-disclosure"');
    expect(register).toContain('1 active');
  });

  it('keeps unknown numeric assessment relationships visible while requesting their exact scope', () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams?cohort=901&subject=902&term=903&type=904" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/academics/exams/');

    expect(request.params).toMatchObject({ cohort: '901', subject: '902', term: '903', exam_type: '904' });
    expect(html).toContain('<option value="901" selected="">Selected group is outside this menu</option>');
    expect(html).toContain('<option value="902" selected="">Selected subject is outside this menu</option>');
    expect(html).toContain('<option value="903" selected="">Selected term is outside this menu</option>');
    expect(html).toContain('<option value="904" selected="">Selected exam type is outside this menu</option>');
    expect(html).not.toContain('<option value="" selected="">All groups</option>');
    expect(html).not.toContain('<option value="" selected="">All subjects</option>');
  });

  it('verifies a selected group omitted from a capped branch menu instead of discarding it', () => {
    cohortRegister.complete = false;
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/exams?cohort=77" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);
    const request = workspaceCalls.find((call) => call.path === '/api/v1/academics/exams/');

    expect(loadedPaths()).toContain('/api/v1/cohorts/77/');
    expect(request.enabled).toBe(true);
    expect(request.params.cohort).toBe('77');
    expect(html).toContain('<option value="77" selected="">Selected group is outside this menu</option>');
    expect(html).not.toContain('selected group does not belong to this branch');
  });

  it('keeps edit, results, import, and back links inside a branch workspace', () => {
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/exams/7" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('href="/branches/2/exams"');
    expect(html).toContain('href="/branches/2/exams/exams/7/edit"');
    expect(html).toContain('href="/branches/2/exams/exams/7/results"');
    expect(html).toContain('href="/branches/2/exams/exams/7/import"');
  });

  it('sends published assessments to the controlled correction and history workflow', () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/9" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('Published assessment');
    expect(html).toContain('Published definitions and results can only change through the correction workflow');
    expect(html).toContain('Publication and correction history');
    expect(html).toContain('href="/exams/exams/9/correct"');
    expect(html).not.toContain('href="/exams/exams/9/edit"');
    expect(html).not.toContain('href="/exams/exams/9/import"');
  });

  it('loads the readiness snapshot and publishes the exact reviewed version with explicit confirmation', async () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/7" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(loadedPaths()).toContain('/api/v1/academics/exams/7/readiness/');
    expect(loadedPaths()).toContain('/api/v1/academics/exams/7/history/');
    expect(html).toContain('Readiness review');
    expect(html).toContain('>ready<');
    expect(html).toContain('Publish exam');

    await mutationOptions[0].mutationFn();
    expect(httpRequest).toHaveBeenCalledWith('POST', '/api/v1/academics/exams/7/publish/', {
      body: { expected_version: 4, confirmed: true },
    });
  });

  it('only exposes catalogue mutations to the organization-wide catalogue grant', () => {
    const academicWriter = renderToStaticMarkup(<ExamsPage route="exams/subjects" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write'] }} />);
    expect(academicWriter).not.toContain('Add subject');
    expect(academicWriter).not.toContain('>Edit<');
    expect(academicWriter).not.toContain('>Remove<');

    const catalogueManager = renderToStaticMarkup(<ExamsPage route="exams/subjects" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:catalogue'] }} />);
    expect(catalogueManager).toContain('Add subject');
    expect(catalogueManager).toContain('>Edit<');
    expect(catalogueManager).toContain('>Remove<');

    const directWriterRoute = renderToStaticMarkup(<ExamsPage route="exams/subjects/new" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write'] }} />);
    expect(directWriterRoute).not.toContain('Academic configuration');
  });

  it('opens a dedicated correction form only for published exams', async () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/9/correct" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('Correct Published assessment');
    expect(html).toContain('Correction reason');
    expect(html).toContain('Record correction');

    const payload = {
      expected_version: 4,
      reason: 'Correcting a transcribed score.',
      changes: { title: 'Corrected assessment title' },
      results: [],
    };
    await mutationOptions[0].mutationFn(payload);
    expect(httpRequest).toHaveBeenCalledWith('POST', '/api/v1/academics/exams/9/correct/', { body: payload });
  });

  it('opens results and CSV import as dedicated pages for writers', () => {
    const permissions = { effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] };
    const resultsHtml = renderToStaticMarkup(<ExamsPage route="exams/exams/7/results" onNav={vi.fn()} user={permissions} />);
    expect(resultsHtml).toContain('Result register');
    expect(resultsHtml).toContain('Exam result entry');
    expect(loadedPaths()).toContain('/api/v1/academics/exams/7/results/');
    expect(loadedPaths()).toContain('/api/v1/cohorts/12/members/');

    workspaceCalls.splice(0);
    const importHtml = renderToStaticMarkup(<ExamsPage route="exams/exams/7/import" onNav={vi.fn()} user={permissions} />);
    expect(importHtml).toContain('Result import');
    expect(importHtml).toContain('Validate and import');
  });

  it('averages only strict finite scores while preserving numeric and string zero', () => {
    examResults.push(
      { id: 1, student: 44, student_name: 'Null score', score: null },
      { id: 2, student: 45, student_name: 'Empty score', score: '' },
      { id: 3, student: 46, student_name: 'Boolean true', score: true },
      { id: 4, student: 47, student_name: 'Boolean false', score: false },
      { id: 5, student: 48, student_name: 'Object score', score: {} },
      { id: 6, student: 49, student_name: 'Array score', score: [] },
      { id: 7, student: 50, student_name: 'Numeric zero', score: 0 },
      { id: 8, student: 51, student_name: 'String zero', score: '0' },
      { id: 9, student: 52, student_name: 'Finite score', score: '12.5' },
      { id: 10, student: 53, student_name: 'Negative score', score: '-5' },
      { id: 11, student: 54, student_name: 'Above maximum', score: '150' },
    );

    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/7/results" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('<span>Average loaded score</span><strong>4.17</strong>');
    expect(html).toContain('Numeric zero');
    expect(html).toContain('String zero');
    expect(html).toContain('value="0"');
    expect(html).not.toContain('<td>true</td>');
    expect(html).not.toContain('<td>false</td>');
    expect(html).toContain('Negative score');
    expect(html).toContain('Above maximum');
    expect(html).not.toContain('<td>-5</td>');
    expect(html).not.toContain('<td>150</td>');
  });

  it('does not load protected result routes for a read-only academic role', () => {
    const html = renderToStaticMarkup(<ExamsPage route="exams/exams/7/results" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);

    expect(html).toContain('Exam record');
    expect(html).not.toContain('Result register');
    expect(loadedPaths()).not.toContain('/api/v1/academics/exams/7/results/');
  });

  it('shows only exams connected to a branch group in a nested register', () => {
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/exams" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);

    expect(html).toContain('Spring assessment');
    expect(html).not.toContain('Other branch assessment');
  });

  it('does not forward an out-of-branch cohort filter to the exam register', () => {
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/exams?cohort=99" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['academics:read'] }} />);
    const examCall = workspaceCalls.find((call) => call.path === '/api/v1/academics/exams/');

    expect(html).toContain('selected group does not belong to this branch');
    expect(examCall.params.cohort).toBeUndefined();
    expect(html).not.toContain('Other branch assessment');
  });

  it('verifies a direct branch exam URL before opening results or the roster', () => {
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/exams/8/results" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['academics:read', 'academics:write', 'cohorts:read'] }} />);

    expect(html).toContain('belongs to another branch');
    expect(loadedPaths()).toEqual(['/api/v1/academics/exams/8/', '/api/v1/cohorts/99/']);
    expect(loadedPaths()).not.toContain('/api/v1/academics/exams/8/results/');
    expect(loadedPaths()).not.toContain('/api/v1/cohorts/99/members/');
  });

  it('does not present organization-wide grade registers as branch records', () => {
    const html = renderToStaticMarkup(<ExamsPage route="branches/2/exams/grades" branchId="2" onNav={vi.fn()} user={{ effective_permissions: ['*:*'] }} />);

    expect(html).toContain('Recent assessment moments');
    expect(loadedPaths()).not.toContain('/api/v1/academics/grades/');
    expect(loadedPaths()).not.toContain('/api/v1/academics/subjects/');
    expect(loadedPaths()).toEqual(expect.arrayContaining(['/api/v1/cohorts/', '/api/v1/academics/exams/']));
  });
});
