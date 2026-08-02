import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_CONFIG } from './config.js';
import {
  changeCurrentPassword,
  getCurrentUser,
  loginWithPassword,
  logoutCurrentSession,
} from './auth.js';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

function success(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: vi.fn(async () => JSON.stringify({ success: true, data })),
  };
}

describe('management session helpers', () => {
  let session;
  let persistent;

  beforeEach(() => {
    session = memoryStorage();
    persistent = memoryStorage();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', persistent);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bootstraps CSRF, trims the username, preserves the password, and keeps credentials out of storage', async () => {
    session.setItem(API_CONFIG.legacyTokenKey, 'stale-tab-token');
    persistent.setItem(API_CONFIG.legacyTokenKey, 'legacy-persistent-token');
    fetch
      .mockResolvedValueOnce(success({ csrf_token: 'masked-csrf-token' }))
      .mockResolvedValueOnce(success({ role: 'staff', must_change_password: false }));

    const result = await loginWithPassword(
      { username: '  ceo.user  ', password: '  not-recorded  ' },
      { notify: false },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const [bootstrapUrl, bootstrapInit] = fetch.mock.calls[0];
    expect(bootstrapUrl).toBe('/api/v1/auth/session/');
    expect(bootstrapInit.method).toBe('GET');
    expect(bootstrapInit.credentials).toBe('same-origin');

    const [url, init] = fetch.mock.calls[1];
    const requestBody = JSON.parse(init.body);
    expect(url).toBe('/api/v1/auth/role-login/');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers['X-CSRFToken']).toBe('masked-csrf-token');
    expect(init.headers['X-Session-Transport']).toBe('cookie');
    expect(requestBody).toMatchObject({
      username: 'ceo.user',
      password: '  not-recorded  ',
      platform: 'web',
    });
    expect(requestBody.device_id).toBeTruthy();
    expect(result).toEqual({ role: 'staff', must_change_password: false });
    expect(session.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.setItem).toHaveBeenCalledWith(
      API_CONFIG.sessionSignalKey,
      expect.stringContaining('signed-in'),
    );
  });

  it('accepts the rotated HttpOnly cookie after mandatory password change', async () => {
    session.setItem(API_CONFIG.legacyTokenKey, 'temporary-token');
    fetch.mockResolvedValue(success({}));

    await changeCurrentPassword(
      { oldPassword: 'temporary-password', newPassword: 'new-password' },
      { notify: false },
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/auth/password/change/');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({
      old_password: 'temporary-password',
      new_password: 'new-password',
    });
    expect(session.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.setItem).toHaveBeenCalledWith(
      API_CONFIG.sessionSignalKey,
      expect.stringContaining('password-changed'),
    );
  });

  it('rejects oversize sign-in values without silently truncating the opaque password', async () => {
    await expect(loginWithPassword({ username: 'a'.repeat(151), password: 'valid' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(loginWithPassword({ username: 'admin', password: 'x'.repeat(129) }))
      .rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets session bootstrap own a 401 without broadcasting a stale global logout', async () => {
    const invalidated = vi.fn();
    const changed = vi.fn();
    window.addEventListener('sf-auth-session-invalidated', invalidated);
    window.addEventListener('sf-auth-session-changed', changed);
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      text: vi.fn(async () => JSON.stringify({ success: false, message: 'Session ended' })),
    });

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(invalidated).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(persistent.setItem).not.toHaveBeenCalledWith(
      API_CONFIG.logoutSignalKey,
      expect.anything(),
    );
  });

  it('removes local credentials even when backend logout is unreachable', async () => {
    session.setItem(API_CONFIG.legacyTokenKey, 'active-token');
    persistent.setItem(API_CONFIG.legacyTokenKey, 'legacy-token');
    fetch.mockRejectedValue(new TypeError('Network unavailable'));

    await expect(logoutCurrentSession()).rejects.toThrow(
      'Your workspace is temporarily out of reach. Please try again.',
    );
    expect(session.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(session.getItem(API_CONFIG.deviceKey)).toBeNull();
    expect(persistent.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.setItem).toHaveBeenCalledWith(
      API_CONFIG.logoutSignalKey,
      expect.any(String),
    );
    const logoutSignal = persistent.setItem.mock.calls.find(([key]) => key === API_CONFIG.logoutSignalKey)?.[1];
    expect(JSON.parse(logoutSignal)).toMatchObject({ reason: 'unconfirmed' });
  });

  it('treats an already-ended session as a confirmed logout', async () => {
    const invalidated = vi.fn();
    window.addEventListener('sf-auth-session-invalidated', invalidated);
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      text: vi.fn(async () => JSON.stringify({ success: false, message: 'Session ended' })),
    });

    await expect(logoutCurrentSession()).resolves.toBeUndefined();
    expect(persistent.setItem).toHaveBeenLastCalledWith(
      API_CONFIG.logoutSignalKey,
      expect.any(String),
    );
    expect(JSON.parse(persistent.setItem.mock.calls.at(-1)[1])).toMatchObject({ reason: 'confirmed' });
    expect(invalidated).not.toHaveBeenCalled();
  });
});
