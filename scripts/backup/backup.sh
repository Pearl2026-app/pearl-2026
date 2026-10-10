#!/usr/bin/env bash
# Daily database backup: a compressed pg_dump, kept for BACKUP_RETENTION_DAYS.
#   DATABASE_URL         database to back up (required)
#   BACKUP_TARGET        s3://bucket/prefix  (uploaded with the aws CLI) or a local directory
#   BACKUP_RETENTION_DAYS  default 30
# Prints the path or URL of the new backup on its last line.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_TARGET:?Set BACKUP_TARGET to s3://bucket/prefix or a directory}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NAME="sahyadri-${STAMP}.dump"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Custom format: compressed, and pg_restore can restore it table by table if ever needed.
# Prisma's ?schema= parameter is not understood by pg_dump, so it is stripped.
pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname="${DATABASE_URL%%\?*}" --file="$TMP/$NAME"
SIZE=$(wc -c < "$TMP/$NAME")
[ "$SIZE" -gt 1024 ] || { echo "Backup looks empty ($SIZE bytes)" >&2; exit 1; }
sha256sum "$TMP/$NAME" | awk '{print $1}' > "$TMP/$NAME.sha256"

if [[ "$BACKUP_TARGET" == s3://* ]]; then
  aws s3 cp "$TMP/$NAME" "$BACKUP_TARGET/$NAME" --only-show-errors --sse AES256
  aws s3 cp "$TMP/$NAME.sha256" "$BACKUP_TARGET/$NAME.sha256" --only-show-errors --sse AES256
  # Retention: delete dumps older than RETENTION days.
  CUTOFF=$(date -u -d "-$RETENTION days" +%Y-%m-%d)
  aws s3 ls "$BACKUP_TARGET/" | awk '{print $4}' | grep -E '^sahyadri-.*\.dump(\.sha256)?$' | while read -r f; do
    DAY=$(echo "$f" | sed -E 's/^sahyadri-([0-9-]{10}).*/\1/')
    [[ "$DAY" < "$CUTOFF" ]] && aws s3 rm "$BACKUP_TARGET/$f" --only-show-errors
  done
  echo "$BACKUP_TARGET/$NAME"
else
  mkdir -p "$BACKUP_TARGET"
  mv "$TMP/$NAME" "$TMP/$NAME.sha256" "$BACKUP_TARGET/"
  find "$BACKUP_TARGET" -maxdepth 1 -name 'sahyadri-*.dump*' -mtime +"$RETENTION" -delete
  echo "$BACKUP_TARGET/$NAME"
fi
