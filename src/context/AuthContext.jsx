import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_CONFIG } from '../api/config.js';
import {
  ApiError,
  configureHttpSessionPolicy,
  resetHttpSessionPolicy,
} from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import {
  AUTH_SESSION_CHANGED,
  AUTH_SESSION_INVALIDATED,
  changeCurrentPassword,
  getCurrentUser,
  loginWithPassword,
  logoutCurrentSession,
} from '../api/auth.js';
import { resolveRole } from '../config/resolveRole.js';
import {
  configureBusinessFormatting,
  resetBusinessFormatting,
} from '../lib/formatters.js';

const AuthContext = createContext(null);
const SESSION_PREVIEW_PREFIXES = Object.freeze(['sf-star-ai-conversations-']);
const SIGNOUT_UNCONFIRMED_REASON = 'This tab cleared its private information, but the sign-out request could not be confirmed. Your browser session may still be active. Try again when the connection is available, then close all StarForge tabs.';

function clearSessionPreviewData() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => SESSION_PREVIEW_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Session teardown continues even when browser storage is unavailable.
  }
}

function clearPrivateTabState({ clearDevice = false } = {}) {
  try {
    sessionStorage.removeItem(API_CONFIG.legacyTokenKey);
    if (clearDevice) sessionStorage.removeItem(API_CONFIG.deviceKey);
  } catch {
    // Protected UI and in-memory records are still cleared below.
  }
  clearSessionPreviewData();
  resetBusinessFormatting();
  resetHttpSessionPolicy();
  queryClient.clear();
}

const anonymousState = () => ({
  status: 'anonymous',
  user: null,
  role: null,
  error: null,
  reason: null,
});

function mockUser() {
  const role = resolveRole() || 'ceo';
  const director = role === 'ceo';
  const readOnly = import.meta.env.DEV && typeof window !== 'undefined'
    ? ['1', 'true', 'yes', 'on'].includes(String(new URLSearchParams(window.location?.search || '').get('read_only') || '').toLowerCase())
    : false;
  return {
    id: `mock-${role}`,
    principal_kind: 'staff',
    username: director ? 'admin' : 'demo.manager',
    full_name: director ? 'Demo Director' : 'Demo Manager',
    first_name: 'Demo',
    last_name: director ? 'Director' : 'Manager',
    is_active: true,
    must_change_password: false,
    tenant_slug: 'mock',
    organization_locale: 'en',
    organization_timezone: 'Asia/Tashkent',
    primary_currency: 'UZS',
    read_only_session: readOnly,
    effective_permissions: director
      ? ['*:*']
      : [
          'students:read',
          'cohorts:read',
          'teachers:read',
          'attendance:read',
          'academics:read',
          'assignments:read',
          'placement:read',
          'schedule:read',
          'tasks:read',
          'cover:read',
          'procurement:read',
          'approvals:read',
          'intelligence:read',
          'reports:read',
          'messaging:read',
          'campaign:read',
          'forms:read',
          'notifications:read',
        ],
    role_memberships: [
      {
        id: `mock-${role}-membership`,
        account_type: director ? 1 : 2,
        account_type_name: director ? 'Director' : 'Head of Department',
        account_type_slug: director ? 'director' : 'head_of_dept',
        account_kind: 'staff',
        branch: director ? null : 1,
        branch_name: director ? null : 'Central Campus',
        department: null,
      },
    ],
    scopes: director
      ? []
      : [{
          branch: { id: 1, name: 'Central Campus' },
          department: null,
          effective_permissions: [
            'students:read',
            'teachers:read',
            'attendance:read',
            'academics:read',
          ],
        }],
  };
}

