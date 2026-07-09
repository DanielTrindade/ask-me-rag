#!/usr/bin/env bash
# Health-check the ask-me-rag Cloud Run deployment end to end.
# Usage: bash scripts/check-deploy.sh
# Validates secret VALUES (not just their existence), the service status,
# and smoke-tests the live endpoints. Never prints secret material.
set -uo pipefail

GCLOUD="${GCLOUD:-gcloud}"
PROJECT="${PROJECT:-$($GCLOUD config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-ask-me-rag}"
FAILURES=0

ok()   { echo "  [ok]   $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo "  [warn] $1"; }

b64url_decode() {
  local seg="$1"
  local pad=$(( (4 - ${#seg} % 4) % 4 ))
  printf '%s%*s' "$seg" "$pad" | tr '_-' '/+' | tr -d '\n' | base64 -d 2>/dev/null
}

echo "== Checking secrets in project $PROJECT =="

# Supabase key: must be service_role (legacy JWT) or sb_secret_ (new format).
supa=$($GCLOUD secrets versions access latest --secret=supabase-service-role-key \
  --project="$PROJECT" 2>/dev/null)
if [ -z "$supa" ]; then
  fail "supabase-service-role-key has no accessible version"
else
  case "$supa" in
    sb_secret_*) ok "supabase key is a new-format secret key" ;;
    sb_publishable_*) fail "supabase key is the PUBLIC publishable key — replace with the secret key" ;;
    *)
      role=$(b64url_decode "$(echo "$supa" | cut -d. -f2)" \
        | grep -oE '"role":"[^"]+"' | head -1 | cut -d: -f2 | tr -d '"')
      if [ "$role" = "service_role" ]; then
        ok "supabase key role: service_role"
      else
        fail "supabase key role is '${role:-unknown}' — the app needs service_role (run scripts/fill-secrets.sh)"
      fi ;;
  esac
fi

# Google key: live test, report status only.
gkey=$($GCLOUD secrets versions access latest --secret=google-generative-ai-api-key \
  --project="$PROJECT" 2>/dev/null)
if [ -z "$gkey" ]; then
  fail "google-generative-ai-api-key has no accessible version"
else
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    "https://generativelanguage.googleapis.com/v1beta/models?key=$gkey" || echo "000")
  if [ "$code" = "200" ]; then
    ok "Google API key accepted (HTTP 200)"
  else
    fail "Google API rejected the key (HTTP $code) — run scripts/fill-secrets.sh with a fresh key"
  fi
fi

echo
echo "== Checking Cloud Run service $SERVICE ($REGION) =="
url=$($GCLOUD run services describe "$SERVICE" --region="$REGION" \
  --project="$PROJECT" --format="value(status.url)" 2>/dev/null)
ready=$($GCLOUD run services describe "$SERVICE" --region="$REGION" \
  --project="$PROJECT" --format="value(status.conditions[0].status)" 2>/dev/null)
if [ "$ready" = "True" ] && [ -n "$url" ]; then
  ok "service Ready at $url"
else
  fail "service not Ready (status=${ready:-unknown})"
fi

if [ -n "$url" ]; then
  echo
  echo "== Smoke-testing live endpoints =="
  home=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$url/")
  [ "$home" = "200" ] && ok "GET / -> 200" || fail "GET / -> $home"

  chat=$(curl -s --max-time 60 -X POST "$url/api/chat" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"id":"healthcheck","role":"user","parts":[{"type":"text","text":"ping"}]}]}' \
    -w '\n%{http_code}')
  chat_code=$(echo "$chat" | tail -1)
  if [ "$chat_code" = "200" ]; then
    ok "POST /api/chat -> 200 (RAG pipeline responding)"
  else
    fail "POST /api/chat -> $chat_code: $(echo "$chat" | head -1 | head -c 200)"
  fi
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$FAILURES check(s) failed."
  exit 1
fi
