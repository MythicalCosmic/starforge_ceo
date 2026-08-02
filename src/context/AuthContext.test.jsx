import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  effects: [],
  listeners: new Map(),
  setters: [],
  getCurrentUser: vi.fn(),
  loginWithPassword: vi.fn(),
  clearQueryCache: vi.fn(),
  removeSessionItem: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCallback: (callback) => callback,
    useEffect: (effect) => {
      harness.effects.push(effect);
    },
    useMemo: (factory) => factory(),
    useRef: (value) => ({ current: value }),
    useState: (initial) => {
      const setter = vi.fn();
      harness.setters.push(setter);
      return [typeof initial === 'function' ? initial() : initial, setter];
    },
  };
});

vi.mock('../api/config.js', () => ({
  API_CONFIG: {
    useMock: false,
    legacyTokenKey: 'sf-auth-token',
    deviceKey: 'sf-auth-device',
    sessionSignalKey: 'sf-auth-session-epoch',
    logoutSignalKey: 'sf-auth-logout-epoch',
  },
}));

vi.mock('../api/queryClient.js', () => ({
  queryClient: { clear: harness.clearQueryCache },
}));

vi.mock('../api/auth.js', () => ({
  AUTH_SESSION_CHANGED: 'sf-auth-session-changed',
  AUTH_SESSION_INVALIDATED: 'sf-auth-session-invalidated',
  changeCurrentPassword: vi.fn(),
  getCurrentUser: harness.getCurrentUser,
  loginWithPassword: harness.loginWithPassword,
  logoutCurrentSession: vi.fn(),
}));

vi.mock('../config/resolveRole.js', () => ({
  resolveRole: () => 'ceo',
}));

import { AuthProvider } from './AuthContext.jsx';

const user = {
  id: 7,
  principal_kind: 'staff',
  is_active: true,
  role_memberships: [{ account_type_slug: 'director' }],
};

function storageEvent(key, reason) {
  return {
    key,
    newValue: JSON.stringify({ reason, at: Date.now(), nonce: 'test' }),
  };
}

function dispatchStorage(event) {
  harness.listeners.get('storage')?.forEach((listener) => listener(event));
}

async function flushSessionRead() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('cross-tab authentication boundaries', () => {
  beforeEach(() => {
    harness.effects.length = 0;
    harness.listeners.clear();
    harness.setters.length = 0;
    harness.getCurrentUser.mockReset().mockResolvedValue(user);
    harness.loginWithPassword.mockReset().mockResolvedValue({ must_change_password: false });
    harness.clearQueryCache.mockReset();
    harness.removeSessionItem.mockReset();

    vi.stubGlobal('sessionStorage', {
      removeItem: harness.removeSessionItem,
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type, listener) => {
        const listeners = harness.listeners.get(type) || [];
        listeners.push(listener);
        harness.listeners.set(type, listeners);
      }),
      removeEventListener: vi.fn(),
    });
  });

  it('clears identity-bound data before accepting another tab sign-in', async () => {
    AuthProvider({ children: null });
    const removeListeners = harness.effects[1]();

    dispatchStorage(
      storageEvent('sf-auth-session-epoch', 'signed-in'),
    );
    await flushSessionRead();

    expect(harness.clearQueryCache).toHaveBeenCalledOnce();
    expect(harness.removeSessionItem).toHaveBeenCalledWith('sf-auth-token');
    expect(harness.removeSessionItem).toHaveBeenCalledWith('sf-auth-device');
    expect(harness.getCurrentUser).toHaveBeenCalledOnce();
    removeListeners();
  });

  it('revalidates an unauthorized signal instead of letting a stale 401 erase a newer cookie', async () => {
    AuthProvider({ children: null });
    harness.effects[1]();

    dispatchStorage(
      storageEvent('sf-auth-logout-epoch', 'unauthorized'),
    );
    await flushSessionRead();

    expect(harness.clearQueryCache).toHaveBeenCalledOnce();
    expect(harness.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('collapses simultaneous unauthorized signals into one session check', async () => {
    let resolveUser;
    harness.getCurrentUser.mockReturnValue(new Promise((resolve) => {
      resolveUser = resolve;
    }));
    AuthProvider({ children: null });
    harness.effects[1]();

    const signal = storageEvent('sf-auth-logout-epoch', 'unauthorized');
    dispatchStorage(signal);
    dispatchStorage(signal);

    expect(harness.getCurrentUser).toHaveBeenCalledOnce();
    resolveUser(user);
    await flushSessionRead();
  });

  it('accepts a confirmed cross-tab logout without trying to reopen the session', async () => {
    AuthProvider({ children: null });
    harness.effects[1]();

    dispatchStorage(
      storageEvent('sf-auth-logout-epoch', 'confirmed'),
    );
    await flushSessionRead();

    expect(harness.clearQueryCache).toHaveBeenCalledOnce();
    expect(harness.getCurrentUser).not.toHaveBeenCalled();
    const setSession = harness.setters[0];
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: 'anonymous' }));
  });

  it('does not report sign-in success when the returned cookie cannot be confirmed', async () => {
    harness.getCurrentUser.mockRejectedValue({ status: 401 });
    const provider = AuthProvider({ children: null });

    await expect(provider.props.value.login({ username: 'admin', password: 'root' }))
      .rejects.toMatchObject({ status: 401 });

    expect(harness.loginWithPassword).toHaveBeenCalledOnce();
    const setSession = harness.setters[0];
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: 'anonymous' }));
  });
});
