function boundedQueryText(value, maximum) {
  const text = [...String(value || '')]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim();
  return text.slice(0, maximum);
}

export function managementQueryState(query) {
  const params = new URLSearchParams(query);
  const rawPage = String(params.get('page') || '');
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    search: boundedQueryText(params.get('q'), 160),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    cursor: boundedQueryText(params.get('cursor'), 512) || null,
  };
}
