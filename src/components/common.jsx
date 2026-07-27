export function DataTable({ cols, children, selectable = false }) {
  return (
    <div className="ad-table-wrap" tabIndex="0" role="region" aria-label="Scrollable data table">
      <table className={`ad-table${selectable ? ' ad-table-selectable' : ''}`}>
        <thead>
          <tr>
            {cols.map((column, index) => (
              <th
                key={`${column.key || column.label}-${index}`}
                style={{ textAlign: column.align || 'left' }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ label, page = 1, pages = 1, onPage }) {
  const numbers = [1];
  if (page > 3) numbers.push('…');
  for (let value = Math.max(2, page - 1); value <= Math.min(pages - 1, page + 1); value += 1) {
    numbers.push(value);
  }
  if (page < pages - 2) numbers.push('…');
  if (pages > 1) numbers.push(pages);

  return (
    <div className="ad-table-foot">
      <span>{label}</span>
      <div className="ad-pager">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage?.(Math.max(1, page - 1))}
        >
          ‹
        </button>
        {numbers.map((value, index) =>
          value === '…' ? (
            <span key={`ellipsis-${index}`}>…</span>
          ) : (
            <button
              type="button"
              key={value}
              className={value === page ? 'on' : ''}
              aria-current={value === page ? 'page' : undefined}
              aria-label={`Page ${value}`}
              onClick={() => onPage?.(value)}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage?.(Math.min(pages, page + 1))}
        >
          ›
        </button>
      </div>
    </div>
  );
}
