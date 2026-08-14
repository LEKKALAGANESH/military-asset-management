import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import Banner from '../components/Banner.jsx';
import DataTable from '../components/DataTable.jsx';
import Field from '../components/Field.jsx';
import FilterBar from '../components/FilterBar.jsx';
import SelectField from '../components/SelectField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useApi from '../hooks/useApi.js';
import useFilterParams from '../hooks/useFilterParams.js';
import useMeta from '../hooks/useMeta.js';
import api from '../services/api.js';
import { defaultFilters, formatDateTime, formatNumber } from '../utils/format.js';

const ASSIGNMENT_COLUMNS = [
  { key: 'occurred_at', header: 'Date', render: (row) => formatDateTime(row.occurred_at) },
  { key: 'base_name', header: 'Base' },
  { key: 'equipment_name', header: 'Equipment' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => formatNumber(row.quantity) },
  {
    key: 'assigned_to',
    header: 'Assigned to',
    render: (row) => `${row.personnel_rank ? `${row.personnel_rank} ` : ''}${row.assigned_to}`,
  },
  { key: 'purpose', header: 'Purpose', render: (row) => row.purpose || '—' },
  { key: 'created_by', header: 'Logged by', render: (row) => row.created_by ?? '—' },
];

const EXPENDITURE_COLUMNS = [
  { key: 'occurred_at', header: 'Date', render: (row) => formatDateTime(row.occurred_at) },
  { key: 'base_name', header: 'Base' },
  { key: 'equipment_name', header: 'Equipment' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => formatNumber(row.quantity) },
  { key: 'reason', header: 'Reason' },
  { key: 'created_by', header: 'Logged by', render: (row) => row.created_by ?? '—' },
];

const TABS = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'expenditures', label: 'Expenditures' },
];

const emptyAssignment = { equipmentTypeId: '', quantity: '', assignedTo: '', personnelRank: '', purpose: '' };
const emptyExpenditure = { equipmentTypeId: '', quantity: '', reason: '' };

