function optionIdentity(option) {
  return option?.id ?? option?.value ?? option;
}

/**
 * Keeps a controlled relationship filter honest when its selected record falls
 * outside a capped or still-loading option register.
 */
export function UnloadedSelectionOption({ value, options = [], label }) {
  const selected = String(value ?? '');
  if (!selected || options.some((option) => String(optionIdentity(option)) === selected)) return null;

  return <option value={selected}>Selected {label} is outside this menu</option>;
}
