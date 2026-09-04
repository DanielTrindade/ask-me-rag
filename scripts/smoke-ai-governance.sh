#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-${TARGET_URL:-}}"
CURL_BIN="${CURL_BIN:-curl}"
MODE="${AI_SMOKE_MODE:-fallback}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-10}"

if [[ ! "$TARGET_URL" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "Usage: scripts/smoke-ai-governance.sh <service-url>" >&2
  exit 2
fi
if [[ "$MODE" != "fallback" && "$MODE" != "kill-switch" ]]; then
  echo "AI_SMOKE_MODE must be fallback or kill-switch." >&2
  exit 2
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

request() {
  local method="$1"
  local url="$2"
  local output="$3"
  local payload="${4:-}"
  local args=(--silent --show-error --output "$output" --write-out '%{http_code}' --max-time "$TIMEOUT_SECONDS")
  if [[ "$method" == "POST" ]]; then
    args+=(--request POST --header 'content-type: application/json' --data "$payload")
  fi
  "$CURL_BIN" "${args[@]}" "$url"
}

health_code="$(request GET "${TARGET_URL%/}/api/health" "$work_dir/health.json")"
[[ "$health_code" == "200" ]] || {
  echo "Health check returned HTTP $health_code." >&2
  exit 1
}
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$work_dir/health.json" || {
  echo "Health check returned an unexpected contract." >&2
  exit 1
}

if [[ "$MODE" == "fallback" ]]; then
  # A pergunta DEVE casar com uma FAQ determinística: se não casar, o serviço
  # chamaria o LLM (custo) e o grep abaixo falharia.
  question='Como posso entrar em contato com você?'
  payload='{"conversationId":"019f5cf7-7cc8-7d02-b252-4920e3c0861b","messages":[{"id":"smoke-faq","role":"user","parts":[{"type":"text","text":"'"$question"'"}]}]}'
  code="$(request POST "${TARGET_URL%/}/api/chat" "$work_dir/chat.txt" "$payload")"
  [[ "$code" == "200" ]] || { echo "Deterministic fallback returned HTTP $code." >&2; exit 1; }
  grep -q 'links profissionais' "$work_dir/chat.txt" || {
    echo "Deterministic FAQ answer was not returned." >&2
    exit 1
  }
  echo "No-bill smoke passed: health and deterministic fallback."
else
  payload='{"conversationId":"019f5cf7-7cc8-7d02-b252-4920e3c0861b","messages":[{"id":"smoke-limit","role":"user","parts":[{"type":"text","text":"smoke interno do kill switch"}]}]}'
  code="$(request POST "${TARGET_URL%/}/api/chat" "$work_dir/chat.json" "$payload")"
  [[ "$code" == "503" ]] || { echo "Kill-switch smoke returned HTTP $code instead of 503." >&2; exit 1; }
  grep -Eq '"error"[[:space:]]*:[[:space:]]*"disabled"' "$work_dir/chat.json" || {
    echo "Kill-switch smoke returned an unexpected contract." >&2
    exit 1
  }
  echo "No-bill smoke passed: health and internal kill switch."
fi
