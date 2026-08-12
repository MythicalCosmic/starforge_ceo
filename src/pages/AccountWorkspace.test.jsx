import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ changePassword: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), warning: vi.fn(), danger: vi.fn() }),
}));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  workspaceRoute(route) {
    const [path, query = ''] = String(route || '').split('?', 2);
    return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  },
  useWorkspaceData(path) {
    const data = path === '/api/v1/users/me/' ? {
      id: 1,
      username: 'admin',
      full_name: 'Demo Director',
      first_name: 'Demo',
      last_name: 'Director',
      is_active: true,
      must_change_password: false,
      tenant_slug: 'demo',
      role_memberships: [{ id: 1, account_type_name: 'Director', account_kind: 'staff' }],
    } : path === '/api/v1/users/sessions/' ? {
      count: 1,
      results: [{ id: 8, platform: 'web', device: 'Linux', browser: 'Chrome', current_session: true, read_only: false, last_activity_at: '2026-08-10T10:00:00Z', idle_expires_at: '2026-08-10T11:00:00Z' }],
    } : { count: 0, results: [] };
    const rows = Array.isArray(data.results) ? data.results : [];
    return { data, rows, total: rows.length, pending: false, paused: false, error: null, complete: true, retry: vi.fn() };
  },
}));

import { AccountPage } from './AccountWorkspace.jsx';

describe('account workspace assurance', () => {
  it('uses human sign-in wording instead of exposing an account state value', () => {
    const html = renderToStaticMarkup(<AccountPage route="account/profile" onNav={vi.fn()} />);

    expect(html).toContain('Password is up to date');
    expect(html).toContain('No password update is currently required.');
    expect(html).not.toContain('Password is accepted');
  });

  it('applies the shared password length boundary in the full account workspace', () => {
    const html = renderToStaticMarkup(<AccountPage route="account/security" onNav={vi.fn()} />);

    expect(html).toContain('id="account-new-password"');
    expect(html).toContain('maxLength="128"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('Active sign-ins');
  });

  it('highlights the current sign-in and exposes its real sign-out action on devices', () => {
    const html = renderToStaticMarkup(<AccountPage route="account/devices" onNav={vi.fn()} />);

    expect(html).toContain('Active sign-ins');
    expect(html).toContain('is-current-session');
    expect(html).toContain('current session');
    expect(html).toContain('Sign out this current device');
  });

  it('replaces account mutations with clear view-only guidance for restricted sessions', () => {
    const html = renderToStaticMarkup(<AccountPage
      route="account/devices"
      onNav={vi.fn()}
      user={{ read_only_session: true }}
    />);

    expect(html).toContain('current · view only');
    expect(html).not.toContain('Sign out this current device');
  });
});
