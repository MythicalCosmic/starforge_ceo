import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { PageLoader } from './components/feedback.jsx';
import {
  loadManagementPages,
  prefetchRoute,
  ROUTE_MODULES,
} from './config/routeLoaders.js';
import { roleConfigForUser } from './config/roles.js';
import { resolveLegacySegments } from './config/routes.js';
import { shouldResolveLazyManagementTitle } from './config/titleRouting.js';
import { useAuth } from './context/AuthContext.jsx';
import { ScopeProvider } from './context/ScopeContext.jsx';
import { AvailabilityProvider } from './context/AvailabilityContext.jsx';
import { ApplicationGate } from './components/AvailabilityState.jsx';
import { BRANCH_WORKSPACE_SECTIONS, branchWorkspaceRoute } from './config/branchWorkspace.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import { Shell } from './layout/Shell.jsx';
import { userFacingError } from './lib/userFacingError.js';
import {
  AuthLoadingPage,
  AuthMessagePage,
  LoginPage,
  PasswordChangePage,
} from './pages/Login.jsx';

const lazyPage = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

const PAGES = Object.freeze(Object.fromEntries(
  Object.entries(ROUTE_MODULES).map(([routeId, module]) => [
    routeId,
    lazyPage(module.load, module.exportName),
  ]),
));

// eslint-disable-next-line react-refresh/only-export-components
export const REGISTERED_PAGE_IDS = Object.freeze(Object.keys(PAGES));

function splitRoute(route) {
  const [path, query = ''] = String(route || '').split('?', 2);
  const segments = path.split('/').filter(Boolean);
  return { segments, query };
}

function LeadershipWorkspace({ role, user, logout }) {
  const cfg = useMemo(() => roleConfigForUser(role, user), [role, user]);
  const allowed = useMemo(
    () => new Set(cfg.destinations.map((item) => item.id)),
    [cfg.destinations],
  );
  const fallback = cfg.primaryNav.find((item) => !item.hidden)?.id || cfg.destinations[0].id;
  const [route, routeTo] = useHashRoute(fallback);
  const { segments } = splitRoute(route);
  const resolvedSegments = resolveLegacySegments(segments);
  const resolvedBase = resolvedSegments[0] || fallback;
  const routeId = allowed.has(resolvedBase) ? resolvedBase : fallback;
  const currentItem = cfg.destinations.find((item) => item.id === routeId);
  const canonicalRoute = routeId === resolvedBase
    ? [currentItem.path, ...resolvedSegments.slice(1)].join('/') + (route.includes('?') ? `?${route.split('?')[1]}` : '')
    : currentItem.path;
  const canonicalPath = canonicalRoute.split('?')[0];
  const Page = PAGES[routeId] || PAGES[fallback];
  const branchWorkspace = branchWorkspaceRoute(canonicalRoute);
  const branchSection = branchWorkspace
    ? BRANCH_WORKSPACE_SECTIONS.find((item) => item.id === branchWorkspace.section)
    : null;
  const activeApps = branchSection?.app || currentItem?.app;
  const activeLabel = branchSection?.label || currentItem?.label || 'This application';

  const prefetch = useCallback((target) => {
    void prefetchRoute(target);
  }, []);

  const navigate = useCallback(
    (target, options) => {
      prefetch(target);
      const { segments: targetSegments, query } = splitRoute(target);
      const resolvedTarget = resolveLegacySegments(targetSegments);
      const targetBase = resolvedTarget[0] || fallback;
      const destination = cfg.destinations.find((item) => item.id === targetBase);
      if (!destination) {
        routeTo(fallback, options);
        return;
      }
      const path = [destination.path, ...resolvedTarget.slice(1)].join('/');
      routeTo(query ? `${path}?${query}` : path, options);
    },
    [cfg.destinations, fallback, prefetch, routeTo],
  );

  useEffect(() => {
    if (route !== canonicalRoute) navigate(canonicalRoute, { replace: true, scroll: false });
  }, [canonicalRoute, navigate, route]);

  useEffect(() => {
    const titleSegments = canonicalPath.split('/').filter(Boolean);
    const nestedLabel = titleSegments[1]
      ? titleSegments[1]
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replaceAll('-', ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
      : '';
    const fallbackTitle = titleSegments[2]
      ? `Details · ${currentItem.label} · StarForge EDU`
      : nestedLabel
        ? `${nestedLabel} · ${currentItem.label} · StarForge EDU`
        : `${currentItem.label} · StarForge EDU`;
    document.title = fallbackTitle;

    let cancelled = false;
    if (shouldResolveLazyManagementTitle(
      routeId,
      Boolean(titleSegments[1]),
      Boolean(titleSegments[2]),
    )) {
      loadManagementPages().then(({ managementModuleFor }) => {
        if (cancelled) return;
        const managementModule = managementModuleFor(routeId, role, user);
        const activeView = managementModule?.tabs.find((tab) => tab.id === titleSegments[1]);
        if (!managementModule || !activeView) return;
        document.title = `${activeView.label} · ${managementModule.title} · StarForge EDU`;
      }).catch(() => {
        // The visible page owns the loading error. The readable fallback title
        // remains valid if its lazy chunk cannot be inspected here.
      });
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('leadership-workspace')?.focus({ preventScroll: true });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [canonicalPath, currentItem.label, role, routeId, user]);

  return (
    <AvailabilityProvider user={user}>
      <ScopeProvider
        role={role}
        defaultBranch={cfg.defaultBranch}
        defaultBranchName={cfg.defaultBranchName}
      >
        <Shell
          cfg={cfg}
          user={user}
          active={routeId}
          route={canonicalRoute}
          onNav={navigate}
          onPrefetch={prefetch}
          onLogout={logout}
        >
          <ApplicationGate apps={activeApps} label={activeLabel}>
            <Suspense fallback={<PageLoader label="Shaping your next view…" />}>
              <div className="sf-route-stage" key={canonicalPath}>
                <Page role={role} user={user} route={canonicalRoute} onNav={navigate} />
              </div>
            </Suspense>
          </ApplicationGate>
        </Shell>
      </ScopeProvider>
    </AvailabilityProvider>
  );
}

export default function App() {
  const auth = useAuth();

  if (auth.status === 'checking') return <AuthLoadingPage />;
  if (auth.status === 'anonymous') return <LoginPage />;
  if (auth.status === 'password-change') return <PasswordChangePage />;
  if (auth.status === 'signout-unconfirmed') {
    return (
      <AuthMessagePage
        title="Sign-out could not be confirmed"
        description={auth.reason}
        retry={auth.logout}
        retryLabel="Try sign out again"
      />
    );
  }
  if (auth.status === 'forbidden') {
    return (
      <AuthMessagePage
        title="Management access unavailable"
        description={auth.reason || 'This account is not authorized to open the leadership workspace.'}
        logout={auth.logout}
      />
    );
  }
  if (auth.status === 'error') {
    return (
      <AuthMessagePage
        title="Your workspace could not be opened"
        description={userFacingError(auth.error, {
          fallback: 'Please try again in a moment. Your information remains protected.',
        })}
        retry={auth.retry}
        logout={auth.logout}
      />
    );
  }
  return <LeadershipWorkspace role={auth.role} user={auth.user} logout={auth.logout} />;
}
