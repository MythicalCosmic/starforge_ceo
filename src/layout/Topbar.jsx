import { cloneElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { SfAvatar, SfStar } from '../components/primitives.jsx';
import { groupNav } from '../config/roles.js';
import { usePopover } from '../hooks/useOutsideClick.js';
import { PreferencesMenu } from './PreferencesMenu.jsx';

const ACCOUNT_SECTION_LABELS = Object.freeze({
  notifications: 'Notifications',
  security: 'Security',
  devices: 'Recognized devices',
  access: 'My access',
  workspace: 'Workspace preferences',
});

function destinationLabel(item, t, route = '') {
  if (item.id === 'settings') {
    return t('shell.workspacePreferences', { defaultValue: 'Workspace preferences' });
  }
  if (item.id === 'account') {
    const section = String(route).split('?', 1)[0].split('/').filter(Boolean)[1];
    if (ACCOUNT_SECTION_LABELS[section]) return ACCOUNT_SECTION_LABELS[section];
    return t('shell.myProfile', { defaultValue: 'My profile' });
  }
  return t(item.labelKey, { defaultValue: item.label || item.id });
}

function destinationGroup(groupKey, t) {
  if (groupKey === 'system') {
    return t('shell.workspaceGroup', { defaultValue: 'Workspace' });
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

function routeHref(target) {
  const path = String(target || 'overview')
    .replace(/^#/, '')
    .replace(/^\/+/, '');
  return `/${path || 'overview'}`;
}

function handleRouteClick(event, onNav, target, afterNavigate) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  onNav(target);
  afterNavigate?.();
}

function GroupMenu({ group, active, onNav, onPrefetch }) {
  const { t } = useTranslation();
  const pop = usePopover(false);
  const panelId = useId();
  const current = group.items.find((item) => item.id === active);
  const label = destinationGroup(group.grpKey, t);

  if (group.items.length === 1) {
    const item = group.items[0];
    const target = item.path || item.id;
    return (
      <a
        className={'ad-primary-group' + (current ? ' is-active' : '')}
        href={routeHref(target)}
        onClick={(event) => handleRouteClick(event, onNav, target)}
        onMouseEnter={() => onPrefetch?.(target)}
        onFocus={() => onPrefetch?.(target)}
        aria-current={current ? 'page' : undefined}
      >
        {cloneElement(item.icon, { size: 15 })}
        <span>{label}</span>
      </a>
    );
  }

  return (
    <div className="ad-primary-menu" ref={pop.ref}>
      <button
        ref={pop.triggerRef}
        type="button"
        className={'ad-primary-group' + (current ? ' is-active' : '')}
        onClick={pop.toggle}
        aria-controls={panelId}
        aria-expanded={pop.open}
      >
        {cloneElement((current || group.items[0]).icon, { size: 15 })}
        <span>{label}</span>
        <span className="ad-primary-chevron">
          {cloneElement(Icons.chevR, { size: 12 })}
        </span>
      </button>

      {pop.open && (
        <div id={panelId} className="ad-primary-popover" aria-label={label}>
          <div className="ad-primary-popover-title">{label}</div>
          {group.items.map((item) => {
            const selected = item.id === active;
            const target = item.path || item.id;
            return (
              <a
                key={item.id}
                className={'ad-primary-option' + (selected ? ' is-current' : '')}
                href={routeHref(target)}
                onClick={(event) => handleRouteClick(event, onNav, target, () => pop.close(false))}
                onMouseEnter={() => onPrefetch?.(target)}
                onFocus={() => onPrefetch?.(target)}
                aria-current={selected ? 'page' : undefined}
              >
                <span>{cloneElement(item.icon, { size: 16 })}</span>
                <strong>{destinationLabel(item, t)}</strong>
                {selected && cloneElement(Icons.check, { size: 13 })}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkspaceSearch({ cfg, onNav, onPrefetch, navigatorOpen }) {
  const { t } = useTranslation();
  const {
    open: searchOpen,
    setOpen: setSearchOpen,
    ref: searchRef,
    triggerRef,
  } = usePopover(false);
  const inputRef = useRef(null);
  const panelId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const entries = useMemo(
    () =>
      (cfg.directoryNav || cfg.destinations || cfg.nav).map((item) => {
        const label = destinationLabel(item, t);
        const group = destinationGroup(item.grpKey, t);
        return {
          ...item,
          label,
          group,
          searchable: `${label} ${group}`.toLocaleLowerCase(),
        };
      }),
    [cfg.destinations, cfg.directoryNav, cfg.nav, t],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (needle
      ? entries.filter((entry) => entry.searchable.includes(needle))
      : entries
    ).slice(0, 8);
  }, [entries, query]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (
        !navigatorOpen &&
        !document.querySelector('[aria-modal="true"]') &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === 'k'
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [navigatorOpen, setSearchOpen]);

  useEffect(() => {
    if (navigatorOpen) setSearchOpen(false);
  }, [navigatorOpen, setSearchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const close = () => {
    setQuery('');
    setHighlighted(0);
    setSearchOpen(false);
  };

  const go = (entry) => {
    if (!entry) return;
    const target = entry.path || entry.id;
    onPrefetch?.(target);
    onNav(target);
    close();
  };

  const handleKeys = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) =>
        results.length ? (index - 1 + results.length) % results.length : 0,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[highlighted] || results[0]);
    }
  };

  return (
    <div className="ad-command" ref={searchRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ad-command-trigger"
        onClick={() => setSearchOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        aria-controls={searchOpen ? panelId : undefined}
        aria-label={t('shell.searchWorkspace', { defaultValue: 'Go to page' })}
      >
        {cloneElement(Icons.search, { size: 16 })}
        <span>{t('shell.searchWorkspace', { defaultValue: 'Go to page' })}</span>
        <kbd>Ctrl K</kbd>
      </button>

      {searchOpen && (
        <div
          id={panelId}
          className="ad-command-panel"
          role="dialog"
          aria-label={t('shell.quickNavigation', { defaultValue: 'Quick navigation' })}
        >
          <div className="ad-command-input">
            {cloneElement(Icons.search, { size: 18 })}
            <input
              ref={inputRef}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls={listboxId}
              aria-activedescendant={
                results[highlighted] ? `${listboxId}-option-${highlighted}` : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeys}
              placeholder={t('shell.findPage', { defaultValue: 'Find a page or workspace…' })}
              aria-label={t('shell.findPage', { defaultValue: 'Find a page or workspace' })}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label={t('shell.clearSearch', { defaultValue: 'Clear search' })}
              >
                {cloneElement(Icons.x, { size: 14 })}
              </button>
            )}
          </div>

          <div className="ad-command-heading">
            <span>{t('shell.quickNavigation', { defaultValue: 'Quick navigation' })}</span>
            <span>{results.length}</span>
          </div>

          <div id={listboxId} className="ad-command-results" role="listbox">
            {results.length ? (
              results.map((entry, index) => {
                const target = entry.path || entry.id;
                return (
                  <a
                    role="option"
                    id={`${listboxId}-option-${index}`}
                    aria-selected={highlighted === index}
                    key={entry.id}
                    className={
                      'ad-command-result' + (highlighted === index ? ' is-highlighted' : '')
                    }
                    href={routeHref(target)}
                    onMouseEnter={() => {
                      setHighlighted(index);
                      onPrefetch?.(target);
                    }}
                    onFocus={() => {
                      setHighlighted(index);
                      onPrefetch?.(target);
                    }}
                    onClick={(event) => handleRouteClick(event, onNav, target, close)}
                  >
                    <span className="ad-command-result-icon">
                      {cloneElement(entry.icon, { size: 17 })}
                    </span>
                    <span className="ad-command-result-copy">
                      <strong>{entry.label}</strong>
                      <small>{entry.group}</small>
                    </span>
                    {cloneElement(Icons.chevR, { size: 13 })}
                  </a>
                );
              })
            ) : (
              <div className="ad-command-empty">
                <strong>
                  {t('shell.nothingFound', { defaultValue: 'Nothing matched that search' })}
                </strong>
                <small>
                  {t('shell.tryDifferentWords', {
                    defaultValue: 'Try a shorter or different phrase.',
                  })}
                </small>
              </div>
            )}
          </div>

          <div className="ad-command-footer" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
            <span><kbd>Enter</kbd> Open</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  cfg,
  current,
  active,
  route,
  scope,
  navigationLayout = 'sidebar',
  navigatorOpen = false,
  onNav,
  onPrefetch,
  onOpenDrawer,
}) {
  const { t } = useTranslation();
  const groups = groupNav(cfg.nav);
  const hasEngagement = cfg.nav.some((item) => item.id === 'engagement');
  const hasAccount = cfg.nav.some((item) => item.id === 'account');
  const currentLabel = current
    ? destinationLabel(current, t, route)
    : t('shell.workspace', { defaultValue: 'Workspace' });

  return (
    <header className="ad-masthead" data-layout={navigationLayout}>
      <div className="ad-top">
        <a
          className="ad-masthead-brand"
          href={routeHref('overview')}
          onClick={(event) => handleRouteClick(event, onNav, 'overview')}
          onMouseEnter={() => onPrefetch?.('overview')}
          onFocus={() => onPrefetch?.('overview')}
          aria-label="StarForge EDU · Overview"
        >
          <span aria-hidden="true"><SfStar size={20} color="currentColor" /></span>
          <strong>StarForge <small>EDU</small></strong>
        </a>

        <div className="ad-top-context">
          <span>{t(cfg.labelKey)} · {scopeLabel(scope, t)}</span>
          <strong>{currentLabel}</strong>
        </div>

        <WorkspaceSearch
          cfg={cfg}
          onNav={onNav}
          onPrefetch={onPrefetch}
          navigatorOpen={navigatorOpen}
        />

        <div className="ad-top-actions">
          <PreferencesMenu onOpenSettings={() => onNav('settings')} />

          {hasEngagement && (
            <a
              className="ad-top-ic"
              href={routeHref('engagement/notifications')}
              onClick={(event) =>
                handleRouteClick(event, onNav, 'engagement/notifications')
              }
              onMouseEnter={() => onPrefetch?.('engagement/notifications')}
              onFocus={() => onPrefetch?.('engagement/notifications')}
              aria-label={t('shell.openUpdates', { defaultValue: 'Open updates' })}
              title={t('shell.updates', { defaultValue: 'Updates' })}
            >
              {cloneElement(Icons.bell, { size: 17 })}
            </a>
          )}

          {hasAccount && (
            <a
              className="ad-top-av"
              href={routeHref('account')}
              onClick={(event) => handleRouteClick(event, onNav, 'account')}
              onMouseEnter={() => onPrefetch?.('account')}
              onFocus={() => onPrefetch?.('account')}
              aria-label={`${cfg.who} · ${t('shell.myProfile', { defaultValue: 'My profile' })}`}
            >
              <SfAvatar name={cfg.who} size={32} color={cfg.accent} decorative />
              <span>
                <strong>{cfg.who}</strong>
                <small>{cfg.whoRole || t(cfg.whoRoleKey)}</small>
              </span>
            </a>
          )}

          <button
            type="button"
            className="ad-mobile-navigator"
            onClick={onOpenDrawer}
            data-navigator-trigger
            aria-haspopup="dialog"
            aria-expanded={navigatorOpen}
            aria-label={t('shell.openMenu', { defaultValue: 'Open all destinations' })}
          >
            {cloneElement(Icons.filter, { size: 18 })}
          </button>
        </div>
      </div>

      {navigationLayout === 'top' && (
        <div className="ad-primary-row">
          <nav className="ad-primary-nav" aria-label="Workspace sections">
            {groups.map((group) => (
              <GroupMenu
                key={group.grpKey}
                group={group}
                active={active}
                onNav={onNav}
                onPrefetch={onPrefetch}
              />
            ))}
          </nav>
          <button
            type="button"
            className="ad-all-destinations"
            onClick={onOpenDrawer}
            data-navigator-trigger
            aria-haspopup="dialog"
            aria-expanded={navigatorOpen}
          >
            {cloneElement(Icons.filter, { size: 15 })}
            <span>{t('shell.allDestinations', { defaultValue: 'All destinations' })}</span>
          </button>
        </div>
      )}
    </header>
  );
}
