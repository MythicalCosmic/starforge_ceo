import { describe, expect, it } from 'vitest';
import { userFacingError } from './userFacingError.js';

describe('executive-safe authentication errors', () => {
  it('does not expose credential-service detail on rejected sign-in', () => {
    const message = userFacingError(
      { status: 401, message: 'SELECT failed for auth_user at internal-host:5432' },
      { context: 'login', fallback: 'Sign-in failed.' },
    );

    expect(message).toBe('Those sign-in details were not accepted. Check them and try again.');
    expect(message).not.toMatch(/SELECT|auth_user|5432/);
  });

  it('uses a neutral fallback for unexpected sign-in failures', () => {
    expect(userFacingError(
      { status: 500, message: 'Traceback: database unavailable' },
      { context: 'login', fallback: 'Sign-in failed. Check your details and try again.' },
    )).toBe('Sign-in failed. Check your details and try again.');
  });

  it('keeps forbidden and missing sign-in operations in login-safe language', () => {
    expect(userFacingError({ status: 403 }, { context: 'login' }))
      .toBe('Those sign-in details were not accepted. Check them and try again.');
    expect(userFacingError({ status: 404 }, { context: 'login' }))
      .toBe('Sign-in is temporarily unavailable. Please try again in a moment.');
  });
});