export default function Assignments() {
  const { user, canPickBase } = useAuth();
  const { baseOptions, equipmentOptions } = useMeta();

  const [tab, setTab] = useState('assignments');
  const [filters, setFilters] = useState(defaultFilters);
  const [baseId, setBaseId] = useState(() => (canPickBase ? '' : String(user?.baseId ?? '')));
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [expenditureForm, setExpenditureForm] = useState(emptyExpenditure);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { key, params } = useFilterParams(filters);
  const assignments = useApi(() => api.get('/assignments', { params }).then((r) => r.data.data), key);
  const expenditures = useApi(() => api.get('/expenditures', { params }).then((r) => r.data.data), key);

  const isAssignmentTab = tab === 'assignments';
  const targetBaseId = canPickBase ? baseId : String(user?.baseId ?? '');

  const updateAssignment = (field) => (event) =>
    setAssignmentForm({ ...assignmentForm, [field]: event.target.value });
  const updateExpenditure = (field) => (event) =>
    setExpenditureForm({ ...expenditureForm, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      if (isAssignmentTab) {
        const { data } = await api.post('/assignments', {
          baseId: Number(targetBaseId),
          equipmentTypeId: Number(assignmentForm.equipmentTypeId),
          quantity: Number(assignmentForm.quantity),
          assignedTo: assignmentForm.assignedTo,
          personnelRank: assignmentForm.personnelRank || undefined,
          purpose: assignmentForm.purpose || undefined,
        });
        setFeedback({ tone: 'success', message: data.message });
        setAssignmentForm(emptyAssignment);
        assignments.refetch();
      } else {
        const { data } = await api.post('/expenditures', {
          baseId: Number(targetBaseId),
          equipmentTypeId: Number(expenditureForm.equipmentTypeId),
          quantity: Number(expenditureForm.quantity),
          reason: expenditureForm.reason,
        });
        setFeedback({ tone: 'success', message: data.message });
        setExpenditureForm(emptyExpenditure);
        expenditures.refetch();
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Record type" className="flex gap-1 rounded-xl border border-night-700 bg-night-900 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => { setTab(item.id); setFeedback(null); }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === item.id ? 'bg-olive-600 text-white' : 'text-slate-300 hover:bg-night-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="card p-4" aria-label={isAssignmentTab ? 'Assign equipment' : 'Record an expenditure'}>
        <h2 className="mb-3 text-sm font-bold text-slate-200">
          {isAssignmentTab ? 'Assign equipment to personnel' : 'Record consumed or written-off stock'}
        </h2>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Base"
              required
              hint={canPickBase ? undefined : `Locked to ${user?.baseName}`}
              value={targetBaseId}
              onChange={(event) => setBaseId(event.target.value)}
              disabled={!canPickBase}
              placeholder="Select a base…"
              options={baseOptions}
            />

            {isAssignmentTab ? (
              <>
                <SelectField
                  label="Equipment type"
                  required
                  value={assignmentForm.equipmentTypeId}
                  onChange={updateAssignment('equipmentTypeId')}
                  placeholder="Select equipment…"
                  options={equipmentOptions}
                />

                <Field label="Quantity" required>
                  {(props) => (
                    <input {...props} type="number" min="1" step="1" value={assignmentForm.quantity}
                      onChange={updateAssignment('quantity')} placeholder="10" />
                  )}
                </Field>

                <Field label="Assigned to" required>
                  {(props) => (
                    <input {...props} type="text" maxLength={120} value={assignmentForm.assignedTo}
                      onChange={updateAssignment('assignedTo')} placeholder="Elena Rivera" />
                  )}
                </Field>

                <Field label="Rank">
                  {(props) => (
                    <input {...props} type="text" maxLength={50} value={assignmentForm.personnelRank}
                      onChange={updateAssignment('personnelRank')} placeholder="SGT" />
                  )}
                </Field>

                <Field label="Purpose">
                  {(props) => (
                    <input {...props} type="text" maxLength={500} value={assignmentForm.purpose}
                      onChange={updateAssignment('purpose')} placeholder="Border patrol rotation" />
                  )}
                </Field>
              </>
            ) : (
              <>
                <SelectField
                  label="Equipment type"
                  required
                  value={expenditureForm.equipmentTypeId}
                  onChange={updateExpenditure('equipmentTypeId')}
                  placeholder="Select equipment…"
                  options={equipmentOptions}
                />

                <Field label="Quantity" required>
                  {(props) => (
                    <input {...props} type="number" min="1" step="1" value={expenditureForm.quantity}
                      onChange={updateExpenditure('quantity')} placeholder="5000" />
                  )}
                </Field>

                <Field label="Reason" required>
                  {(props) => (
                    <input {...props} type="text" maxLength={200} value={expenditureForm.reason}
                      onChange={updateExpenditure('reason')} placeholder="Live-fire training exercise" />
                  )}
                </Field>
              </>
            )}
          </div>

          <Banner tone={feedback?.tone} message={feedback?.message} />

          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? 'Saving…' : isAssignmentTab ? 'Assign equipment' : 'Record expenditure'}
          </button>
        </form>
      </section>

      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} />

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">
          {isAssignmentTab ? 'Assignment history' : 'Expenditure history'}
        </h2>
        {isAssignmentTab ? (
          <DataTable
            caption="Equipment assigned to personnel in the selected window"
            columns={ASSIGNMENT_COLUMNS}
            rows={assignments.data ?? []}
            loading={assignments.loading}
            error={assignments.error}
            onRetry={assignments.refetch}
            emptyTitle="No assignments in this window"
            emptyHint="Assign equipment above, or widen the date range."
          />
        ) : (
          <DataTable
            caption="Stock consumed or written off in the selected window"
            columns={EXPENDITURE_COLUMNS}
            rows={expenditures.data ?? []}
            loading={expenditures.loading}
            error={expenditures.error}
            onRetry={expenditures.refetch}
            emptyTitle="No expenditures in this window"
            emptyHint="Record one above, or widen the date range."
          />
        )}
      </section>
    </div>
  );
}
