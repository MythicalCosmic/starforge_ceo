import { cloneElement } from 'react';
import { Icons } from './Icons.jsx';
import { SfAvatar } from './primitives.jsx';
import { formatBusinessNumber, formatOrganizationDate } from '../lib/formatters.js';
import { ApplicationUnavailableState } from './AvailabilityState.jsx';
import { isServiceUnavailable } from '../lib/appAvailability.js';
import { supportReference, userFacingError } from '../lib/userFacingError.js';

export function RouteLink({ to, onNav, children, className = '', ...props }) {
  return (
    <a
      {...props}
      className={className}
      href={`/${String(to || '').replace(/^\/+/, '')}`}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self')) return;
        event.preventDefault();
        if (typeof onNav === 'function') onNav(to);
        else if (typeof window !== 'undefined') window.location.assign(`/${String(to || '').replace(/^\/+/, '')}`);
      }}
    >
      {children}
    </a>
  );
}

export function WorkspaceHeader({ eyebrow, title, description, actions, status }) {
  return (
    <header className="fw-head">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="fw-head-actions">{actions}</div>}
      {status && <div className="fw-head-status">{status}</div>}
    </header>
  );
}

export function SectionNav({ label, items, active, basePath, onNav }) {
  return (
    <nav className="fw-section-nav" aria-label={`${label} sections`}>
      <span>{label}</span>
      <div>
        {items.map((item) => (
          <RouteLink aria-current={item.id === active ? 'page' : undefined} title={item.description} className={item.id === active ? 'is-active' : ''} to={`${basePath}/${item.id}`} onNav={onNav} key={item.id}>
            <span aria-hidden="true">{cloneElement(item.icon || Icons.doc, { size: 15 })}</span>
            <strong>{item.label}</strong>
          </RouteLink>
        ))}
      </div>
    </nav>
  );
}

export function WorkspaceLayout({ navigation, children }) {
  return <div className={`fw-layout${navigation ? ' has-nav' : ''}`}>{navigation}<div className="fw-layout-content">{children}</div></div>;
}

export function FilterPanel({ title = 'Filters', children, primary, actions, activeCount = 0, advancedCount = 0, advancedLabel = 'More filters' }) {
  const progressive = primary != null;
  return (
    <section className={`fw-filters${progressive ? ' is-progressive' : ''}`} aria-label={title}>
      <header>
        <span aria-hidden="true">{cloneElement(Icons.filter, { size: 15 })}</span>
        <strong>{title}</strong>
        {activeCount > 0 && <b>{activeCount} active</b>}
      </header>
      <div className="fw-filter-fields">{progressive ? primary : children}</div>
      {actions && <footer>{actions}</footer>}
      {progressive && (
        <details className="fw-filter-disclosure" open={advancedCount > 0 || undefined}>
          <summary>
            <span>{advancedLabel}</span>
            {advancedCount > 0 && <b>{advancedCount} active</b>}
            <span aria-hidden="true">{cloneElement(Icons.chevR, { size: 14 })}</span>
          </summary>
          <div className="fw-filter-fields">{children}</div>
        </details>
      )}
    </section>
  );
}

export function FilterField({ label, children, wide = false }) {
  return <label className={wide ? 'is-wide' : ''}><span>{label}</span>{children}</label>;
}

export function ActionButton({ children, icon, tone = 'soft', ...props }) {
  return <button type="button" className={`fw-action is-${tone}`} {...props}>{icon && cloneElement(icon, { size: 15 })}{children}</button>;
}

export function LinkButton({ children, icon, tone = 'soft', to, onNav, ...props }) {
  return <RouteLink {...props} className={`fw-action is-${tone}`} to={to} onNav={onNav}>{icon && cloneElement(icon, { size: 15 })}{children}</RouteLink>;
}

