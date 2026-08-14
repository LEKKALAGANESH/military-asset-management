import { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import DataTable from '../components/DataTable.jsx';
import Field from '../components/Field.jsx';
import SelectField from '../components/SelectField.jsx';
import useApi from '../hooks/useApi.js';
import useFilterParams from '../hooks/useFilterParams.js';
import api from '../services/api.js';
import { clampDateRange, daysAgo, formatDateTime, toInputDate } from '../utils/format.js';

const ACTION_TONES = {
  PURCHASE: 'emerald',
  TRANSFER: 'sky',
  ASSIGNMENT: 'violet',
  EXPENDITURE: 'rose',
  LOGIN: 'slate',
  LOGIN_FAILED: 'amber',
  ACCESS_DENIED: 'rose',
};

const COLUMNS = [
  { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
  { key: 'action', header: 'Action', render: (row) => <Badge tone={ACTION_TONES[row.action]}>{row.action}</Badge> },
  { key: 'username', header: 'User', render: (row) => row.username ?? 'anonymous' },
  { key: 'user_role', header: 'Role', render: (row) => row.user_role ?? '—' },
  { key: 'entity', header: 'Entity', render: (row) => (row.entity_id ? `${row.entity} #${row.entity_id}` : row.entity ?? '—') },
  { key: 'details', header: 'Details', render: (row) => <span className="whitespace-normal">{row.details}</span> },
  { key: 'ip_address', header: 'IP', render: (row) => row.ip_address ?? '—' },
];

export default function AuditLogs() {
  const [filters, setFilters] = useState({ action: '', startDate: daysAgo(30), endDate: toInputDate(new Date()) });
  const [actions, setActions] = useState([]);

  const { key, params } = useFilterParams(filters, { limit: 200 });
  const logs = useApi(() => api.get('/audit-logs', { params }).then((r) => r.data.data), key);

  useEffect(() => {
    api.get('/audit-logs/actions')
      .then(({ data }) => setActions(data.data))
      .catch(() => setActions([])); // Dropdown degrades to "All actions"; the table still works.
  }, []);

  const set = (field) => (event) =>
    setFilters(clampDateRange({ ...filters, [field]: event.target.value }, field));

  return (
    <div className="space-y-5">
      <section className="card p-4" aria-label="Audit filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            label="Action"
            value={filters.action}
            onChange={set('action')}
            placeholder="All actions"
            options={actions.map((action) => ({ value: action, label: action }))}
          />
          <Field label="From">
            {(props) => <input {...props} type="date" value={filters.startDate} onChange={set('startDate')} max={filters.endDate} />}
          </Field>
          <Field label="To">
            {(props) => <input {...props} type="date" value={filters.endDate} onChange={set('endDate')} min={filters.startDate} />}
          </Field>
        </div>
      </section>

      <section aria-label="Audit trail" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-200">System audit trail</h2>
          <p className="text-xs text-slate-500">Append-only · every mutation is recorded</p>
        </div>
        <DataTable
          caption="Every recorded system action in the selected window"
          columns={COLUMNS}
          rows={logs.data ?? []}
          loading={logs.loading}
          error={logs.error}
          onRetry={logs.refetch}
          emptyTitle="No audit entries in this window"
          emptyHint="Widen the date range or clear the action filter."
        />
      </section>
    </div>
  );
}
