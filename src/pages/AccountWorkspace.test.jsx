import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ changePassword: vi.fn() }),
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
  });
});
