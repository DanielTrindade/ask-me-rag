#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Defina PROJECT_ID}"
: "${REGION:?Defina REGION}"
: "${IMAGE:?Defina IMAGE com o mesmo artefato versionado da aplicação}"
: "${JOB_SERVICE_ACCOUNT:?Defina JOB_SERVICE_ACCOUNT}"
: "${SCHEDULER_SERVICE_ACCOUNT:?Defina SCHEDULER_SERVICE_ACCOUNT}"
: "${SUPABASE_URL:?Defina SUPABASE_URL}"

JOB_NAME="${JOB_NAME:-ask-me-chat-retention}"
SCHEDULER_NAME="${SCHEDULER_NAME:-ask-me-chat-retention-daily}"
SCHEDULE="${SCHEDULE:-15 3 * * *}"
TIME_ZONE="${TIME_ZONE:-America/Manaus}"
SUPABASE_SERVICE_KEY_SECRET="${SUPABASE_SERVICE_KEY_SECRET:-supabase-service-role-key}"

gcloud run jobs deploy "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${JOB_SERVICE_ACCOUNT}" \
  --command="node" \
  --args="scripts/chat-observability-retention.mjs" \
  --tasks=1 \
  --max-retries=1 \
  --task-timeout=300s \
  --memory=512Mi \
  --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL},CHAT_IP_RETENTION_DAYS=7,CHAT_CONVERSATION_RETENTION_DAYS=30,CHAT_AUDIT_RETENTION_DAYS=90" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_KEY_SECRET}:latest" \
  --quiet

gcloud run jobs add-iam-policy-binding "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${SCHEDULER_SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  --quiet

TARGET_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"

if gcloud scheduler jobs describe "${SCHEDULER_NAME}" \
  --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_NAME}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${TARGET_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}" \
    --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
    --quiet
else
  gcloud scheduler jobs create http "${SCHEDULER_NAME}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${TARGET_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}" \
    --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
    --quiet
fi

echo "Retenção configurada: ${JOB_NAME} / ${SCHEDULER_NAME}"
