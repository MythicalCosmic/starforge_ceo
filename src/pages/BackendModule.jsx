import { cloneElement, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '../components/common.jsx';
import { Icons } from '../components/Icons.jsx';
import { Button, Pill, SfAvatar } from '../components/primitives.jsx';
import {
  normalizeApiCollection,
  useApiDetail,
  useApiResource,
} from '../hooks/useApiResource.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { isMissing, statusTone } from '../lib/resourcePresentation.js';
import { hasDeclaredAccess } from '../lib/permissions.js';
import {
  formatBusinessMoney,
  formatBusinessNumber,
  formatOrganizationDate,
  formatOrganizationTime,
  toFiniteBusinessNumber,
} from '../lib/formatters.js';
import { managementQueryState } from '../lib/managementQuery.js';
import { safeDocumentUrl } from '../lib/safeExternalUrl.js';
import '../styles/resource-v2.css';

const EMPTY = '\u2014';
const SKELETON_ROWS = ['one', 'two', 'three', 'four', 'five'];

function businessCopy(value) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/\bcanonical backend directories\b/gi, 'official directories')
    .replace(/\breported by the backend\b/gi, 'recorded across the organization')
    .replace(/\bpermission-scoped\b/gi, 'access-appropriate')
    .replace(/\bresource operations\b/gi, 'Knowledge operations')
    .replace(/\brequest id\b/gi, 'Reference')
    .replace(/\bresource id\b/gi, 'Reference')
    .replace(/\bresource type\b/gi, 'Area')
    .replace(/\bchild resource\b/gi, 'supporting information')
    .replace(/\bserver[- ]side\b/gi, 'company-wide')
    .replace(/\blive api\b/gi, 'current information')
    .replace(/\bendpoint\b/gi, 'area')
    .replace(/\bbackend\b/gi, 'organization')
    .replace(/\bapi\b/gi, 'workspace')
    .replace(/\bresources\b/gi, 'items')
    .replace(/\bresource\b/gi, 'item')
    .replace(/\btenant\b/gi, 'organization')
    .replace(/\bmetadata\b/gi, 'context')
    .replace(/This is not a simulated chatbot\./gi, 'Every figure reflects recorded activity.');
}

function getValue(row, key) {
  if (!row || !key) return undefined;
  return key.split('.').reduce((value, part) => value?.[part], row);
}

function Glyph({ icon, size = 18, className = '' }) {
  return (
    <span className={`rv2-glyph ${className}`.trim()} aria-hidden="true">
      {cloneElement(icon, { size })}
    </span>
  );
}

const RouteLink = forwardRef(function RouteLink(
  { route, onFollow, children, ...props },
  ref,
) {
  return (
    <a
      {...props}
      ref={ref}
      href={`#/${route}`}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onFollow();
      }}
    >
      {children}
    </a>
  );
});

function formatDate(value, dateOnly = false) {
  return formatOrganizationDate(value, { dateOnly }) || EMPTY;
}

function formatMoney(value, currency) {
  return formatBusinessMoney(value, currency) || EMPTY;
}

function formatBytes(value) {
  if (isMissing(value)) return EMPTY;
  const bytes = toFiniteBusinessNumber(value);
  if (bytes == null || bytes < 0) return EMPTY;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && scaled >= 1024; index += 1) {
    scaled /= 1024;
    unit = units[index];
  }
  return `${scaled.toFixed(scaled >= 10 ? 1 : 2)} ${unit}`;
}

function objectLabel(value, field) {
  if (!value || typeof value !== 'object') return String(value ?? EMPTY);
  const keys = field?.itemKeys || ['name', 'title', 'label', 'code', 'reason', 'status'];
  const parts = keys
    .map((key) => value[key])
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map(String);
  return parts.length ? parts.join(' \u2014 ') : 'Additional information';
}

function textValue(value, field, detail) {
  if (value === undefined || value === null || value === '') return EMPTY;
  if (Array.isArray(value)) {
    if (!value.length) return EMPTY;
    return value.map((item) => objectLabel(item, field)).join(', ');
  }
  if (typeof value === 'object') return objectLabel(value, field);
  const text = String(value);
  if (detail || field.format === 'longText' || text.length <= 90) return text;
  return `${text.slice(0, 87)}\u2026`;
}

