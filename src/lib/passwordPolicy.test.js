import { describe, expect, it } from 'vitest';
import { passwordChangeFailure, validatePasswordChange } from './passwordPolicy.js';

describe('password change guidance', () => {
  it('matches the pinned backend minimum and rejects numeric-only passwords', () => {
    expect(validatePasswordChange({
      currentPassword: 'Temporary-42',
      newPassword: 'short',
      confirmation: 'short',
    })).toMatchObject({ field: 'new' });
    expect(validatePasswordChange({
      currentPassword: 'Temporary-42',
      newPassword: '1234567890',
      confirmation: '1234567890',
    })).toMatchObject({ field: 'new', message: expect.stringContaining('numeric') });
  });

  it('places mismatch and backend policy failures beside the relevant field', () => {
    expect(validatePasswordChange({
      currentPassword: 'Temporary-42',
      newPassword: 'Nebula-Compass-77',
      confirmation: 'Different-Compass-77',
    })).toMatchObject({ field: 'confirmation' });
    expect(passwordChangeFailure({ status: 400, code: 'weak_password' }))
      .toMatchObject({ field: 'new' });
    expect(passwordChangeFailure({ status: 400, code: 'wrong_password' }))
      .toMatchObject({ field: 'current' });
  });
});
