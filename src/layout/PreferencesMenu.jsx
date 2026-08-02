import { cloneElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { LANGUAGES } from '../i18n/index.js';
import { usePopover } from '../hooks/useOutsideClick.js';

export function PreferencesMenu({ onOpenSettings }) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = usePreferences();
  const pop = usePopover(false);
  const panelId = useId();

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
        aria-controls={pop.open ? panelId : undefined}
      >
        {cloneElement(theme === 'dark' ? Icons.moon : Icons.sun, { size: 16 })}
      </button>

      {pop.open && (
        <div
          id={panelId}
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

          {LANGUAGES.length > 1 && <section className="ad-preference-section">
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
          </section>}

          {onOpenSettings && (
            <button
              type="button"
              className="ad-open-settings"
              onClick={() => {
                pop.close(false);
                onOpenSettings();
              }}
            >
              <span>
                <strong>{t('shell.workspacePreferences', { defaultValue: 'All preferences' })}</strong>
                <small>{t('shell.personalizeView', { defaultValue: 'Layout, color and density' })}</small>
              </span>
              {cloneElement(Icons.chevR, { size: 15 })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
