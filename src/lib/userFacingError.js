export function userFacingError(error, { context = 'workspace', fallback } = {}) {
  const status = Number(error?.status);

  if (status === 0 || error?.name === 'TypeError') {
    return 'Your workspace is temporarily out of reach. Check your connection and try again.';
  }
  if (context === 'login' && [400, 401, 403, 422].includes(status)) {
    return 'Those sign-in details were not accepted. Check them and try again.';
  }
  if (context === 'login' && status === 404) {
    return 'Sign-in is temporarily unavailable. Please try again in a moment.';
  }
  if (status === 401) return 'Your private session has ended. Sign in again to continue.';
  if (status === 402) {
    return 'Your organization\'s current plan does not include this information.';
  }
  if (status === 403) return 'This information is outside your current responsibilities.';
  if (status === 404) return 'This information is no longer available in the current view.';
  if (status === 429) return 'Updates are briefly paused. Please try again in a moment.';
  if ([502, 503, 504].includes(status)) {
    return 'Live information is temporarily unavailable. Your records remain protected.';
  }
  return fallback || 'This view could not be opened. Please try again.';
}

export function supportReference(error) {
  const value = String(error?.requestId || '').trim();
  return value ? value.slice(-12).toUpperCase() : '';
}