function classifyUser(user, forcePasswordChange = false) {
  if (user?.principal_kind !== 'staff') {
    return {
      status: 'forbidden',
      user,
      role: null,
      error: null,
      reason: 'This workspace is available only to CEO and manager accounts.',
    };
  }

  const role = resolveRole(user);
  if (!role) {
    return {
      status: 'forbidden',
      user,
      role: null,
      error: null,
      reason: 'This account does not currently have Director or Department Manager access.',
    };
  }

  return {
    status: user.must_change_password || forcePasswordChange ? 'password-change' : 'authenticated',
    user,
    role,
    error: null,
    reason: null,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState({
    status: 'checking',
    user: null,
    role: null,
    error: null,
    reason: null,
  });
  const epochRef = useRef(0);
  const revalidationRef = useRef(null);

  const hydrate = useCallback(async ({ forcePasswordChange = false } = {}) => {
    const epoch = ++epochRef.current;

    if (API_CONFIG.useMock) {
      const user = mockUser();
      if (epoch !== epochRef.current) return null;
      const next = classifyUser(user);
      configureBusinessFormatting(user);
      configureHttpSessionPolicy(user);
      setSession(next);
      return next;
    }

    setSession((current) => ({ ...current, status: 'checking', error: null }));
    try {
      const user = await getCurrentUser();
      if (epoch !== epochRef.current) return null;
      const next = classifyUser(user, forcePasswordChange);
      configureBusinessFormatting(user);
      configureHttpSessionPolicy(user);
      setSession(next);
      return next;
    } catch (error) {
      if (epoch !== epochRef.current) return null;
      resetBusinessFormatting();
      resetHttpSessionPolicy();
      if (error?.status === 401) {
        const next = anonymousState();
        setSession(next);
        return next;
      }
      const next = {
        status: 'error',
        user: null,
        role: null,
        error,
        reason: null,
      };
      setSession(next);
      return next;
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const revalidateSharedSession = () => {
      if (revalidationRef.current) return revalidationRef.current;
      const pending = hydrate();
      revalidationRef.current = pending;
      void pending.finally(() => {
        if (revalidationRef.current === pending) revalidationRef.current = null;
      });
      return pending;
    };
    const syncSession = (event) => {
      const reason = event?.detail?.reason;
      if (reason === 'signed-out') {
        epochRef.current += 1;
        clearPrivateTabState({ clearDevice: true });
        setSession(anonymousState());
        return;
      }
      // A protected request can finish with 401 after another tab has already
      // replaced the shared cookie. Re-check the authoritative cookie instead
      // of letting that stale response sign the newer session out.
      clearPrivateTabState({ clearDevice: reason === 'signed-in' || reason === 'password-changed' });
      if (reason === 'unauthorized') void revalidateSharedSession();
      else void hydrate();
    };
    const invalidateSession = () => {
      clearPrivateTabState({ clearDevice: true });
      void revalidateSharedSession();
    };
    window.addEventListener(AUTH_SESSION_CHANGED, syncSession);
    window.addEventListener(AUTH_SESSION_INVALIDATED, invalidateSession);
    const syncLogoutAcrossTabs = (event) => {
      if (event.key !== API_CONFIG.logoutSignalKey || !event.newValue) return;
      let reason = 'confirmed';
      try {
        reason = JSON.parse(event.newValue)?.reason || reason;
      } catch {
        // Legacy logout epochs represent a confirmed-or-expired session.
      }
      clearPrivateTabState({ clearDevice: true });
      if (reason === 'unconfirmed') {
        epochRef.current += 1;
        setSession({
          status: 'signout-unconfirmed',
          user: null,
          role: null,
          error: null,
          reason: SIGNOUT_UNCONFIRMED_REASON,
        });
      } else if (reason === 'unauthorized') {
        // Validate again so a late 401 from the previous identity cannot erase
        // a newer shared-cookie session.
        void revalidateSharedSession();
      } else {
        epochRef.current += 1;
        setSession(anonymousState());
      }
    };
    const syncLoginAcrossTabs = (event) => {
      if (event.key !== API_CONFIG.sessionSignalKey || !event.newValue) return;
      let reason = '';
      try {
        reason = JSON.parse(event.newValue)?.reason || '';
      } catch {
        // A malformed non-secret signal is ignored.
      }
      if (reason === 'signed-in' || reason === 'password-changed') {
        // Query keys intentionally contain no identity data, so another tab
        // replacing the browser session is a hard cache/privacy boundary.
        clearPrivateTabState({ clearDevice: true });
        void hydrate();
      }
    };
    window.addEventListener('storage', syncLogoutAcrossTabs);
    window.addEventListener('storage', syncLoginAcrossTabs);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED, syncSession);
      window.removeEventListener(AUTH_SESSION_INVALIDATED, invalidateSession);
      window.removeEventListener('storage', syncLogoutAcrossTabs);
      window.removeEventListener('storage', syncLoginAcrossTabs);
    };
  }, [hydrate]);

  const login = useCallback(
    async (credentials) => {
      const result = await loginWithPassword(credentials, { notify: false });
      clearSessionPreviewData();
      const next = await hydrate({ forcePasswordChange: Boolean(result?.must_change_password) });
      if (next?.status === 'error') throw next.error;
      if (!next || next.status === 'anonymous') {
        throw new ApiError(401, 'The browser session could not be confirmed.');
      }
      // A correctly authenticated but unsupported staff role is routed to the
      // explicit access message. It must not receive a false success toast.
      return next;
    },
    [hydrate],
  );

  const changePassword = useCallback(
    async ({ oldPassword, newPassword }) => {
      await changeCurrentPassword({ oldPassword, newPassword }, { notify: false });
      const next = await hydrate();
      if (next?.status === 'authenticated') return next;
      if (next?.status === 'error') throw next.error;
      if (next?.status === 'anonymous') {
        throw new ApiError(401, 'The replacement browser session could not be confirmed.');
      }
      throw new ApiError(409, 'The password change could not be confirmed.');
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    epochRef.current += 1;
    clearSessionPreviewData();
    if (API_CONFIG.useMock) {
      await hydrate();
      return;
    }
    setSession((current) => ({ ...current, status: 'checking', error: null }));
    try {
      await logoutCurrentSession();
      resetBusinessFormatting();
      resetHttpSessionPolicy();
      epochRef.current += 1;
      setSession(anonymousState());
    } catch (error) {
      // Cached/private UI is already cleared by logoutCurrentSession. The
      // opaque cookie cannot be removed by JavaScript, so never claim that a
      // failed remote revocation ended the private session.
      resetBusinessFormatting();
      resetHttpSessionPolicy();
      epochRef.current += 1;
      setSession({
        status: 'signout-unconfirmed',
        user: null,
        role: null,
        error,
        reason: SIGNOUT_UNCONFIRMED_REASON,
      });
    }
  }, [hydrate]);

  const value = useMemo(
    () => ({
      ...session,
      login,
      changePassword,
      logout,
      retry: hydrate,
    }),
    [session, login, changePassword, logout, hydrate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
