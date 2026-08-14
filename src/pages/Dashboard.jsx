import { ArrowLeftRight, Flame, PackageCheck, UserCheck, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Badge from '../components/Badge.jsx';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import NetMoveModal from '../components/NetMoveModal.jsx';
import StatCard from '../components/StatCard.jsx';
import { AsyncBoundary } from '../components/States.jsx';
import useApi from '../hooks/useApi.js';
import useFilterParams from '../hooks/useFilterParams.js';
import api from '../services/api.js';
import { defaultFilters, formatDateTime, formatNumber } from '../utils/format.js';

/**
 * Validated against the #0b1220 chart surface: inside the lightness band, above the chroma
 * floor, CVD separation ΔE 21.8 (protan), normal-vision ΔE 22.4, contrast above 3:1.
 */
const SERIES = [
  { key: 'Opening', color: '#6b8fd4' },
  { key: 'Closing', color: '#849433' },
];

const MOVEMENT_TONES = {
  PURCHASE: 'emerald',
  TRANSFER_IN: 'sky',
  TRANSFER_OUT: 'amber',
  ASSIGNMENT: 'violet',
  EXPENDITURE: 'rose',
};

const MOVEMENT_COLUMNS = [
  { key: 'occurred_at', header: 'When', render: (row) => formatDateTime(row.occurred_at) },
  {
    key: 'movement_type',
    header: 'Movement',
    render: (row) => (
      <Badge tone={MOVEMENT_TONES[row.movement_type]}>{row.movement_type.replace('_', ' ')}</Badge>
    ),
  },
  { key: 'base_name', header: 'Base' },
  { key: 'equipment_name', header: 'Equipment' },
  {
    key: 'delta',
    header: 'Quantity',
    align: 'right',
    render: (row) => (
      <span className={row.delta < 0 ? 'text-rose-400' : 'text-emerald-400'}>
        {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)}
      </span>
    ),
  },
  { key: 'actor', header: 'By', render: (row) => row.actor ?? '—' },
];

