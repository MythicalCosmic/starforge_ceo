import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { Icons } from './Icons.jsx';
import { usePopover } from '../hooks/useOutsideClick.js';
import { formatBusinessNumber, toFiniteBusinessNumber } from '../lib/formatters.js';
import { findEnabledOptionIndex } from '../lib/listboxNavigation.js';
import '../styles/executive-v3.css';

const EMPTY = '\u2014';

function finite(value) {
  return toFiniteBusinessNumber(value);
}

function formatValue(value, formatter) {
  if (formatter) return formatter(value);
  const number = finite(value);
  return number == null ? EMPTY : formatBusinessNumber(number, { maximumFractionDigits: 1 });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ExecutiveSelect({ label, value, options, onChange, hint, className = '' }) {
  const listId = useId();
  const labelId = useId();
  const valueId = useId();
  const { open, setOpen, close, ref, triggerRef } = usePopover(false);
  const optionRefs = useRef([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex] || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  const choose = (option) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const move = (index) => {
    if (!options.length) return;
    const direction = index >= activeIndex ? 1 : -1;
    const next = findEnabledOptionIndex(options, index, direction);
    if (next >= 0) setActiveIndex(next);
  };

  const onTriggerKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const requested = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : clamp(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1), 0, options.length - 1);
    const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
    const next = findEnabledOptionIndex(options, requested, direction);
    if (next >= 0) setActiveIndex(next);
    setOpen(true);
  };

  const onOptionKeyDown = (event, index) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[index]);
    }
  };

  return (
    <div className={`ex-select ${open ? 'is-open' : ''} ${className}`.trim()} ref={ref}>
      <span className="ex-select-label" id={labelId}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span id={valueId}>{selected?.label || '—'}</span>
        {cloneElement(Icons.chevR, { size: 15 })}
      </button>
      {hint && <small>{hint}</small>}
      {open && (
        <div className="ex-select-popover" id={listId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              ref={(node) => { optionRefs.current[index] = node; }}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              disabled={option.disabled}
              key={option.value}
              onClick={() => choose(option)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
              {String(option.value) === String(value) && cloneElement(Icons.check, { size: 14 })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartCard({ eyebrow, title, description, action, legend, children, className = '' }) {
  const headingId = useId();
  return (
    <section className={`ex-chart-card ${className}`.trim()} aria-labelledby={headingId}>
      <header className="ex-chart-head">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action && <div className="ex-chart-action">{action}</div>}
      </header>
      {legend?.length > 0 && (
        <div className="ex-chart-legend" aria-label="Chart legend">
          {legend.map((item) => (
            <span key={item.label}>
              <i style={{ '--legend-color': item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className="ex-chart-body">{children}</div>
    </section>
  );
}

export function ChartEmpty({ children = 'There is not enough recorded activity for this chart yet.' }) {
  return (
    <div className="ex-chart-empty" role="status">
      <span aria-hidden="true">{cloneElement(Icons.trend, { size: 19 })}</span>
      <strong>No chartable records in this view</strong>
      <small>{children}</small>
    </div>
  );
}

export function ChartLoading({ label = 'Loading verified chart data' }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4_000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="ex-chart-loading" role="status" aria-live="polite">
      <div className="ex-chart-loading-copy">
        <span aria-hidden="true">{cloneElement(Icons.trend, { size: 17 })}</span>
        <span><strong>{label}</strong><small>{slow ? 'The live service is responding slowly; this request is still bounded and safe to retry.' : 'Requesting current, permission-scoped information…'}</small></span>
      </div>
      <div className="ex-chart-loading-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    </div>
  );
}

export function ChartState({ states = [], label, children }) {
  const active = states.filter((state) => state?.enabled !== false);
  if (states.length && !active.length) return <ChartLoading label={label} />;
  const pending = active.some((state) => state?.pending && state?.data == null);
  const failure = active.find((state) => (state?.error || state?.paused) && state?.data == null);
  if (pending) return <ChartLoading label={label} />;
  if (failure) {
    return (
      <div className="ex-chart-failure" role="alert">
        <span aria-hidden="true">{cloneElement(Icons.flag, { size: 19 })}</span>
        <strong>{failure.paused ? 'This chart is waiting for a connection' : 'This chart could not reach the live service'}</strong>
        <small>No zero or empty result has been inferred.</small>
        <button type="button" onClick={() => failure.retry?.()}>Try again</button>
      </div>
    );
  }
  return children;
}

export function RankedBars({ data, valueKey = 'value', labelKey = 'label', formatter, max, onSelect }) {
  const visible = (data || []).filter((item) => finite(item?.[valueKey]) != null);
  const ceiling = finite(max) ?? Math.max(0, ...visible.map((item) => finite(item[valueKey]) || 0));
  if (!visible.length || ceiling <= 0) return <ChartEmpty />;

  return (
    <div className="ex-ranked-bars">
      {visible.map((item, index) => {
        const value = finite(item[valueKey]) || 0;
        const width = Math.max(value > 0 ? 2 : 0, Math.min(100, (value / ceiling) * 100));
        const content = (
          <>
            <span className="ex-ranked-label">
              <b>{item.rank ?? index + 1}</b>
              <span>
                <strong>{item[labelKey]}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
            </span>
            <span className="ex-ranked-value">{formatValue(value, formatter)}</span>
            {item.metrics?.length > 0 && (
              <span className="ex-ranked-metrics">
                {item.metrics.map((metric) => (
                  <span key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></span>
                ))}
              </span>
            )}
            <span className="ex-ranked-track" aria-hidden="true">
              <i style={{ '--bar-width': `${width}%`, '--bar-color': item.color }} />
            </span>
            {onSelect && <span className="ex-ranked-open" aria-hidden="true">Open {cloneElement(Icons.chevR, { size: 13 })}</span>}
          </>
        );
        return onSelect ? (
          <button type="button" onClick={() => onSelect(item)} key={item.id ?? item[labelKey]} aria-label={`Open ${item[labelKey]}, ${formatValue(value, formatter)}`}>
            {content}
          </button>
        ) : (
          <div key={item.id ?? item[labelKey]}>{content}</div>
        );
      })}
    </div>
  );
}

export function ComparisonBars({ data, formatter, onSelect }) {
  const visible = (data || []).filter((item) => finite(item?.value) != null);
  const maximum = Math.max(0, ...visible.map((item) => Math.abs(finite(item.value) || 0)));
  if (!visible.length || maximum <= 0) return <ChartEmpty />;
  return (
    <div className="ex-comparison-bars">
      {visible.map((item) => {
        const value = finite(item.value) || 0;
        const content = (
          <>
            <span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>
            <span className="ex-comparison-column" aria-hidden="true">
              <i style={{ '--bar-height': `${Math.max(4, Math.abs(value) / maximum * 100)}%`, '--bar-color': item.color }} />
            </span>
            <b>{formatValue(value, formatter)}</b>
            <span className="ex-chart-tooltip" role="tooltip">{item.detail || item.label}<strong>{formatValue(value, formatter)}</strong></span>
          </>
        );
        return onSelect ? (
          <button type="button" key={item.label} onClick={() => onSelect(item)} aria-label={`${item.label}: ${formatValue(value, formatter)}`}>{content}</button>
        ) : (
          <div key={item.label} tabIndex="0" aria-label={`${item.label}: ${formatValue(value, formatter)}`}>{content}</div>
        );
      })}
    </div>
  );
}

export function PeriodBars({ data, formatter, onSelect }) {
  const visible = (data || []).filter((item) => finite(item?.value) != null);
  const maximum = Math.max(0, ...visible.map((item) => finite(item.value) || 0));
  if (!visible.length || maximum <= 0) return <ChartEmpty />;
  return (
    <div className="ex-period-scroll" role="region" aria-label="Scrollable discrete period comparison" tabIndex="0">
      <div className="ex-period-bars" style={{ '--period-count': visible.length }}>
        {visible.map((item) => {
          const value = finite(item.value) || 0;
          const content = (
            <>
              <strong>{formatValue(value, formatter)}</strong>
              <span className="ex-period-column" aria-hidden="true"><i style={{ '--bar-height': `${Math.max(3, value / maximum * 100)}%`, '--bar-color': item.color }} /></span>
              <small>{item.label}</small>
              <span className="ex-chart-tooltip" role="tooltip">{item.detail || item.label}<strong>{formatValue(value, formatter)}</strong></span>
            </>
          );
          return onSelect ? (
            <button type="button" key={item.key ?? item.label} onClick={() => onSelect(item)} aria-label={`${item.label}: ${formatValue(value, formatter)}`}>{content}</button>
          ) : (
            <div key={item.key ?? item.label} tabIndex="0" aria-label={`${item.label}: ${formatValue(value, formatter)}`}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export function SegmentedBreakdown({ data, formatter, onSelect }) {
  const visible = (data || []).filter((item) => (finite(item?.value) || 0) > 0);
  const total = visible.reduce((result, item) => result + (finite(item.value) || 0), 0);
  if (!total) return <ChartEmpty />;
  return (
    <div className="ex-segmented-list">
      {visible.map((item) => {
        const value = finite(item.value) || 0;
        const share = value / total * 100;
        const content = (
          <>
            <span className="ex-segmented-name"><i style={{ '--segment-color': item.color }} /><strong>{item.label}</strong></span>
            <span className="ex-segmented-numbers"><b>{formatValue(value, formatter)}</b><small>{formatBusinessNumber(share, { maximumFractionDigits: 1 })}%</small></span>
            <span className="ex-segmented-track" aria-hidden="true"><i style={{ '--segment-width': `${share}%`, '--segment-color': item.color }} /></span>
            {onSelect && <span className="ex-segmented-open" aria-hidden="true">Explore {cloneElement(Icons.chevR, { size: 13 })}</span>}
          </>
        );
        return onSelect ? (
          <button type="button" key={item.label} onClick={() => onSelect(item)} aria-label={`${item.label}: ${formatValue(value, formatter)}, ${formatBusinessNumber(share, { maximumFractionDigits: 1 })} percent`}>{content}</button>
        ) : (
          <div key={item.label}>{content}</div>
        );
      })}
    </div>
  );
}

export function DonutBreakdown({ data, centerValue, centerLabel, formatter }) {
  const visible = (data || []).filter((item) => (finite(item.value) || 0) > 0);
  const total = visible.reduce((sum, item) => sum + (finite(item.value) || 0), 0);
  if (!total) return <ChartEmpty />;
  let consumed = 0;
  const stops = visible.map((item) => {
    const start = consumed / total * 100;
    consumed += finite(item.value) || 0;
    const end = consumed / total * 100;
    return `${item.color || 'var(--sf-primary)'} ${start}% ${end}%`;
  });
  return (
    <div className="ex-donut-layout">
      <div className="ex-donut" style={{ '--donut-segments': `conic-gradient(${stops.join(',')})` }}>
        <span><strong>{centerValue ?? formatValue(total, formatter)}</strong><small>{centerLabel || 'total'}</small></span>
      </div>
      <dl>
        {visible.map((item) => (
          <div key={item.label}>
            <dt><i style={{ '--legend-color': item.color }} />{item.label}</dt>
            <dd>{formatValue(item.value, formatter)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ActivityHeatmap({ rows, columns, value, label, formatter, onSelect }) {
  const cells = (rows || []).flatMap((row) => (columns || []).map((column) => finite(value(row, column)) || 0));
  const maximum = Math.max(0, ...cells);
  if (!rows?.length || !columns?.length) return <ChartEmpty />;
  return (
    <div className="ex-heatmap-scroll" role="region" aria-label="Scrollable comparison table" tabIndex="0">
      <div className="ex-heatmap" style={{ '--heatmap-columns': columns.length }}>
        <span />
        {columns.map((column) => <b key={column.key}>{column.label}</b>)}
        {rows.map((row) => (
          <div className="ex-heatmap-row" key={row.id ?? row.label}>
            <strong>{row.label}</strong>
            {columns.map((column) => {
              const cell = finite(value(row, column)) || 0;
              const intensity = maximum > 0 ? Math.max(0.08, cell / maximum) : 0.04;
              const fillStrength = Math.round(intensity * 72);
              const borderStrength = Math.round(intensity * 30);
              const content = label ? label(cell, row, column) : formatValue(cell, formatter);
              const cellStyle = {
                '--cell-fill': `color-mix(in srgb, var(--sf-primary) ${fillStrength}%, var(--sf-surface))`,
                '--cell-border': `color-mix(in srgb, var(--sf-primary) ${borderStrength}%, var(--sf-border))`,
              };
              return onSelect ? (
                <button
                  key={column.key}
                  type="button"
                  style={cellStyle}
                  onClick={() => onSelect(row, column, cell)}
                  aria-label={`${row.label}, ${column.label}: ${formatValue(cell, formatter)}`}
                >{content}<span className="ex-cell-tooltip" role="tooltip">{row.label} · {column.label}<strong>{formatValue(cell, formatter)}</strong></span></button>
              ) : (
                <span key={column.key} style={cellStyle} title={`${row.label}, ${column.label}: ${formatValue(cell, formatter)}`}>{content}</span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
