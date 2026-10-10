#!/usr/bin/env bash
# Proves a backup can be restored: back up SOURCE, restore it into a scratch database,
# and compare row counts of the key tables. Exits non-zero on any difference.
#   DATABASE_URL     the database to back up (read-only use)
#   SCRATCH_URL      an EMPTY database the test may fill and wipe (never production)
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${SCRATCH_URL:?Set SCRATCH_URL to an empty scratch database}"
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
[ "${SCRATCH_URL%%\?*}" != "${DATABASE_URL%%\?*}" ] || { echo "SCRATCH_URL must differ from DATABASE_URL" >&2; exit 1; }

FILE=$(BACKUP_TARGET="$WORK" "$DIR/backup.sh" | tail -1)
"$DIR/restore.sh" "$FILE" "$SCRATCH_URL" --yes

TABLES='"User" "Customer" "Product" "Order" "OrderItem" "Payment" "Invoice" "Enquiry" "AuditLog" "OrderEvent" "Setting" "_prisma_migrations"'
FAIL=0
for t in $TABLES; do
  A=$(psql "${DATABASE_URL%%\?*}" -tAc "select count(*) from $t")
  B=$(psql "${SCRATCH_URL%%\?*}" -tAc "select count(*) from $t")
  printf '%-22s %8s %8s %s\n' "$t" "$A" "$B" "$([ "$A" = "$B" ] && echo ok || echo DIFFERENT)"
  [ "$A" = "$B" ] || FAIL=1
done
# The append-only guards (audit log, order timeline) must survive a restore.
GUARDS=$(psql "${SCRATCH_URL%%\?*}" -tAc "select count(*) from pg_trigger where tgname like '%append_only'")
[ "$GUARDS" -ge 2 ] || { echo "Append-only triggers missing after restore ($GUARDS found)" >&2; FAIL=1; }
[ "$FAIL" = 0 ] && echo "Restore test passed: $(basename "$FILE")" || { echo "Restore test FAILED" >&2; exit 1; }
