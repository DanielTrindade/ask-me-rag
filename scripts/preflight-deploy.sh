#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-ask-me-rag}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-ask-me-rag}"
REPOSITORY="${ARTIFACT_REPOSITORY:-ask-me-rag}"
BUILD_SA="${CLOUD_BUILD_SERVICE_ACCOUNT:-cloudbuild-deploy@${PROJECT_ID}.iam.gserviceaccount.com}"
# Accept both the plain email and the projects/*/serviceAccounts/* resource name.
BUILD_SA="${BUILD_SA##*/}"
RUNTIME_SA="${RUNTIME_SERVICE_ACCOUNT:-ask-me-rag-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
IMAGE_TAG="${IMAGE_TAG:-}"

if [[ -n "$IMAGE_TAG" && ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "IMAGE_TAG must be a full 40-character Git SHA." >&2
  exit 2
fi

for api in artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com; do
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

for secret in google-generative-ai-api-key supabase-service-role-key admin-password; do
  gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null
done

if [[ -n "$IMAGE_TAG" ]]; then
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${IMAGE_TAG}"
  gcloud artifacts docker images describe "$image" --project="$PROJECT_ID" >/dev/null
fi

echo "Deployment preflight passed for $SERVICE in $PROJECT_ID/$REGION."

