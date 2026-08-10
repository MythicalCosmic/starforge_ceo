import { cloneElement } from 'react';
import { Icons } from './Icons.jsx';
import { PageLoader } from './feedback.jsx';
import { useAppAvailability } from '../context/AvailabilityContext.jsx';
import '../styles/availability.css';

function PlaceholderCanvas() {
  return (
    <div className="sf-app-placeholder" aria-hidden="true">
      <div className="sf-app-placeholder-head"><i /><span /><span /></div>
      <div className="sf-app-placeholder-grid"><i /><i /><i /></div>
      <div className="sf-app-placeholder-table"><span /><span /><span /><span /></div>
    </div>
  );
}

export function ApplicationUnavailableState({
  label = 'This application',
  status = 'unavailable',
  warnings = [],
  onRetry,
  compact = false,
}) {
  const disabled = status === 'disabled';
  return (
    <section className={`sf-app-unavailable${compact ? ' is-compact' : ''}`} role="status">
      <PlaceholderCanvas />
      <div className="sf-app-unavailable-card">
        <span className="sf-app-unavailable-icon" aria-hidden="true">
          {cloneElement(disabled ? Icons.settings : Icons.shield, { size: 22 })}
        </span>
        <div>
          <span className="sf-app-unavailable-eyebrow">Application unavailable</span>
          <h2>{disabled ? `${label} is turned off` : `${label} is temporarily unavailable`}</h2>
          <p>
            {disabled
              ? 'This application has been disabled for your organization. No records were requested and no changes were made.'
              : 'A service required by this application is currently unavailable. Other areas of the leadership workspace remain available.'}
          </p>
          {warnings.length > 0 && <small>{warnings[0]}</small>}
        </div>
        {typeof onRetry === 'function' && <button type="button" onClick={() => void onRetry()}>Check again</button>}
      </div>
    </section>
  );
}

export function ApplicationDegradedNotice({ label, warnings = [] }) {
  return (
    <div className="sf-app-degraded" role="status">
      <span aria-hidden="true">{cloneElement(Icons.flag, { size: 16 })}</span>
      <span><strong>{label} is operating with limited supporting services</strong><small>{warnings[0] || 'Some connected actions may be unavailable.'}</small></span>
    </div>
  );
}

export function ApplicationGate({ apps, label, children }) {
  const availability = useAppAvailability(apps);
  if (availability.checking) return <PageLoader label={`Checking ${label || 'application'} availability…`} />;
  if (['disabled', 'unavailable'].includes(availability.status)) {
    return (
      <ApplicationUnavailableState
        label={label}
        status={availability.status}
        warnings={availability.warnings}
        onRetry={availability.retry}
      />
    );
  }
  return (
    <>
      {availability.status === 'degraded' && <ApplicationDegradedNotice label={label} warnings={availability.warnings} />}
      {children}
    </>
  );
}
