export function DataTable({ cols, children, selectable = false, label = 'Records' }) {
  return (
    <div className="ad-table-wrap" tabIndex="0" role="region" aria-label={label}>
      <table
        className={`ad-table${selectable ? ' ad-table-selectable' : ''}`}
        aria-label={label}
      >
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
