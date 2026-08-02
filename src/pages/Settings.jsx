import { cloneElement } from 'react';
import { useTranslation } from 'react-i18next';
import { API_CONFIG } from '../api/config.js';
import { Icons } from '../components/Icons.jsx';
import { Button, Pill, SfAvatar } from '../components/primitives.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import {
  NAVIGATION_LAYOUTS,
  PALETTES,
  PALETTE_SWATCHES,
} from '../context/preferenceOptions.js';
import { useToast } from '../context/ToastContext.jsx';
import { LANGUAGES } from '../i18n/index.js';
import { managementMembership } from '../config/resolveRole.js';
import { managementScopeSummary } from '../config/roles.js';
import '../styles/settings-v2.css';

function SectionHeading({ icon, eyebrow, title, description }) {
  return (
    <div className="sf-settings-section-heading">
      <span className="sf-settings-section-icon" aria-hidden="true">
        {cloneElement(icon, { size: 18 })}
      </span>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function PreferenceGroup({ label, description, children }) {
  return (
    <div className="sf-settings-group">
      <div className="sf-settings-group-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="sf-settings-group-control">{children}</div>
    </div>
  );
}

export function SettingsPage({ role, user, onNav }) {
  const { t, i18n } = useTranslation();
  const {
    theme,
    setTheme,
    palette,
    setPalette,
    density,
    setDensity,
    navigationLayout,
    setNavigationLayout,
  } = usePreferences();
  const { logout } = useAuth();
  const toast = useToast();

  const language = (i18n.resolvedLanguage || 'en').split('-')[0];
  const membership = managementMembership(user, role);
  const scope = managementScopeSummary(role, user);
  const name = user?.full_name || user?.username || t('settings.managementAccount');
  const roleLabel =
    membership?.account_type_name ||
    (role === 'ceo'
      ? t('settings.chiefExecutive')
      : t('settings.departmentManager'));
  const scopeLabel =
    role === 'ceo'
      ? t('settings.organizationWide')
      : scope.name || t('settings.assignedScope');

  const notify = (title, message) =>
    toast.push({
      id: 'workspace-preference',
      tone: 'success',
      title,
      message,
    });

  const chooseTheme = (nextTheme) => {
    setTheme(nextTheme);
    notify(
      t('settings.appearanceSaved'),
      t(
        nextTheme === 'light'
          ? 'settings.lightThemeActive'
          : 'settings.darkThemeActive',
      ),
    );
  };

  const chooseDensity = (nextDensity) => {
    setDensity(nextDensity);
    notify(
      t('settings.readingDensitySaved'),
      nextDensity === 'comfortable'
        ? t('settings.comfortableSpacingActive')
        : t('settings.focusedSpacingActive'),
    );
  };

  const chooseLanguage = async (nextLanguage) => {
    await i18n.changeLanguage(nextLanguage);
    const targetT = i18n.getFixedT(nextLanguage);
    toast.push({
      id: 'workspace-language',
      tone: 'success',
      title: targetT('settings.languageSaved'),
      message: targetT('settings.languageActive', {
        language: targetT(`lang.${nextLanguage}`),
      }),
    });
  };

  return (
    <div className="sf-settings">
      <header className="sf-settings-head">
        <div>
          <span className="sf-settings-eyebrow">{t('settings.eyebrow')}</span>
          <h1>{t('settings.heading')}</h1>
          <p>{t('settings.intro')}</p>
        </div>
        <Pill tone="success" dot>
          {t('settings.savedAutomatically')}
        </Pill>
      </header>

      <section className="sf-settings-account">
        <SfAvatar name={name} size={52} decorative />
        <div>
          <span>{t('settings.signedInAs')}</span>
          <strong>{name}</strong>
          <small>
            {roleLabel} · {scopeLabel}
          </small>
        </div>
        {!API_CONFIG.useMock ? (
          <div className="sf-settings-account-actions">
            <Button kind="soft" onClick={() => onNav('account')}>
              {t('settings.openProfile')}
            </Button>
            <Button kind="ghost" onClick={logout}>
              {t('connection.logout')}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="sf-settings-sections">
        <section className="sf-settings-section">
          <SectionHeading
            icon={theme === 'dark' ? Icons.moon : Icons.sun}
            eyebrow={t('settings.appearance')}
            title={t('settings.visualTone')}
            description={t('settings.visualToneDescription')}
          />
          <div className="sf-settings-section-body">
            <PreferenceGroup
              label={t('settings.navigationLayout')}
              description={t('settings.navigationLayoutDescription')}
            >
              <div
                className="sf-settings-segment"
                aria-label={t('settings.navigationLayout')}
              >
                {NAVIGATION_LAYOUTS.map((value) => {
                  const sidebar = value === 'sidebar';
                  const label = sidebar
                    ? t('shell.sidebarNavigation')
                    : t('shell.topNavigation');
                  return (
                    <button
                      type="button"
                      key={value}
                      className={navigationLayout === value ? 'is-active' : ''}
                      onClick={() => {
                        setNavigationLayout(value);
                        notify(
                          t('settings.navigationSaved'),
                          t('settings.navigationActive', { layout: label }),
                        );
                      }}
                      aria-pressed={navigationLayout === value}
                    >
                      {cloneElement(sidebar ? Icons.doc : Icons.globe, { size: 16 })}
                      {label}
                    </button>
                  );
                })}
              </div>
            </PreferenceGroup>

            <PreferenceGroup
              label={t('settings.theme')}
              description={t('settings.themeDescription')}
            >
              <div
                className="sf-settings-segment"
                aria-label={t('settings.theme')}
              >
                {[
                  ['light', 'shell.light', Icons.sun],
                  ['dark', 'shell.dark', Icons.moon],
                ].map(([value, labelKey, icon]) => (
                  <button
                    type="button"
                    key={value}
                    className={theme === value ? 'is-active' : ''}
                    onClick={() => chooseTheme(value)}
                    aria-pressed={theme === value}
                  >
                    {cloneElement(icon, { size: 16 })}
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </PreferenceGroup>

            <PreferenceGroup
              label={t('settings.color')}
              description={t('settings.colorDescription')}
            >
              <div className="sf-settings-palettes">
                {PALETTES.map((value) => {
                  const active = palette === value;
                  const label = t(
                    `shell.pal${value[0].toUpperCase()}${value.slice(1)}`,
                  );
                  return (
                    <button
                      type="button"
                      key={value}
                      className={active ? 'is-active' : ''}
                      onClick={() => {
                        setPalette(value);
                        notify(
                          t('settings.colorSaved'),
                          t('settings.colorActive', { color: label }),
                        );
                      }}
                      aria-pressed={active}
                      title={label}
                    >
                      <span aria-hidden="true">
                        {PALETTE_SWATCHES[value].map((color) => (
                          <i key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <strong>{label}</strong>
                      {active ? cloneElement(Icons.check, { size: 14 }) : null}
                    </button>
                  );
                })}
              </div>
            </PreferenceGroup>

            <PreferenceGroup
              label={t('settings.informationDensity')}
              description={t('settings.informationDensityDescription')}
            >
              <div
                className="sf-settings-segment"
                aria-label={t('settings.informationDensity')}
              >
                {[
                  ['dense', 'settings.focused', Icons.filter],
                  ['comfortable', 'settings.comfortable', Icons.folder],
                ].map(([value, labelKey, icon]) => (
                  <button
                    type="button"
                    key={value}
                    className={density === value ? 'is-active' : ''}
                    onClick={() => chooseDensity(value)}
                    aria-pressed={density === value}
                  >
                    {cloneElement(icon, { size: 16 })}
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </PreferenceGroup>
          </div>
        </section>

        {LANGUAGES.length > 1 && <section className="sf-settings-section">
          <SectionHeading
            icon={Icons.globe}
            eyebrow={t('settings.languageEyebrow')}
            title={t('settings.readingLanguage')}
            description={t('settings.readingLanguageDescription')}
          />
          <div className="sf-settings-section-body">
            <div className="sf-settings-language-list">
              {LANGUAGES.map((value) => {
                const active = language === value;
                const label = t(`lang.${value}`);
                return (
                  <button
                    type="button"
                    key={value}
                    className={active ? 'is-active' : ''}
                    onClick={() => void chooseLanguage(value)}
                    aria-pressed={active}
                  >
                    <span>{value.toUpperCase()}</span>
                    <strong>{label}</strong>
                    <small>
                      {active
                        ? t('settings.currentLanguage')
                        : t('settings.selectLanguage')}
                    </small>
                    {active ? cloneElement(Icons.check, { size: 15 }) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>}

        <section className="sf-settings-section">
          <SectionHeading
            icon={Icons.shield}
            eyebrow={t('settings.account')}
            title={t('settings.privacyAndScope')}
            description={t('settings.privacyAndScopeDescription')}
          />
          <div className="sf-settings-section-body">
            <div className="sf-settings-assurance-list">
              {[
                [
                  t('settings.privateSession'),
                  t('settings.privateSessionDescription'),
                ],
                [
                  t('settings.leadershipBoundaries'),
                  t('settings.leadershipBoundariesDescription'),
                ],
                [
                  t('settings.deviceLocalPreferences'),
                  t('settings.deviceLocalPreferencesDescription'),
                ],
              ].map(([title, description], index) => (
                <div key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
