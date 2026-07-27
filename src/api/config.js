// Runtime API configuration. Production is live by default; the small,
// presentation-only demo is available only through an explicit dev flag.

const env = import.meta.env ?? {};

const flag = (v, dflt) => {
  if (v === undefined || v === null || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
};

export const API_CONFIG = Object.freeze({
  // Trailing slash trimmed so `${baseUrl}/students` is always well-formed.
  baseUrl: String(env.VITE_API_URL || '').replace(/\/+$/, ''),
  useMock: flag(env.VITE_USE_MOCK, false),
  // Opaque credentials live for one browser tab/session. Never read a token
  // from VITE_*: build-time values are public to every bundle user.
  tokenKey: 'sf-auth-token',
  deviceKey: 'sf-auth-device',
});
