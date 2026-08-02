import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../components/Icons.jsx';
import { PageLoader } from '../components/feedback.jsx';
import { TextInput } from '../components/form.jsx';
import { Button, Card, SfStar } from '../components/primitives.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { LANGUAGES } from '../i18n/index.js';
import {
  passwordChangeFailure,
  validatePasswordChange,
} from '../lib/passwordPolicy.js';
import { userFacingError } from '../lib/userFacingError.js';
import {
  getLoginPrompt,
  normalizeLoginLanguage,
  PAGE_PROMPT_INDEX,
} from './loginExperience.js';

function messageFor(error, fallback, context = 'workspace') {
  return userFacingError(error, { context, fallback });
}

function AuthField({ id, label, required = false, children }) {
  return (
    <div className="sf-field">
      <label className="sf-field-l" htmlFor={id}>
        {label}
        {required ? <em aria-hidden="true">*</em> : null}
      </label>
      {children}
    </div>
  );
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
          {LANGUAGES.length > 1 && (
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
          )}
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
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const pendingRef = useRef(false);
  const errorId = error ? 'sf-login-error' : undefined;
  const credentialError = error && [400, 401, 403, 422].includes(Number(error.status));

  const submit = async (event) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const cleanUsername = username.trim();
    const exactPassword = password;
    const nextErrors = {};
    if (!cleanUsername) nextErrors.username = t('connection.usernameRequired');
    else if (cleanUsername.length > 150) nextErrors.username = t('connection.usernameTooLong');
    else if (/\p{Cc}/u.test(cleanUsername)) nextErrors.username = t('connection.invalidCharacters');
    if (!exactPassword) nextErrors.password = t('connection.passwordRequired');
    else if (exactPassword.length > 128) nextErrors.password = t('connection.passwordTooLong');
    else if (/\p{Cc}/u.test(exactPassword)) nextErrors.password = t('connection.invalidCharacters');

    setUsername(cleanUsername);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.warning(t('connection.checkFields'), {
        id: 'sf-login-feedback',
        title: t('connection.signInNeedsAttention'),
      });
      window.requestAnimationFrame(() => {
        document.getElementById(nextErrors.username ? 'sf-login-username' : 'sf-login-password')?.focus();
      });
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const nextSession = await login({ username: cleanUsername, password: exactPassword });
      if (nextSession?.status === 'authenticated' || nextSession?.status === 'password-change') {
        toast.success(t('connection.loginSuccess'), {
          id: 'sf-login-feedback',
          title: t('connection.welcome'),
        });
      }
    } catch (requestError) {
      const message = messageFor(
        requestError,
        t('connection.loginFailed', {
          defaultValue: 'Sign-in failed. Check your details and try again.',
        }),
        'login',
      );
      setPassword('');
      setShowPassword(false);
      setError(requestError);
      setFieldErrors({});
      toast.danger(message, {
        id: 'sf-login-feedback',
        title: t('connection.loginFailedTitle'),
      });
      pendingRef.current = false;
      setPending(false);
      window.requestAnimationFrame(() => {
        document.getElementById('sf-login-password')?.focus();
      });
    }
  };

  return (
    <LoginFrame>
      <form
        className="sf-login-form"
        onSubmit={submit}
        noValidate
        aria-busy={pending}
        aria-describedby="sf-login-description"
      >
        <AuthField
          id="sf-login-username"
          label={t('connection.username', { defaultValue: 'Username' })}
          required
        >
          <span className="sf-login-input-shell">
            <span className="sf-login-input-icon" aria-hidden="true">
              {cloneElement(Icons.user, { size: 18 })}
            </span>
            <TextInput
              id="sf-login-username"
              value={username}
              onChange={(value) => {
                setUsername(value);
                setFieldErrors((current) => ({ ...current, username: '' }));
                if (error) setError(null);
              }}
              onBlur={() => setUsername((value) => value.trim())}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.username || credentialError)}
              aria-describedby={fieldErrors.username ? 'sf-login-username-error' : errorId}
              autoFocus
              required
            />
          </span>
          {fieldErrors.username ? (
            <span className="sf-login-field-error" id="sf-login-username-error" role="alert">
              {fieldErrors.username}
            </span>
          ) : null}
        </AuthField>
        <AuthField
          id="sf-login-password"
          label={t('connection.password', { defaultValue: 'Password' })}
          required
        >
          <span className="sf-login-password">
            <span className="sf-login-input-icon" aria-hidden="true">
              {cloneElement(Icons.shield, { size: 18 })}
            </span>
            <TextInput
              id="sf-login-password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setFieldErrors((current) => ({ ...current, password: '' }));
                if (error) setError(null);
              }}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.password || credentialError)}
              aria-describedby={fieldErrors.password ? 'sf-login-password-error' : errorId}
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
          {fieldErrors.password ? (
            <span className="sf-login-field-error" id="sf-login-password-error" role="alert">
              {fieldErrors.password}
            </span>
          ) : null}
        </AuthField>
        {error ? (
          <div className="sf-login-error" id="sf-login-error" role="alert">
            {messageFor(
              error,
              t('connection.loginFailed', {
                defaultValue: 'Sign-in failed. Check your details and try again.',
              }),
              'login',
            )}
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
  const toast = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  const submit = async (event) => {
    event.preventDefault();
    if (pendingRef.current) return;
    setError(null);
    const policyIssue = validatePasswordChange({
      currentPassword: oldPassword,
      newPassword,
      confirmation,
    });
    if (policyIssue) {
      setError(policyIssue);
      toast.warning(policyIssue.message, { title: 'Check the highlighted field' });
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await changePassword({ oldPassword, newPassword });
      toast.success('Your password has been changed and the leadership workspace is ready.', { title: 'Password updated' });
    } catch (requestError) {
      const failure = passwordChangeFailure(requestError);
      setError(failure);
      toast.danger(failure.message, { title: 'Password not changed' });
      if (failure.field === 'current') setOldPassword('');
      if (failure.field === 'new') {
        setNewPassword('');
        setConfirmation('');
      }
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <AuthFrame
      title="Change your temporary password"
      description="Your account requires a new password before management data can be opened."
    >
      <form className="sf-connection-form" onSubmit={submit} aria-busy={pending}>
        <AuthField id="sf-current-password" label="Temporary password" required>
          <TextInput
            id="sf-current-password"
            value={oldPassword}
            onChange={(value) => {
              setOldPassword(value);
              if (error?.field === 'current') setError(null);
            }}
            type="password"
            autoComplete="current-password"
            disabled={pending}
            autoFocus
            aria-invalid={error?.field === 'current'}
            aria-describedby={error?.field === 'current' ? 'sf-current-password-error' : undefined}
            required
          />
          {error?.field === 'current' && (
            <span className="sf-field-help is-error" id="sf-current-password-error" role="alert">
              {error.message}
            </span>
          )}
        </AuthField>
        <AuthField id="sf-new-password" label="New password" required>
          <TextInput
            id="sf-new-password"
            value={newPassword}
            onChange={(value) => {
              setNewPassword(value);
              if (error?.field === 'new') setError(null);
            }}
            type="password"
            autoComplete="new-password"
            disabled={pending}
            aria-invalid={error?.field === 'new'}
            aria-describedby={`sf-password-policy${error?.field === 'new' ? ' sf-new-password-error' : ''}`}
            required
          />
          <span className="sf-field-help" id="sf-password-policy">
            Use 10–128 characters. Avoid common, numeric-only, or account-based passwords.
          </span>
          {error?.field === 'new' && (
            <span className="sf-field-help is-error" id="sf-new-password-error" role="alert">
              {error.message}
            </span>
          )}
        </AuthField>
        <AuthField id="sf-confirm-password" label="Confirm new password" required>
          <TextInput
            id="sf-confirm-password"
            value={confirmation}
            onChange={(value) => {
              setConfirmation(value);
              if (error?.field === 'confirmation') setError(null);
            }}
            type="password"
            autoComplete="new-password"
            disabled={pending}
            aria-invalid={error?.field === 'confirmation'}
            aria-describedby={error?.field === 'confirmation' ? 'sf-confirm-password-error' : undefined}
            required
          />
          {error?.field === 'confirmation' && (
            <span className="sf-field-help is-error" id="sf-confirm-password-error" role="alert">
              {error.message}
            </span>
          )}
        </AuthField>
        {error?.field === 'form' ? (
          <div className="sf-form-error" role="alert">
            {error.message}
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

export function AuthMessagePage({ title, description, retry, logout, retryLabel = 'Try again', logoutLabel = 'Sign out' }) {
  return (
    <AuthFrame title={title} description={description}>
      <div className="sf-connection-actions">
        {retry ? (
          <Button kind="primary" onClick={retry}>
            {retryLabel}
          </Button>
        ) : null}
        {logout ? (
          <Button kind={retry ? 'ghost' : 'primary'} onClick={logout}>
            {logoutLabel}
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
