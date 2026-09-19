# Backup & restore runbook

Supports **BKP-001…004**: automated dumps via script / GitHub Actions, plus restore checklist and drill guidance.

## Automated backup (preferred)

### Option A — Host cron (production)

On a machine with network access to Postgres and `pg_dump` installed:

```bash
chmod +x scripts/backup-db.sh
export DATABASE_URL='postgresql://…'
export BACKUP_DIR=/var/backups/fajara
export RETENTION_DAYS=14

# Daily 02:00 Africa/Banjul (UTC+0)
crontab -e
# 0 2 * * * /path/to/fajara-resturant/scripts/backup-db.sh >> /var/log/fajara-backup.log 2>&1
```

Copy dumps off-box (S3/R2/encrypted disk). Do not leave the only copy on the DB host.

### Option B — GitHub Actions

Workflow: [`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml)

1. Add repository secret `DATABASE_URL` (staging or production dump role).
2. Optional secret `BACKUP_RETENTION_DAYS` (default 14 for local prune; Actions artifacts also expire at 14 days).
3. Enable Actions; run **Database backup** manually once to verify.
4. For production, prefer Option A + object storage; treat Actions as a secondary / staging path (artifact retention is short).

### Manual one-off

```bash
export DATABASE_URL='postgresql://…'
./scripts/backup-db.sh
# or:
pg_dump "$DATABASE_URL" -Fc -f "fajara-$(date +%Y%m%d-%H%M).dump"
```

## Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RPO | ≤ 24 hours | Nightly dump; tighten if hosting offers PITR |
| RTO | ≤ 4 hours | Known-good dump onto prepared host + smoke tests |

## Restore checklist

1. Provision empty Postgres matching major version.
2. Create role/database if needed.
3. Restore:

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists --no-owner fajara-YYYYMMDD-HHMMSS.dump
# Or plain SQL:
# psql "$DATABASE_URL" -f fajara-YYYYMMDD.sql
```

4. If dump is older than current Prisma migrations: `cd server && npx prisma migrate deploy`.
5. Smoke-test: staff login, open table, place/send kitchen ticket, settle payment, settings load.
6. Log restore date, dump file, environment, and who verified.

## Periodic restore drill (BKP-004)

| Cadence | Action | Pass criteria |
|---------|--------|---------------|
| Quarterly (min.) | Restore latest dump to a throwaway staging DB | Steps 1–5 complete; smoke tests green |
| After major schema migrations | Spot-check restore of pre-migration dump | App boots; migrations apply cleanly |

Record each drill in the ops log (date, dump id, result, signer).

## Not covered yet (hosting-dependent)

- Continuous WAL / point-in-time recovery (enable on managed Postgres if available)
- Cross-region replication
- Object-storage lifecycle policies (configure on the bucket used for dump copies)

See also [environments.md](./environments.md).
