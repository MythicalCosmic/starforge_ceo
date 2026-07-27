import { cloneElement, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/common.jsx';
import { Icons } from '../components/Icons.jsx';
import { Modal } from '../components/Modal.jsx';
import { Button, Pill } from '../components/primitives.jsx';
import {
  normalizeApiCollection,
  useApiDetail,
  useApiResource,
} from '../hooks/useApiResource.js';
import { isMissing, statusTone } from '../lib/resourcePresentation.js';

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

function formatDate(value, dateOnly = false) {
  if (!value) return EMPTY;
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return dateOnly
    ? parsed.toLocaleDateString()
    : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatMoney(value) {
  if (value === undefined || value === null || value === '') return EMPTY;
  const raw = String(value);
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return `${raw} UZS`;
  const [, sign, whole, decimals = ''] = match;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const visibleDecimals = decimals.replace(/0+$/, '');
  return `${sign}${grouped}${visibleDecimals ? `.${visibleDecimals}` : ''} UZS`;
}

function formatBytes(value) {
  if (isMissing(value)) return EMPTY;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return EMPTY;
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

function RenderedValue({ field, row, detail = false, links = true }) {
  const value = getValue(row, field.key);

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
  if (field.format === 'money') return <span className="sf-mono">{formatMoney(value)}</span>;
  if (field.format === 'bytes') return <span className="sf-mono">{formatBytes(value)}</span>;
  if (field.format === 'minutes') {
    return isMissing(value) ? EMPTY : `${value} min`;
  }
  if (field.format === 'percent') {
    if (isMissing(value)) return EMPTY;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return EMPTY;
    const scaled = numeric * (field.scale ?? 1);
    return <span className="sf-mono">{scaled.toFixed(scaled % 1 === 0 ? 0 : 1)}%</span>;
  }
  if (field.format === 'number') {
    if (value === undefined || value === null || value === '') return EMPTY;
    const numeric = Number(value);
    return <span className="sf-mono">{Number.isFinite(numeric) ? numeric.toLocaleString() : String(value)}</span>;
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
        : Number(value);
    return <span className="sf-mono">{Number.isFinite(count) ? count.toLocaleString() : EMPTY}</span>;
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
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return EMPTY;
    if (!links) return 'Document available';
    return (
      <a
        className="rv2-file-link"
        href={value}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Glyph icon={Icons.doc} size={15} />
        Open document
      </a>
    );
  }

  return textValue(value, field, detail);
}

function rowIdentity(resource, row, index = 0) {
  const value = getValue(row, resource.rowKey || 'id');
  return String(value ?? row?.id ?? `row-${index}`);
}

function recordHeading(resource, row) {
  if (!row) return 'Selected record';
  const fields = [...(resource.detail || []), ...(resource.columns || [])];
  const preferred = fields.find((field) =>
    ['name', 'title', 'student_name', 'number', 'code', 'username'].includes(field.key),
  );
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
  const rateLimited = error?.status === 429;
  const title = forbidden
    ? 'This view is outside your access'
    : unauthorized
      ? 'Your session needs a quick refresh'
      : rateLimited
        ? 'Updates are briefly paused'
        : 'This view needs another moment';
  const message = forbidden
    ? 'Your current leadership role does not include this area. Nothing has been changed.'
    : unauthorized
      ? 'Sign in again with your CEO or manager account to continue.'
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
      <Button kind="soft" onClick={onRetry}>Try again</Button>
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

function MobileRecordCards({ resource, items, onOpen }) {
  const visibleFields = resource.columns.slice(0, 4);

  return (
    <div className="rv2-mobile-records">
      {items.map((row, index) => {
        const key = rowIdentity(resource, row, index);
        const heading = recordHeading(resource, row);
        return (
          <button
            type="button"
            className="rv2-record-card"
            key={key}
            onClick={() => onOpen(row, key)}
            aria-label={`Open details for ${heading}`}
          >
            <span className="rv2-record-card-head">
              <strong>{heading}</strong>
              <Glyph icon={Icons.chevR} size={17} />
            </span>
            <span className="rv2-record-card-grid">
              {visibleFields.map((field) => (
                <span className="rv2-record-card-field" key={field.key}>
                  <small>{businessCopy(field.label)}</small>
                  <b><RenderedValue field={field} row={row} links={false} /></b>
                </span>
              ))}
            </span>
          </button>
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
        <article key={rowIdentity(relation, item, index)}>
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
  const pages = normalized.pagination.pages;

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
            detail.retry();
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
            <span>Connected to this record</span>
            <Button kind="soft" onClick={detail.retry} disabled={detail.loading}>Refresh</Button>
          </div>

          {detail.loading ? (
            <LoadingPanel compact label="Preparing supporting information" />
          ) : detail.error ? (
            <ErrorPanel error={detail.error} onRetry={detail.retry} compact />
          ) : (
            <>
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
                      cols={relation.columns.map((field) => ({
                        ...field,
                        label: businessCopy(field.label),
                      }))}
                    >
                      {normalized.items.map((item, index) => (
                        <tr key={rowIdentity(relation, item, index)}>
                          {relation.columns.map((field) => (
                            <td key={field.key}><RenderedValue field={field} row={item} /></td>
                          ))}
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                  <RelatedCards relation={relation} items={normalized.items} />
                  <div className="rv2-related-foot">
                    <span>
                      Showing {normalized.items.length.toLocaleString()} of {Number(total).toLocaleString()}
                    </span>
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

function RecordDetailModal({ resource, row, open, onClose }) {
  const detail = useApiDetail(resource, open ? row : null);
  const data = detail.data || row;
  const fields = resource.detail?.length ? resource.detail : resource.columns;
  const heading = recordHeading(resource, data);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={businessCopy(resource.label || 'Record details')}
      title={heading === EMPTY ? 'Record details' : heading}
      className="rv2-record-modal"
    >
      <div className="rv2-modal-status">
        <span>
          <Glyph icon={Icons.doc} size={17} />
          Complete record overview
        </span>
        <Pill tone={detail.error ? 'danger' : detail.loading ? 'primary' : 'success'} dot>
          {detail.error ? 'Needs attention' : detail.loading ? 'Updating' : 'Ready'}
        </Pill>
      </div>

      {detail.error && (
        <div className="rv2-modal-error">
          <ErrorPanel error={detail.error} onRetry={detail.retry} compact />
        </div>
      )}

      <section className="rv2-detail-section" aria-label="Record information">
        <div className="rv2-section-head">
          <h3>Key information</h3>
          <span>{fields.length.toLocaleString()} details</span>
        </div>
        <div className="rv2-detail-grid">
          {fields.map((field) => (
            <div className="rv2-detail-field" key={field.key}>
              <span>{businessCopy(field.label)}</span>
              <strong><RenderedValue field={field} row={data} detail /></strong>
            </div>
          ))}
        </div>
      </section>

      {resource.related?.length > 0 && (
        <section className="rv2-detail-section rv2-connected" aria-label="Connected activity">
          <div className="rv2-section-head">
            <h3>Connected activity</h3>
            <span>{resource.related.length.toLocaleString()} section{resource.related.length === 1 ? '' : 's'}</span>
          </div>
          <div className="rv2-related-stack">
            {resource.related.map((relation) => (
              <RelatedPanel
                key={`${relation.id}:${rowIdentity(resource, row)}`}
                relation={relation}
                row={row}
              />
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}

function SummaryBar({ total, visible, page, pages, updatedAt }) {
  return (
    <section className="rv2-summary" aria-label="Current view summary">
      <div>
        <span>Total records</span>
        <strong>{total.toLocaleString()}</strong>
      </div>
      <div>
        <span>Showing now</span>
        <strong>{visible.toLocaleString()}</strong>
      </div>
      <div>
        <span>Position</span>
        <strong>{page == null ? 'Current view' : pages > 1 ? `${page} of ${pages}` : 'All'}</strong>
      </div>
      <div>
        <span>Last refreshed</span>
        <strong>
          {updatedAt
            ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : EMPTY}
        </strong>
      </div>
    </section>
  );
}

function ResourceWorkspace({ resource }) {
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(draftSearch.trim());
      setPage(1);
      setCursor(null);
      setSelectedKey(null);
      setDetailOpen(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [draftSearch]);

  const collection = useApiResource(resource, { search, page, cursor });
  const selectedRow = useMemo(
    () => collection.items.find(
      (row, index) => rowIdentity(resource, row, index) === selectedKey,
    ) || null,
    [collection.items, resource, selectedKey],
  );
  const pagination = collection.pagination;
  const total = Number(pagination.total) || 0;
  const currentPage = Number(pagination.page) || page || 1;
  const totalPages = Number(pagination.pages) || 1;
  const resultLabel = `${total.toLocaleString()} record${total === 1 ? '' : 's'}`;

  useEffect(() => {
    if (!collection.loading && !collection.error) setUpdatedAt(new Date());
  }, [collection.error, collection.loading]);

  function openRecord(row, key) {
    setSelectedKey(key);
    setDetailOpen(true);
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setSelectedKey(null);
    setDetailOpen(false);
  }

  return (
    <div className="rv2-workspace">
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
            <i className={collection.loading ? 'is-loading' : ''} />
            {collection.loading ? 'Refreshing' : 'Up to date'}
          </span>
          <Button kind="soft" onClick={collection.retry} disabled={collection.loading}>
            <Glyph icon={Icons.trend} size={16} />
            Refresh
          </Button>
        </div>
      </section>

      {!collection.error && (
        <SummaryBar
          total={total}
          visible={collection.items.length}
          page={resource.pagination === 'cursor' ? null : currentPage}
          pages={totalPages}
          updatedAt={updatedAt}
        />
      )}

      {collection.error ? (
        <ErrorPanel error={collection.error} onRetry={collection.retry} />
      ) : collection.loading && !collection.items.length ? (
        <LoadingPanel />
      ) : !collection.items.length ? (
        <EmptyPanel searched={Boolean(search)} />
      ) : (
        <section className="rv2-register">
          <header className="rv2-register-head">
            <div>
              <span>Current register</span>
              <h2>{businessCopy(resource.label || 'Records')}</h2>
            </div>
            <div>
              <strong>{collection.items.length.toLocaleString()} shown</strong>
              <small>Open any record for full details</small>
            </div>
          </header>

          <div className="rv2-desktop-table">
            <DataTable
              cols={[
                ...resource.columns.map((field) => ({
                  ...field,
                  label: businessCopy(field.label),
                })),
                { key: '__details', label: 'Details', align: 'right' },
              ]}
              selectable
            >
              {collection.items.map((row, index) => {
                const key = rowIdentity(resource, row, index);
                const selected = key === selectedKey;
                return (
                  <tr
                    key={key}
                    className={selected ? 'is-selected' : undefined}
                    onClick={() => openRecord(row, key)}
                  >
                    {resource.columns.map((field) => (
                      <td key={field.key}><RenderedValue field={field} row={row} /></td>
                    ))}
                    <td className="rv2-row-action-cell">
                      <button
                        type="button"
                        className="rv2-row-action"
                        aria-label={`Open details for ${recordHeading(resource, row)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openRecord(row, key);
                        }}
                      >
                        View
                        <Glyph icon={Icons.chevR} size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          <MobileRecordCards
            resource={resource}
            items={collection.items}
            onOpen={openRecord}
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
                  onClick={() => {
                    setCursor(pagination.previousCursor || null);
                    setSelectedKey(null);
                    setDetailOpen(false);
                  }}
                >
                  Previous
                </Button>
                <Button
                  kind="soft"
                  disabled={!pagination.hasNext || !pagination.nextCursor || collection.loading}
                  onClick={() => {
                    setCursor(pagination.nextCursor);
                    setSelectedKey(null);
                    setDetailOpen(false);
                  }}
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

      <RecordDetailModal
        key={`${resource.id}:${selectedKey || 'closed'}`}
        resource={resource}
        row={selectedRow}
        open={detailOpen && Boolean(selectedRow)}
        onClose={() => {
          setDetailOpen(false);
          setSelectedKey(null);
        }}
      />
    </div>
  );
}

export function BackendModule({ module }) {
  const [activeTabId, setActiveTabId] = useState(module.tabs[0].id);
  const activeTab = module.tabs.find((item) => item.id === activeTabId) || module.tabs[0];
  const activeResource = useMemo(
    () => ({ ...activeTab, permission: activeTab.permission || module.permission }),
    [activeTab, module.permission],
  );

  return (
    <div className="rv2-page">
      <header className="rv2-page-head">
        <span className="rv2-page-icon">
          <Glyph icon={Icons.folder} size={20} />
        </span>
        <div>
          <span className="rv2-page-eyebrow">{businessCopy(module.eyebrow)}</span>
          <h1>{businessCopy(module.title)}</h1>
          <p>{businessCopy(module.description)}</p>
        </div>
      </header>

      <section className="rv2-view-selector">
        <div>
          <span className="rv2-view-label">Choose a view</span>
          <strong>{businessCopy(activeTab.label)}</strong>
          <small>{module.tabs.length.toLocaleString()} available section{module.tabs.length === 1 ? '' : 's'}</small>
        </div>
        <label className="rv2-select">
          <span className="rv2-sr-only">Current view</span>
          <select
            value={activeTab.id}
            onChange={(event) => setActiveTabId(event.target.value)}
          >
            {module.tabs.map((item) => (
              <option value={item.id} key={item.id}>{businessCopy(item.label)}</option>
            ))}
          </select>
          <Glyph icon={Icons.chevR} size={18} />
        </label>
      </section>

      <div className="rv2-view" key={activeTab.id}>
        <ResourceWorkspace resource={activeResource} />
      </div>
    </div>
  );
}
