#!/bin/sh
set -eu

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
case "$authority" in
  *:*)
    port=${authority##*:}
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
      fail_upstream
    fi
    ;;
esac

envsubst '${API_UPSTREAM}' \
  < /etc/nginx/nginx.conf.template \
  > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
