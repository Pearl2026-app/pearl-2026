#!/usr/bin/env bash
# Builds the whole shop for a Hostinger "Web App" (Node.js, Business plan and up), where it runs as ONE app on one
# address: the website, the /admin dashboard and the API behind a small router (scripts/hostinger/start.mjs), the
# same split vercel.json makes. Hostinger runs this as the build command from the repository root.
set -euo pipefail
cd "$(dirname "$0")/../.."

# pnpm, pinned to the version in package.json, whether or not the host has it
PNPM="pnpm"
command -v pnpm >/dev/null 2>&1 || PNPM="npx -y pnpm@9.12.0"

[ -n "${SKIP_INSTALL:-}" ] || $PNPM install --frozen-lockfile --filter sahyadri-pearls --filter "@sahyadri/web..." --filter "@sahyadri/admin..." --filter "@sahyadri/api..."
# the website's and the admin's server-side calls to the API stay inside the app (start.mjs runs the API here);
# the admin bakes this into its rewrites at build time
export API_INTERNAL_URL="http://127.0.0.1:4100"
$PNPM --filter "@sahyadri/api..." build
$PNPM --filter "@sahyadri/web..." build
$PNPM --filter "@sahyadri/admin..." build

# the sample art and the stock and collection photos the API serves at /media
MEDIA="$PWD/apps/api/bundled-media"
rm -rf "$MEDIA" && mkdir -p "$MEDIA"
(cd packages/db && STORAGE_LOCAL_DIR="$MEDIA" npx tsx seed/draw-samples.ts) || echo "WARNING: sample art not drawn; the shop still runs."
echo "Build finished."