export function WorkspaceState({ state, empty = false, emptyTitle = 'No records match this view', emptyBody = 'Try adjusting the filters.', applicationLabel = 'This application', children }) {
  if (state?.paused && !state?.rows?.length && !state?.data) {
    return <div className="fw-state" role="status"><span>{cloneElement(Icons.flag, { size: 20 })}</span><strong>You are offline</strong><p>Reconnect to prepare this view.</p></div>;
  }
  if (state?.pending) {
    return <div className="fw-state is-loading" role="status" aria-label="Preparing this view"><div className="fw-loading-copy"><strong>Preparing this view</strong><small>Requesting current information from the live service…</small></div><i /><i /><i /><i /></div>;
  }
  if (state?.error && !state?.rows?.length && !state?.data) {
    if (isServiceUnavailable(state.error)) {
      return <ApplicationUnavailableState label={applicationLabel} status="unavailable" onRetry={state.retry} compact />;
    }
    const reference = supportReference(state.error);
    return <div className="fw-state" role="alert"><span>{cloneElement(Icons.flag, { size: 20 })}</span><strong>This view could not be opened</strong><p>{userFacingError(state.error)}</p>{reference && <small>Support reference {reference}</small>}<ActionButton onClick={state.retry}>Try again</ActionButton></div>;
  }
  if (empty) {
    return <div className="fw-state"><span>{cloneElement(Icons.search, { size: 20 })}</span><strong>{emptyTitle}</strong><p>{emptyBody}</p></div>;
  }
  return children;
}

export function CoverageBar({ state, label = 'records', filtered = false, pageLimited = false }) {
  if (state.pending && !state.rows.length) {
    return <div className="fw-coverage is-partial" role="status"><span>{cloneElement(Icons.trend, { size: 13 })}</span><span><strong>Loading {label}</strong><small>Coverage will be confirmed before totals are treated as complete.</small></span></div>;
  }
  if ((state.error || state.paused) && !state.rows.length) {
    return <div className="fw-coverage is-partial" role="status"><span>{cloneElement(Icons.flag, { size: 13 })}</span><span><strong>{label.charAt(0).toUpperCase() + label.slice(1)} coverage unavailable</strong><small>No empty or complete conclusion is drawn from this view.</small></span></div>;
  }
  return (
    <div className={`fw-coverage${!state.complete ? ' is-partial' : ''}`}>
      <span>{cloneElement(state.complete ? Icons.check : Icons.flag, { size: 13 })}</span>
      <span>
        <strong>{formatBusinessNumber(state.rows.length)} of {formatBusinessNumber(state.total)} {label} loaded</strong>
        <small>{state.complete
          ? (filtered ? 'All loaded records can be filtered and exported.' : 'Complete current register.')
          : pageLimited
            ? 'The register total is exact; cards and downloads contain only this page.'
            : 'Totals and client-side breakdowns are limited to loaded records.'}</small>
      </span>
      {state.updatedAt && <time>{formatOrganizationDate(state.updatedAt)}</time>}
    </div>
  );
}

function paginationItems(page, pages) {
  const visible = new Set([1, pages, page - 1, page, page + 1]);
  const numbers = [...visible]
    .filter((value) => value >= 1 && value <= pages)
    .sort((left, right) => left - right);
  return numbers.flatMap((value, index) => {
    const previous = numbers[index - 1];
    return index > 0 && value - previous > 1
      ? [`gap-${previous}-${value}`, value]
      : [value];
  });
}

export function WorkspacePagination({ label = 'records', page = 1, pages = 1, total = 0, loading = false, onPage }) {
  const pageCount = Math.max(1, Number(pages) || 1);
  if (pageCount <= 1) return null;
  const currentPage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  const items = paginationItems(currentPage, pageCount);
  const selectPage = (nextPage) => {
    if (!loading && nextPage !== currentPage) onPage?.(nextPage);
  };

  return (
    <nav className="fw-pagination" aria-label={`${label} pages`}>
      <p>
        <strong>{formatBusinessNumber(total)} {label}</strong>
        <span>Page {formatBusinessNumber(currentPage)} of {formatBusinessNumber(pageCount)}</span>
      </p>
      <div>
        <button type="button" disabled={loading || currentPage <= 1} onClick={() => selectPage(currentPage - 1)} aria-label={`Previous ${label} page`}><span aria-hidden="true">&lsaquo;</span></button>
        {items.map((item) => typeof item === 'string'
          ? <span key={item} aria-hidden="true">&hellip;</span>
          : <button type="button" className={item === currentPage ? 'is-current' : ''} disabled={loading} aria-current={item === currentPage ? 'page' : undefined} aria-label={`${label} page ${item}`} onClick={() => selectPage(item)} key={item}>{formatBusinessNumber(item)}</button>)}
        <button type="button" disabled={loading || currentPage >= pageCount} onClick={() => selectPage(currentPage + 1)} aria-label={`Next ${label} page`}>{cloneElement(Icons.chevR, { size: 15 })}</button>
      </div>
    </nav>
  );
}

