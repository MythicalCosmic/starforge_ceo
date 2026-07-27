import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useScope } from '../context/ScopeContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function Shell({ cfg, active, onNav, onLogout, children }) {
  const { branchId, options } = useScope();
  const { navigationLayout } = usePreferences();
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const sidebarLayout = navigationLayout !== 'top';

  const visibleOptions =
    cfg.role === 'manager'
      ? options.filter((option) => String(option.id) === String(branchId))
      : options;
  const currentScope =
    visibleOptions.find((option) => String(option.id) === String(branchId)) ||
    visibleOptions[0];
  const current = cfg.nav.find((item) => item.id === active);
  const canLogout = cfg.nav.some((item) => item.id === 'backendAccount');

  useEffect(() => {
    if (!navigatorOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const triggers = [...document.querySelectorAll('[data-navigator-trigger]')];
        triggers.find((trigger) => trigger.getClientRects().length > 0)?.focus();
      });
    };
  }, [navigatorOpen]);

  const navigate = (id) => {
    onNav(id);
    setNavigatorOpen(false);
  };

  const openNavigator = () => {
    window.dispatchEvent(new Event('sf-close-popovers'));
    setNavigatorOpen(true);
  };

  return (
    <div
      className="ad-root ad-shell-v2"
      data-role={cfg.role}
      data-navigation={sidebarLayout ? 'sidebar' : 'top'}
    >
      <a className="ad-skip-link" href="#leadership-workspace">
        Skip to main content
      </a>

      {sidebarLayout && (
        <Sidebar
          variant="rail"
          cfg={cfg}
          active={active}
          onNav={navigate}
          branches={visibleOptions}
          branch={branchId}
          open={navigatorOpen}
          onClose={() => setNavigatorOpen(false)}
          onLogout={onLogout}
          canLogout={canLogout}
        />
      )}

      <div className="ad-col">
        <Topbar
          cfg={cfg}
          current={current}
          active={active}
          scope={currentScope}
          navigationLayout={sidebarLayout ? 'sidebar' : 'top'}
          navigatorOpen={navigatorOpen}
          onNav={navigate}
          onOpenDrawer={openNavigator}
        />
        <main id="leadership-workspace" className="ad-main" tabIndex="-1">
          {children}
        </main>
      </div>

      {navigatorOpen && (
        <>
          <button
            type="button"
            className="ad-scrim"
            onClick={() => setNavigatorOpen(false)}
            aria-label="Close navigation"
          />
          {!sidebarLayout && (
            <Sidebar
              variant="navigator"
              cfg={cfg}
              active={active}
              onNav={navigate}
              branches={visibleOptions}
              branch={branchId}
              open={navigatorOpen}
              onClose={() => setNavigatorOpen(false)}
              onLogout={onLogout}
              canLogout={canLogout}
            />
          )}
        </>
      )}
    </div>
  );
}
