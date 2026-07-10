#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-ask-me-rag}"
REGION="${GCP_REGION:-us-central1}"
REPOSITORY="${ARTIFACT_REPOSITORY:-ask-me-rag}"
STAGING_BUCKET="${CLOUD_BUILD_STAGING_BUCKET:-${PROJECT_ID}_cloudbuild}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-DanielTrindade/ask-me-rag}"
POOL_ID="${WORKLOAD_IDENTITY_POOL:-github-actions}"
PROVIDER_ID="${WORKLOAD_IDENTITY_PROVIDER:-github}"
GITHUB_SA_ID="${GITHUB_DEPLOY_SERVICE_ACCOUNT:-github-deploy}"
BUILD_SA_ID="${CLOUD_BUILD_SERVICE_ACCOUNT:-cloudbuild-deploy}"
RUNTIME_SA_ID="${RUNTIME_SERVICE_ACCOUNT:-ask-me-rag-sa}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
GITHUB_SA="${GITHUB_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="${BUILD_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

ensure_service_account() {
  local id="$1" display_name="$2"
  if ! gcloud iam service-accounts describe "${id}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$id" --project="$PROJECT_ID" \
      --display-name="$display_name"
  fi
}

echo "Enabling required Google Cloud APIs."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  sts.googleapis.com \
  --project="$PROJECT_ID" --quiet

ensure_service_account "$GITHUB_SA_ID" "GitHub Actions deploy submitter"
ensure_service_account "$BUILD_SA_ID" "Cloud Build deploy executor"
gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT_ID" >/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$GITHUB_SA" --role=roles/cloudbuild.builds.editor --quiet
gcloud storage buckets add-iam-policy-binding "gs://$STAGING_BUCKET" \
  --member="serviceAccount:$GITHUB_SA" --role=roles/storage.objectAdmin --quiet
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
  --project="$PROJECT_ID" --member="serviceAccount:$GITHUB_SA" \
  --role=roles/iam.serviceAccountUser --quiet

gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" \
  --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" --role=roles/run.developer --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --quiet
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project="$PROJECT_ID" --member="serviceAccount:$BUILD_SA" \
  --role=roles/iam.serviceAccountUser --quiet

if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" --location=global \
    --display-name="GitHub Actions"
fi

MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
CONDITION="assertion.repository=='${GITHUB_REPOSITORY}' && assertion.ref=='refs/heads/main'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com/" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com/" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
fi

PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPOSITORY}"
gcloud iam service-accounts add-iam-policy-binding "$GITHUB_SA" \
  --project="$PROJECT_ID" --member="$PRINCIPAL" \
  --role=roles/iam.workloadIdentityUser --quiet

echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_REGION=$REGION"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$GITHUB_SA"
echo "CLOUD_BUILD_SERVICE_ACCOUNT=projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}"

