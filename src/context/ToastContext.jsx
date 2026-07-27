import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../components/Icons.jsx';

const ToastContext = createContext(null);
const DEFAULT_DURATION = 5200;
const MAX_VISIBLE = 5;

const iconForTone = {
  success: Icons.check,
  warning: Icons.flag,
  danger: Icons.x,
  info: Icons.bell,
};

let sequence = 0;

function normalizeToast(input) {
  const toast = typeof input === 'string' ? { message: input } : input || {};
  sequence += 1;
  return {
    id: toast.id || `sf-toast-${Date.now()}-${sequence}`,
    title: String(toast.title || ''),
    message: String(toast.message || ''),
    tone: ['success', 'warning', 'danger', 'info'].includes(toast.tone)
      ? toast.tone
      : 'info',
    duration: Number.isFinite(toast.duration) ? Math.max(0, toast.duration) : DEFAULT_DURATION,
    action: toast.action || null,
    createdAt: Date.now(),
    exiting: false,
  };
}

function ToastItem({ toast, dismiss }) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (paused || toast.duration === 0) return undefined;
    timerRef.current = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timerRef.current);
  }, [dismiss, paused, toast.createdAt, toast.duration, toast.id]);

  const icon = iconForTone[toast.tone] || Icons.bell;

  return (
    <article
      className={`sf-toast sf-toast-${toast.tone}${paused ? ' is-paused' : ''}${toast.exiting ? ' is-leaving' : ''}`}
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ '--sf-toast-duration': `${toast.duration}ms` }}
    >
      <span className="sf-toast-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="sf-toast-copy">
        {toast.title ? <strong>{toast.title}</strong> : null}
        {toast.message ? <p>{toast.message}</p> : null}
        {toast.action?.label ? (
          <button
            type="button"
            className="sf-toast-action"
            onClick={() => {
              toast.action.onClick?.();
              if (toast.action.dismiss !== false) dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="sf-toast-close"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        {Icons.x}
      </button>
      {toast.duration > 0 ? <span className="sf-toast-progress" aria-hidden="true" /> : null}
    </article>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const removalTimers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)),
    );
    if (removalTimers.current.has(id)) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      removalTimers.current.delete(id);
    }, 260);
    removalTimers.current.set(id, timer);
  }, []);

  const push = useCallback((input) => {
    const toast = normalizeToast(input);
    const pendingRemoval = removalTimers.current.get(toast.id);
    if (pendingRemoval) {
      window.clearTimeout(pendingRemoval);
      removalTimers.current.delete(toast.id);
    }
    setToasts((current) => [...current.filter((item) => item.id !== toast.id), toast].slice(-MAX_VISIBLE));
    return toast.id;
  }, []);

  const update = useCallback((id, patch) => {
    const pendingRemoval = removalTimers.current.get(id);
    if (pendingRemoval) {
      window.clearTimeout(pendingRemoval);
      removalTimers.current.delete(id);
    }
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id
          ? {
              ...toast,
              ...(typeof patch === 'function' ? patch(toast) : patch),
              id,
              createdAt: Date.now(),
              exiting: false,
            }
          : toast,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    removalTimers.current.forEach((timer) => window.clearTimeout(timer));
    removalTimers.current.clear();
    setToasts([]);
  }, []);

  useEffect(
    () => () => {
      removalTimers.current.forEach((timer) => window.clearTimeout(timer));
      removalTimers.current.clear();
    },
    [],
  );

  const value = useMemo(
    () => ({
      push,
      update,
      dismiss,
      clear,
      success: (message, options = {}) => push({ ...options, message, tone: 'success' }),
      warning: (message, options = {}) => push({ ...options, message, tone: 'warning' }),
      danger: (message, options = {}) => push({ ...options, message, tone: 'danger' }),
      info: (message, options = {}) => push({ ...options, message, tone: 'info' }),
    }),
    [clear, dismiss, push, update],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="sf-toast-viewport" aria-label="Notifications">
              {toasts.map((toast) => (
                <ToastItem key={`${toast.id}-${toast.createdAt}`} toast={toast} dismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

// This module intentionally keeps the provider and its tiny consumer hook together.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