export function RenderedValue({ field, row, detail = false, links = true }) {
  const value = getValue(row, field.key);

  if (field.format === 'person') {
    if (isMissing(value)) return EMPTY;
    const secondary = getValue(row, field.secondaryKey);
    return (
      <span className="rv2-person">
        <SfAvatar name={String(value)} size={detail ? 38 : 32} decorative />
        <span>
          <strong>{String(value)}</strong>
          {!isMissing(secondary) && <small>{String(secondary)}</small>}
        </span>
      </span>
    );
  }

  if (field.format === 'status') {
    if (value === undefined || value === null || value === '') return EMPTY;
    return <Pill tone={statusTone(value)} dot>{String(value).replaceAll('_', ' ')}</Pill>;
  }
  if (field.format === 'boolean') {
    if (isMissing(value)) return EMPTY;
    return <Pill tone={value ? 'success' : 'neutral'}>{value ? 'Yes' : 'No'}</Pill>;
  }
  if (field.format === 'datetime') return formatDate(value);
  if (field.format === 'date') return formatDate(value, true);
  if (field.format === 'money') {
    const explicitCurrency = /(?:^|_)uzs(?:_|$)/i.test(String(field.key || '')) ? 'UZS' : undefined;
    return <span className="sf-mono">{formatMoney(value, explicitCurrency)}</span>;
  }
  if (field.format === 'bytes') return <span className="sf-mono">{formatBytes(value)}</span>;
  if (field.format === 'minutes') {
    const numeric = toFiniteBusinessNumber(value);
    return numeric == null ? EMPTY : `${formatBusinessNumber(numeric)} min`;
  }
  if (field.format === 'percent') {
    if (isMissing(value)) return EMPTY;
    const numeric = toFiniteBusinessNumber(value);
    const scale = toFiniteBusinessNumber(field.scale ?? 1);
    if (numeric == null || scale == null) return EMPTY;
    const scaled = numeric * scale;
    if (!Number.isFinite(scaled)) return EMPTY;
    const formatted = formatBusinessNumber(scaled, {
      minimumFractionDigits: scaled % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    });
    return <span className="sf-mono">{formatted}%</span>;
  }
  if (field.format === 'number') {
    if (value === undefined || value === null || value === '') return EMPTY;
    const numeric = toFiniteBusinessNumber(value);
    return <span className="sf-mono">{numeric == null ? EMPTY : formatBusinessNumber(numeric)}</span>;
  }
  if (field.format === 'id') {
    return value === undefined || value === null || value === ''
      ? EMPTY
      : <span className="sf-mono">#{String(value)}</span>;
  }
  if (field.format === 'count') {
    if (isMissing(value)) return EMPTY;
    const count = Array.isArray(value)
      ? value.length
      : value && typeof value === 'object'
        ? Object.keys(value).length
        : toFiniteBusinessNumber(value);
    return <span className="sf-mono">{count == null ? EMPTY : formatBusinessNumber(count)}</span>;
  }
  if (field.format === 'mapCount') {
    const count = value && typeof value === 'object' ? Object.keys(value).length : 0;
    return count ? `${count} detail${count === 1 ? '' : 's'}` : EMPTY;
  }
  if (field.format === 'map') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY;
    const entries = Object.entries(value);
    if (!entries.length) return EMPTY;
    const limit = detail ? 20 : 4;
    const visible = entries.slice(0, limit).map(([key, item]) => {
      const rendered = item && typeof item === 'object'
        ? objectLabel(item, field)
        : String(item);
      return `${businessCopy(key.replaceAll('_', ' '))}: ${rendered}`;
    });
    if (entries.length > limit) visible.push(`+${entries.length - limit} more`);
    return visible.join(', ');
  }
  if (field.format === 'list') return textValue(value, field, detail);
  if (field.format === 'url') {
    const href = safeDocumentUrl(value);
    if (!href) return EMPTY;
    if (!links) return 'Document available';
    const destination = new URL(href).hostname.replace(/^www\./, '');
    return (
      <a
        className="rv2-file-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open document from ${destination} in a new tab`}
        title={`Opens ${destination} in a new tab`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Glyph icon={Icons.doc} size={15} />
        Open document · {destination}
      </a>
    );
  }

  return textValue(value, field, detail);
}

function rowIdentity(resource, row) {
  const value = getValue(row, resource.rowKey || 'id');
  const fallback = row?.id;
  if (value === undefined || value === null || value === '') {
    return fallback === undefined || fallback === null || fallback === ''
      ? null
      : String(fallback);
  }
  return String(value);
}

function recordHeading(resource, row) {
  if (!row) return 'Selected record';
  const fields = [...(resource.detail || []), ...(resource.columns || [])];
  const titleKeys = [
    resource.titleField,
    'full_name',
    'name',
    'title',
    'student_name',
    'teacher_name',
    'parent_name',
    'number',
    'code',
    'username',
  ].filter(Boolean);
  const preferred = titleKeys
    .map((key) => fields.find((field) => field.key === key))
    .find((field) => field && !isMissing(getValue(row, field.key)));
  const fallback = fields.find((field) => {
    const value = getValue(row, field.key);
    return value !== undefined && value !== null && value !== '';
  });
  const field = preferred || fallback;
  return field ? textValue(getValue(row, field.key), field, true) : 'Selected record';
}

function ErrorPanel({ error, onRetry, compact = false }) {
  const forbidden = error?.status === 403;
  const unauthorized = error?.status === 401;
  const unavailableOnPlan = error?.status === 402;
  const rateLimited = error?.status === 429;
  const title = forbidden
    ? 'This view is outside your access'
    : unauthorized
      ? 'Your session needs a quick refresh'
      : unavailableOnPlan
        ? 'This view is not included yet'
        : rateLimited
          ? 'Updates are briefly paused'
          : 'This view needs another moment';
  const message = forbidden
    ? 'Your current leadership role does not include this area. Nothing has been changed.'
    : unauthorized
      ? 'Sign in again with your CEO or manager account to continue.'
      : unavailableOnPlan
        ? 'Your organization\'s current plan does not include this information.'
        : rateLimited
          ? 'There is a short pause while recent activity settles. Try again in a moment.'
          : 'We could not bring this information together just now. Your records remain safe.';

  return (
    <section
      className={`rv2-state rv2-state-error${compact ? ' is-compact' : ''}`}
      role="alert"
    >
      <span className="rv2-state-icon">
        <Glyph icon={forbidden ? Icons.shield : Icons.flag} size={22} />
      </span>
      <div className="rv2-state-copy">
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {!forbidden && !unauthorized && !unavailableOnPlan && (
        <Button kind="soft" onClick={onRetry}>Try again</Button>
      )}
    </section>
  );
}

