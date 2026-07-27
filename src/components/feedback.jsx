import { cloneElement } from 'react';
import { Icons } from './Icons.jsx';
import { SfStar } from './primitives.jsx';

export function PageLoader({ label = 'Preparing your workspace…' }) {
  return (
    <div className="sf-page-loader" role="status" aria-label={label}>
      <div className="sf-page-loader-mark" aria-hidden="true">
        <span className="sf-page-loader-orbit sf-page-loader-orbit-one" />
        <span className="sf-page-loader-orbit sf-page-loader-orbit-two" />
        <SfStar size={25} color="currentColor" />
      </div>
      <div className="sf-page-loader-copy">
        <strong>{label}</strong>
        <span>Bringing the right view into focus</span>
      </div>
      <div className="sf-page-loader-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function InlineLoader({ label = 'Updating view…' }) {
  return (
    <span className="sf-inline-loader" role="status">
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function Skeleton({ lines = 3, compact = false }) {
  return (
    <div className={`sf-skeleton${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          style={{ '--sf-skeleton-width': `${Math.max(38, 100 - index * 13)}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = Icons.trend,
  eyebrow = 'Ready when you are',
  title,
  description,
  action,
}) {
  return (
    <div className="sf-empty-state">
      <span className="sf-empty-state-icon" aria-hidden="true">
        {cloneElement(icon, { size: 21 })}
      </span>
      <div>
        <span className="sf-empty-state-eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="sf-empty-state-action">{action}</div> : null}
    </div>
  );
}
