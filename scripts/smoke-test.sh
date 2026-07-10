#!/usr/bin/env bash
set -uo pipefail

TARGET_URL="${1:-${TARGET_URL:-}}"
ATTEMPTS="${SMOKE_ATTEMPTS:-5}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-10}"
BACKOFF_SECONDS="${SMOKE_BACKOFF_SECONDS:-2}"
CURL_BIN="${CURL_BIN:-curl}"
SLEEP_BIN="${SLEEP_BIN:-sleep}"

if [[ -z "$TARGET_URL" ]]; then
  echo "Usage: scripts/smoke-test.sh <service-url>" >&2
  exit 2
fi

if [[ ! "$TARGET_URL" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "Invalid service URL." >&2
  exit 2
fi

for value in "$ATTEMPTS" "$TIMEOUT_SECONDS" "$BACKOFF_SECONDS"; do
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "Smoke-test timing values must be non-negative integers." >&2
    exit 2
  fi
done

if (( ATTEMPTS < 1 || TIMEOUT_SECONDS < 1 )); then
  echo "Smoke-test attempts and timeout must be greater than zero." >&2
  exit 2
fi

HEALTH_URL="${TARGET_URL%/}/api/health"

for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  code="$($CURL_BIN \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --max-time "$TIMEOUT_SECONDS" \
    "$HEALTH_URL" 2>/dev/null)" || code="000"

  if [[ "$code" == "200" ]]; then
    echo "Health check passed on attempt $attempt/$ATTEMPTS."
    exit 0
  fi

  echo "Health check attempt $attempt/$ATTEMPTS returned HTTP $code." >&2
  if (( attempt < ATTEMPTS && BACKOFF_SECONDS > 0 )); then
    "$SLEEP_BIN" "$BACKOFF_SECONDS"
  fi
done

echo "Health check failed after $ATTEMPTS attempts." >&2
exit 1

