import Field from './Field.jsx';

export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  hint,
  error,
}) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(props) => (
        <select {...props} value={value} onChange={onChange} disabled={disabled}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}
