const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/**
 * Keep local development sessions isolated per application. Browser cookies
 * are scoped by hostname, not port, so two apps on localhost would otherwise
 * overwrite the same backend session cookie.
 */
export function isolatedDevelopmentUrl(locationLike, appHostname) {
  if (!locationLike?.href || !LOOPBACK_HOSTS.has(locationLike.hostname)) return '';
  const target = new URL(locationLike.href);
  target.hostname = appHostname;
  return target.href;
}
