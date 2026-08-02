// Framework-free client for authenticated management endpoints. It centralizes
// the same-origin URL, JSON envelopes, cookie-session auth, CSRF, query parameters, timeouts,
// request correlation, and typed failures.

import { API_CONFIG } from './config.js';
import { queryClient } from './queryClient.js';

export class ApiError extends Error {
  constructor(status, message, data, requestId, retryAfter) {
    super(message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data && typeof data === 'object' ? data.code : undefined;
    this.errors = data && typeof data === 'object' ? data.errors : undefined;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

function invalidateUnauthorizedSession(responseId) {
  queryClient.clear();
  try {
    sessionStorage.removeItem(API_CONFIG.legacyTokenKey);
  } catch {
    // The auth provider still receives the invalidation event below.
  }
  try {
    localStorage.removeItem(API_CONFIG.legacyTokenKey);
    localStorage.setItem(
      API_CONFIG.logoutSignalKey,
      JSON.stringify({
        reason: 'unauthorized',
        at: Date.now(),
        nonce: Math.random().toString(16).slice(2),
      }),
    );
  } catch {
    // Persistent credentials are never used, but remove any legacy copy.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sf-auth-session-invalidated', {
        detail: { reason: 'unauthorized', requestId: responseId },
      }),
    );
  }
}

function csrfCookie() {
  if (typeof document === 'undefined') return '';
  const prefix = 'csrftoken=';
  const entry = String(document.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return '';
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    // A malformed, non-authenticating CSRF cookie must not crash every unsafe
    // request. The service will reject the request safely and can issue a fresh
    // cookie on the next session bootstrap.
    return '';
  }
}

function buildUrl(path, params) {
  let url = API_CONFIG.baseUrl + path;
  if (params && typeof params === 'object') {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length) {
      const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }
  return url;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function currentLanguage() {
  try {
    const selected = localStorage.getItem('sf-lang');
    return selected === 'en' ? selected : 'en';
  } catch {
    return 'en';
  }
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function unwrapEnvelope(data, status, id, withMeta) {
  if (!data || typeof data !== 'object' || !('success' in data)) {
    return withMeta ? { data, pagination: undefined } : data;
  }
  if (data.success === false) throw new ApiError(status, data.message, data, id);
  return withMeta
    ? {
        data: data.data,
        pagination: data.pagination,
        ...(Array.isArray(data.warnings) && data.warnings.length
          ? { warnings: data.warnings }
          : {}),
      }
    : data.data;
}

export async function httpRequest(method, path, {
  params,
  body,
  signal,
  timeout = 10000,
  withMeta = false,
  auth = true,
  idempotencyKey,
  csrfToken = '',
  sessionTransport = '',
  invalidateOnUnauthorized = true,
} = {}) {
  const hasControlCharacter = typeof path === 'string' && [...path].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  const trustedPath = typeof path === 'string' &&
    path.startsWith('/api/v1/') &&
    !path.startsWith('//') &&
    !/[\\?#]/.test(path) &&
    !hasControlCharacter &&
    !/%(?![\da-f]{2})/i.test(path);
  let safeSegments = false;
  if (trustedPath) {
    try {
      safeSegments = path
        .split('/')
        .every((segment) => {
          const decoded = decodeURIComponent(segment);
          return !['.', '..'].includes(decoded) &&
            !/[\\/]/.test(decoded) &&
            ![...decoded].some((character) => {
              const code = character.charCodeAt(0);
              return code < 32 || code === 127;
            });
        });
    } catch {
      safeSegments = false;
    }
  }
  if (!trustedPath || !safeSegments) {
    throw new ApiError(0, 'This view could not be prepared. Please try again.');
  }
  if (import.meta.env.DEV && API_CONFIG.useMock) {
    const { mockHttpRequest } = await import('./mockFixtures.js');
    return mockHttpRequest(method, path, { params, body, signal, withMeta, auth });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const id = requestId();
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
  const suppliedCsrfToken = typeof csrfToken === 'string' ? csrfToken.trim() : '';
  const requestCsrfToken = unsafe ? suppliedCsrfToken || csrfCookie().trim() : '';
  const safeIdempotencyKey = typeof idempotencyKey === 'string' &&
    idempotencyKey.length >= 8 && idempotencyKey.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ? idempotencyKey
    : '';
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  let abortedByCaller = Boolean(signal?.aborted);
  const markCallerAbort = () => {
    abortedByCaller = true;
  };
  signal?.addEventListener('abort', markCallerAbort, { once: true });

  // Supplying a caller signal used to disable the timeout entirely. Combine both
  // cancellation sources so navigation cancellation and the safety timeout work
  // together on every request.
  let requestSignal = controller.signal;
  if (signal) {
    if (typeof AbortSignal.any === 'function') {
      requestSignal = AbortSignal.any([controller.signal, signal]);
    } else {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const res = await fetch(buildUrl(path, params), {
      method: normalizedMethod,
      headers: {
        Accept: 'application/json',
        'Accept-Language': currentLanguage(),
        'X-Request-ID': id,
        ...(safeIdempotencyKey ? { 'Idempotency-Key': safeIdempotencyKey } : {}),
        ...(requestCsrfToken ? { 'X-CSRFToken': requestCsrfToken } : {}),
        ...(sessionTransport === 'cookie' ? { 'X-Session-Transport': 'cookie' } : {}),
        ...(body != null && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body == null ? undefined : isMultipart ? body : JSON.stringify(body),
      // The deployable console and API intentionally share one tenant origin.
      // This sends the HttpOnly session cookie without enabling cross-origin cookies.
      credentials: 'same-origin',
      mode: 'same-origin',
      // API redirects are a contract failure. In particular, a 307/308 must
      // never forward a sign-in body to a Location chosen by another service.
      redirect: 'error',
      // TanStack Query owns the bounded in-memory cache. Keep private responses
      // out of the browser's reusable HTTP cache across identity transitions.
      cache: 'no-store',
      signal: requestSignal,
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    const responseId = res.headers.get('X-Request-ID') || id;
    if (!res.ok) {
      if (res.status === 401 && auth && invalidateOnUnauthorized) {
        invalidateUnauthorizedSession(responseId);
      }
      const message = data && typeof data === 'object' ? data.message || data.error : undefined;
      throw new ApiError(res.status, message || res.statusText, data, responseId, res.headers.get('Retry-After'));
    }
    if (text && typeof data === 'string') {
      throw new ApiError(
        res.status,
        'The response could not be understood. Please try again.',
        undefined,
        responseId,
      );
    }
    return unwrapEnvelope(data, res.status, responseId, withMeta);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(0, abortedByCaller ? 'Request aborted' : 'Request timed out', undefined, id);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      0,
      'Your workspace is temporarily out of reach. Please try again.',
      undefined,
      id,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', markCallerAbort);
  }
}
