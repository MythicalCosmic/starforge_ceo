import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), warning: vi.fn(), danger: vi.fn() }),
}));

function state(data, rows = []) {
  return {
    data,
    rows,
    total: rows.length,
    pagination: { page: 1, pages: 1, total: rows.length },
    loading: false,
    pending: false,
    paused: false,
    error: null,
    complete: true,
    retry: vi.fn(),
  };
}

vi.mock('../hooks/useWorkspaceData.js', () => ({
  useWorkspaceData(path) {
    if (path === '/api/v1/people-imports/') {
      const drafts = [{
        id: 41,
        kind: 'student',
        status: 'needs_attention',
        status_label: 'Needs attention',
        source_file_name: 'august-students.xlsx',
        row_count: 18,
        updated_at: '2026-08-20T08:00:00Z',
      }];
      return state(drafts, drafts);
    }
    if (path === '/api/v1/people-imports/41/') {
      return state({
        id: 41,
        kind: 'student',
        status: 'draft',
        status_label: 'Draft',
        source_file_name: 'august-students.xlsx',
        row_count: 18,
        ready_count: 17,
        error_count: 1,
        excluded_count: 0,
        imported_count: 0,
        can_edit: true,
        can_confirm: false,
        updated_at: '2026-08-20T08:00:00Z',
      });
    }
    if (path === '/api/v1/people-imports/41/rows/') {
      const rows = [{
        id: 91,
        position: 7,
        state: 'invalid',
        is_included: true,
        data: { branch: 2, first_name: 'Aziza', last_name: 'Karimova', phone: '', email: '', status: 'lead', cohort: '' },
        errors: { phone: ['Provide a phone or an email.'] },
        source_data: { Name: 'Aziza Karimova' },
      }];
      return state(rows, rows);
    }
    if (path === '/api/v1/org/branches/') return state([{ id: 2, name: 'Central Campus' }], [{ id: 2, name: 'Central Campus' }]);
    if (path === '/api/v1/org/departments/' || path === '/api/v1/cohorts/') return state([], []);
    return state(null, []);
  },
}));

import {
  PeopleImportButton,
  PeopleImportDrafts,
  PeopleImportReviewPage,
} from './PeopleImportWorkspace.jsx';

describe('people import workspace', () => {
  it('uses one compact native-file action on a directory page', () => {
    const markup = renderToStaticMarkup(<PeopleImportButton kind="student" basePath="students" onNav={vi.fn()} />);

    expect(markup).toContain('type="file"');
    expect(markup).toContain('.csv,.tsv,.xlsx');
    expect(markup).toContain('>Import</button>');
  });

  it('keeps unfinished uploads visible as resumable drafts', () => {
    const markup = renderToStaticMarkup(<PeopleImportDrafts kind="student" basePath="students" onNav={vi.fn()} />);

    expect(markup).toContain('Import drafts');
    expect(markup).toContain('august-students.xlsx');
    expect(markup).toContain('/students/imports/41');
    expect(markup).toContain('Resume');
  });

  it('renders a dedicated editable review register before confirmation', () => {
    const markup = renderToStaticMarkup(<PeopleImportReviewPage kind="student" draftId="41" onNav={vi.fn()} canWrite />);

    expect(markup).toContain('Import review');
    expect(markup).toContain('Review register');
    expect(markup).toContain('Spreadsheet row 7');
    expect(markup).toContain('Needs attention');
    expect(markup).toContain('Confirm import');
    expect(markup).not.toContain('Are you sure?');
  });
});
