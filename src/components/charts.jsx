import { cloneElement } from 'react';

export function Kpi({ label, value, accent, icon, sub }) {
  return (
    <div className="ad-kpi">
      <div className="ad-kpi-top">
        <span className="ad-kpi-label">{label}</span>
        {icon && (
          <span className="ad-kpi-icon" style={{ color: accent || 'var(--sf-muted)' }}>
            {cloneElement(icon, { size: 15 })}
          </span>
        )}
      </div>
      <div className="ad-kpi-row">
        <span className="sf-mono ad-kpi-v" style={{ color: accent || 'var(--sf-ink)' }}>
          {value ?? '—'}
        </span>
      </div>
      {sub && <div className="ad-kpi-sub">{sub}</div>}
    </div>
  );
}
