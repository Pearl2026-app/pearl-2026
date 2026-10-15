#!/usr/bin/env bash
# Builds the presentation site inside its container (used by Dockerfile.demo and by the one-file Hugging Face
# Dockerfile in scripts/demo/space/). Expects the code in /repo and Node copied into /usr/local.
set -euo pipefail
cd /repo
ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack
ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
export PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
# The website and admin reach the API inside the container; their rewrites are fixed at build time.
export API_INTERNAL_URL=http://127.0.0.1:4000
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile \
  --filter "@sahyadri/api..." --filter "@sahyadri/web..." --filter "@sahyadri/admin..." \
  --filter "@sahyadri/mobile-customer..." --filter "@sahyadri/mobile-delivery..."
pnpm --filter "@sahyadri/api..." build
bash scripts/demo/export-apps.sh
pnpm --filter "@sahyadri/web..." build
pnpm --filter "@sahyadri/admin..." build
rm -rf /pnpm/store /root/.cache /root/.npm # downloads no longer needed
# Free hosts run the container as an ordinary user with uid 1000; Postgres needs a named user.
id -u demo >/dev/null 2>&1 || useradd -m -u 1000 demo
echo "Presentation site built."
