// Session helpers for the StarForge backend's opaque bearer credential.
// CEOs and managers authenticate through the backend's role-native endpoint.

import { API_CONFIG } from './config.js';
import { ApiError, httpRequest } from './http.js';

export const AUTH_SESSION_CHANGED = 'sf-auth-session-changed';
export const AUTH_SESSION_INVALIDATED = 'sf-auth-session-invalidated';

function readStoredToken() {
  try {
    return sessionStorage.getItem(API_CONFIG.tokenKey) || '';
  } catch {
    return '';
  }
}

function removeLegacyPersistentToken() {
  try {
    localStorage.removeItem(API_CONFIG.tokenKey);
  } catch {
    // localStorage may be unavailable or blocked. It is never used for auth.
  }
}

function notifySessionChange(reason) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED, { detail: { reason } }));
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

function authSessionSource() {
  removeLegacyPersistentToken();
  return readStoredToken() ? 'storage' : null;
}

export function hasAuthSession() {
  return Boolean(authSessionSource());
}

function saveAuthToken(token, { notify = true } = {}) {
  const normalized = String(token || '').trim();
  if (!normalized) throw new ApiError(0, 'Your sign-in could not be completed. Please try again.');

  try {
    sessionStorage.setItem(API_CONFIG.tokenKey, normalized);
  } catch {
    throw new ApiError(0, 'The browser could not save this session.');
  }
  removeLegacyPersistentToken();
  if (notify) notifySessionChange('signed-in');
}

function clearAuthToken({ notify = true, clearDevice = false } = {}) {
  try {
    sessionStorage.removeItem(API_CONFIG.tokenKey);
    if (clearDevice) sessionStorage.removeItem(API_CONFIG.deviceKey);
  } catch {
    // The in-memory UI must still reflect the signed-out state.
  }
  removeLegacyPersistentToken();
  if (notify) notifySessionChange('signed-out');
}

export async function loginWithPassword({ username, password }, { notify = true } = {}) {
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername || !password) throw new ApiError(400, 'Username and password are required.');

  const result = await httpRequest('POST', '/api/v1/auth/role-login/', {
    body: {
      username: cleanUsername,
      password,
      platform: 'web',
      device_id: deviceId(),
    },
    // A stale credential must not be sent while replacing a session.
    auth: false,
  });
  saveAuthToken(result?.access, { notify });
  return result;
}

export function getCurrentUser({ signal } = {}) {
  return httpRequest('GET', '/api/v1/users/me/', { signal });
}

export async function changeCurrentPassword({ oldPassword, newPassword }, { notify = true } = {}) {
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, 'Current and new passwords are required.');
  }
  const result = await httpRequest('POST', '/api/v1/auth/password/change/', {
    body: { old_password: oldPassword, new_password: newPassword },
  });
  saveAuthToken(result?.access, { notify });
  return result;
}

export async function logoutCurrentSession() {
  try {
    // The backend invalidates its server-side opaque session here.
    if (hasAuthSession()) await httpRequest('POST', '/api/v1/auth/logout/');
  } finally {
    // Local data must not stay visible if the network request fails.
    clearAuthToken({ clearDevice: true });
  }
}