function LoadingPanel({ compact = false, label = 'Preparing your view' }) {
  return (
    <section
      className={`rv2-loading${compact ? ' is-compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="rv2-loading-head">
        <span className="rv2-loading-mark">
          <Glyph icon={Icons.brand} size={18} />
        </span>
        <span>
          <strong>{label}</strong>
          <small>Gathering the latest information.</small>
        </span>
      </div>
      <div className="rv2-skeleton" aria-hidden="true">
        {SKELETON_ROWS.slice(0, compact ? 2 : 5).map((row) => (
          <div className="rv2-skeleton-row" key={row}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </section>
  );
}

function OfflinePanel({ compact = false }) {
  return (
    <section className={`rv2-state rv2-state-error${compact ? ' is-compact' : ''}`} role="status">
      <span className="rv2-state-icon">
        <Glyph icon={Icons.flag} size={22} />
      </span>
      <div className="rv2-state-copy">
        <h3>You are offline</h3>
        <p>Reconnect to prepare this view. No information has been replaced or lost.</p>
      </div>
    </section>
  );
}

function EmptyPanel({ searched }) {
  return (
    <section className="rv2-state rv2-state-empty">
      <span className="rv2-state-icon">
        <Glyph icon={searched ? Icons.search : Icons.folder} size={22} />
      </span>
      <div className="rv2-state-copy">
        <h3>{searched ? 'No matching records' : 'Nothing to review yet'}</h3>
        <p>
          {searched
            ? 'Try a shorter phrase or clear the search to see the full picture.'
            : 'New information will appear here when it becomes available.'}
        </p>
      </div>
    </section>
  );
}

function PageControls({ label, page = 1, pages = 1, onPage }) {
  const numbers = [1];
  if (page > 3) numbers.push('ellipsis-before');
  for (let value = Math.max(2, page - 1); value <= Math.min(pages - 1, page + 1); value += 1) {
    numbers.push(value);
  }
  if (page < pages - 2) numbers.push('ellipsis-after');
  if (pages > 1) numbers.push(pages);

  return (
    <div className="rv2-pagination">
      <span>{label}</span>
      <div className="rv2-pager">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          <span aria-hidden="true">&lsaquo;</span>
        </button>
        {numbers.map((value) =>
          typeof value === 'string' ? (
            <span key={value} aria-hidden="true">&hellip;</span>
          ) : (
            <button
              type="button"
              key={value}
              className={value === page ? 'is-current' : ''}
              aria-current={value === page ? 'page' : undefined}
              aria-label={`Page ${value}`}
              onClick={() => onPage(value)}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(Math.min(pages, page + 1))}
        >
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      </div>
    </div>
  );
}

function MobileRecordCards({ resource, items, onOpen, recordRoute }) {
  return (
    <div className="rv2-mobile-records">
      {items.map((row, index) => {
        const identity = rowIdentity(resource, row, index);
        const key = identity ?? `unidentified-record-${index}`;
        const rowCanOpen = Boolean(onOpen && recordRoute && identity);
        const heading = recordHeading(resource, row);
        const visibleFields = resource.columns
          .filter((field) => String(getValue(row, field.key) ?? '').trim() !== heading)
          .slice(0, 4);
        const content = (
          <>
            <span className="rv2-record-card-head">
              <strong>{heading}</strong>
              {rowCanOpen && <Glyph icon={Icons.chevR} size={17} />}
            </span>
            <span className="rv2-record-card-grid">
              {visibleFields.map((field) => (
                <span className="rv2-record-card-field" key={field.key}>
                  <small>{businessCopy(field.label)}</small>
                  <b><RenderedValue field={field} row={row} links={false} /></b>
                </span>
              ))}
            </span>
          </>
        );
        return rowCanOpen ? (
          <RouteLink
            className="rv2-record-card"
            key={key}
            route={recordRoute(identity)}
            onFollow={() => onOpen(row, identity)}
          >
            {content}
          </RouteLink>
        ) : (
          <article className="rv2-record-card" key={key}>{content}</article>
        );
      })}
    </div>
  );
}

function RelatedCards({ relation, items }) {
  const visibleFields = relation.columns.slice(0, 4);

  return (
    <div className="rv2-related-cards">
      {items.map((item, index) => (
        <article key={rowIdentity(relation, item) ?? `related-record-${index}`}>
          {visibleFields.map((field) => (
            <div key={field.key}>
              <span>{businessCopy(field.label)}</span>
              <strong><RenderedValue field={field} row={item} detail /></strong>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function RelatedPanel({ relation, row }) {
  const [opened, setOpened] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = relation.pageSize || 25;
  const paginated = relation.pagination === 'page';

  useEffect(() => {
    setPage(1);
    setOpened(false);
  }, [relation.id, row]);

  const detail = useApiDetail(
    { detailPath: relation.path },
    opened ? row : null,
    { page, pageSize, paginated },
  );
  const relatedData = relation.itemsKey
    ? getValue(detail.data, relation.itemsKey)
    : detail.data;
  const normalized = useMemo(
    () =>
      normalizeApiCollection(
        { data: relatedData, pagination: detail.pagination },
        page,
        pageSize,
      ),
    [detail.pagination, page, pageSize, relatedData],
  );
  const total = normalized.pagination.total;
  const totalKnown = normalized.pagination.totalKnown;
  const pages = normalized.pagination.pages;
  const hasRelatedData = detail.data !== null && detail.data !== undefined;

  return (
    <section className={`rv2-related${opened ? ' is-open' : ''}`}>
      <button
        type="button"
        className="rv2-related-toggle"
        aria-expanded={opened}
        onClick={() => {
          if (opened) {
            setOpened(false);
          } else {
            setOpened(true);
          }
        }}
      >
        <span className="rv2-related-title">
          <Glyph icon={Icons.folder} size={17} />
          <span>
            <strong>{businessCopy(relation.label)}</strong>
            <small>Supporting information</small>
          </span>
        </span>
        <Glyph icon={Icons.chevR} size={18} className="rv2-related-arrow" />
      </button>

      {opened && (
        <div className="rv2-related-body">
          <div className="rv2-related-actions">
            <span>{detail.paused ? 'Offline · last available view' : 'Connected to this record'}</span>
            <Button kind="soft" onClick={detail.retry} disabled={detail.loading}>Refresh</Button>
          </div>

          {detail.paused && !hasRelatedData ? (
            <OfflinePanel compact />
          ) : detail.loading && !hasRelatedData ? (
            <LoadingPanel compact label="Preparing supporting information" />
          ) : detail.error && !hasRelatedData ? (
            <ErrorPanel error={detail.error} onRetry={detail.retry} compact />
          ) : (
            <>
              {(detail.error || detail.paused) && (
                <div className="rv2-stale" role="status">
                  <span>
                    <Glyph icon={Icons.flag} size={16} />
                    {detail.paused ? 'Offline · showing the last available view.' : 'Showing the most recent available view.'}
                  </span>
                </div>
              )}
              {relation.summaryFields?.length > 0 && (
                <div className="rv2-related-summary">
                  {relation.summaryFields.map((field) => (
                    <div key={field.key}>
                      <span>{businessCopy(field.label)}</span>
                      <strong><RenderedValue field={field} row={detail.data} detail /></strong>
                    </div>
                  ))}
                </div>
              )}

              {!normalized.items.length ? (
                <div className="rv2-related-empty">No connected activity to review.</div>
              ) : (
                <>
                  <div className="rv2-related-table">
                    <DataTable
                      label={`${businessCopy(relation.label)} details`}
                      cols={relation.columns.map((field) => ({
                        ...field,
                        label: businessCopy(field.label),
                      }))}
                    >
                      {normalized.items.map((item, index) => (
                        <tr key={rowIdentity(relation, item) ?? `related-row-${index}`}>
                          {relation.columns.map((field) => (
                            <td key={field.key}><RenderedValue field={field} row={item} /></td>
                          ))}
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                  <RelatedCards relation={relation} items={normalized.items} />
                  <div className="rv2-related-foot">
                    <span>{totalKnown
                      ? `Showing ${formatBusinessNumber(normalized.items.length)} of ${formatBusinessNumber(total)}`
                      : `Showing ${formatBusinessNumber(normalized.items.length)} · total unavailable`}</span>
                    {paginated && pages > 1 && (
                      <div className="rv2-related-pager">
                        <Button
                          kind="soft"
                          disabled={page <= 1 || detail.loading}
                          onClick={() => setPage((value) => Math.max(1, value - 1))}
                        >
                          Previous
                        </Button>
                        <span>Page {page} of {pages}</span>
                        <Button
                          kind="soft"
                          disabled={page >= pages || detail.loading}
                          onClick={() => setPage((value) => Math.min(pages, value + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RecordBreadcrumb({ resource, listRoute, onBack, current = false }) {
  return (
    <nav className="rv2-breadcrumb" aria-label="Breadcrumb">
      <RouteLink route={listRoute} onFollow={onBack}>
        <Glyph icon={Icons.chevR} size={15} />
        {businessCopy(resource.label || 'Directory')}
      </RouteLink>
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Details</span>
        </>
      )}
    </nav>
  );
}

function RecordDetailPage({ resource, row, listRoute, onBack, workspaceTitle }) {
  const detail = useApiDetail(resource, row);
  const data = detail.data || row;
  const fields = resource.detail?.length ? resource.detail : resource.columns;
  const heading = recordHeading(resource, data);
  useWorkspaceTitle(
    heading === EMPTY || heading === 'Selected record' ? '' : heading,
    businessCopy(workspaceTitle),
    rowIdentity(resource, data) || '',
  );
  const statusField = fields.find((field) => field.format === 'status');
  const statusValue = statusField ? getValue(data, statusField.key) : null;
  const email = getValue(data, 'email');
  const phone = getValue(data, 'phone');
  const visibleFields = fields.filter((field) => {
    const value = getValue(data, field.key);
    if (field === statusField || ['email', 'phone'].includes(field.key)) return false;
    return String(value ?? '').trim() !== heading;
  });
  const hasDisplayData = fields.some((field) => {
    if (field.key === resource.rowKey || field.key === 'id') return false;
    return !isMissing(getValue(data, field.key));
  });

  if (!hasDisplayData && detail.paused) {
    return (
      <article className="rv2-record-page">
        <RecordBreadcrumb resource={resource} listRoute={listRoute} onBack={onBack} />
        <h1 className="rv2-sr-only">{heading === EMPTY ? 'Record details' : heading}</h1>
        <OfflinePanel />
      </article>
    );
  }

  if (!hasDisplayData && detail.loading) {
    return (
      <article className="rv2-record-page">
        <RecordBreadcrumb resource={resource} listRoute={listRoute} onBack={onBack} />
        <h1 className="rv2-sr-only">{heading === EMPTY ? 'Record details' : heading}</h1>
        <LoadingPanel label="Preparing this record" />
      </article>
    );
  }

  if (!hasDisplayData && detail.error) {
    return (
      <article className="rv2-record-page">
        <RecordBreadcrumb resource={resource} listRoute={listRoute} onBack={onBack} />
        <h1 className="rv2-sr-only">{heading === EMPTY ? 'Record details' : heading}</h1>
        <ErrorPanel error={detail.error} onRetry={detail.retry} />
      </article>
    );
  }

  return (
    <article className="rv2-record-page">
      <RecordBreadcrumb
        resource={resource}
        listRoute={listRoute}
        onBack={onBack}
        current
      />

      <header className="rv2-profile-head">
        <SfAvatar name={heading === EMPTY ? 'Record' : heading} size={62} decorative />
        <div className="rv2-profile-copy">
          <span>{businessCopy(resource.label || 'Record')}</span>
          <h1>{heading === EMPTY ? 'Record details' : heading}</h1>
          <div className="rv2-profile-meta">
            {statusValue != null && statusValue !== '' && (
              <Pill tone={statusTone(statusValue)} dot>
                {String(statusValue).replaceAll('_', ' ')}
              </Pill>
            )}
            {!isMissing(email) && <span>{String(email)}</span>}
            {!isMissing(phone) && <span>{String(phone)}</span>}
          </div>
        </div>
        <div className="rv2-profile-actions">
          <span className="rv2-profile-readiness" aria-live="polite">
            <i className={detail.loading ? 'is-loading' : detail.error || detail.paused ? 'has-error' : ''} />
            {detail.paused ? 'Offline · last available view' : detail.error ? 'Needs attention' : detail.loading ? 'Updating' : 'Up to date'}
          </span>
          <Button kind="soft" onClick={detail.retry} disabled={detail.loading}>
            Refresh
          </Button>
        </div>
      </header>

      {detail.error && (
        <div className="rv2-record-error">
          <ErrorPanel error={detail.error} onRetry={detail.retry} />
        </div>
      )}

      {detail.loading && !detail.error && Object.keys(data || {}).length <= 1 ? (
        <LoadingPanel label="Preparing this record" />
      ) : (
        <section className="rv2-detail-section" aria-label="Record information">
        <div className="rv2-section-head">
          <h3>Key information</h3>
          <span>{formatBusinessNumber(visibleFields.length)} details</span>
        </div>
        <div className="rv2-detail-grid">
          {visibleFields.map((field) => (
            <div className="rv2-detail-field" key={field.key}>
              <span>{businessCopy(field.label)}</span>
              <strong><RenderedValue field={field} row={data} detail /></strong>
            </div>
          ))}
        </div>
        </section>
      )}

      {!detail.error && resource.related?.length > 0 && (
        <section className="rv2-detail-section rv2-connected" aria-label="Connected activity">
          <div className="rv2-section-head">
            <h3>Connected activity</h3>
            <span>{formatBusinessNumber(resource.related.length)} section{resource.related.length === 1 ? '' : 's'}</span>
          </div>
          <div className="rv2-related-stack">
            {resource.related.map((relation) => (
              <RelatedPanel
                key={`${relation.id}:${rowIdentity(resource, row)}`}
                relation={relation}
                row={data}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function SummaryBar({ total, visible, page, pages, updatedAt }) {
  return (
    <section className="rv2-summary" aria-label="Current view summary">
      <div>
        <span>Total records</span>
        <strong>{formatBusinessNumber(total)}</strong>
      </div>
      <div>
        <span>Showing now</span>
        <strong>{formatBusinessNumber(visible)}</strong>
      </div>
      <div>
        <span>Position</span>
        <strong>{page == null ? 'Current view' : pages > 1 ? `${page} of ${pages}` : 'All'}</strong>
      </div>
      <div>
        <span>Last refreshed</span>
        <strong>
          {updatedAt ? formatOrganizationTime(updatedAt) : EMPTY}
        </strong>
      </div>
    </section>
  );
}

function ResourceWorkspace({ resource, query = '', onRouteState, onOpen, detailBase }) {
  const initial = managementQueryState(query);
  const routeStateRef = useRef(initial);
  const [draftSearch, setDraftSearch] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);
  const [page, setPage] = useState(initial.page);
  const [cursor, setCursor] = useState(initial.cursor);
  const resultsRef = useRef(null);
  const pendingResultNavigation = useRef(false);

  useEffect(() => {
    const next = managementQueryState(query);
    const previous = routeStateRef.current;
    if (
      next.search === previous.search &&
      next.page === previous.page &&
      next.cursor === previous.cursor
    ) return;
    routeStateRef.current = next;
    setDraftSearch(next.search);
    setSearch(next.search);
    setPage(next.page);
    setCursor(next.cursor);
  }, [query]);

  useEffect(() => {
    if (draftSearch.trim() === search) return undefined;
    const timer = setTimeout(() => {
      const nextSearch = draftSearch.trim();
      setSearch(nextSearch);
      setPage(1);
      setCursor(null);
      routeStateRef.current = { search: nextSearch, page: 1, cursor: null };
      onRouteState?.({ search: nextSearch, page: 1, cursor: null });
    }, 250);
    return () => clearTimeout(timer);
  }, [draftSearch, onRouteState, search]);

  const collection = useApiResource(resource, { search, page, cursor });
  const pagination = collection.pagination;
  const total = pagination.totalKnown ? pagination.total : null;
  const currentPage = Number(pagination.page) || page || 1;
  const totalPages = Number(pagination.pages) || 1;
  const resultLabel = pagination.totalKnown
    ? `${formatBusinessNumber(total)} record${total === 1 ? '' : 's'}`
    : `${formatBusinessNumber(collection.items.length)} shown · total unavailable`;

  useEffect(() => {
    if (!pendingResultNavigation.current || collection.loading) return;
    pendingResultNavigation.current = false;
    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [collection.loading, collection.updatedAt]);

  function changePage(nextPage) {
    pendingResultNavigation.current = true;
    setPage(nextPage);
    setCursor(null);
    routeStateRef.current = { search, page: nextPage, cursor: null };
    onRouteState?.({ search, page: nextPage, cursor: null }, { replace: false });
  }

  function changeCursor(nextCursor) {
    pendingResultNavigation.current = true;
    setCursor(nextCursor);
    setPage(1);
    routeStateRef.current = { search, page: 1, cursor: nextCursor };
    onRouteState?.({ search, page: 1, cursor: nextCursor }, { replace: false });
  }

  const canOpen = Boolean(resource.detailPath && onOpen);
  const recordRoute = canOpen && detailBase
    ? (identity) => `${detailBase}/${encodeURIComponent(identity)}${query ? `?${query}` : ''}`
    : null;
  const missingIdentityCount = canOpen
    ? collection.items.filter((row) => rowIdentity(resource, row) == null).length
    : 0;
  const showCollection = collection.items.length > 0;
  const showStaleWarning = Boolean(collection.error && showCollection);

  return (
    <div
      className="rv2-workspace"
      ref={resultsRef}
      tabIndex="-1"
      aria-label={`${businessCopy(resource.label || 'Records')} results`}
    >
      <section className="rv2-toolbar" aria-label="Review tools">
        {resource.searchParam !== false ? (
          <div className="rv2-search">
            <Glyph icon={Icons.search} size={17} />
            <input
              aria-label="Search records"
              placeholder={businessCopy(resource.searchPlaceholder || 'Search this section')}
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            {draftSearch && (
              <button type="button" onClick={() => setDraftSearch('')} aria-label="Clear search">
                <Glyph icon={Icons.x} size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="rv2-toolbar-note">
            <Glyph icon={Icons.filter} size={17} />
            <span>Focused view</span>
          </div>
        )}
        <div className="rv2-toolbar-actions">
          <span className="rv2-freshness" aria-live="polite">
            <i className={collection.loading ? 'is-loading' : collection.error ? 'has-error' : ''} />
            {collection.loading
              ? 'Refreshing'
              : collection.paused
                ? showCollection ? 'Offline · last available view' : 'Offline'
              : collection.error && showCollection
                ? 'Showing last available view'
                : collection.error
                  ? 'Needs attention'
                  : collection.updatedAt
                    ? 'Up to date'
                    : 'Preparing'}
          </span>
          <Button kind="soft" onClick={collection.retry} disabled={collection.loading}>
            <Glyph icon={Icons.trend} size={16} />
            Refresh
          </Button>
        </div>
      </section>

      {collection.updatedAt && (!collection.error || showCollection) && (
        <SummaryBar
          total={total}
          visible={collection.items.length}
          page={resource.pagination === 'cursor' ? null : currentPage}
          pages={totalPages}
          updatedAt={collection.updatedAt}
        />
      )}

      {showStaleWarning && (
        <section className="rv2-stale" role="status">
          <span>
            <Glyph icon={Icons.flag} size={17} />
            Showing the most recent available view.
          </span>
          <Button kind="soft" onClick={collection.retry}>Try again</Button>
        </section>
      )}

      {collection.warnings?.length > 0 && (
        <section className="rv2-stale" role="status">
          <span>
            <Glyph icon={Icons.flag} size={17} />
            Some supporting information is temporarily unavailable.
          </span>
        </section>
      )}

      {collection.paused && showCollection && (
        <section className="rv2-stale" role="status">
          <span>
            <Glyph icon={Icons.flag} size={17} />
            Offline · showing the last available view.
          </span>
        </section>
      )}

      {missingIdentityCount > 0 && (
        <section className="rv2-stale" role="status">
          <span>
            <Glyph icon={Icons.flag} size={17} />
            {missingIdentityCount === 1 ? 'One record' : `${missingIdentityCount} records`} cannot be opened because identifying information is incomplete.
          </span>
        </section>
      )}

      {collection.paused && !showCollection ? (
        <OfflinePanel />
      ) : collection.error && !showCollection ? (
        <ErrorPanel error={collection.error} onRetry={collection.retry} />
      ) : collection.loading && !showCollection ? (
        <LoadingPanel />
      ) : !showCollection ? (
        <>
          <EmptyPanel searched={Boolean(search)} />
          {resource.pagination === 'page' && currentPage > 1 && (
            <PageControls
              label="No records on this page"
              page={currentPage}
              pages={Math.max(currentPage, totalPages)}
              onPage={changePage}
            />
          )}
        </>
      ) : (
        <section className="rv2-register">
          <header className="rv2-register-head">
            <div>
              <span>Current register</span>
              <h2>{businessCopy(resource.label || 'Records')}</h2>
            </div>
            <div>
              <strong>{formatBusinessNumber(collection.items.length)} shown</strong>
              <small>{canOpen ? 'Open any record for full details' : 'Complete current view'}</small>
            </div>
          </header>

          <div className="rv2-desktop-table">
            <DataTable
              label={`${businessCopy(resource.label || 'Records')} register`}
              cols={[
                ...resource.columns.map((field) => ({
                  ...field,
                  label: businessCopy(field.label),
                })),
                ...(canOpen ? [{ key: '__details', label: 'Details', align: 'right' }] : []),
              ]}
              selectable={canOpen}
            >
              {collection.items.map((row, index) => {
                const identity = rowIdentity(resource, row, index);
                const key = identity ?? `unidentified-record-${index}`;
                const rowCanOpen = Boolean(canOpen && identity);
                return (
                  <tr key={key}>
                    {resource.columns.map((field) => (
                      <td key={field.key}><RenderedValue field={field} row={row} /></td>
                    ))}
                    {canOpen && <td className="rv2-row-action-cell">
                      {rowCanOpen ? (
                        <RouteLink
                          className="rv2-row-action"
                          aria-label={`Open details for ${recordHeading(resource, row)}`}
                          route={recordRoute(identity)}
                          onFollow={() => onOpen(row, identity)}
                        >
                          View
                          <Glyph icon={Icons.chevR} size={14} />
                        </RouteLink>
                      ) : <span aria-label="Details unavailable">—</span>}
                    </td>}
                  </tr>
                );
              })}
            </DataTable>
          </div>

          <MobileRecordCards
            resource={resource}
            items={collection.items}
            onOpen={canOpen ? onOpen : undefined}
            recordRoute={recordRoute}
          />

          {resource.pagination === 'none' ? (
            <div className="rv2-pagination"><span>{resultLabel}</span></div>
          ) : resource.pagination === 'cursor' ? (
            <div className="rv2-pagination">
              <span>{resultLabel}</span>
              <div className="rv2-cursor-pager">
                <Button
                  kind="soft"
                  disabled={!pagination.hasPrevious || collection.loading}
                  onClick={() => changeCursor(pagination.previousCursor || null)}
                >
                  Previous
                </Button>
                <Button
                  kind="soft"
                  disabled={!pagination.hasNext || !pagination.nextCursor || collection.loading}
                  onClick={() => changeCursor(pagination.nextCursor)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : (
            <PageControls
              label={resultLabel}
              page={currentPage}
              pages={totalPages}
              onPage={changePage}
            />
          )}
        </section>
      )}

    </div>
  );
}

function routeRow(resource, encodedId) {
  if (!resource.detailPath || !encodedId) return null;
  let value;
  try {
    value = decodeURIComponent(encodedId);
  } catch {
    return null;
  }
  const keys = [...resource.detailPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (!keys.length) return null;
  return keys.reduce((row, key) => ({ ...row, [key]: value }), {
    [resource.rowKey || 'id']: value,
  });
}

function stateQuery({ search, page, cursor }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (page > 1) params.set('page', String(page));
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function BackendModule({ module, basePath, route, onNavigate, capabilities }) {
  const [path, query = ''] = String(route || basePath).split('?', 2);
  const segments = useMemo(() => path.split('/').filter(Boolean), [path]);
  const requestedTabId = segments[1];
  const [selectedSeed, setSelectedSeed] = useState(null);
  const activeTabRef = useRef(null);
  const capabilitySet = useMemo(
    () => (Array.isArray(capabilities) ? new Set(capabilities) : null),
    [capabilities],
  );
  const visibleTabs = useMemo(() => {
    if (!capabilitySet) return module.tabs;
    return module.tabs.filter((item) =>
      hasDeclaredAccess(item.permission || module.permission, capabilitySet));
  }, [capabilitySet, module.permission, module.tabs]);
  const noVisibleTabs = Boolean(capabilitySet && visibleTabs.length === 0);
  const activeTab = visibleTabs.find((item) => item.id === requestedTabId) || visibleTabs[0] || module.tabs[0];
  const activeResource = useMemo(
    () => ({
      ...activeTab,
      permission: activeTab.permission || module.permission,
      related: (activeTab.related || []).filter((relation) =>
        hasDeclaredAccess(relation.permission, capabilitySet)),
    }),
    [activeTab, capabilitySet, module.permission],
  );
  const listPath = `${basePath}/${activeTab.id}`;
  const detailId = requestedTabId === activeTab.id ? segments[2] : null;
  const routedDetailRow = useMemo(
    () => routeRow(activeResource, detailId),
    [activeResource, detailId],
  );
  const detailRow = useMemo(() => {
    if (!routedDetailRow || selectedSeed?.tabId !== activeTab.id) return routedDetailRow;
    const routedKey = rowIdentity(activeResource, routedDetailRow);
    return selectedSeed.key === routedKey
      ? { ...routedDetailRow, ...selectedSeed.row }
      : routedDetailRow;
  }, [activeResource, activeTab.id, routedDetailRow, selectedSeed]);
  const querySuffix = query ? `?${query}` : '';
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  }, [activeTab.id]);

  useEffect(() => {
    if (requestedTabId && requestedTabId !== activeTab.id) {
      onNavigate(listPath, { replace: true, scroll: false });
    } else if (detailId && !routedDetailRow) {
      onNavigate(`${listPath}${querySuffix}`, { replace: true, scroll: false });
    } else if (segments.length > 3) {
      const canonical = detailId
        ? `${listPath}/${segments[2]}${querySuffix}`
        : `${listPath}${querySuffix}`;
      onNavigate(canonical, { replace: true, scroll: false });
    }
  }, [activeTab.id, detailId, listPath, onNavigate, querySuffix, requestedTabId, routedDetailRow, segments]);

  const updateRouteState = useMemo(
    () => ({ search, page, cursor }, { replace = true } = {}) => {
      const nextQuery = stateQuery({ search, page, cursor });
      onNavigate(nextQuery ? `${listPath}?${nextQuery}` : listPath, {
        replace,
        scroll: false,
      });
    },
    [listPath, onNavigate],
  );

  return (
    <div className="rv2-page">
      {!detailRow && <header className="rv2-page-head">
        <span className="rv2-page-icon">
          <Glyph icon={Icons.folder} size={20} />
        </span>
        <div>
          <span className="rv2-page-eyebrow">{businessCopy(module.eyebrow)}</span>
          <h1>{businessCopy(module.title)}</h1>
          <p>{businessCopy(module.description)}</p>
        </div>
      </header>}

      {visibleTabs.length > 1 && (
        <div className="rv2-view-picker">
          <label htmlFor={`${basePath}-view`}>Current view</label>
          <select
            id={`${basePath}-view`}
            value={activeTab.id}
            onChange={(event) => onNavigate(`${basePath}/${event.target.value}`)}
          >
            {visibleTabs.map((item) => (
              <option value={item.id} key={item.id}>{businessCopy(item.label)}</option>
            ))}
          </select>
        </div>
      )}

      <div className={`rv2-module-layout${visibleTabs.length > 1 ? ' has-section-rail' : ''}`}>
        {visibleTabs.length > 1 && (
          <aside className="rv2-section-rail" aria-label={`${businessCopy(module.title)} sections`}>
            <span>Explore</span>
            <nav>
              {visibleTabs.map((item) => (
                <RouteLink
                  key={item.id}
                  ref={item.id === activeTab.id ? activeTabRef : undefined}
                  className={item.id === activeTab.id ? 'is-active' : ''}
                  aria-current={item.id === activeTab.id ? 'page' : undefined}
                  route={`${basePath}/${item.id}`}
                  onFollow={() => onNavigate(`${basePath}/${item.id}`)}
                >
                  <Glyph icon={item.id === activeTab.id ? Icons.chevR : Icons.doc} size={15} />
                  <span>{businessCopy(item.label)}</span>
                </RouteLink>
              ))}
            </nav>
          </aside>
        )}

        <div className="rv2-module-main">
          <div className="rv2-view" key={`${activeTab.id}:${detailRow ? 'detail' : 'list'}`}>
            {noVisibleTabs ? (
              <ErrorPanel error={{ status: 403 }} />
            ) : detailRow ? (
              <RecordDetailPage
                resource={activeResource}
                row={detailRow}
                workspaceTitle={module.title}
                listRoute={`${listPath}${querySuffix}`}
                onBack={() => {
                  if (selectedSeed?.tabId === activeTab.id) {
                    setSelectedSeed(null);
                    window.history.back();
                  } else {
                    onNavigate(`${listPath}${querySuffix}`, { replace: true });
                  }
                }}
              />
            ) : (
              <ResourceWorkspace
                resource={activeResource}
                query={query}
                detailBase={listPath}
                onRouteState={updateRouteState}
                onOpen={activeResource.detailPath ? (row, key) => {
                  setSelectedSeed({ tabId: activeTab.id, key, row });
                  onNavigate(`${listPath}/${encodeURIComponent(key)}${querySuffix}`);
                } : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
