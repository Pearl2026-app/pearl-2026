#!/usr/bin/env bash
# Restore a backup into a database.
#   restore.sh <backup file or s3:// URL> <target DATABASE_URL> [--yes]
# The target must be EMPTY unless --yes is given (then its existing objects are replaced).
# Never point this at production without a fresh backup of production first.
set -euo pipefail
SRC="${1:?Usage: restore.sh <backup> <target database url> [--yes]}"
TARGET="${2:?Usage: restore.sh <backup> <target database url> [--yes]}"
FORCE="${3:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
URL="${TARGET%%\?*}"

if [[ "$SRC" == s3://* ]]; then
  aws s3 cp "$SRC" "$TMP/backup.dump" --only-show-errors
  aws s3 cp "$SRC.sha256" "$TMP/backup.dump.sha256" --only-show-errors || true
  SRC="$TMP/backup.dump"
elif [ -f "$SRC.sha256" ]; then
  cp "$SRC.sha256" "$TMP/backup.dump.sha256"
fi
if [ -f "$TMP/backup.dump.sha256" ]; then
  [ "$(sha256sum "$SRC" | awk '{print $1}')" = "$(cat "$TMP/backup.dump.sha256")" ] || { echo "Checksum mismatch: the backup is damaged." >&2; exit 1; }
fi

TABLES=$(psql "$URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$TABLES" != "0" ] && [ "$FORCE" != "--yes" ]; then
  echo "The target database is not empty ($TABLES tables). Re-run with --yes to replace it." >&2
  exit 1
fi
pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error --dbname="$URL" "$SRC"
echo "Restored $(psql "$URL" -tAc 'select count(*) from "Order"') orders and $(psql "$URL" -tAc 'select count(*) from "Product"') products."
