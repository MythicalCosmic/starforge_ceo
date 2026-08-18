import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceCalls = vi.hoisted(() => []);

vi.mock('../context/ToastContext.jsx', () => ({ useToast: () => ({ success: vi.fn(), danger: vi.fn() }) }));
vi.mock('../hooks/useWorkspaceTitle.js', () => ({ useWorkspaceTitle: vi.fn() }));
vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute: (route) => ({ segments: String(route || '').split('/').filter(Boolean), params: new URLSearchParams() }),
  useWorkspaceData(path, params, options = {}) {
    workspaceCalls.push({ path, params });
    const data = {
      '/api/v1/content/libraries/': [{ id: 1, name: 'Smart Class Learning Hub', visibility: 'tenant', is_active: true }],
      '/api/v1/content/folders/': [{ id: 2, library: 1, library_name: 'Smart Class Learning Hub', name: 'Presentation Resources' }],
      '/api/v1/content/files/': [{ id: 3, library: 1, library_name: 'Smart Class Learning Hub', folder_name: 'Presentation Resources', title: 'Speaking guide', content_type: 'application/pdf', size_bytes: 1200, status: 'clean', is_approved_teacher: true, is_approved_manager: true, is_downloadable: true }],
      '/api/v1/printing/printers/': [{ id: 4, branch: 1, name: 'Reception Laser', is_active: true, capabilities: { color: true, duplex: true, paper: ['A4'] } }],
      '/api/v1/printing/jobs/': [], '/api/v1/printing/agents/': [], '/api/v1/org/branches/': [{ id: 1, name: 'Main Branch' }], '/api/v1/org/departments/': [], '/api/v1/cohorts/': [],
    };
    const enabled = options.enabled ?? Boolean(path);
    const rows = enabled ? data[path] || [] : [];
    return { enabled, rows, total: rows.length, data: enabled ? { results: rows } : null, pending: false, paused: false, error: null, complete: true, retry: vi.fn() };
  },
}));

import { ContentPage } from './ContentWorkspace.jsx';

const director = { effective_permissions: ['content:read', 'content:write', 'content:approve', 'content:publish', 'printing:read', 'printing:write'] };
const renderPage = (route) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ContentPage user={director} route={route} onNav={vi.fn()} /></QueryClientProvider>);

describe('content and print workspace', () => {
  beforeEach(() => workspaceCalls.splice(0));

  it('shows upload and a readable library without a developer action console', () => {
    const html = renderPage('content/library');
    expect(html).toContain('Upload file');
    expect(html).toContain('Speaking guide');
    expect(html).toContain('Presentation Resources');
    expect(html).not.toContain('Request data');
    expect(html).not.toContain('Technical contract');
  });

  it('shows a useful empty print queue and printer cards', () => {
    expect(renderPage('content/print')).toContain('The print queue is clear');
    const printers = renderPage('content/printers');
    expect(printers).toContain('Reception Laser');
    expect(printers).toContain('Double-sided');
  });

  it('never sends unsupported ordering filters to content collections', () => {
    renderPage('content/library');
    const contentCalls = workspaceCalls.filter(({ path }) => path.startsWith('/api/v1/content/'));
    expect(contentCalls).toHaveLength(3);
    expect(contentCalls.every(({ params }) => !Object.hasOwn(params || {}, 'ordering'))).toBe(true);
  });
});
