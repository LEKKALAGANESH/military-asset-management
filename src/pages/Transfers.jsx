import { ArrowRight, Info, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import Banner from '../components/Banner.jsx';
import DataTable from '../components/DataTable.jsx';
import Field from '../components/Field.jsx';
import FilterBar from '../components/FilterBar.jsx';
import SelectField from '../components/SelectField.jsx';
import { ROLES, useAuth } from '../context/AuthContext.jsx';
import useApi from '../hooks/useApi.js';
import useFilterParams from '../hooks/useFilterParams.js';
import useMeta from '../hooks/useMeta.js';
import api from '../services/api.js';
import { defaultFilters, formatDateTime, formatNumber } from '../utils/format.js';

const DIRECTION_TONES = { IN: 'emerald', OUT: 'amber', INTERNAL: 'slate' };

const COLUMNS = [
  { key: 'occurred_at', header: 'Date', render: (row) => formatDateTime(row.occurred_at) },
  {
    key: 'direction',
    header: 'Direction',
    render: (row) => <Badge tone={DIRECTION_TONES[row.direction]}>{row.direction}</Badge>,
  },
  {
    key: 'route',
    header: 'Route',
    render: (row) => (
      <span className="inline-flex items-center gap-1.5">
        {row.source_base_name}
        <ArrowRight size={13} className="text-slate-500" aria-label="to" />
        {row.destination_base_name}
      </span>
    ),
  },
  { key: 'equipment_name', header: 'Equipment' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => formatNumber(row.quantity) },
  { key: 'status', header: 'Status' },
  { key: 'initiated_by', header: 'Initiated by', render: (row) => row.initiated_by ?? '—' },
  { key: 'notes', header: 'Notes', render: (row) => row.notes || '—' },
];

const emptyForm = { sourceBaseId: '', destinationBaseId: '', equipmentTypeId: '', quantity: '', notes: '' };

export default function Transfers() {
  const { user, can, canPickBase } = useAuth();
  const { bases, baseOptions, equipmentOptions } = useMeta();

  const [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState(() => ({ ...emptyForm, sourceBaseId: canPickBase ? '' : String(user?.baseId ?? '') }));
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState(null);

  const { key, params } = useFilterParams(filters);
  const transfers = useApi(() => api.get('/transfers', { params }).then((r) => r.data.data), key);

  const canInitiate = can(ROLES.ADMIN, ROLES.LOGISTICS_OFFICER);
  const sourceBaseId = canPickBase ? form.sourceBaseId : String(user?.baseId ?? '');
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  // Show what the source base holds so an overdraft is obvious before submitting rather than
  // arriving as a 409. The server still enforces it either way.
  useEffect(() => {
    if (!sourceBaseId || !form.equipmentTypeId) {
      setAvailable(null);
      return undefined;
    }

    let active = true;
    api.get('/assets/stock', { params: { baseId: sourceBaseId, equipmentTypeId: form.equipmentTypeId } })
      .then(({ data }) => {
        if (!active) return;
        const row = data.data.find((entry) => String(entry.base_id) === String(sourceBaseId));
        setAvailable(row?.quantity ?? 0);
      })
      .catch(() => active && setAvailable(null));

    return () => { active = false; };
  }, [sourceBaseId, form.equipmentTypeId]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const { data } = await api.post('/transfers', {
        sourceBaseId: Number(sourceBaseId),
        destinationBaseId: Number(form.destinationBaseId),
        equipmentTypeId: Number(form.equipmentTypeId),
        quantity: Number(form.quantity),
        notes: form.notes || undefined,
      });
      setFeedback({ tone: 'success', message: data.message });
      setForm({ ...emptyForm, sourceBaseId: canPickBase ? '' : String(user?.baseId ?? '') });
      setAvailable(null);
      transfers.refetch();
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const overdraft = available !== null && form.quantity !== '' && Number(form.quantity) > available;

  return (
    <div className="space-y-5">
      {canInitiate ? (
        <section className="card p-4" aria-label="Initiate a transfer">
          <h2 className="mb-3 text-sm font-bold text-slate-200">Initiate a transfer</h2>

          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="From base"
                required
                hint={canPickBase ? undefined : `Locked to ${user?.baseName}`}
                value={sourceBaseId}
                onChange={update('sourceBaseId')}
                disabled={!canPickBase}
                placeholder="Select source…"
                options={baseOptions}
              />

              <SelectField
                label="To base"
                required
                value={form.destinationBaseId}
                onChange={update('destinationBaseId')}
                placeholder="Select destination…"
                options={bases
                  .filter((base) => String(base.id) !== String(sourceBaseId))
                  .map((base) => ({ value: base.id, label: base.name }))}
              />

              <SelectField
                label="Equipment type"
                required
                value={form.equipmentTypeId}
                onChange={update('equipmentTypeId')}
                placeholder="Select equipment…"
                options={equipmentOptions}
              />

              <Field
                label="Quantity"
                required
                error={overdraft ? `Only ${formatNumber(available)} available at the source base.` : undefined}
                hint={available !== null && !overdraft ? `${formatNumber(available)} available` : undefined}
              >
                {(props) => (
                  <input {...props} type="number" min="1" step="1" value={form.quantity}
                    onChange={update('quantity')} placeholder="25" />
                )}
              </Field>
            </div>

            <Field label="Notes">
              {(props) => (
                <input {...props} type="text" maxLength={500} value={form.notes}
                  onChange={update('notes')} placeholder="Reinforcement of 2nd Battalion" />
              )}
            </Field>

            <Banner tone={feedback?.tone} message={feedback?.message} />

            <button type="submit" disabled={submitting || overdraft} className="btn-primary">
              {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {submitting ? 'Transferring…' : 'Execute transfer'}
            </button>
          </form>
        </section>
      ) : (
        <p className="card flex items-start gap-2 p-4 text-sm text-slate-400">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          Transfers are initiated by Logistics Officers and Administrators. You can review every
          movement involving your base below.
        </p>
      )}

      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} />

      <section aria-label="Transfer history" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">Movement history</h2>
        <DataTable
          caption="Transfers involving the selected base in the selected window"
          columns={COLUMNS}
          rows={transfers.data ?? []}
          loading={transfers.loading}
          error={transfers.error}
          onRetry={transfers.refetch}
          emptyTitle="No transfers in this window"
          emptyHint="Initiate one above, or widen the date range."
        />
      </section>
    </div>
  );
}
