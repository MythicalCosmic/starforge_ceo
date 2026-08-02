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

  it('sends same-origin cookies and CSRF without exposing a bearer token', async () => {
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
      csrfToken: 'masked-csrf-token',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/example/?search=Ada+Lovelace&page=2');
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers['X-CSRFToken']).toBe('masked-csrf-token');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers['X-Request-ID']).toBeTruthy();
    expect(init.body).toBe('{"enabled":true}');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.credentials).toBe('same-origin');
    expect(init.mode).toBe('same-origin');
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    expect(result).toEqual({
      data: [{ id: 7 }],
      pagination: { total: 1, page: 1, page_size: 25, pages: 1 },
    });
  });

  it('selects cookie transport explicitly for browser login', async () => {
    session.setItem(API_CONFIG.legacyTokenKey, 'stale-secret');
    fetch.mockResolvedValue(response({ body: { success: true, data: { role: 'staff' } } }));

    await httpRequest('POST', '/api/v1/auth/role-login/', {
      body: { username: 'director', password: 'hidden' },
      auth: false,
      csrfToken: 'login-csrf',
      sessionTransport: 'cookie',
    });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers['X-CSRFToken']).toBe('login-csrf');
    expect(init.headers['X-Session-Transport']).toBe('cookie');
  });

  it('does not forward unknown session transports and falls back to the CSRF cookie', async () => {
    vi.stubGlobal('document', { cookie: 'csrftoken=cookie-csrf-token' });
    fetch.mockResolvedValue(response({ body: { success: true, data: { saved: true } } }));

    await httpRequest('POST', '/api/v1/example/', {
      body: { enabled: true },
      csrfToken: '   ',
      sessionTransport: 'bearer\r\nX-Injected: yes',
    });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers['X-CSRFToken']).toBe('cookie-csrf-token');
    expect(init.headers).not.toHaveProperty('X-Session-Transport');
  });

  it('sends FormData without overriding the browser multipart boundary', async () => {
    fetch.mockResolvedValue(response({ body: { success: true, data: { created: 2 } } }));
    const form = new FormData();
    form.append('file', new Blob(['student_id,score\nS-1,92'], { type: 'text/csv' }), 'results.csv');

    await httpRequest('POST', '/api/v1/academics/exams/7/results/import-csv/', { body: form });

    const [, init] = fetch.mock.calls[0];
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('rejects paths outside the same-origin application namespace before fetch', async () => {
    for (const path of [
      '//evil.example/api/v1/students/',
      'https://evil.example/api/v1/students/',
      '/api/v1/../secrets/',
      '/api/v1/%2e%2e%2fsecrets/',
      '/api/v1/students%5c..%5csecrets/',
      '/api/v1/students/%0a/',
      '/api/v1/students/?next=//evil.example',
    ]) {
      await expect(httpRequest('GET', path)).rejects.toMatchObject({ status: 0 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails safely when a stale CSRF cookie contains malformed escaping', async () => {
    vi.stubGlobal('document', { cookie: 'csrftoken=invalid%ZZvalue' });
    fetch.mockResolvedValue(response({ body: { success: true, data: { saved: true } } }));

    await httpRequest('POST', '/api/v1/example/', { body: { enabled: true } });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers).not.toHaveProperty('X-CSRFToken');
  });

  it('clears legacy and tab credentials and emits invalidation events on 401', async () => {
    session.setItem(API_CONFIG.legacyTokenKey, 'expired-secret');
    persistent.setItem(API_CONFIG.legacyTokenKey, 'legacy-secret');
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
    expect(session.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.getItem(API_CONFIG.legacyTokenKey)).toBeNull();
    expect(persistent.setItem).toHaveBeenCalledWith(
      API_CONFIG.logoutSignalKey,
      expect.any(String),
    );
    const logoutSignal = persistent.setItem.mock.calls.find(
      ([key]) => key === API_CONFIG.logoutSignalKey,
    )?.[1];
    expect(JSON.parse(logoutSignal)).toMatchObject({ reason: 'unauthorized' });
    expect(invalidated).toHaveBeenCalledOnce();
    // One invalidation event is enough; emitting a second change event caused
    // duplicate session bootstraps and made cross-tab races harder to settle.
    expect(changed).not.toHaveBeenCalled();
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
