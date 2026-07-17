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
RETENTION_JOB_SA_ID="${RETENTION_JOB_SERVICE_ACCOUNT:-ask-me-retention-job}"
RETENTION_SCHEDULER_SA_ID="${RETENTION_SCHEDULER_SERVICE_ACCOUNT:-ask-me-retention-scheduler}"
IP_HMAC_SECRET="${CHAT_IP_HMAC_SECRET:-ask-me-chat-ip-hmac-key}"
IP_ENCRYPTION_SECRET="${CHAT_IP_ENCRYPTION_SECRET:-ask-me-chat-ip-encryption-keys}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
GITHUB_SA="${GITHUB_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="${BUILD_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
RETENTION_JOB_SA="${RETENTION_JOB_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
RETENTION_SCHEDULER_SA="${RETENTION_SCHEDULER_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

ensure_service_account() {
  local id="$1" display_name="$2"
  if ! gcloud iam service-accounts describe "${id}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$id" --project="$PROJECT_ID" \
      --display-name="$display_name"
  fi
}

ensure_secret() {
  local name="$1"
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic
  fi
}

has_enabled_secret_version() {
  local name="$1"
  [[ -n "$(gcloud secrets versions list "$name" --project="$PROJECT_ID" \
    --filter='state=ENABLED' --limit=1 --format='value(name)')" ]]
}

add_generated_secret_version() {
  local name="$1" value="$2"
  if ! has_enabled_secret_version "$name"; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "Generated the first version of $name."
  fi
}

grant_secret_access() {
  local name="$1" service_account="$2"
  gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT_ID" \
    --member="serviceAccount:$service_account" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

echo "Enabling required Google Cloud APIs."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sts.googleapis.com \
  --project="$PROJECT_ID" --quiet

ensure_service_account "$GITHUB_SA_ID" "GitHub Actions deploy submitter"
ensure_service_account "$BUILD_SA_ID" "Cloud Build deploy executor"
ensure_service_account "$RUNTIME_SA_ID" "Ask Me RAG runtime"
ensure_service_account "$RETENTION_JOB_SA_ID" "Chat observability retention job"
ensure_service_account "$RETENTION_SCHEDULER_SA_ID" "Chat observability retention scheduler"

for secret in google-generative-ai-api-key supabase-service-role-key admin-password "$IP_HMAC_SECRET" "$IP_ENCRYPTION_SECRET"; do
  ensure_secret "$secret"
done

add_generated_secret_version "$IP_HMAC_SECRET" "$(openssl rand -base64 32 | tr -d '\r\n')"
encryption_key="$(openssl rand -base64 32 | tr -d '\r\n')"
add_generated_secret_version "$IP_ENCRYPTION_SECRET" "{\"v1\":\"${encryption_key}\"}"
unset encryption_key

for secret in google-generative-ai-api-key supabase-service-role-key admin-password "$IP_HMAC_SECRET" "$IP_ENCRYPTION_SECRET"; do
  grant_secret_access "$secret" "$RUNTIME_SA"
done
grant_secret_access supabase-service-role-key "$RETENTION_JOB_SA"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$GITHUB_SA" --role=roles/cloudbuild.builds.editor --quiet
for role in roles/artifactregistry.reader roles/iam.serviceAccountViewer roles/run.viewer roles/secretmanager.viewer roles/serviceusage.serviceUsageViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$GITHUB_SA" --role="$role" --quiet
done

gcloud storage buckets add-iam-policy-binding "gs://$STAGING_BUCKET" \
  --member="serviceAccount:$GITHUB_SA" --role=roles/storage.objectAdmin --quiet
gcloud storage buckets add-iam-policy-binding "gs://$STAGING_BUCKET" \
  --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer --quiet
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
  --project="$PROJECT_ID" --member="serviceAccount:$GITHUB_SA" \
  --role=roles/iam.serviceAccountUser --quiet

gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" \
  --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer --quiet
for role in roles/cloudscheduler.admin roles/logging.logWriter roles/run.admin roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$BUILD_SA" --role="$role" --quiet
done
for service_account in "$RUNTIME_SA" "$RETENTION_JOB_SA" "$RETENTION_SCHEDULER_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$service_account" \
    --project="$PROJECT_ID" --member="serviceAccount:$BUILD_SA" \
    --role=roles/iam.serviceAccountUser --quiet
done

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

echo
echo "Bootstrap concluído. Cadastre versões para os segredos da aplicação que ainda estiverem vazios:"
for secret in google-generative-ai-api-key supabase-service-role-key admin-password; do
  if ! has_enabled_secret_version "$secret"; then
    echo "  - $secret"
  fi
done
echo
echo "Variáveis do GitHub:"
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_REGION=$REGION"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$GITHUB_SA"
echo "CLOUD_BUILD_SERVICE_ACCOUNT=projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}"
echo "CHAT_OBSERVABILITY_ENABLED=false"
echo "CHAT_TRUSTED_PROXY_HOPS=unset"
echo "DEPLOY_OBSERVABILITY_RETENTION=true"
