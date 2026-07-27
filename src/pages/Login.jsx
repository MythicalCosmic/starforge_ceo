import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { PageLoader } from '../components/feedback.jsx';
import { Field, TextInput } from '../components/form.jsx';
import { Button, Card, SfStar } from '../components/primitives.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { LANGUAGES } from '../i18n/index.js';
import {
  getLoginPrompt,
  normalizeLoginLanguage,
  PAGE_PROMPT_INDEX,
} from './loginExperience.js';

function messageFor(error, fallback) {
  if (error?.data && typeof error.data === 'object') {
    return error.data.message || error.data.error || error.message || fallback;
  }
  return error?.message || fallback;
}

function AuthFrame({ title, description, children }) {
  return (
    <main className="sf-auth">
      <div className="sf-auth-panel">
        <div className="sf-auth-brand">
          <SfStar size={30} color="var(--sf-primary)" />
          <strong style={{ fontSize: 19, letterSpacing: '-0.02em' }}>StarForge · EDU</strong>
        </div>
        <Card title={title}>
          {description ? (
            <p style={{ margin: '0 0 18px', color: 'var(--sf-muted)', fontSize: 13, lineHeight: 1.55 }}>
              {description}
            </p>
          ) : null}
          {children}
        </Card>
      </div>
    </main>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function splitGraphemes(value, locale) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

function typingDelay(character, position) {
  if (/[.!?]/u.test(character)) return 145;
  if (/[,;:]/u.test(character)) return 90;
  if (character === ' ') return 18;
  return 27 + (position % 4) * 3;
}

function LeadershipStory({ prompt, language, tipLabel }) {
  const reducedMotion = useReducedMotion();
  const leadCharacters = useMemo(
    () => splitGraphemes(prompt.lead, language),
    [prompt.lead, language],
  );
  const accentCharacters = useMemo(
    () => splitGraphemes(prompt.accent, language),
    [prompt.accent, language],
  );
  const characters = useMemo(
    () => [...leadCharacters, ...accentCharacters],
    [leadCharacters, accentCharacters],
  );
  const [visibleCount, setVisibleCount] = useState(reducedMotion ? characters.length : 0);
  const [complete, setComplete] = useState(reducedMotion);
  const [showCaret, setShowCaret] = useState(!reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(characters.length);
      setComplete(true);
      setShowCaret(false);
      return undefined;
    }

    let cursor = 0;
    let timer;
    let cancelled = false;
    setVisibleCount(0);
    setComplete(false);
    setShowCaret(true);

    const typeNext = () => {
      if (cancelled) return;
      cursor += 1;
      setVisibleCount(cursor);
      if (cursor >= characters.length) {
        setComplete(true);
        return;
      }
      timer = window.setTimeout(
        typeNext,
        typingDelay(characters[cursor - 1], cursor),
      );
    };

    timer = window.setTimeout(typeNext, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [characters, prompt.id, reducedMotion]);

  useEffect(() => {
    if (!complete || reducedMotion) return undefined;
    const timer = window.setTimeout(() => setShowCaret(false), 1700);
    return () => window.clearTimeout(timer);
  }, [complete, reducedMotion]);

  const visibleLead = leadCharacters.slice(0, visibleCount).join('');
  const visibleAccent = accentCharacters
    .slice(0, Math.max(0, visibleCount - leadCharacters.length))
    .join('');
  const caretInLead = showCaret && visibleCount < leadCharacters.length;
  const caretInAccent = showCaret && !caretInLead;
  const fullHeadline = `${prompt.lead} ${prompt.accent}`;

  return (
    <div className="sf-login-story">
      <div className="sf-login-story-copy">
        <p className="sf-login-story-eyebrow">{prompt.eyebrow}</p>
        <h2 className="sf-login-headline" aria-label={fullHeadline}>
          <span className="sf-login-headline-ghost" aria-hidden="true">
            <span>{prompt.lead}</span>
            <em>{prompt.accent}</em>
          </span>
          <span className="sf-login-headline-typed" aria-hidden="true">
            <span>
              {visibleLead}
              {caretInLead ? <i className="sf-login-caret" /> : null}
            </span>
            <em>
              {visibleAccent}
              {caretInAccent ? <i className="sf-login-caret" /> : null}
            </em>
          </span>
        </h2>
        <p className={`sf-login-story-body${complete ? ' is-visible' : ''}`}>
          {prompt.body}
        </p>
      </div>
      <div className={`sf-login-tip${complete ? ' is-visible' : ''}`}>
        <span className="sf-login-tip-dot" aria-hidden="true" />
        <span>
          <strong>{tipLabel}</strong> {prompt.tip}
        </span>
      </div>
    </div>
  );
}

function LoginFrame({ children }) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = usePreferences();
  const language = normalizeLoginLanguage(i18n.resolvedLanguage || i18n.language);
  const prompt = getLoginPrompt(language, PAGE_PROMPT_INDEX);
  const dark = theme === 'dark';

  return (
    <main className="sf-login">
      <section className="sf-login-story-panel" aria-label={t('connection.storyLabel')}>
        <div className="sf-login-brand">
          <span className="sf-login-brand-mark">
            <SfStar size={24} color="currentColor" />
          </span>
          <span>
            <strong>StarForge EDU</strong>
            <small>{t('connection.brandLine')}</small>
          </span>
        </div>
        <LeadershipStory
          prompt={prompt}
          language={language}
          tipLabel={t('connection.tipLabel')}
        />
      </section>

      <section className="sf-login-access" aria-labelledby="sf-login-title">
        <div className="sf-login-tools">
          <div
            className="sf-login-languages"
            role="group"
            aria-label={t('connection.languageLabel')}
          >
            {LANGUAGES.map((locale) => (
              <button
                key={locale}
                type="button"
                className={language === locale ? 'is-active' : ''}
                onClick={() => i18n.changeLanguage(locale)}
                aria-pressed={language === locale}
              >
                {locale.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="sf-login-theme"
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? t('connection.useLightTheme') : t('connection.useDarkTheme')}
          >
            {cloneElement(dark ? Icons.moon : Icons.sun, { size: 17 })}
          </button>
        </div>

        <div className="sf-login-access-inner">
          <p className="sf-login-access-eyebrow">
            <span aria-hidden="true" />
            {t('connection.eyebrow')}
          </p>
          <h1 id="sf-login-title">{t('connection.title')}</h1>
          <p className="sf-login-access-description" id="sf-login-description">
            {t('connection.description')}
          </p>
          {children}
          <p className="sf-login-secure-note">
            <span aria-hidden="true">{cloneElement(Icons.shield, { size: 15 })}</span>
            {t('connection.secureNote')}
          </p>
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorId = error ? 'sf-login-error' : undefined;

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login({ username, password });
    } catch (requestError) {
      setPassword('');
      setError(
        messageFor(
          requestError,
          t('connection.loginFailed', {
            defaultValue: 'Sign-in failed. Check your credentials and try again.',
          }),
        ),
      );
      setPending(false);
    }
  };

  return (
    <LoginFrame>
      <form
        className="sf-login-form"
        onSubmit={submit}
        aria-busy={pending}
        aria-describedby="sf-login-description"
      >
        <Field label={t('connection.username', { defaultValue: 'Username' })} required>
          <TextInput
            id="sf-login-username"
            value={username}
            onChange={(value) => {
              setUsername(value);
              if (error) setError('');
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            autoFocus
            required
          />
        </Field>
        <Field label={t('connection.password', { defaultValue: 'Password' })} required>
          <span className="sf-login-password">
            <TextInput
              id="sf-login-password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (error) setError('');
              }}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={pending}
              aria-invalid={Boolean(error)}
              aria-describedby={errorId}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={pending}
              aria-controls="sf-login-password"
              aria-pressed={showPassword}
            >
              {showPassword ? t('connection.hidePassword') : t('connection.showPassword')}
            </button>
          </span>
        </Field>
        {error ? (
          <div className="sf-login-error" id="sf-login-error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="sf-login-submit" type="submit" disabled={pending}>
          <span>
            {pending ? <i className="sf-login-spinner" aria-hidden="true" /> : null}
            {pending ? t('connection.submitting') : t('connection.submit')}
          </span>
          <span className="sf-login-submit-arrow" aria-hidden="true">
            →
          </span>
        </button>
        <p className="sf-login-role-note">{t('connection.roleNote')}</p>
      </form>
    </LoginFrame>
  );
}

export function PasswordChangePage() {
  const { changePassword, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword === oldPassword) {
      setError('Choose a new password that is different from the temporary password.');
      return;
    }
    setPending(true);
    try {
      await changePassword({ oldPassword, newPassword });
    } catch (requestError) {
      setNewPassword('');
      setConfirmation('');
      setError(messageFor(requestError, 'The password could not be changed.'));
      setPending(false);
    }
  };

  return (
    <AuthFrame
      title="Change your temporary password"
      description="Your account requires a new password before management data can be opened."
    >
      <form className="sf-connection-form" onSubmit={submit} aria-busy={pending}>
        <Field label="Temporary password" required>
          <TextInput
            value={oldPassword}
            onChange={setOldPassword}
            type="password"
            autoComplete="current-password"
            disabled={pending}
            autoFocus
            required
          />
        </Field>
        <Field label="New password" required>
          <TextInput
            value={newPassword}
            onChange={setNewPassword}
            type="password"
            autoComplete="new-password"
            disabled={pending}
            required
          />
        </Field>
        <Field label="Confirm new password" required>
          <TextInput
            value={confirmation}
            onChange={setConfirmation}
            type="password"
            autoComplete="new-password"
            disabled={pending}
            required
          />
        </Field>
        {error ? (
          <div className="sf-form-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="sf-connection-actions">
          <Button kind="primary" type="submit" disabled={pending}>
            {pending ? 'Changing password…' : 'Change password'}
          </Button>
          <Button kind="ghost" onClick={logout} disabled={pending}>
            Sign out
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}

export function AuthMessagePage({ title, description, retry, logout }) {
  return (
    <AuthFrame title={title} description={description}>
      <div className="sf-connection-actions">
        {retry ? (
          <Button kind="primary" onClick={retry}>
            Try again
          </Button>
        ) : null}
        {logout ? (
          <Button kind={retry ? 'ghost' : 'primary'} onClick={logout}>
            Sign out
          </Button>
        ) : null}
      </div>
    </AuthFrame>
  );
}

export function AuthLoadingPage() {
  return (
    <main className="sf-auth">
      <PageLoader label="Opening your leadership workspace…" />
    </main>
  );
}
