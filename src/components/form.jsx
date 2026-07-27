export function Field({ label, required, children }) {
  return (
    <label className="sf-field">
      <span className="sf-field-l">
        {label}
        {required && <em aria-hidden="true">*</em>}
      </span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, type = 'text', ...rest }) {
  return (
    <input
      className="sf-input"
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      {...rest}
    />
  );
}
