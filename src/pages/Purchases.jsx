import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
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
import { defaultFilters, formatCurrency, formatDateTime, formatNumber } from '../utils/format.js';

const COLUMNS = [
  { key: 'occurred_at', header: 'Date', render: (row) => formatDateTime(row.occurred_at) },
  { key: 'base_name', header: 'Base' },
  { key: 'equipment_name', header: 'Equipment' },
  { key: 'category', header: 'Category' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => formatNumber(row.quantity) },
  { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
  { key: 'supplier', header: 'Supplier', render: (row) => row.supplier || '—' },
  { key: 'created_by', header: 'Logged by', render: (row) => row.created_by ?? '—' },
];

const emptyForm = { baseId: '', equipmentTypeId: '', quantity: '', unitCost: '', supplier: '' };

export default function Purchases() {
  const { user, can, canPickBase } = useAuth();
  const { baseOptions, equipmentOptions } = useMeta();

  const [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState(() => ({ ...emptyForm, baseId: canPickBase ? '' : String(user?.baseId ?? '') }));
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { key, params } = useFilterParams(filters);
  const purchases = useApi(() => api.get('/purchases', { params }).then((r) => r.data.data), key);

  const canRecord = can(ROLES.ADMIN, ROLES.LOGISTICS_OFFICER, ROLES.BASE_COMMANDER);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const { data } = await api.post('/purchases', {
        baseId: Number(form.baseId || user?.baseId),
        equipmentTypeId: Number(form.equipmentTypeId),
        quantity: Number(form.quantity),
        unitCost: form.unitCost === '' ? undefined : Number(form.unitCost),
        supplier: form.supplier || undefined,
      });
      setFeedback({ tone: 'success', message: data.message });
      setForm({ ...emptyForm, baseId: canPickBase ? '' : String(user?.baseId ?? '') });
      purchases.refetch();
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {canRecord && (
        <section className="card p-4" aria-label="Record a purchase">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
            <Plus size={16} aria-hidden="true" />
            Record a purchase
          </h2>

          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                label="Base"
                required
                hint={canPickBase ? undefined : `Locked to ${user?.baseName}`}
                value={canPickBase ? form.baseId : String(user?.baseId ?? '')}
                onChange={update('baseId')}
                disabled={!canPickBase}
                placeholder="Select a base…"
                options={baseOptions}
              />

              <SelectField
                label="Equipment type"
                required
                value={form.equipmentTypeId}
                onChange={update('equipmentTypeId')}
                placeholder="Select equipment…"
                options={equipmentOptions}
              />

              <Field label="Quantity" required>
                {(props) => (
                  <input {...props} type="number" min="1" step="1" value={form.quantity}
                    onChange={update('quantity')} placeholder="100" />
                )}
              </Field>

              <Field label="Unit cost (USD)">
                {(props) => (
                  <input {...props} type="number" min="0" step="0.01" value={form.unitCost}
                    onChange={update('unitCost')} placeholder="1150.00" />
                )}
              </Field>

              <Field label="Supplier">
                {(props) => (
                  <input {...props} type="text" maxLength={150} value={form.supplier}
                    onChange={update('supplier')} placeholder="Colt Defense" />
                )}
              </Field>
            </div>

            <Banner tone={feedback?.tone} message={feedback?.message} />

            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {submitting ? 'Recording…' : 'Record purchase'}
            </button>
          </form>
        </section>
      )}

      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} />

      <section aria-label="Purchase history" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">Purchase history</h2>
        <DataTable
          caption="Purchases recorded in the selected window"
          columns={COLUMNS}
          rows={purchases.data ?? []}
          loading={purchases.loading}
          error={purchases.error}
          onRetry={purchases.refetch}
          emptyTitle="No purchases in this window"
          emptyHint="Record one above, or widen the date range."
        />
      </section>
    </div>
  );
}
