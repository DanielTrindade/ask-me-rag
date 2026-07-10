#!/usr/bin/env bash
# Apply versioned migrations without interactive login or persistent linking.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://...' bash scripts/setup-db.sh
#   MIGRATION_DRY_RUN=true SUPABASE_DB_URL='postgresql://...' bash scripts/setup-db.sh
set -euo pipefail
set +x

DB_URL="${SUPABASE_DB_URL:-${1:-}}"
DRY_RUN="${MIGRATION_DRY_RUN:-false}"

if [[ -z "$DB_URL" ]]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 2
fi

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "SUPABASE_DB_URL must be a PostgreSQL connection URL." >&2
  exit 2
fi

args=(db push --db-url "$DB_URL" --include-all)
if [[ "$DRY_RUN" == "true" ]]; then
  args+=(--dry-run)
elif [[ "$DRY_RUN" != "false" ]]; then
  echo "MIGRATION_DRY_RUN must be 'true' or 'false'." >&2
  exit 2
fi

echo "Applying versioned Supabase migrations (dry-run=$DRY_RUN)."
npx supabase "${args[@]}"
echo "Supabase migrations completed."
