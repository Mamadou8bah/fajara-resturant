#!/usr/bin/env bash
# Automated Postgres dump for Fajara (BKP-001).
# Usage:
#   DATABASE_URL='postgresql://…' ./scripts/backup-db.sh
#   BACKUP_DIR=/var/backups/fajara RETENTION_DAYS=14 ./scripts/backup-db.sh

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

OUT="${BACKUP_DIR}/fajara-${STAMP}.dump"
echo "Dumping to ${OUT}…"
pg_dump "$DATABASE_URL" -Fc -f "$OUT"

# Keep a small metadata sidecar for ops logs (no secrets)
{
  echo "createdAt=${STAMP}Z"
  echo "format=custom"
  echo "tool=pg_dump"
} > "${OUT}.meta"

echo "Pruning dumps older than ${RETENTION_DAYS} days in ${BACKUP_DIR}…"
find "$BACKUP_DIR" -name 'fajara-*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete || true
find "$BACKUP_DIR" -name 'fajara-*.dump.meta' -type f -mtime "+${RETENTION_DAYS}" -delete || true

echo "Backup complete: ${OUT}"
