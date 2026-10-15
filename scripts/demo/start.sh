#!/usr/bin/env bash
# Starts the presentation site inside Dockerfile.demo: database, API (demo mode), website, admin and the router.
set -euo pipefail
export PATH="/usr/lib/postgresql/16/bin:$PATH"
export PGDATA=/tmp/pgdata
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  initdb -D "$PGDATA" -U demo --auth=trust >/dev/null
fi
pg_ctl -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c port=5432 -k /tmp" -l /tmp/postgres.log -w start
createdb -h 127.0.0.1 -U demo sahyadri 2>/dev/null || true
export DATABASE_URL="postgresql://demo@127.0.0.1:5432/sahyadri"
(cd /repo/packages/db && ./node_modules/.bin/prisma migrate deploy)

# Public address: Hugging Face sets SPACE_HOST; elsewhere set PUBLIC_URL, or it is the local port.
if [ -n "${SPACE_HOST:-}" ]; then PUBLIC_URL="https://${SPACE_HOST}"; fi
PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT:-7860}}"
secret() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
export NODE_ENV=production DEMO_MODE=true \
  JWT_ACCESS_SECRET="$(secret)" JWT_REFRESH_SECRET="$(secret)" APP_SECRET="$(secret)" \
  WEB_URL="$PUBLIC_URL" ADMIN_URL="$PUBLIC_URL/admin" API_URL="$PUBLIC_URL" \
  STORAGE_LOCAL_DIR=/tmp/media
# Sign-in cookies need https; a local run over plain http turns that off.
case "$PUBLIC_URL" in https://*) ;; *) export COOKIE_SECURE=false ;; esac

# Each service is restarted if it stops, so one crash never takes the presentation down.
keep() { while true; do "$@" || true; echo "[demo] $* stopped; restarting in 2 s" >&2; sleep 2; done; }
(cd /repo/apps/api && PORT=4000 keep node --enable-source-maps dist/main.js) &
(cd /repo/apps/web && keep ./node_modules/.bin/next start -p 3000 -H 127.0.0.1) &
(cd /repo/apps/admin && keep ./node_modules/.bin/next start -p 3001 -H 127.0.0.1) &
echo "[demo] Presentation site starting at $PUBLIC_URL/platforms"
exec node /repo/scripts/demo/router.mjs
