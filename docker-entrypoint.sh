#!/bin/sh
set -eu
umask 077

api_upstream=${API_UPSTREAM:-}

fail_upstream() {
  echo 'API_UPSTREAM must be one HTTPS origin with a valid host and optional port, with no path, credentials, control characters, or trailing slash.' >&2
  exit 1
}

# Reject every character outside the origin grammar before invoking grep.
# grep evaluates input line-by-line, so this explicit whole-value guard is
# required to prevent CR/LF content from validating one line and then being
# injected into the rendered Nginx configuration.
case "$api_upstream" in
  ""|*[!A-Za-z0-9.:/-]*)
    fail_upstream
    ;;
esac

if ! printf '%s\n' "$api_upstream" \
  | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
  fail_upstream
fi

authority=${api_upstream#https://}
api_upstream_host=${authority%%:*}

# Accept DNS names and IPv4 literals, but reject empty, oversized, or malformed
# labels before they reach either Nginx configuration or TLS SNI verification.
if [ "${#api_upstream_host}" -gt 253 ] \
  || ! printf '%s\n' "$api_upstream_host" \
    | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$'; then
  fail_upstream
fi

case "$authority" in
  *:*)
    port=${authority##*:}
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
      fail_upstream
    fi
    ;;
esac

export API_UPSTREAM_HOST="$api_upstream_host"
envsubst '${API_UPSTREAM} ${API_UPSTREAM_HOST}' \
  < /etc/nginx/nginx.conf.template \
  > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
