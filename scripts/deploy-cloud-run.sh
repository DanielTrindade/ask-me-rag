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
if [[ "$OBSERVABILITY_ENABLED" == "true" ]]; then
  [[ "$TRUSTED_PROXY_HOPS" =~ ^([0-9]|10)$ ]] || {
    echo "CHAT_TRUSTED_PROXY_HOPS must be an integer from 0 to 10 when observability is enabled." >&2
    exit 2
  }
elif [[ "$TRUSTED_PROXY_HOPS" == "unset" ]]; then
  TRUSTED_PROXY_HOPS=""
fi

SHORT_SHA="${EXPECTED_SHA:0:12}"
SUFFIX="sha-${SHORT_SHA}"
CANDIDATE_TAG="candidate-${SHORT_SHA}"
REVISION="${SERVICE}-${SUFFIX}"

service_json() {
  "$GCLOUD_BIN" run services describe "$SERVICE" --project="$PROJECT_ID" \
    --region="$REGION" --format=json
}

before="$(service_json)"
STABLE_REVISION="$(printf '%s' "$before" | "$PYTHON_BIN" -c \
  'import json,sys; d=json.load(sys.stdin); print(next((t.get("revisionName", "") for t in d.get("status",{}).get("traffic",[]) if t.get("percent")==100), ""))')"
[[ -n "$STABLE_REVISION" ]] || { echo "Could not identify stable revision." >&2; exit 1; }

echo "Deploying candidate revision without production traffic."
"$GCLOUD_BIN" run deploy "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE_DIGEST" --service-account="$RUNTIME_SA" \
  --revision-suffix="$SUFFIX" --tag="$CANDIDATE_TAG" --no-traffic \
  --labels="commit-sha=$SHORT_SHA,build-id=$BUILD_LABEL,managed-by=cloud-build" \
  --update-env-vars="CHAT_OBSERVABILITY_ENABLED=$OBSERVABILITY_ENABLED,CHAT_TRUSTED_PROXY_HOPS=$TRUSTED_PROXY_HOPS,CHAT_IP_ACTIVE_KEY_VERSION=v1,CHAT_IP_RETENTION_DAYS=7,CHAT_CONVERSATION_RETENTION_DAYS=30,CHAT_AUDIT_RETENTION_DAYS=90" \
  --update-secrets="CHAT_IP_HMAC_KEY_BASE64=${IP_HMAC_SECRET}:latest,CHAT_IP_ENCRYPTION_KEYS_JSON=${IP_ENCRYPTION_SECRET}:latest" \
  --quiet

candidate_state="$(service_json)"
CANDIDATE_URL="$(printf '%s' "$candidate_state" | CANDIDATE_TAG="$CANDIDATE_TAG" "$PYTHON_BIN" -c \
  'import json,os,sys; d=json.load(sys.stdin); tag=os.environ["CANDIDATE_TAG"]; print(next((t.get("url", "") for t in d.get("status",{}).get("traffic",[]) if t.get("tag")==tag), ""))')"
[[ -n "$CANDIDATE_URL" ]] || { echo "Candidate URL was not assigned." >&2; exit 1; }

bash "$SMOKE_TEST_BIN" "$CANDIDATE_URL"

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

echo "Promoting candidate revision to 100% traffic."
"$GCLOUD_BIN" run services update-traffic "$SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --to-revisions="$REVISION=100" --quiet

public_url="$(service_json | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["status"]["url"])')"
if ! bash "$SMOKE_TEST_BIN" "$public_url"; then
  echo "Post-promotion check failed; restoring $STABLE_REVISION." >&2
  "$GCLOUD_BIN" run services update-traffic "$SERVICE" --project="$PROJECT_ID" \
    --region="$REGION" --to-revisions="$STABLE_REVISION=100" --quiet
  exit 1
fi

echo "Promoted revision $REVISION from immutable image digest."
