import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  status: 'signout-unconfirmed',
  reason: 'This tab cleared its private information, but the sign-out request could not be confirmed.',
  logout: vi.fn(),
}));

vi.mock('./context/AuthContext.jsx', () => ({
  useAuth: () => authState,
}));

import App from './App.jsx';

describe('application authentication boundaries', () => {
  it('does not claim a failed remote logout ended the private session', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Sign-out could not be confirmed');
    expect(html).toContain('sign-out request could not be confirmed');
    expect(html).toContain('Try sign out again');
    expect(html).not.toContain('Welcome back');
  });
});
