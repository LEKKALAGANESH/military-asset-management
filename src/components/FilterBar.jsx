import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useMeta from '../hooks/useMeta.js';
import { clampDateRange } from '../utils/format.js';
import Field from './Field.jsx';
import SelectField from './SelectField.jsx';

export default function FilterBar({ filters, onChange, onReset }) {
  const { canPickBase, user } = useAuth();
  const { baseOptions, equipmentOptions } = useMeta();

  const set = (key) => (event) =>
    onChange(clampDateRange({ ...filters, [key]: event.target.value }, key));

  return (
    <section className="card p-4" aria-label="Filters">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filters
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From">
          {(props) => <input {...props} type="date" value={filters.startDate} onChange={set('startDate')} max={filters.endDate || undefined} />}
        </Field>

        <Field label="To">
          {(props) => <input {...props} type="date" value={filters.endDate} onChange={set('endDate')} min={filters.startDate || undefined} />}
        </Field>

        {/* Disabled for anyone but an Admin — the server overwrites their baseId anyway,
            so offering the control would be a lie. */}
        <SelectField
          label="Base"
          hint={canPickBase ? undefined : `Locked to ${user?.baseName ?? 'your base'}`}
          value={canPickBase ? filters.baseId : ''}
          onChange={set('baseId')}
          disabled={!canPickBase}
          placeholder={canPickBase ? 'All bases' : user?.baseName ?? 'Your base'}
          options={canPickBase ? baseOptions : []}
        />

        <SelectField
          label="Equipment type"
          value={filters.equipmentTypeId}
          onChange={set('equipmentTypeId')}
          placeholder="All equipment"
          options={equipmentOptions}
        />
      </div>

      {onReset && (
        <button type="button" onClick={onReset} className="btn-ghost mt-3 !py-1.5 text-xs">
          <RotateCcw size={13} aria-hidden="true" />
          Reset filters
        </button>
      )}
    </section>
  );
}
