#!/usr/bin/env bash
# Fill Secret Manager values for ask-me-rag with validation + confirmation.
# Usage: bash scripts/fill-secrets.sh
#
# Safety nets (each of these caught a real production mistake):
#   - Values are masked everywhere; the full secret is never echoed.
#   - The Supabase key is decoded and REJECTED if it is the anon key.
#   - The Google API key is live-tested against the API before publishing.
#   - Secrets are created automatically if they don't exist yet.
set -euo pipefail

GCLOUD="${GCLOUD:-gcloud}"
PROJECT="${PROJECT:-$($GCLOUD config get-value project 2>/dev/null)}"

if [ -z "$PROJECT" ]; then
  echo "No GCP project set. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

# ---- helpers ----

mask() {
  # Masked preview: first 6 and last 4 chars visible, middle replaced by dots.
  local v="$1"
  local len=${#v}
  if [ "$len" -le 10 ]; then
    printf '%.0s*' $(seq 1 "$len")
    return
  fi
  printf '%s...%s' "${v:0:6}" "${v: -4}"
}

b64url_decode() {
  # Decode a JWT segment (base64url, no padding) to plain text.
  local seg="$1"
  local pad=$(( (4 - ${#seg} % 4) % 4 ))
  printf '%s%*s' "$seg" "$pad" | tr '_-' '/+' | tr -d '\n' | base64 -d 2>/dev/null
}

supabase_role() {
  # Print the role of a Supabase key: service_role, anon, secret (new sb_secret_
  # format, equivalent to service_role), publishable (new anon equivalent),
  # or NOT_RECOGNIZED.
  local key="$1"
  case "$key" in
    sb_secret_*)      echo "secret"; return ;;
    sb_publishable_*) echo "publishable"; return ;;
  esac
  local payload
  payload=$(echo "$key" | cut -d. -f2)
  if [ -z "$payload" ] || [ "$payload" = "$key" ]; then
    echo "NOT_RECOGNIZED"
    return
  fi
  local decoded
  decoded=$(b64url_decode "$payload" || true)
  local role
  role=$(echo "$decoded" | grep -oE '"role":"[^"]+"' | head -1 | cut -d: -f2 | tr -d '"')
  echo "${role:-NOT_RECOGNIZED}"
}

validate_supabase_service_key() {
  # Returns 0 only for keys that can act as the server-side privileged key.
  local role
  role=$(supabase_role "$1")
  case "$role" in
    service_role|secret)
      echo "  [ok]   key role: $role"
      return 0 ;;
    anon|publishable)
      echo "  [FAIL] this is the PUBLIC '$role' key, not the service key." >&2
      echo "         The app's RLS setup revokes all access from anon, so this key" >&2
      echo "         breaks every Supabase call. Copy the 'service_role' (legacy)" >&2
      echo "         or 'Secret key' (sb_secret_...) from:" >&2
      echo "         Supabase Dashboard -> Project Settings -> API keys" >&2
      return 1 ;;
    *)
      echo "  [warn] key format not recognized (role=$role); publishing anyway may break the app." >&2
      return 2 ;;
  esac
}

validate_google_key() {
  # Live-test the key against the Generative Language API.
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    "https://generativelanguage.googleapis.com/v1beta/models?key=$1" || echo "000")
  if [ "$code" = "200" ]; then
    echo "  [ok]   key accepted by generativelanguage.googleapis.com"
    return 0
  fi
  echo "  [FAIL] Google API rejected the key (HTTP $code)." >&2
  echo "         Generate an API key at https://aistudio.google.com/apikey" >&2
  return 1
}

ensure_secret_exists() {
  local name="$1"
  if ! "$GCLOUD" secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    echo "  [new]  creating secret $name"
    "$GCLOUD" secrets create "$name" --replication-policy=automatic \
      --project="$PROJECT" --quiet
  fi
}

confirm_publish() {
  local name="$1" masked="$2"
  echo
  echo "  Secret:  $name"
  echo "  Preview: $masked"
  printf '  Publish this value? [y/N]: '
  local reply
  read -r reply
  [ "${reply:-N}" = "y" ] || [ "${reply:-N}" = "Y" ]
}

fill() {
  # Args: name, prompt, validator (optional function name)
  local name="$1" prompt="$2" validator="${3:-}"
  printf '%s' "$prompt"
  read -rs value; echo
  if [ -z "$value" ]; then
    echo "  [skip] empty value for $name"
    return
  fi

  if [ -n "$validator" ]; then
    local rc=0
    "$validator" "$value" || rc=$?
    if [ "$rc" -eq 1 ]; then
      echo "  [skip] $name not published — fix the key and rerun."
      return
    fi
  fi

  if confirm_publish "$name" "$(mask "$value")"; then
    ensure_secret_exists "$name"
    printf '%s' "$value" | "$GCLOUD" secrets versions add "$name" \
      --data-file=- --project="$PROJECT" --quiet
    echo "  [ok]   published new version of $name"
  else
    echo "  [skip] not published — value discarded"
  fi
}

# ---- main ----

echo "Filling secrets for project $PROJECT."
echo "Input is hidden while typing; only a masked preview is ever shown."
echo "Press Enter without typing to skip a secret. Ctrl-C to abort."
echo

fill google-generative-ai-api-key "Google AI Studio API key (REQUIRED, used for embeddings + chat): " validate_google_key
fill supabase-service-role-key   "Supabase service role / secret key (REQUIRED): " validate_supabase_service_key
fill admin-password              "Admin password for /admin (REQUIRED): "
fill anthropic-api-key           "Anthropic API key (leave blank if not using Claude): "
fill openai-api-key              "OpenAI API key (leave blank if not using GPT): "

echo
echo "Done. Verify with: gcloud secrets list --project=$PROJECT"
echo "Then redeploy (or restart) so Cloud Run picks up the ':latest' versions:"
echo "  gcloud builds submit --config cloudbuild.yaml"
