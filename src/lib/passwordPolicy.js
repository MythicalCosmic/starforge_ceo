export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function validatePasswordChange({ currentPassword, newPassword, confirmation }) {
  if (!currentPassword) {
    return { field: 'current', message: 'Enter your temporary password.' };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      field: 'new',
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    return {
      field: 'new',
      message: `Use no more than ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }
  if (/^\d+$/.test(newPassword)) {
    return { field: 'new', message: 'Choose a password that is not entirely numeric.' };
  }
  if (newPassword === currentPassword) {
    return {
      field: 'new',
      message: 'Choose a password that differs from the temporary password.',
    };
  }
  if (newPassword !== confirmation) {
    return { field: 'confirmation', message: 'The new passwords do not match.' };
  }
  return null;
}

export function passwordChangeFailure(error) {
  if (error?.code === 'wrong_password') {
    return { field: 'current', message: 'The temporary password was not accepted.' };
  }
  if (error?.code === 'weak_password' || [400, 422].includes(Number(error?.status))) {
    return {
      field: 'new',
      message: 'Choose a less common password that is not based on your name or account details.',
    };
  }
  if (Number(error?.status) === 429) {
    return {
      field: 'form',
      message: 'Password changes are briefly paused. Please wait a moment and try again.',
    };
  }
  if (Number(error?.status) === 401) {
    return {
      field: 'form',
      message: 'Your private session has ended. Sign in again to continue.',
    };
  }
  if (Number(error?.status) === 0) {
    return {
      field: 'form',
      message: 'Your workspace is temporarily out of reach. Check your connection and try again.',
    };
  }
  return { field: 'form', message: 'The password could not be changed. Please try again.' };
}