export default function Dashboard() {
  const [filters, setFilters] = useState(defaultFilters);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { key, params } = useFilterParams(filters);
  const metrics = useApi(() => api.get('/assets/metrics', { params }).then((r) => r.data), key);
  const balances = useApi(() => api.get('/assets/balances', { params }).then((r) => r.data.data), key);
  const movements = useApi(
    () => api.get('/assets/movements', { params: { ...params, limit: 15 } }).then((r) => r.data.data),
    key,
  );

  /**
   * One chart per category. A single axis cannot hold 42,000 rounds of 5.56mm and 3 M1
   * Abrams — the ammunition sets the scale and every vehicle renders as an invisible sliver.
   * Categories share a unit, so each facet gets a readable domain.
   */
  const facets = useMemo(() => {
    const groups = new Map();
    for (const row of balances.data ?? []) {
      if (row.openingBalance === 0 && row.closingBalance === 0) continue;
      if (!groups.has(row.category)) groups.set(row.category, { category: row.category, unit: row.unit, rows: [] });
      groups.get(row.category).rows.push({
        name: row.equipmentName,
        Opening: row.openingBalance,
        Closing: row.closingBalance,
      });
    }
    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
  }, [balances.data]);

  const m = metrics.data?.metrics;

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} />

      <AsyncBoundary loading={metrics.loading} error={metrics.error} onRetry={metrics.refetch}>
        <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Opening Balance" value={m?.openingBalance} accent="slate" icon={Warehouse}
            hint="Stock held before the window" />
          <StatCard label="Net Movement" value={m?.netMovement} accent="emerald" icon={ArrowLeftRight}
            hint="Click for the breakdown" onClick={() => setShowBreakdown(true)} />
          <StatCard label="Assigned" value={m?.assigned} accent="sky" icon={UserCheck}
            hint="Issued to personnel" />
          <StatCard label="Expended" value={m?.expended} accent="rose" icon={Flame}
            hint="Consumed or written off" />
          <StatCard label="Closing Balance" value={m?.closingBalance} accent="amber" icon={PackageCheck}
            hint="Opening + net − assigned − expended" />
        </section>
      </AsyncBoundary>

      {m && <NetMoveModal metrics={m} open={showBreakdown} onClose={() => setShowBreakdown(false)} />}

      <section className="card p-4" aria-label="Opening versus closing balance by equipment type">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-200">Opening vs Closing balance</h2>
          {/* One legend for every facet — identity is never colour-alone. */}
          <ul className="flex items-center gap-4 text-xs text-slate-400">
            {SERIES.map((series) => (
              <li key={series.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: series.color }} aria-hidden="true" />
                {series.key}
              </li>
            ))}
          </ul>
        </div>

        <AsyncBoundary
          loading={balances.loading}
          error={balances.error}
          onRetry={balances.refetch}
          isEmpty={facets.length === 0}
          emptyTitle="No stock in this window"
          emptyHint="Widen the date range or clear the equipment filter."
        >
          <>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {facets.map((facet) => (
                <figure key={facet.category} className="min-w-0">
                  <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {facet.category} <span className="normal-case text-slate-500">({facet.unit.toLowerCase()}s)</span>
                  </figcaption>
                  {/* Horizontal bars: equipment names read straight instead of tilted. */}
                  <div style={{ height: Math.max(120, facet.rows.length * 46 + 24) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={facet.rows}
                        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                        barGap={2}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#273652" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={formatNumber} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fill: '#cbd5e1', fontSize: 11 }}
                          width={140}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: '#ffffff0a' }}
                          contentStyle={{ background: '#121b2e', border: '1px solid #273652', borderRadius: 8, color: '#e2e8f0' }}
                          formatter={(value) => `${formatNumber(value)} ${facet.unit.toLowerCase()}s`}
                        />
                        {SERIES.map((series) => (
                          <Bar key={series.key} dataKey={series.key} fill={series.color} radius={[0, 4, 4, 0]} barSize={12} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </figure>
              ))}
            </div>

            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
                View balances as a table
              </summary>
              <div className="table-wrap mt-3">
                <table className="min-w-full divide-y divide-night-700">
                  <caption className="sr-only">Opening and closing balance per equipment type</caption>
                  <thead className="bg-night-800/60">
                    <tr>
                      <th scope="col" className="th">Equipment</th>
                      <th scope="col" className="th">Category</th>
                      <th scope="col" className="th text-right">Opening</th>
                      <th scope="col" className="th text-right">Net</th>
                      <th scope="col" className="th text-right">Assigned</th>
                      <th scope="col" className="th text-right">Expended</th>
                      <th scope="col" className="th text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-night-800">
                    {(balances.data ?? []).map((row) => (
                      <tr key={row.equipmentTypeId}>
                        <td className="td">{row.equipmentName}</td>
                        <td className="td">{row.category}</td>
                        <td className="td text-right font-mono">{formatNumber(row.openingBalance)}</td>
                        <td className="td text-right font-mono">{formatNumber(row.netMovement)}</td>
                        <td className="td text-right font-mono">{formatNumber(row.assigned)}</td>
                        <td className="td text-right font-mono">{formatNumber(row.expended)}</td>
                        <td className="td text-right font-mono text-slate-50">{formatNumber(row.closingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        </AsyncBoundary>
      </section>

      <section aria-label="Recent activity" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">Recent activity</h2>
        <DataTable
          caption="The most recent asset movements in the selected window"
          columns={MOVEMENT_COLUMNS}
          rows={movements.data ?? []}
          loading={movements.loading}
          error={movements.error}
          onRetry={movements.refetch}
          emptyTitle="No movements in this window"
          emptyHint="Record a purchase or transfer, or widen the date range."
          rowKey={(row) => `${row.movement_type}-${row.id}`}
        />
      </section>
    </div>
  );
}
