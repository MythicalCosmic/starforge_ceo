import { cloneElement, useEffect, useRef } from 'react';
import { Icons } from '../components/Icons.jsx';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { SfAvatar } from '../components/primitives.jsx';
import { availableBranchSections } from '../config/branchWorkspace.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

function routeHref(target) {
  return `/${String(target || '').replace(/^\/+/, '')}`;
}

function follow(event, onNav, target) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onNav(target);
}

export function BranchSidebar({
  cfg,
  capabilities,
  branchId,
  branchName,
  section,
  onNav,
  onPrefetch,
  onLogout,
  open,
  onClose,
}) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const sections = availableBranchSections(cfg, capabilities);
  const groups = sections.reduce((result, item) => {
    const existing = result.find((group) => group.label === item.group);
    if (existing) existing.items.push(item);
    else result.push({ label: item.group, items: [item] });
    return result;
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const focusEntry = () => {
      const target = closeRef.current || focusableElements(panelRef.current)[0] || panelRef.current;
      target?.focus({ preventScroll: true });
    };

    // Move focus during the opening commit, then repeat on the next frame so
    // pointer-trigger focus cannot pull it back. The final pass runs after the
    // 180ms entrance transition because browsers do not focus visibility-
    // transitioning descendants consistently.
    focusEntry();
    const frame = window.requestAnimationFrame(focusEntry);
    const transitionTimer = window.setTimeout(focusEntry, 200);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(panelRef.current);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const onFocusIn = (event) => {
      if (!panelRef.current?.contains(event.target)) focusEntry();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(transitionTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, [onClose, open]);

  return (
    <aside
      ref={panelRef}
      className={`ad-sidebar-rail bw-sidebar${open ? ' is-open' : ''}`}
      aria-label={`${branchName || 'Branch'} navigation`}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? 'true' : undefined}
      tabIndex={open ? -1 : undefined}
    >
      <header className="ad-rail-head">
        <a
          className="ad-rail-brand"
          href={routeHref('branches')}
          onClick={(event) => follow(event, onNav, 'branches')}
          onMouseEnter={() => onPrefetch?.('branches')}
          onFocus={() => onPrefetch?.('branches')}
        >
          <BrandLogo decorative />
        </a>
        <button ref={closeRef} type="button" className="ad-rail-close" onClick={onClose} aria-label="Close navigation">
          {cloneElement(Icons.x, { size: 17 })}
        </button>
      </header>

      <div className="bw-context">
        <a
          href={routeHref('branches')}
          onClick={(event) => follow(event, onNav, 'branches')}
          onMouseEnter={() => onPrefetch?.('branches')}
          onFocus={() => onPrefetch?.('branches')}
        >
          <span aria-hidden="true">{cloneElement(Icons.chevR, { size: 14 })}</span>
          All branches
        </a>
        <span>Branch workspace</span>
        <strong>{branchName || `Branch ${branchId}`}</strong>
      </div>

      <nav className="ad-rail-nav">
        {groups.map((group) => (
          <section className="ad-rail-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((item) => {
              const selected = item.id === section;
              const target = `branches/${branchId}/${item.id}`;
              return (
                <a
                  key={item.id}
                  className={`ad-rail-link${selected ? ' is-current' : ''}${item.safetyHold ? ' is-safety-held' : ''}`}
                  href={routeHref(target)}
                  onClick={(event) => follow(event, onNav, target)}
                  onMouseEnter={() => onPrefetch?.(target)}
                  onFocus={() => onPrefetch?.(target)}
                  aria-current={selected ? 'page' : undefined}
                >
                  <span>{cloneElement(item.icon, { size: 16 })}</span>
                  <strong>{item.label}</strong>
                  {item.safetyHold && <small title="Awaiting branch-safe history">Safe</small>}
                  {selected && <i aria-hidden="true" />}
                </a>
              );
            })}
          </section>
        ))}
      </nav>

      <footer className="ad-rail-footer">
        <a
          className="ad-rail-profile"
          href={routeHref('account')}
          onClick={(event) => follow(event, onNav, 'account')}
          onMouseEnter={() => onPrefetch?.('account')}
          onFocus={() => onPrefetch?.('account')}
        >
          <SfAvatar name={cfg.who} size={36} color={cfg.accent} decorative />
          <span><strong>{cfg.who}</strong><small>{cfg.whoRole || 'Leadership'}</small></span>
        </a>
        <button type="button" className="ad-rail-logout" onClick={onLogout} aria-label="Sign out">
          {cloneElement(Icons.logout, { size: 16 })}
        </button>
      </footer>
    </aside>
  );
}
