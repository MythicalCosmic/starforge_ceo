import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), danger: vi.fn() }),
}));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute: (route) => ({ segments: String(route || '').split('/').filter(Boolean), params: new URLSearchParams() }),
  useWorkspaceData(path, _params, options = {}) {
    const rowsByPath = {
      '/api/v1/reports/': [{ id: 1, key: 'attendance', title: 'Attendance report', description: 'Attendance outcomes.', default_format: 'pdf' }],
      '/api/v1/reports/runs/': [{ id: 4, report_key: 'attendance', format: 'pdf', status: 'done', file_bytes: 1200, download_url: 'https://files.example/report.pdf', created_at: '2026-08-13T08:00:00Z' }],
      '/api/v1/reports/schedules/': [{ id: 8, report_key: 'attendance', format: 'pdf', cadence: 'weekly', weekday: 1, hour: 7, recipient_ids: [22], is_active: true }],
      '/api/v1/org/branches/': [],
      '/api/v1/cohorts/': [],
      '/api/v1/schedule/terms/': [],
      '/api/v1/academics/subjects/': [],
      '/api/v1/messaging/contacts/': [],
    };
    const enabled = options.enabled ?? Boolean(path);
    const rows = enabled ? rowsByPath[path] || [] : [];
    return { enabled, rows, total: rows.length, data: enabled ? { results: rows } : null, pending: false, paused: false, error: null, complete: true, retry: vi.fn() };
  },
}));

vi.mock('../hooks/useWorkspaceTitle.js', () => ({ useWorkspaceTitle: vi.fn() }));

import { ReportsPage } from './ReportsWorkspace.jsx';

const director = { effective_permissions: ['reports:read', 'reports:write', 'messaging:read'] };
const renderPage = (route) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ReportsPage user={director} route={route} onNav={vi.fn()} />
  </QueryClientProvider>,
);

describe('reports workspace', () => {
  it('renders a business report library without a developer request console', () => {
    const html = renderPage('reports/library');
    expect(html).toContain('Attendance report');
    expect(html).toContain('Prepare report');
    expect(html).not.toContain('Request data');
    expect(html).not.toContain('Technical contract');
  });

  it('renders ready downloads and readable schedule state', () => {
    const runs = renderPage('reports/runs');
    const schedules = renderPage('reports/schedules');
    expect(runs).toContain('Download');
    expect(schedules).toContain('Weekly');
    expect(schedules).toContain('Active');
  });
});
