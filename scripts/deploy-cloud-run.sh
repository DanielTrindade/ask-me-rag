#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:?GCP_REGION is required}"
SERVICE="${CLOUD_RUN_SERVICE:?CLOUD_RUN_SERVICE is required}"
IMAGE_DIGEST="${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
RUNTIME_SA="${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
EXPECTED_SHA="${EXPECTED_GIT_SHA:?EXPECTED_GIT_SHA is required}"
REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
OBSERVABILITY_ENABLED="${CHAT_OBSERVABILITY_ENABLED:-false}"
TRUSTED_PROXY_HOPS="${CHAT_TRUSTED_PROXY_HOPS:-unset}"
CHAT_PROVIDER="${CHAT_LLM_PROVIDER:-groq}"
GOVERNANCE_MODE="${CHAT_GOVERNANCE_MODE:-off}"
ROLLOUT_PERCENT="${ROLLOUT_TRAFFIC_PERCENT:-0}"
IP_HMAC_SECRET="${CHAT_IP_HMAC_SECRET:-ask-me-chat-ip-hmac-key}"
IP_ENCRYPTION_SECRET="${CHAT_IP_ENCRYPTION_SECRET:-ask-me-chat-ip-encryption-keys}"
BUILD_LABEL="${BUILD_ID:-manual}"
GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
CURL_BIN="${CURL_BIN:-curl}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SMOKE_TEST_BIN="${SMOKE_TEST_BIN:-scripts/smoke-test.sh}"

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid Git SHA." >&2; exit 2; }
[[ "$IMAGE_DIGEST" == *@sha256:* ]] || { echo "IMAGE_DIGEST must be immutable." >&2; exit 2; }
[[ "$OBSERVABILITY_ENABLED" == "true" || "$OBSERVABILITY_ENABLED" == "false" ]] || {
  echo "CHAT_OBSERVABILITY_ENABLED must be true or false." >&2
  exit 2
}
[[ "$CHAT_PROVIDER" == "groq" ]] || {
  echo "CHAT_LLM_PROVIDER is invalid." >&2
  exit 2
}
[[ "$GOVERNANCE_MODE" == "off" || "$GOVERNANCE_MODE" == "shadow" || "$GOVERNANCE_MODE" == "enforce" ]] || {
  echo "CHAT_GOVERNANCE_MODE must be off, shadow, or enforce." >&2
  exit 2
}
[[ "$ROLLOUT_PERCENT" =~ ^([0-9]|[1-9][0-9]|100)$ ]] || {
  echo "ROLLOUT_TRAFFIC_PERCENT must be an integer from 0 to 100." >&2
  exit 2
}
if [[ "$OBSERVABILITY_ENABLED" == "true" ]]; then
  [[ "$TRUSTED_PROXY_HOPS" =~ ^([0-9]|10)$ ]] || {
    echo "CHAT_TRUSTED_PROXY_HOPS must be an integer from 0 to 10 when observability is enabled." >&2
    exit 2
  }
elif [[ "$TRUSTED_PROXY_HOPS" == "unset" ]]; then
  TRUSTED_PROXY_HOPS=""
fi

SHORT_SHA="${EXPECTED_SHA:0:12}"
BUILD_SUFFIX="$(printf '%s' "$BUILD_LABEL" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-8)"
BUILD_SUFFIX="${BUILD_SUFFIX:-manual}"
SUFFIX="sha-${SHORT_SHA}-${BUILD_SUFFIX}"
CANDIDATE_TAG="candidate-${SHORT_SHA}-${BUILD_SUFFIX}"
REVISION="${SERVICE}-${SUFFIX}"

service_json() {
  "$GCLOUD_BIN" run services describe "$SERVICE" --project="$PROJECT_ID" \
    --region="$REGION" --format=json
}

before="$(service_json)"
STABLE_REVISION="$(printf '%s' "$before" | "$PYTHON_BIN" -c \
  'import json,sys; d=json.load(sys.stdin); candidates=[t for t in d.get("status",{}).get("traffic",[]) if t.get("revisionName") and int(t.get("percent",0)) > 0]; print(max(candidates,key=lambda t:int(t.get("percent",0))).get("revisionName","") if candidates else "")')"
[[ -n "$STABLE_REVISION" ]] || { echo "Could not identify stable revision." >&2; exit 1; }

