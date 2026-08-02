import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { BranchSidebar } from './BranchSidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { availableBranchSections, branchWorkspaceRoute } from '../config/branchWorkspace.js';
import { useScope } from '../context/ScopeContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { API_CONFIG } from '../api/config.js';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { effectiveCapabilities, hasCapability } from '../lib/permissions.js';

export function Shell({
  cfg,
  user,
  active,
  route,
  onNav,
  onPrefetch,
  onLogout,
  children,
}) {
  const { branchId, options } = useScope();
  const { navigationLayout } = usePreferences();
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const restoreNavigatorFocusRef = useRef(false);
  const navigatorFocusFrameRef = useRef(null);
  const branchWorkspace = branchWorkspaceRoute(route);
  const capabilities = effectiveCapabilities(user);
  const canReadBranchIdentity = capabilities == null || hasCapability(capabilities, 'org:read');
  const branchDetail = useWorkspaceData(
    branchWorkspace ? `/api/v1/org/branches/${branchWorkspace.branchId}/` : null,
    undefined,
    { enabled: Boolean(branchWorkspace) && canReadBranchIdentity, staleTime: 5 * 60_000 },
  );
  // A branch is a contextual workspace with its own persistent rail. Keeping
  // that rail visible avoids mixing organization-wide and branch-scoped data.
  const sidebarLayout = Boolean(branchWorkspace) || navigationLayout !== 'top';

  const visibleOptions =
    cfg.role === 'manager'
      ? options.filter((option) => String(option.id) === String(branchId))
      : options;
  const currentScope =
    visibleOptions.find((option) => String(option.id) === String(branchId)) ||
    visibleOptions[0];
  const branchSections = branchWorkspace ? availableBranchSections(cfg, capabilities) : [];
  const branchSection = branchSections.find((item) => item.id === branchWorkspace?.section);
  const current = branchWorkspace
    ? {
        id: 'branches',
        label: branchSection?.label || 'Branch workspace',
        labelKey: 'branch.workspace',
        grpKey: 'main',
        icon: branchSection?.icon,
      }
    : cfg.destinations.find((item) => item.id === active);
  const canLogout = cfg.destinations.some((item) => item.id === 'account');
  const scopedBranchName = String(currentScope?.id) === String(branchWorkspace?.branchId)
    ? currentScope?.name
    : '';
  const branchName = branchDetail.data?.name || scopedBranchName || `Branch ${branchWorkspace?.branchId || ''}`.trim();
  const topbarScope = branchWorkspace
    ? { id: branchWorkspace.branchId, name: branchName }
    : currentScope;

  useEffect(() => {
    if (!navigatorOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!restoreNavigatorFocusRef.current) return;
      restoreNavigatorFocusRef.current = false;
      navigatorFocusFrameRef.current = window.requestAnimationFrame(() => {
        navigatorFocusFrameRef.current = null;
        const triggers = [...document.querySelectorAll('[data-navigator-trigger]')];
        triggers.find((trigger) => trigger.getClientRects().length > 0)?.focus();
      });
    };
  }, [navigatorOpen]);

  useEffect(
    () => () => {
      if (navigatorFocusFrameRef.current) {
        window.cancelAnimationFrame(navigatorFocusFrameRef.current);
      }
    },
    [],
  );

  const navigate = useCallback((id) => {
    restoreNavigatorFocusRef.current = false;
    onNav(id);
    setNavigatorOpen(false);
  }, [onNav]);

  const closeNavigator = useCallback(() => {
    restoreNavigatorFocusRef.current = true;
    setNavigatorOpen(false);
  }, []);

  const openNavigator = useCallback(() => {
    if (navigatorFocusFrameRef.current) {
      window.cancelAnimationFrame(navigatorFocusFrameRef.current);
      navigatorFocusFrameRef.current = null;
    }
    restoreNavigatorFocusRef.current = true;
    window.dispatchEvent(new Event('sf-close-popovers'));
    setNavigatorOpen(true);
  }, []);

  return (
    <div
      className="ad-root ad-shell-v2"
      data-role={cfg.role}
      data-navigation={sidebarLayout ? 'sidebar' : 'top'}
      data-branch-workspace={branchWorkspace ? 'true' : undefined}
    >
      <a
        className="ad-skip-link"
        href="#leadership-workspace"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('leadership-workspace')?.focus();
        }}
      >
        Skip to main content
      </a>

      {sidebarLayout && (
        branchWorkspace ? (
          <BranchSidebar
            cfg={cfg}
            capabilities={capabilities}
            branchId={branchWorkspace.branchId}
            branchName={branchName}
            section={branchWorkspace.section}
            onNav={navigate}
            onPrefetch={onPrefetch}
            open={navigatorOpen}
            onClose={closeNavigator}
            onLogout={onLogout}
          />
        ) : (
          <Sidebar
            variant="rail"
            cfg={cfg}
            active={active}
            onNav={navigate}
            onPrefetch={onPrefetch}
            branches={visibleOptions}
            branch={branchId}
            open={navigatorOpen}
            onClose={closeNavigator}
            onLogout={onLogout}
            canLogout={canLogout}
          />
        )
      )}

      <div
        className="ad-col"
        aria-hidden={navigatorOpen ? 'true' : undefined}
        inert={navigatorOpen ? '' : undefined}
      >
        <Topbar
          cfg={cfg}
          current={current}
          active={active}
          scope={topbarScope}
          navigationLayout={sidebarLayout ? 'sidebar' : 'top'}
          navigatorOpen={navigatorOpen}
          onNav={navigate}
          onPrefetch={onPrefetch}
          onOpenDrawer={openNavigator}
        />
        <main id="leadership-workspace" className="ad-main" tabIndex="-1">
          {API_CONFIG.useMock && (
            <div className="ad-preview-note" role="status">
              Design preview · Sample information only
            </div>
          )}
          {children}
        </main>
      </div>

      {navigatorOpen && (
        <>
          <button
            type="button"
            className="ad-scrim"
            onClick={closeNavigator}
            aria-label="Close navigation"
          />
          {!sidebarLayout && (
            <Sidebar
              variant="navigator"
              cfg={cfg}
              active={active}
              onNav={navigate}
              onPrefetch={onPrefetch}
              branches={visibleOptions}
              branch={branchId}
              open={navigatorOpen}
              onClose={closeNavigator}
              onLogout={onLogout}
              canLogout={canLogout}
            />
          )}
        </>
      )}
    </div>
  );
}
