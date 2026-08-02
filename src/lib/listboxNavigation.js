export function findEnabledOptionIndex(options, start, direction = 1) {
  if (!Array.isArray(options) || !options.length) return -1;

  const step = direction < 0 ? -1 : 1;
  const bounded = Math.min(options.length - 1, Math.max(0, start));

  for (let index = bounded; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) return index;
  }

  for (let index = bounded - step; index >= 0 && index < options.length; index -= step) {
    if (!options[index]?.disabled) return index;
  }

  return -1;
}
