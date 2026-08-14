import { AsyncBoundary } from './States.jsx';

// Columns are data, not markup — every history view shares this one table.
export default function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  caption,
  emptyTitle = 'No records yet',
  emptyHint,
  rowKey = (row) => row.id,
}) {
  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!rows || rows.length === 0}
      emptyTitle={emptyTitle}
      emptyHint={emptyHint}
    >
      <div className="table-wrap">
        <table className="min-w-full divide-y divide-night-700">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-night-800/60">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`th ${column.align === 'right' ? 'text-right' : ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-night-800">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-night-800/40">
                {columns.map((column) => (
                  <td key={column.key} className={`td ${column.align === 'right' ? 'text-right font-mono' : ''}`}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AsyncBoundary>
  );
}
