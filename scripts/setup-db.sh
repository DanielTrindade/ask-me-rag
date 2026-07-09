#!/usr/bin/env bash
# Link this local repo to a remote Supabase project and push migrations.
# Usage: bash scripts/setup-db.sh <SUPABASE_ACCESS_TOKEN>
#   or:  SUPABASE_ACCESS_TOKEN=xxx bash scripts/setup-db.sh
set -euo pipefail

TOKEN="${1:-${SUPABASE_ACCESS_TOKEN:-}}"
PROJECT_REF="xjemdvtnudsjhttnnwol"

if [ -z "$TOKEN" ]; then
  echo "Usage: bash scripts/setup-db.sh <SUPABASE_ACCESS_TOKEN>"
  echo "Generate one at https://app.supabase.com/account/tokens"
  exit 1
fi

echo "=== Logging in to Supabase ==="
npx supabase login --token "$TOKEN"

echo "=== Linking project $PROJECT_REF ==="
npx supabase link --project-ref "$PROJECT_REF"

echo "=== Pushing migrations to remote ==="
npx supabase db push

echo
echo "Done. Schema applied to the cloud database."
echo "Verify in the Supabase dashboard -> Table Editor -> documents"