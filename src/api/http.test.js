import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_CONFIG } from './config.js';
import { ApiError, httpRequest } from './http.js';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  };
}

function response({
  ok = true,
  status = 200,
  statusText = 'OK',
  body = null,
  headers = {},
} = {}) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    text: vi.fn(async () => (body == null ? '' : JSON.stringify(body))),
  };
}

describe('httpRequest', () => {
  let session;
  let persistent;
  let browserWindow;

  beforeEach(() => {
    session = memoryStorage();
    persistent = memoryStorage();
    browserWindow = new EventTarget();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', persistent);
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends the tab-scoped bearer token and unwraps canonical response metadata', async () => {
    session.setItem(API_CONFIG.tokenKey, 'session-secret');
    fetch.mockResolvedValue(
      response({
        body: {
          success: true,
          data: [{ id: 7 }],
          pagination: { total: 1, page: 1, page_size: 25, pages: 1 },
        },
        headers: { 'X-Request-ID': 'server-request-id' },
      }),
    );

    const result = await httpRequest('POST', '/api/v1/example/', {
      params: { search: 'Ada Lovelace', page: 2, empty: '' },
      body: { enabled: true },
      withMeta: true,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/example/?search=Ada+Lovelace&page=2');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer session-secret');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers['X-Request-ID']).toBeTruthy();
    expect(init.body).toBe('{"enabled":true}');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      data: [{ id: 7 }],
      pagination: { total: 1, page: 1, page_size: 25, pages: 1 },
    });
  });

  it('does not send a stale bearer token on unauthenticated requests', async () => {
    session.setItem(API_CONFIG.tokenKey, 'stale-secret');
    fetch.mockResolvedValue(response({ body: { success: true, data: { access: 'new-secret' } } }));

    await httpRequest('POST', '/api/v1/auth/role-login/', {
      body: { username: 'director', password: 'hidden' },
      auth: false,
    });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('clears legacy and tab credentials and emits invalidation events on 401', async () => {
    session.setItem(API_CONFIG.tokenKey, 'expired-secret');
    persistent.setItem(API_CONFIG.tokenKey, 'legacy-secret');
    const invalidated = vi.fn();
    const changed = vi.fn();
    browserWindow.addEventListener('sf-auth-session-invalidated', invalidated);
    browserWindow.addEventListener('sf-auth-session-changed', changed);
    fetch.mockResolvedValue(
      response({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: { success: false, message: 'Session expired', code: 'expired' },
        headers: { 'X-Request-ID': 'expired-request-id' },
      }),
    );

    const request = httpRequest('GET', '/api/v1/users/me/');

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Session expired',
      code: 'expired',
      requestId: 'expired-request-id',
    });
    expect(session.getItem(API_CONFIG.tokenKey)).toBeNull();
    expect(persistent.getItem(API_CONFIG.tokenKey)).toBeNull();
    expect(invalidated).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('turns a backend-declared failure in an HTTP 200 envelope into an ApiError', async () => {
    fetch.mockResolvedValue(
      response({
        body: {
          success: false,
          message: 'Operation was refused',
          code: 'policy_denied',
          errors: { branch: ['Not in scope'] },
        },
      }),
    );

    const request = httpRequest('GET', '/api/v1/example/');

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 200,
        message: 'Operation was refused',
        code: 'policy_denied',
        errors: { branch: ['Not in scope'] },
      }),
    );
    await request.catch((error) => expect(error).toBeInstanceOf(ApiError));
  });

  it('rejects an HTTP 200 proxy page instead of presenting it as empty API data', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'X-Request-ID': 'html-response-id' }),
      text: vi.fn(async () => '<!doctype html><title>Proxy login</title>'),
    });

    await expect(httpRequest('GET', '/api/v1/students/')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'The response could not be understood. Please try again.',
      requestId: 'html-response-id',
    });
  });

  it('distinguishes caller cancellation from a transport timeout', async () => {
    const caller = new AbortController();
    fetch.mockImplementation(async (_url, init) => {
      caller.abort();
      await new Promise((resolve, reject) => {
        if (init.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });

    await expect(
      httpRequest('GET', '/api/v1/example/', { signal: caller.signal }),
    ).rejects.toMatchObject({
      status: 0,
      message: 'Request aborted',
    });
  });
});
