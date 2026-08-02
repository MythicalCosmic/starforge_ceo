export function safeDocumentUrl(value, origin = globalThis.location?.origin || 'https://localhost') {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, origin);
    const localDevelopment = url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localDevelopment) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
