import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/ToastContext.jsx', () => ({ useToast: () => ({ success: vi.fn(), danger: vi.fn() }) }));
vi.mock('../hooks/useWorkspaceTitle.js', () => ({ useWorkspaceTitle: vi.fn() }));
vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute: (route) => ({ segments: String(route || '').split('/').filter(Boolean), params: new URLSearchParams() }),
  useWorkspaceData(path, _params, options = {}) {
    const data = {
      '/api/v1/campaigns/': [{ id: 7, name: 'August attendance reminder', message: 'Please remember tomorrow’s lesson.', branch_name: 'Main Branch', status: 'sent', total: 24, sent_count: 23, failed_count: 1, created_by_name: 'CEO Director', created_at: '2026-08-13T12:00:00Z' }],
      '/api/v1/campaigns/7/recipients/': [{ id: 9, student: 4, student_name: 'Example Student', phone: '+998900000000', status: 'sent' }],
      '/api/v1/forms/': [{ id: 2, title: 'Learning experience', status: 'published', is_anonymous: true, form_fields: [{ id: 1 }] }],
      '/api/v1/notifications/': [{ id: 3, title: 'Report ready', body: 'The attendance report is ready.', event_type: 'report_ready', read_at: null, created_at: '2026-08-13T12:10:00Z' }],
      '/api/v1/org/branches/': [{ id: 1, name: 'Main Branch' }],
      '/api/v1/cohorts/': [{ id: 5, branch: 1, name: 'Smart' }],
      '/api/v1/campaigns/templates/': [],
    };
    const enabled = options.enabled ?? Boolean(path);
    const rows = enabled ? data[path] || [] : [];
    return { enabled, rows, total: rows.length, data: enabled ? { results: rows } : null, pending: false, paused: false, error: null, complete: true, retry: vi.fn() };
  },
}));

import { EngagementPage } from './EngagementWorkspace.jsx';

const director = { effective_permissions: ['campaign:read', 'campaign:write', 'campaign:send', 'forms:read', 'notifications:read', 'org:read', 'cohorts:read'] };
const renderPage = (route) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><EngagementPage user={director} route={route} onNav={vi.fn()} /></QueryClientProvider>);

describe('community engagement workspace', () => {
  it('shows readable engagement work rather than a generic record inspector', () => {
    const html = renderPage('engagement/overview');
    expect(html).toContain('Learning experience');
    expect(html).toContain('August attendance reminder');
    expect(html).toContain('New outreach');
    expect(html).not.toContain('Key information');
    expect(html).not.toContain('Technical contract');
  });

  it('shows campaign delivery details and normal actions', () => {
    const html = renderPage('engagement/campaigns');
    expect(html).toContain('Please remember tomorrow’s lesson.');
    expect(html).toContain('Example Student');
    expect(html).toContain('Confirmed messages');
    expect(html).not.toContain('Request data');
  });
});