echo "Deploying candidate revision without production traffic."
"$GCLOUD_BIN" run deploy "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE_DIGEST" --service-account="$RUNTIME_SA" \
  --revision-suffix="$SUFFIX" --tag="$CANDIDATE_TAG" --no-traffic \
  --labels="commit-sha=$SHORT_SHA,build-id=$BUILD_LABEL,managed-by=cloud-build" \
  --update-env-vars="CHAT_LLM_PROVIDER=$CHAT_PROVIDER,CHAT_GOVERNANCE_MODE=$GOVERNANCE_MODE,CHAT_OBSERVABILITY_ENABLED=$OBSERVABILITY_ENABLED,CHAT_TRUSTED_PROXY_HOPS=$TRUSTED_PROXY_HOPS,CHAT_IP_ACTIVE_KEY_VERSION=v1,CHAT_IP_RETENTION_DAYS=7,CHAT_CONVERSATION_RETENTION_DAYS=30,CHAT_AUDIT_RETENTION_DAYS=90" \
  --remove-env-vars="LLM_PROVIDER,GOOGLE_MODEL,EMBEDDING_PROVIDER,EMBEDDING_MODEL,EMBEDDING_DIMENSION,GOOGLE_VERTEX_PROJECT,GOOGLE_VERTEX_LOCATION,EMBEDDING_VERTEX_PROJECT,EMBEDDING_VERTEX_LOCATION" \
  --remove-secrets="GOOGLE_GENERATIVE_AI_API_KEY,ANTHROPIC_API_KEY,OPENAI_API_KEY" \
  --update-secrets="GROQ_API_KEY=groq-api-key:latest,CHAT_IP_HMAC_KEY_BASE64=${IP_HMAC_SECRET}:latest,CHAT_IP_ENCRYPTION_KEYS_JSON=${IP_ENCRYPTION_SECRET}:latest" \
  --quiet

candidate_state="$(service_json)"
CANDIDATE_URL="$(printf '%s' "$candidate_state" | CANDIDATE_TAG="$CANDIDATE_TAG" "$PYTHON_BIN" -c \
  'import json,os,sys; d=json.load(sys.stdin); tag=os.environ["CANDIDATE_TAG"]; print(next((t.get("url", "") for t in d.get("status",{}).get("traffic",[]) if t.get("tag")==tag), ""))')"
[[ -n "$CANDIDATE_URL" ]] || { echo "Candidate URL was not assigned." >&2; exit 1; }

bash "$SMOKE_TEST_BIN" "$CANDIDATE_URL"

if [[ "$ROLLOUT_PERCENT" == "0" ]]; then
  echo "Candidate revision $REVISION validated with 0% production traffic."
  exit 0
fi

if [[ "${SKIP_HEAD_CHECK:-false}" != "true" ]]; then
  remote_sha="$("$CURL_BIN" --fail --silent --show-error \
    -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${REPOSITORY}/commits/main" \
    | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["sha"])')"
  [[ "$remote_sha" == "$EXPECTED_SHA" ]] || {
    echo "Commit is no longer the HEAD of main; candidate will not be promoted." >&2
    exit 1
  }
fi

STABLE_PERCENT=$((100 - ROLLOUT_PERCENT))
if [[ "$ROLLOUT_PERCENT" == "100" ]]; then
  TRAFFIC_TARGET="$REVISION=100"
else
  TRAFFIC_TARGET="$REVISION=$ROLLOUT_PERCENT,$STABLE_REVISION=$STABLE_PERCENT"
fi

echo "Routing $ROLLOUT_PERCENT% of production traffic to candidate revision."
"$GCLOUD_BIN" run services update-traffic "$SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --to-revisions="$TRAFFIC_TARGET" --quiet

public_url="$(service_json | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["status"]["url"])')"
if ! bash "$SMOKE_TEST_BIN" "$public_url"; then
  echo "Post-rollout check failed; restoring $STABLE_REVISION." >&2
  "$GCLOUD_BIN" run services update-traffic "$SERVICE" --project="$PROJECT_ID" \
    --region="$REGION" --to-revisions="$STABLE_REVISION=100" --quiet
  exit 1
fi

echo "Revision $REVISION is serving $ROLLOUT_PERCENT% from an immutable image digest."
