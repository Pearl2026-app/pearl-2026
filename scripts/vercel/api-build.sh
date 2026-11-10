#!/usr/bin/env bash
# Builds the API for Vercel Functions (the free plan has no containers). Run from the repository root by the
# "api" service in vercel.json. Besides compiling, it does the start-up work a long-running server used to do:
#   1. draws the sample art and copies the stock photos and the signature collection into apps/api/bundled-media
#      (served read-only at /media by the function);
#   2. on the production deployment only, when DEMO_MODE or SETUP_ON_START is on: applies the database migrations
#      (a failure stops the deployment, so new code never meets old tables) and runs the seed (never overwrites).
set -euo pipefail
cd "$(dirname "$0")/../.."

pnpm --filter "@sahyadri/api..." build

MEDIA="$PWD/apps/api/bundled-media"
rm -rf "$MEDIA" && mkdir -p "$MEDIA"
(cd packages/db && STORAGE_LOCAL_DIR="$MEDIA" npx tsx seed/draw-samples.ts)

# Supabase's transaction pooler (port 6543), the right DATABASE_URL for many short-lived functions, cannot run
# migrations. When DATABASE_MIGRATE_URL is set (the session pooler, port 5432), the build's database work uses it.
DB_SETUP_URL="${DATABASE_MIGRATE_URL:-${DATABASE_URL:-}}"

on() { case "$(echo "${1:-}" | tr 'A-Z' 'a-z')" in 1|true|yes|on) return 0;; *) return 1;; esac; }
if [ "${VERCEL_ENV:-}" = "production" ] && [ -n "${DATABASE_URL:-}" ] && { on "${DEMO_MODE:-}" || on "${SETUP_ON_START:-}"; }; then
  echo "Applying database migrations…"
  (cd packages/db && DATABASE_URL="$DB_SETUP_URL" npx prisma migrate deploy)
  if on "${DEMO_MODE:-}"; then
    # The demo's sample data is already in place; the full demo seed is too slow from here. Add the collection only.
    echo "Adding the signature collection…"
    (cd packages/db && DATABASE_URL="$DB_SETUP_URL" STORAGE_LOCAL_DIR="$MEDIA" timeout 300 npx tsx seed/collection-only.ts) || echo "::warning:: The signature collection was not added; the site still deploys."
  else
    echo "Running the production setup (adds only what is missing)…"
    (cd packages/db && DATABASE_URL="$DB_SETUP_URL" SEED_MODE=production STORAGE_LOCAL_DIR="$MEDIA" timeout 1500 npx tsx seed/seed.ts) || echo "::warning:: The production setup did not finish; the site still deploys. See the build log above."
  fi
else
  echo "Database setup skipped (not the production deployment, or neither DEMO_MODE nor SETUP_ON_START is on)."
fi
du -sh "$MEDIA" || true
