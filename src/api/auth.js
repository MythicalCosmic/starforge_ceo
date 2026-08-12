// Session helpers for the StarForge backend's opaque HttpOnly cookie credential.
// CEOs and managers authenticate through the backend's role-native endpoint.

import { API_CONFIG } from './config.js';
import { ApiError, httpRequest } from './http.js';
import { queryClient } from './queryClient.js';

export const AUTH_SESSION_CHANGED = 'sf-auth-session-changed';
export const AUTH_SESSION_INVALIDATED = 'sf-auth-session-invalidated';

let currentUserRequest = null;

function clearCurrentUserRequest() {
  currentUserRequest = null;
}

function removeLegacyTokens() {
  try {
    sessionStorage.removeItem(API_CONFIG.legacyTokenKey);
  } catch {
    // Continue: the credential is not stored in JavaScript-accessible storage.
  }
  try {
    localStorage.removeItem(API_CONFIG.legacyTokenKey);
  } catch {
    // localStorage may be unavailable or blocked.
  }
}

function notifySessionChange(reason, { broadcast = false } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED, { detail: { reason } }));
  if (broadcast) broadcastSessionChange(reason);
}

function broadcastSessionChange(reason) {
  try {
    localStorage.setItem(
      API_CONFIG.sessionSignalKey,
      JSON.stringify({ reason, at: Date.now(), nonce: Math.random().toString(16).slice(2) }),
    );
  } catch {
    // New tabs still discover the shared cookie during bootstrap.
  }
}

function broadcastLogout(reason = 'confirmed') {
  try {
    localStorage.setItem(
      API_CONFIG.logoutSignalKey,
      JSON.stringify({ reason, at: Date.now(), nonce: Math.random().toString(16).slice(2) }),
    );
  } catch {
    // Other tabs will still expire on their next protected request.
  }
}

function deviceId() {
  try {
    let value = sessionStorage.getItem(API_CONFIG.deviceKey);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(API_CONFIG.deviceKey, value);
    }
    return value;
  } catch {
    return '';
  }
}

function acceptBrowserSession({ notify = true, reason = 'signed-in' } = {}) {
  clearCurrentUserRequest();
  removeLegacyTokens();
  queryClient.clear();
  if (notify) notifySessionChange(reason);
  broadcastSessionChange(reason);
}

function clearBrowserSession({ notify = true, clearDevice = false, broadcast = false, logoutReason = 'confirmed' } = {}) {
  clearCurrentUserRequest();
  try {
    sessionStorage.removeItem(API_CONFIG.legacyTokenKey);
    if (clearDevice) sessionStorage.removeItem(API_CONFIG.deviceKey);
  } catch {
    // The in-memory UI must still reflect the signed-out state.
  }
  removeLegacyTokens();
  queryClient.clear();
  if (broadcast) broadcastLogout(logoutReason);
  if (notify) notifySessionChange('signed-out');
}

export async function loginWithPassword({ username, password }, { notify = true } = {}) {
  const cleanUsername = String(username ?? '').trim();
  const exactPassword = String(password ?? '');
  if (!cleanUsername || !exactPassword) {
    throw new ApiError(400, 'Username and password are required.');
  }
  if (cleanUsername.length > 150 || exactPassword.length > 128) {
    throw new ApiError(400, 'Check the highlighted sign-in details and try again.');
  }
  if (/\p{Cc}/u.test(cleanUsername) || /\p{Cc}/u.test(exactPassword)) {
    throw new ApiError(400, 'Sign-in details cannot contain control characters.');
  }

  // Login itself is CSRF protected. This safe GET sets the CSRF cookie and
  // returns its masked request token; neither value authenticates a user.
  const browserSession = await httpRequest('GET', '/api/v1/auth/session/', {
    auth: false,
    timeout: 12_000,
  });

  const result = await httpRequest('POST', '/api/v1/auth/role-login/', {
    body: {
      username: cleanUsername,
      // Passwords are opaque credentials. Altering surrounding whitespace can
      // silently turn a valid password into a different one; injection safety
      // belongs to parameterized service-side authentication.
      password: exactPassword,
      platform: 'web',
      device_id: deviceId(),
    },
    csrfToken: browserSession?.csrf_token,
    sessionTransport: 'cookie',
    auth: false,
  });
  acceptBrowserSession({ notify });
  return result;
}

export function getCurrentUser({ signal } = {}) {
  // Session bootstrap owns its 401 transition. Suppressing the global 401
  // signal here avoids a stale bootstrap response invalidating a newer cookie
  // session established in another tab.
  const request = () => httpRequest('GET', '/api/v1/users/me/', {
    signal,
    timeout: 12_000,
    invalidateOnUnauthorized: false,
  });
  // React development remounts and cross-tab session events can ask for the
  // same identity at the same time. Share that one authoritative read instead
  // of opening duplicate identity requests. A caller-owned signal remains
  // isolated because sharing it would let one consumer cancel every consumer.
  if (signal) return request();
  if (!currentUserRequest) {
    const pending = request();
    currentUserRequest = pending;
    pending.then(
      () => { if (currentUserRequest === pending) clearCurrentUserRequest(); },
      () => { if (currentUserRequest === pending) clearCurrentUserRequest(); },
    );
  }
  return currentUserRequest;
}

export async function changeCurrentPassword({ oldPassword, newPassword }, { notify = true } = {}) {
  const exactOldPassword = String(oldPassword ?? '');
  const exactNewPassword = String(newPassword ?? '');
  if (!exactOldPassword || !exactNewPassword) {
    throw new ApiError(400, 'Current and new passwords are required.');
  }
  if (exactOldPassword.length > 128 || exactNewPassword.length > 128) {
    throw new ApiError(400, 'Check the highlighted password details and try again.');
  }
  if (/\p{Cc}/u.test(exactOldPassword) || /\p{Cc}/u.test(exactNewPassword)) {
    throw new ApiError(400, 'Password details cannot contain control characters.');
  }
  const result = await httpRequest('POST', '/api/v1/auth/password/change/', {
    body: { old_password: exactOldPassword, new_password: exactNewPassword },
  });
  acceptBrowserSession({ notify, reason: 'password-changed' });
  return result;
}

export async function logoutCurrentSession() {
  // Remove private UI state before waiting on the network so choosing sign out
  // can never leave the authenticated workspace visible on a slow connection.
  clearBrowserSession({ clearDevice: true, broadcast: false });
  let failure = null;
  try {
    await httpRequest('POST', '/api/v1/auth/logout/', {
      timeout: 3500,
      // Logout handles an already-ended session as a confirmed outcome itself;
      // it must not emit a competing global unauthorized transition first.
      invalidateOnUnauthorized: false,
    });
  } catch (error) {
    // An already-expired or already-revoked session is a confirmed signed-out
    // outcome. Transport, CSRF, and service failures remain unconfirmed.
    if (Number(error?.status) !== 401) failure = error;
  }
  broadcastLogout(failure ? 'unconfirmed' : 'confirmed');
  if (failure) throw failure;
}
