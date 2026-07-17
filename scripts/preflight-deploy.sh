#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-ask-me-rag}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-ask-me-rag}"
REPOSITORY="${ARTIFACT_REPOSITORY:-ask-me-rag}"
BUILD_SA="${CLOUD_BUILD_SERVICE_ACCOUNT:-cloudbuild-deploy@${PROJECT_ID}.iam.gserviceaccount.com}"
BUILD_SA="${BUILD_SA##*/}"
RUNTIME_SA="${RUNTIME_SERVICE_ACCOUNT:-ask-me-rag-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
RETENTION_JOB_SA="${RETENTION_JOB_SERVICE_ACCOUNT:-ask-me-retention-job@${PROJECT_ID}.iam.gserviceaccount.com}"
RETENTION_SCHEDULER_SA="${RETENTION_SCHEDULER_SERVICE_ACCOUNT:-ask-me-retention-scheduler@${PROJECT_ID}.iam.gserviceaccount.com}"
OBSERVABILITY_ENABLED="${CHAT_OBSERVABILITY_ENABLED:-false}"
TRUSTED_PROXY_HOPS="${CHAT_TRUSTED_PROXY_HOPS:-unset}"
DEPLOY_RETENTION="${DEPLOY_OBSERVABILITY_RETENTION:-true}"
IP_HMAC_SECRET="${CHAT_IP_HMAC_SECRET:-ask-me-chat-ip-hmac-key}"
IP_ENCRYPTION_SECRET="${CHAT_IP_ENCRYPTION_SECRET:-ask-me-chat-ip-encryption-keys}"
IMAGE_TAG="${IMAGE_TAG:-}"

[[ "$OBSERVABILITY_ENABLED" == "true" || "$OBSERVABILITY_ENABLED" == "false" ]] || {
  echo "CHAT_OBSERVABILITY_ENABLED must be true or false." >&2
  exit 2
}
[[ "$DEPLOY_RETENTION" == "true" || "$DEPLOY_RETENTION" == "false" ]] || {
  echo "DEPLOY_OBSERVABILITY_RETENTION must be true or false." >&2
  exit 2
}
if [[ "$OBSERVABILITY_ENABLED" == "true" && ! "$TRUSTED_PROXY_HOPS" =~ ^([0-9]|10)$ ]]; then
  echo "Set CHAT_TRUSTED_PROXY_HOPS to the verified value from 0 to 10 before enabling observability." >&2
  exit 2
fi
if [[ -n "$IMAGE_TAG" && ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "IMAGE_TAG must be a full 40-character Git SHA." >&2
  exit 2
fi

for api in artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com; do
  enabled="$(gcloud services list --enabled --project="$PROJECT_ID" \
    --filter="config.name=$api" --format='value(config.name)')"
  [[ "$enabled" == "$api" ]] || { echo "Required API is not enabled: $api" >&2; exit 1; }
done

gcloud artifacts repositories describe "$REPOSITORY" --project="$PROJECT_ID" \
  --location="$REGION" >/dev/null
gcloud run services describe "$SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" >/dev/null
gcloud iam service-accounts describe "$BUILD_SA" --project="$PROJECT_ID" >/dev/null
gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT_ID" >/dev/null

if [[ "$DEPLOY_RETENTION" == "true" ]]; then
  gcloud iam service-accounts describe "$RETENTION_JOB_SA" --project="$PROJECT_ID" >/dev/null
  gcloud iam service-accounts describe "$RETENTION_SCHEDULER_SA" --project="$PROJECT_ID" >/dev/null
fi

for secret in google-generative-ai-api-key supabase-service-role-key admin-password "$IP_HMAC_SECRET" "$IP_ENCRYPTION_SECRET"; do
  gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null
  enabled_version="$(gcloud secrets versions list "$secret" --project="$PROJECT_ID" \
    --filter='state=ENABLED' --limit=1 --format='value(name)')"
  [[ -n "$enabled_version" ]] || {
    echo "Secret has no enabled version: $secret" >&2
    exit 1
  }
done

if [[ -n "$IMAGE_TAG" ]]; then
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${IMAGE_TAG}"
  gcloud artifacts docker images describe "$image" --project="$PROJECT_ID" >/dev/null
fi

echo "Deployment preflight passed for $SERVICE in $PROJECT_ID/$REGION."
