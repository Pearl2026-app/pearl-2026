#!/usr/bin/env bash
# Packs the shop for a Hostinger Web App upload (hPanel → Web Apps → Upload your files) when Git deployment is not
# available (it is switched off while a collaborator manages the account). Hostinger's form only offers the
# package.json scripts named build/dev/lint/test as the build command, so inside the archive "build" runs
# scripts/hostinger/build.sh directly (in the repository, scripts/build.mjs picks it on Hostinger and turbo elsewhere). Uploads from the browser
# tool are limited to 10 MB, so the product videos are left out with NO_VIDEOS=1.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-sahyadri-pearls-hostinger.tar.gz}"
STAGE="$(mktemp -d)"
git ls-files | grep -vE '^(docs/|e2e/|Dockerfile|scripts/demo/space/|apps/web/public/models/|apps/web/public/pearl-film/(closed|under|mask|poster)|apps/mobile-(customer|delivery)/(assets|src|app)/)' \
  | { if [ -n "${NO_VIDEOS:-}" ]; then grep -vE '\.mp4$'; else cat; fi; } > "$STAGE/files.txt"
tar -cf "$STAGE/src.tar" -T "$STAGE/files.txt"
mkdir "$STAGE/src" && tar -xf "$STAGE/src.tar" -C "$STAGE/src"
node -e "const f='$STAGE/src/package.json',p=require(f);p.scripts.build='bash scripts/hostinger/build.sh';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
# Hostinger's own `pnpm install` before the build: only the root's packages (build.sh installs what each app needs),
# with pnpm's store inside the folder so build.sh can delete it (the plan counts every file against its limit)
printf 'recursive-install=false\nstore-dir=.pnpm-store\n' >> "$STAGE/src/.npmrc"
tar -czf "$OUT" -C "$STAGE/src" .
rm -rf "$STAGE"
ls -la "$OUT"
