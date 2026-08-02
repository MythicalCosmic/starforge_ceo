import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options = {}) => options.defaultValue || key,
    i18n: {
      language: 'en',
      resolvedLanguage: 'en',
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../context/PreferencesContext.jsx', () => ({
  usePreferences: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({
    success: vi.fn(),
    warning: vi.fn(),
    danger: vi.fn(),
  }),
}));

vi.mock('../i18n/index.js', () => ({ LANGUAGES: ['en'] }));

import { LoginPage, PasswordChangePage } from './Login.jsx';

describe('authentication form semantics', () => {
  it('exposes password-manager hints without browser-side credential truncation', () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('autoCapitalize="none"');
    expect(html).toContain('aria-controls="sf-login-password"');
    expect(html).toContain('for="sf-login-username"');
    expect(html).toContain('for="sf-login-password"');
    expect(html).not.toContain('maxLength=');
  });

  it('does not silently truncate current or replacement passwords', () => {
    const html = renderToStaticMarkup(<PasswordChangePage />);

    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).not.toContain('maxLength=');
  });
});
