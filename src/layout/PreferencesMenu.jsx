import { cloneElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import {
  NAVIGATION_LAYOUTS,
  PALETTES,
  PALETTE_SWATCHES,
} from '../context/preferenceOptions.js';
import { LANGUAGES } from '../i18n/index.js';
import { usePopover } from '../hooks/useOutsideClick.js';

export function PreferencesMenu() {
  const { t, i18n } = useTranslation();
  const {
    theme,
    setTheme,
    palette,
    setPalette,
    navigationLayout,
    setNavigationLayout,
  } = usePreferences();
  const pop = usePopover(false);

  return (
    <div className="ad-pop ad-preferences" ref={pop.ref}>
      <button
        ref={pop.triggerRef}
        type="button"
        className="ad-top-ic ad-pop-trigger"
        onClick={pop.toggle}
        aria-label={t('shell.preferences', { defaultValue: 'Display preferences' })}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
      >
        {cloneElement(theme === 'dark' ? Icons.moon : Icons.sun, { size: 16 })}
      </button>

      {pop.open && (
        <div
          className="ad-preferences-panel"
          role="dialog"
          aria-label={t('shell.preferences', { defaultValue: 'Display preferences' })}
        >
          <header>
            <span>
              <strong>{t('shell.preferences', { defaultValue: 'Display preferences' })}</strong>
              <small>
                {t('shell.personalizeView', { defaultValue: 'Make the workspace comfortable for you.' })}
              </small>
            </span>
            <button
              type="button"
              onClick={() => pop.close(true)}
              aria-label={t('shell.closePreferences', { defaultValue: 'Close preferences' })}
            >
              {cloneElement(Icons.x, { size: 15 })}
            </button>
          </header>

          <section className="ad-preference-section">
            <h2>{t('shell.navigationLayout', { defaultValue: 'Navigation layout' })}</h2>
            <div className="ad-layout-options">
              {NAVIGATION_LAYOUTS.map((layout) => {
                const selected = navigationLayout === layout;
                return (
                  <button
                    type="button"
                    key={layout}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => setNavigationLayout(layout)}
                    aria-pressed={selected}
                  >
                    {cloneElement(layout === 'sidebar' ? Icons.doc : Icons.globe, {
                      size: 16,
                    })}
                    <span>
                      {layout === 'sidebar'
                        ? t('shell.sidebarNavigation', { defaultValue: 'Sidebar' })
                        : t('shell.topNavigation', { defaultValue: 'Top navigation' })}
                    </span>
                    {selected && cloneElement(Icons.check, { size: 13 })}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ad-preference-section">
            <h2>{t('shell.theme', { defaultValue: 'Theme' })}</h2>
            <div className="ad-theme-options">
              <button
                type="button"
                className={theme === 'light' ? 'is-selected' : ''}
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
              >
                {cloneElement(Icons.sun, { size: 16 })}
                <span>{t('shell.light', { defaultValue: 'Light' })}</span>
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'is-selected' : ''}
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
              >
                {cloneElement(Icons.moon, { size: 16 })}
                <span>{t('shell.dark', { defaultValue: 'Dark' })}</span>
              </button>
            </div>
          </section>

          <section className="ad-preference-section">
            <h2>{t('shell.palette', { defaultValue: 'Palette' })}</h2>
            <div className="ad-palette-options">
              {PALETTES.map((name) => (
                <button
                  type="button"
                  key={name}
                  className={palette === name ? 'is-selected' : ''}
                  onClick={() => setPalette(name)}
                  aria-pressed={palette === name}
                >
                  <span className="ad-palette-dots" aria-hidden="true">
                    {PALETTE_SWATCHES[name].map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <span>
                    {t(`shell.pal${name.charAt(0).toUpperCase()}${name.slice(1)}`, {
                      defaultValue: name,
                    })}
                  </span>
                  {palette === name && cloneElement(Icons.check, { size: 13 })}
                </button>
              ))}
            </div>
          </section>

          <section className="ad-preference-section">
            <h2>{t('shell.language', { defaultValue: 'Language' })}</h2>
            <div className="ad-language-options">
              {LANGUAGES.map((language) => {
                const selected = i18n.resolvedLanguage === language;
                return (
                  <button
                    type="button"
                    key={language}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => i18n.changeLanguage(language)}
                    aria-pressed={selected}
                  >
                    <span>{t(`lang.${language}`)}</span>
                    {selected && cloneElement(Icons.check, { size: 13 })}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
