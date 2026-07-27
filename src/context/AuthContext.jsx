import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_CONFIG } from '../api/config.js';
import {
  AUTH_SESSION_CHANGED,
  AUTH_SESSION_INVALIDATED,
  changeCurrentPassword,
  getCurrentUser,
  hasAuthSession,
  loginWithPassword,
  logoutCurrentSession,
} from '../api/auth.js';
import { resolveRole } from '../config/resolveRole.js';

const AuthContext = createContext(null);

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
  return {
    id: `mock-${role}`,
    principal_kind: 'staff',
    username: director ? 'demo.director' : 'demo.manager',
    full_name: director ? 'Demo Director' : 'Demo Manager',
    first_name: 'Demo',
    last_name: director ? 'Director' : 'Manager',
    is_active: true,
    must_change_password: false,
    tenant_slug: 'mock',
    role_memberships: [
      {
        id: `mock-${role}-membership`,
        account_type: director ? 1 : 2,
        account_type_name: director ? 'Director' : 'Head of Department',
        account_type_slug: director ? 'director' : 'head_of_dept',
        account_kind: 'staff',
        branch: director ? null : 'yun',
        department: null,
      },
    ],
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
      reason: 'This account has no active director or department-head membership.',
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

  const hydrate = useCallback(async ({ forcePasswordChange = false } = {}) => {
    const epoch = ++epochRef.current;

    if (API_CONFIG.useMock) {
      const next = classifyUser(mockUser());
      if (epoch === epochRef.current) setSession(next);
      return next;
    }

    if (!hasAuthSession()) {
      const next = anonymousState();
      if (epoch === epochRef.current) setSession(next);
      return next;
    }

    setSession((current) => ({ ...current, status: 'checking', error: null }));
    try {
      const user = await getCurrentUser();
      const next = classifyUser(user, forcePasswordChange);
      if (epoch === epochRef.current) setSession(next);
      return next;
    } catch (error) {
      if (epoch !== epochRef.current) return null;
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
    const syncSession = () => {
      if (hasAuthSession()) hydrate();
      else {
        epochRef.current += 1;
        setSession(anonymousState());
      }
    };
    const invalidateSession = () => {
      epochRef.current += 1;
      setSession(anonymousState());
    };
    window.addEventListener(AUTH_SESSION_CHANGED, syncSession);
    window.addEventListener(AUTH_SESSION_INVALIDATED, invalidateSession);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED, syncSession);
      window.removeEventListener(AUTH_SESSION_INVALIDATED, invalidateSession);
    };
  }, [hydrate]);

  const login = useCallback(
    async (credentials) => {
      const result = await loginWithPassword(credentials, { notify: false });
      await hydrate({ forcePasswordChange: Boolean(result?.must_change_password) });
      return result;
    },
    [hydrate],
  );

  const changePassword = useCallback(
    async ({ oldPassword, newPassword }) => {
      await changeCurrentPassword({ oldPassword, newPassword }, { notify: false });
      await hydrate();
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    epochRef.current += 1;
    if (API_CONFIG.useMock) {
      await hydrate();
      return;
    }
    setSession((current) => ({ ...current, status: 'checking', error: null }));
    try {
      await logoutCurrentSession();
    } catch {
      // logoutCurrentSession always removes the local key in its finally block.
    } finally {
      epochRef.current += 1;
      setSession(anonymousState());
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
