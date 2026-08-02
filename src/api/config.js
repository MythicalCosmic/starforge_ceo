// Runtime API configuration. Production is live by default; the small,
// presentation-only demo is available only through an explicit dev flag.

const env = import.meta.env ?? {};

const flag = (v, dflt) => {
  if (v === undefined || v === null || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
};

export const API_CONFIG = Object.freeze({
  // Credentials and management data always travel through the page's own
  // origin. Local backend work uses Vite's validated proxy target; production
  // builds reject VITE_API_URL, so no public bundle value can redirect a login.
  baseUrl: '',
  useMock: flag(env.VITE_USE_MOCK, false),
  // The current browser credential is an HttpOnly server cookie. This key is
  // retained only so an upgrade can delete credentials written by old bundles.
  legacyTokenKey: 'sf-auth-token',
  deviceKey: 'sf-auth-device',
  // Non-secret cross-tab signals. Credentials are never copied through storage.
  sessionSignalKey: 'sf-auth-session-epoch',
  logoutSignalKey: 'sf-auth-logout-epoch',
});