function cellValue(row, column) {
  if (column.render) return column.render(row);
  const value = String(column.key || '').split('.').reduce((current, key) => current?.[key], row);
  if (value == null || value === '') return '\u2014';
  if (Array.isArray(value)) return value.join(', ') || '\u2014';
  return String(value);
}

function accessibleRowLabel(row, column, index, rowLabel) {
  if (typeof rowLabel === 'function') return String(rowLabel(row, index) || `record ${index + 1}`);
  if (typeof rowLabel === 'string' && row?.[rowLabel] != null) return String(row[rowLabel]);
  if (!column.render) return cellValue(row, column);
  const fallback = row?.full_name ?? row?.name ?? row?.number ?? row?.title ?? row?.student_id ?? row?.username ?? row?.id;
  return fallback == null ? `record ${index + 1}` : String(fallback);
}

export function WorkspaceTable({ label, columns, rows, rowKey = 'id', rowLabel, rowClassName, onOpen, empty = 'No loaded records in this view.' }) {
  if (!rows.length) return <div className="fw-table-empty">{empty}</div>;
  return (
    <div
      className="fw-table-wrap"
      role="region"
      aria-label={`${label}, scrollable table`}
      tabIndex="0"
    >
      <table className={onOpen ? 'is-interactive' : ''}>
        <caption>{label}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key || column.label}>{column.label}</th>)}{onOpen && <th><span className="fw-sr">Open</span></th>}</tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const key = row?.[rowKey] ?? index;
            return (
              <tr key={key} className={typeof rowClassName === 'function' ? rowClassName(row, index) : rowClassName}>
                {columns.map((column) => <td data-label={column.label} key={column.key || column.label}>{cellValue(row, column)}</td>)}
                {onOpen && <td><button type="button" onClick={() => onOpen(row)} aria-label={`Open ${accessibleRowLabel(row, columns[0], index, rowLabel)}`}>{cloneElement(Icons.chevR, { size: 15 })}</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProfileHero({ name, eyebrow, meta, actions, children }) {
  return (
    <header className="fw-profile-hero">
      <SfAvatar name={name || 'Record'} size={64} decorative />
      <div><span>{eyebrow}</span><h1>{name || 'Record details'}</h1><div className="fw-profile-meta">{meta}</div></div>
      {actions && <div className="fw-profile-actions">{actions}</div>}
      {children}
    </header>
  );
}

export function DetailSection({ eyebrow, title, description, children, className = '' }) {
  return (
    <section className={`fw-detail-section ${className}`.trim()}>
      <header><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div></header>
      <div className="fw-detail-body">{children}</div>
    </section>
  );
}

export function DetailGrid({ fields, columns = 3 }) {
  return (
    <dl className="fw-detail-grid" style={{ '--detail-columns': columns }}>
      {fields.map((field) => (
        <div className={field.wide ? 'is-wide' : ''} key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value == null || field.value === '' ? '\u2014' : field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusPill({ value, tone }) {
  const normalized = String(value || 'unknown').toLowerCase();
  const resolved = tone || (['active', 'paid', 'present', 'approved', 'published'].includes(normalized)
    ? 'success'
    : ['overdue', 'blocked', 'rejected', 'absent', 'high'].includes(normalized)
      ? 'danger'
      : ['issued', 'pending', 'late', 'medium'].includes(normalized)
        ? 'warn'
        : 'neutral');
  return <span className={`fw-status is-${resolved}`}><i />{normalized.replaceAll('_', ' ')}</span>;
}
