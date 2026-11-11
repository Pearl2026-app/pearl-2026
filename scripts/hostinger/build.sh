#!/usr/bin/env bash
# Builds the whole shop for a Hostinger "Web App" (Node.js, Business plan and up), where it runs as ONE app on one
# address: the website, the /admin dashboard and the API behind a small router (scripts/hostinger/start.mjs), the
# same split vercel.json makes. Hostinger runs this as the build command from the repository root.
set -euo pipefail
cd "$(dirname "$0")/../.."

# pnpm, pinned to the version in package.json, whether or not the host has it
PNPM="pnpm"
command -v pnpm >/dev/null 2>&1 || PNPM="npx -y pnpm@9.12.0"

# pnpm's store for this build lives in this folder and is deleted at the end (the plan counts every file). The store
# Hostinger's own `pnpm install` used before this script is remembered, to be emptied at the end too; that install's
# node_modules is removed first, as pnpm will not reuse modules linked from another store.
HOST_STORE="$($PNPM store path 2>/dev/null || true)"
export npm_config_store_dir="$PWD/.pnpm-store"
[ -n "${KEEP_NODE_MODULES:-}" ] || [ -n "${SKIP_INSTALL:-}" ] || rm -rf node_modules apps/*/node_modules packages/*/node_modules

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

# Keep only what runs (owner, 11 Nov: the Business plan's 600,000-file limit, shared with the WordPress sites, was
# exceeded by a full install, about 125,000 files a copy, and Hostinger keeps several copies). The website and the
# admin run from Next's standalone output (a few thousand files each, with only the packages they use); everything
# else is reinstalled with only the runtime packages of the API and the root (about 22,000 files), and pnpm's own
# store is kept in this folder and deleted. KEEP_NODE_MODULES=1 skips this (a local test build).
if [ -z "${KEEP_NODE_MODULES:-}" ]; then
  rm -rf deploy && mkdir -p deploy
  for app in web admin; do
    cp -a "apps/$app/.next/standalone" "deploy/$app"
    cp -a "apps/$app/.next/static" "deploy/$app/apps/$app/.next/static"
    [ -d "apps/$app/public" ] && cp -a "apps/$app/public" "deploy/$app/apps/$app/public"
    rm -rf "apps/$app/.next"
  done
  rm -rf node_modules apps/*/node_modules packages/*/node_modules .pnpm-store
  $PNPM install --frozen-lockfile --prod --store-dir "$PWD/.pnpm-store" --filter sahyadri-pearls --filter "@sahyadri/api..."
  (cd packages/db && ./node_modules/.bin/prisma generate)
  rm -rf .pnpm-store
  case "$HOST_STORE" in
    "$HOME"/*pnpm*) case "$HOST_STORE" in "$PWD"/*) ;; *) rm -rf "$HOST_STORE" && echo "Emptied pnpm's store at $HOST_STORE" ;; esac ;;
  esac
  echo "Files kept: $(find . -path ./.git -prune -o -print | wc -l)"
fi
echo "Build finished."
