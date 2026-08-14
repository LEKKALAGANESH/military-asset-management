import { useId } from 'react';

// Render prop passes the generated id down, so input, select and textarea all work.
export default function Field({ label, error, hint, required, children }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="ml-1 text-rose-400" aria-hidden="true">*</span>}
      </label>

      {children({
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? errorId : undefined,
        required,
        className: `input ${error ? 'border-rose-500' : ''}`,
      })}

      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
