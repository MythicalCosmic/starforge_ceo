import { cloneElement, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { SfAvatar, SfStar } from '../components/primitives.jsx';
import { groupNav } from '../config/roles.js';

function itemLabel(item, t) {
  if (item.id === 'settings') {
    return t('shell.workspacePreferences', { defaultValue: 'Workspace preferences' });
  }
  if (item.id === 'backendAccount') {
    return t('shell.myProfile', { defaultValue: 'My profile' });
  }
  return t(item.labelKey, { defaultValue: item.label || item.id });
}

function groupLabel(groupKey, t) {
  if (groupKey === 'system') {
    return t('shell.workspaceGroup', { defaultValue: 'Your workspace' });
  }
  return t(`navGroups.${groupKey}`, { defaultValue: groupKey });
}

function scopeLabel(scope, t) {
  if (!scope) return t('connection.loading', { defaultValue: 'Preparing your view…' });
  if (scope.id === 'all') {
    return t('shell.organizationWide', { defaultValue: 'Entire organization' });
  }
  return scope.name;
}

export function Sidebar({
  variant = 'navigator',
  cfg,
  active,
  onNav,
  branches = [],
  branch,
  open,
  onClose,
  onLogout,
  canLogout,
}) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const groups = groupNav(cfg.nav);
  const currentScope =
    branches.find((candidate) => String(candidate.id) === String(branch)) || branches[0];

  useEffect(() => {
    if (!open) return undefined;

    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeys = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = [...panelRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeys);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeys);
    };
  }, [onClose, open]);

  if (variant === 'rail') {
    return (
      <aside
        ref={panelRef}
        className={'ad-sidebar-rail' + (open ? ' is-open' : '')}
        aria-label={t('shell.primaryNavigation', { defaultValue: 'Primary navigation' })}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
      >
        <header className="ad-rail-head">
          <button type="button" className="ad-rail-brand" onClick={() => onNav('dash')}>
            <span aria-hidden="true">
              <SfStar size={20} color="currentColor" />
            </span>
            <strong>
              StarForge <small>EDU</small>
            </strong>
          </button>
          <button
            ref={closeRef}
            type="button"
            className="ad-rail-close"
            onClick={onClose}
            aria-label={t('shell.closeMenu', { defaultValue: 'Close navigation' })}
          >
            {cloneElement(Icons.x, { size: 17 })}
          </button>
        </header>

        <div className="ad-rail-scope">
          <span aria-hidden="true">{cloneElement(Icons.globe, { size: 16 })}</span>
          <span>
            <small>{t('shell.leadershipScope', { defaultValue: 'Leadership scope' })}</small>
            <strong>{scopeLabel(currentScope, t)}</strong>
          </span>
        </div>

        <nav className="ad-rail-nav">
          {groups.map((group) => (
            <section key={group.grpKey} className="ad-rail-group">
              <h2>{groupLabel(group.grpKey, t)}</h2>
              {group.items.map((item) => {
                const selected = item.id === active;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={'ad-rail-link' + (selected ? ' is-current' : '')}
                    onClick={() => onNav(item.id)}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <span>{cloneElement(item.icon, { size: 16 })}</span>
                    <strong>{itemLabel(item, t)}</strong>
                    {selected && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <footer className="ad-rail-footer">
          <button
            type="button"
            className="ad-rail-profile"
            onClick={() => canLogout && onNav('backendAccount')}
            disabled={!canLogout}
          >
            <SfAvatar name={cfg.who} size={36} color={cfg.accent} />
            <span>
              <strong>{cfg.who}</strong>
              <small>{cfg.whoRole || t(cfg.whoRoleKey)}</small>
            </span>
          </button>
          {canLogout && (
            <button
              type="button"
              className="ad-rail-logout"
              onClick={onLogout}
              aria-label={t('connection.logout', { defaultValue: 'Sign out' })}
              title={t('connection.logout', { defaultValue: 'Sign out' })}
            >
              {cloneElement(Icons.logout, { size: 16 })}
            </button>
          )}
        </footer>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      className="ad-navigator"
      role="dialog"
      aria-modal="true"
      aria-labelledby="navigator-title"
      style={{ '--role-accent': cfg.accent }}
    >
      <header className="ad-navigator-head">
        <div className="ad-navigator-brand">
          <span className="ad-navigator-mark" aria-hidden="true">
            <SfStar size={22} color="currentColor" />
          </span>
          <span>
            <strong>StarForge EDU</strong>
            <small id="navigator-title">
              {t('shell.navigatorTitle', { defaultValue: 'Workspace navigator' })}
            </small>
          </span>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="ad-navigator-close"
          onClick={onClose}
          aria-label={t('shell.closeMenu', { defaultValue: 'Close navigation' })}
        >
          {cloneElement(Icons.x, { size: 18 })}
        </button>
      </header>

      <div className="ad-navigator-context">
        <span className="ad-navigator-context-icon" aria-hidden="true">
          {cloneElement(Icons.globe, { size: 17 })}
        </span>
        <span className="ad-navigator-context-copy">
          <small>{t('shell.leadershipScope', { defaultValue: 'Leadership scope' })}</small>
          <strong>{scopeLabel(currentScope, t)}</strong>
        </span>
        <span className="ad-navigator-role">{t(cfg.labelKey)}</span>
      </div>

      <div className="ad-navigator-body">
        <nav className="ad-navigator-grid" aria-label="All destinations">
          {groups.map((group) => (
            <section className="ad-navigator-group" key={group.grpKey}>
              <h2>{groupLabel(group.grpKey, t)}</h2>
              <div className="ad-navigator-links">
                {group.items.map((item) => {
                  const selected = item.id === active;
                  const label = itemLabel(item, t);

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={'ad-navigator-link' + (selected ? ' is-current' : '')}
                      onClick={() => onNav(item.id)}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <span className="ad-navigator-link-icon">
                        {cloneElement(item.icon, { size: 17 })}
                      </span>
                      <span>{label}</span>
                      {selected && (
                        <span className="ad-navigator-current" aria-hidden="true">
                          {cloneElement(Icons.check, { size: 13 })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>

      <footer className="ad-navigator-footer">
        <button
          type="button"
          className="ad-navigator-profile"
          onClick={() => canLogout && onNav('backendAccount')}
          disabled={!canLogout}
        >
          <SfAvatar name={cfg.who} size={38} color={cfg.accent} />
          <span>
            <strong>{cfg.who}</strong>
            <small>{cfg.whoRole || t(cfg.whoRoleKey)}</small>
          </span>
        </button>
        {canLogout && (
          <button
            type="button"
            className="ad-navigator-logout"
            onClick={onLogout}
          >
            {cloneElement(Icons.logout, { size: 16 })}
            <span>{t('connection.logout', { defaultValue: 'Sign out' })}</span>
          </button>
        )}
      </footer>
    </aside>
  );
}
