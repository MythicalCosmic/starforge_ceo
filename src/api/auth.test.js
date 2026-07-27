import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_CONFIG } from './config.js';
import {
  changeCurrentPassword,
  hasAuthSession,
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

  it('logs in without forwarding a stale token and keeps the new token tab-scoped', async () => {
    session.setItem(API_CONFIG.tokenKey, 'stale-tab-token');
    persistent.setItem(API_CONFIG.tokenKey, 'legacy-persistent-token');
    fetch.mockResolvedValue(success({ access: 'fresh-tab-token', must_change_password: false }));

    const result = await loginWithPassword(
      { username: '  ceo.user  ', password: 'not-recorded' },
      { notify: false },
    );

    const [url, init] = fetch.mock.calls[0];
    const requestBody = JSON.parse(init.body);
    expect(url).toBe('/api/v1/auth/role-login/');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(requestBody).toMatchObject({
      username: 'ceo.user',
      password: 'not-recorded',
      platform: 'web',
    });
    expect(requestBody.device_id).toBeTruthy();
    expect(result.access).toBe('fresh-tab-token');
    expect(session.getItem(API_CONFIG.tokenKey)).toBe('fresh-tab-token');
    expect(persistent.getItem(API_CONFIG.tokenKey)).toBeNull();
    expect(hasAuthSession()).toBe(true);
  });

  it('replaces the credential returned after mandatory password change', async () => {
    session.setItem(API_CONFIG.tokenKey, 'temporary-token');
    fetch.mockResolvedValue(success({ access: 'rotated-token' }));

    await changeCurrentPassword(
      { oldPassword: 'temporary-password', newPassword: 'new-password' },
      { notify: false },
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/auth/password/change/');
    expect(init.headers.Authorization).toBe('Bearer temporary-token');
    expect(JSON.parse(init.body)).toEqual({
      old_password: 'temporary-password',
      new_password: 'new-password',
    });
    expect(session.getItem(API_CONFIG.tokenKey)).toBe('rotated-token');
  });

  it('removes local credentials even when backend logout is unreachable', async () => {
    session.setItem(API_CONFIG.tokenKey, 'active-token');
    persistent.setItem(API_CONFIG.tokenKey, 'legacy-token');
    fetch.mockRejectedValue(new TypeError('Network unavailable'));

    await expect(logoutCurrentSession()).rejects.toThrow('Network unavailable');
    expect(session.getItem(API_CONFIG.tokenKey)).toBeNull();
    expect(session.getItem(API_CONFIG.deviceKey)).toBeNull();
    expect(persistent.getItem(API_CONFIG.tokenKey)).toBeNull();
    expect(hasAuthSession()).toBe(false);
  });
});
