import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { Icons } from './Icons.jsx';
import { RouteLink, StatusPill } from './WorkspacePrimitives.jsx';
import { studentStatusPresentation } from '../lib/peoplePresentation.js';

export function StudentStatus({ value }) {
  const status = studentStatusPresentation(value);
  return <StatusPill value={status.label} tone={status.tone} />;
}

export function WorkspaceTabs({ label, items, active, basePath, onNav }) {
  return (
    <nav className="fw-workspace-tabs" aria-label={`${label} sections`}>
      <div>
        {items.map((item) => (
          <RouteLink
            className={item.id === active ? 'is-active' : ''}
            to={`${basePath}/${item.id}`}
            onNav={onNav}
            aria-current={item.id === active ? 'page' : undefined}
            key={item.id}
          >
            <span aria-hidden="true">{cloneElement(item.icon || Icons.doc, { size: 15 })}</span>
            <strong>{item.label}</strong>
          </RouteLink>
        ))}
      </div>
    </nav>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function canonicalRouteFilterValue(value) {
  return String(value ?? '').trim();
}

// Kept independent from React so the timing and cancellation contract can be
// exercised directly. Updating the callback lets a pending search commit into
// the newest set of URL filters instead of restoring a stale render.
// eslint-disable-next-line react-refresh/only-export-components
export function createDeferredRouteCommitter(onCommit, delay = 320) {
  let callback = onCommit;
  let committedValue = Symbol('uncommitted');
  let pendingValue = '';
  let timer = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const commit = (value) => {
    cancel();
    pendingValue = canonicalRouteFilterValue(value);
    if (pendingValue === committedValue) return;
    committedValue = pendingValue;
    callback(pendingValue);
  };

  return {
    cancel,
    flush(value = pendingValue) {
      commit(value);
    },
    schedule(value) {
      cancel();
      pendingValue = value;
      timer = setTimeout(() => commit(pendingValue), delay);
    },
    sync(value) {
      cancel();
      pendingValue = canonicalRouteFilterValue(value);
      committedValue = pendingValue;
    },
    update(nextCallback) {
      callback = nextCallback;
    },
  };
}

export function DeferredFilterInput({
  value,
  onCommit,
  debounceMs = 320,
  onBlur,
  onChange,
  onCompositionEnd,
  onCompositionStart,
  onKeyDown,
  type = 'text',
  ...props
}) {
  const externalValue = String(value ?? '');
  const [draft, setDraft] = useState(externalValue);
  const draftRef = useRef(externalValue);
  const externalRef = useRef(externalValue);
  const commitRef = useRef(onCommit);
  const applyingRef = useRef(null);
  const composingRef = useRef(false);
  const committerRef = useRef(null);
  const hintId = useId();

  externalRef.current = externalValue;
  commitRef.current = onCommit;
  applyingRef.current = (nextValue) => {
    if (draftRef.current !== nextValue) {
      draftRef.current = nextValue;
      setDraft(nextValue);
    }
    if (nextValue !== canonicalRouteFilterValue(externalRef.current)) {
      commitRef.current(nextValue);
    }
  };
  if (!committerRef.current) {
    committerRef.current = createDeferredRouteCommitter(
      (nextValue) => applyingRef.current(nextValue),
      debounceMs,
    );
  }
  committerRef.current.update((nextValue) => applyingRef.current(nextValue));

  useEffect(() => {
    committerRef.current.sync(externalValue);
    draftRef.current = externalValue;
    setDraft(externalValue);
  }, [externalValue]);

  useEffect(() => () => committerRef.current.cancel(), []);

  const schedule = (nextValue) => {
    draftRef.current = nextValue;
    setDraft(nextValue);
    if (!composingRef.current) committerRef.current.schedule(nextValue);
  };
  const describedBy = [props['aria-describedby'], hintId].filter(Boolean).join(' ');
  const searchInput = type === 'search';

  return (
    <>
      <input
        {...props}
        type={type}
        value={draft}
        aria-describedby={describedBy}
        autoComplete={props.autoComplete ?? (searchInput ? 'off' : undefined)}
        enterKeyHint={props.enterKeyHint ?? (searchInput ? 'search' : undefined)}
        spellCheck={props.spellCheck ?? (searchInput ? false : undefined)}
        onChange={(event) => {
          schedule(event.target.value);
          onChange?.(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.defaultPrevented) committerRef.current.flush(draftRef.current);
        }}
        onCompositionStart={(event) => {
          composingRef.current = true;
          committerRef.current.cancel();
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          schedule(event.currentTarget.value);
          onCompositionEnd?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === 'Enter' && !event.defaultPrevented && !composingRef.current && !event.nativeEvent?.isComposing) {
            event.preventDefault();
            committerRef.current.flush(draftRef.current);
          }
        }}
      />
      <span className="fw-sr" id={hintId}>Results update after a short pause. Press Enter or leave this field to update now.</span>
    </>
  );
}

export function ProgressiveFilters({
  title,
  primary,
  advanced,
  advancedActiveCount = 0,
  actions,
}) {
  const regionId = useId();
  const [open, setOpen] = useState(advancedActiveCount > 0);

  useEffect(() => {
    if (advancedActiveCount > 0) setOpen(true);
  }, [advancedActiveCount]);

  return (
    <section className={`fw-progressive-filters${open ? ' is-open' : ''}`} aria-label={title}>
      <div className="fw-filter-bar">
        <div className="fw-filter-title">
          <span aria-hidden="true">{cloneElement(Icons.search, { size: 16 })}</span>
          <strong>{title}</strong>
        </div>
        <div className="fw-filter-primary">{primary}</div>
        <div className="fw-filter-actions">
          <button
            type="button"
            className="fw-filter-toggle"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((current) => !current)}
          >
            {cloneElement(Icons.filter, { size: 14 })}
            <span>{open ? 'Fewer filters' : 'More filters'}</span>
            {advancedActiveCount > 0 && <b aria-label={`${advancedActiveCount} advanced filters active`}>{advancedActiveCount}</b>}
            <i aria-hidden="true">{cloneElement(Icons.chevR, { size: 13 })}</i>
          </button>
          {actions}
        </div>
      </div>
      {open && (
        <div className="fw-filter-reveal" id={regionId}>
          <div className="fw-filter-advanced">{advanced}</div>
        </div>
      )}
    </section>
  );
}
