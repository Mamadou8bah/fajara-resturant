# Fajara Restaurant Services — Setup

## Layout

```
client/   Independent Next.js app → Netlify (see client/netlify.toml)
server/   Independent NestJS API → Render (see server/render.yaml)
docs/     Shared product docs + visual prototype
README.md
```

`client` and `server` are separate applications (own lockfile, env, deploy config). They can stay in one git repo or be split later.

## Prerequisites

- Node.js 20+
- pnpm 9
- PostgreSQL 16 (optional `server/docker-compose.yml`)

## Server

```bash
cd server
cp .env.example .env
pnpm install
pnpm generate
docker compose up -d
pnpm migrate:deploy
pnpm seed
pnpm dev
```

API: http://localhost:4000/api — [docs/api.md](./api.md)

Scripts: `pnpm generate`, `pnpm migrate:deploy`, `pnpm migrate:staging`, `pnpm push` (dev experiments only), `pnpm seed`, `pnpm seed:staging`, `pnpm studio`, `pnpm build`.

Seed creates demo staff, **24 menu items with photos**, 15 tables, live orders (multi-guest), inventory/production, shifts, till, payroll, and a settled cash receipt (`TXN-0001`). Demo login emails are in the seed (`*@fajara.local`); PIN and owner password come from `SEED_PIN` / `SEED_OWNER_PASSWORD` in your local `.env` (see `.env.example` — never commit real secrets). Guest: `/m/demo` (or `/m/demo-t1` …).

Staging: see [environments.md](./environments.md). `pnpm migrate:staging` then `pnpm seed:staging` for the local staging DB.

## Client

```bash
cd client
cp .env.example .env
pnpm install
pnpm dev
```

- Staff: http://localhost:3000/app/login
- Guest: http://localhost:3000/m/demo
- Guest by table (dev): http://localhost:3000/table1 or `/table/1` (not logged in → same as scanning that table’s QR)

## Env

| Path | Purpose |
|------|---------|
| `server/.env` | Server config |
| `server/.env.staging.example` / `.env.staging.hosted.example` | Staging local / hosted templates |
| `client/.env` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` |
| `client/.env.staging.example` / `.env.staging.hosted.example` | Staging local / hosted templates |

See [docs/environments.md](./environments.md).

## Prototype

[`docs/Fajara Restaurant Services.html`](./Fajara%20Restaurant%20Services.html)

## Backup

Automated dumps via `scripts/backup-db.sh` (host cron) or [`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml). Full procedure, RPO/RTO targets, restore checklist, and quarterly drill: [backup-restore.md](./backup-restore.md).

```bash
export DATABASE_URL='postgresql://…'
./scripts/backup-db.sh
# Restore:
# pg_restore -d "$DATABASE_URL" --clean --if-exists backups/fajara-YYYYMMDD-HHMMSS.dump
```
