# Environments

| Environment | Purpose |
|-------------|---------|
| Development | Local engineering |
| Staging | Client / UAT |
| Production | Live restaurant |

| Concern | Development | Staging | Production |
|---------|-------------|---------|------------|
| Database | Local `fajara` | Separate staging DB | Separate production DB |
| `APP_ENV` | `development` | `staging` | `production` |
| `JWT_SECRET` | Local value | Unique staging secret | Unique production secret |
| `CORS_ORIGIN` / `PUBLIC_WEB_URL` | `localhost:3000` | Staging web origin | Production HTTPS origin |
| Client `NEXT_PUBLIC_*` | Local API URLs | Staging API URLs | Production API URLs |

## Templates

| File | Environment |
|------|-------------|
| `server/.env.example` | Development |
| `server/.env.staging.example` | Staging — **local docker** (default) |
| `server/.env.staging.hosted.example` | Staging — **hosted HTTPS** |
| `server/.env.production.example` | Production |
| `client/.env.example` | Development |
| `client/.env.staging.example` | Staging — local |
| `client/.env.staging.hosted.example` | Staging — hosted HTTPS |
| `client/.env.production.example` | Production |

Real `.env` / `.env.staging` / `.env.production` files are gitignored.

## Client public vars

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_APP_ENV`

Server holds DB, JWT, Cloudinary, and similar credentials.

## Schema (Prisma migrations)

Baseline migration lives in `server/prisma/migrations/`. Prefer **`pnpm migrate:deploy`** (or `pnpm migrate:staging`) on staging/production. Use `pnpm push` only for disposable local experiments.

## Staging checklist (before client UAT)

### A. Local staging (this machine + docker)

1. **Separate Postgres** — staging compose on port **5433** (never the prod DB).
2. Copy templates:
   - `server/.env.staging.example` → `server/.env.staging`
   - `client/.env.staging.example` → `client/.env.staging`
3. Start DB + migrate + seed (from `server/`):

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
pnpm migrate:staging
pnpm seed:staging
pnpm dev
```

4. Client (from `client/`): `pnpm dev` with `.env.staging` loaded (or copy values into `.env.local`).
5. Smoke: login, guest QR order, KDS, settle with cash received, till close.
6. Confirm PWA icons: `/icon-192.png`, `/icon-512.png`.

Local defaults (full values live in `server/.env.staging.example` / `client/.env.staging.example` — do not paste production or Neon credentials into docs):

| Var | Notes |
|-----|--------|
| `DATABASE_URL` | Local staging Postgres from `docker-compose.staging.yml` |
| `CORS_ORIGIN` / `PUBLIC_WEB_URL` | Local web origin |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` | Local API / realtime URLs |

### B. Hosted staging — independent deploys (Render API + Netlify web + Neon)

`server/` and `client/` are separate apps. Staging DB is **Neon**.

1. **Neon**
   - Create / reuse a Neon project; copy the **pooled** connection string (`…-pooler…`, `sslmode=require`).
2. **API (Render)** — see [`server/README.md`](../server/README.md)
   - Blueprint: [`server/render.yaml`](../server/render.yaml) (monorepo: Blueprint path or Root Directory = `server`)
   - Build / pre-deploy / start as in that file (`migrate:deploy` + `seed` on each deploy)
   - Env: Neon `DATABASE_URL`, `SEED_OWNER_PASSWORD`; `JWT_SECRET` can be auto-generated
3. **Web (Netlify)** — see [`client/README.md`](../client/README.md)
   - Base directory: `client` (uses [`client/netlify.toml`](../client/netlify.toml))
   - Env: `NEXT_PUBLIC_APP_ENV=staging`, `NEXT_PUBLIC_API_URL=https://<api>.onrender.com/api`, `NEXT_PUBLIC_WS_URL=https://<api>.onrender.com/realtime`
4. **Cross-link CORS**
   - On Render: `CORS_ORIGIN` + `PUBLIC_WEB_URL` = `https://<site>.netlify.app`
5. Device smoke against the Netlify HTTPS origin (SEC-001). Templates: `server/.env.staging.hosted.example`, `client/.env.staging.hosted.example`.
6. Set **VAPID** keys on Render (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) after `npx web-push generate-vapid-keys`. Confirm push opt-in on staff PWA and guest Home Screen (iOS 16.4+).

**Note:** `preDeployCommand` needs a paid Render plan (e.g. starter). Free/idle web services sleep — first request after sleep can be slow; Socket.IO reconnects on wake.

## Monitoring

- **Backend:** optional Sentry via `SENTRY_DSN` on the API (`server/src/main.ts`). Leave unset if unused.
- **Frontend:** optional Sentry via `NEXT_PUBLIC_SENTRY_DSN` (`client/src/components/SentryInit.tsx`). Leave unset if unused.
- Do not put secrets other than the public DSN in client env; never send PINs/tokens in custom breadcrumbs.

## Open go-live decisions

Still need owners before production cutover:

| Decision | Options / notes | Owner |
|----------|-----------------|-------|
| Production domain | Custom domain vs temporary host | |
| Hosting ownership | Staging: Render (API) + Netlify (web); production TBD | |
| Staging URL for UAT | Netlify site + Render API (environments.md §B) | |
| Backup automation | Keep manual dumps vs scheduled job (see [backup-restore.md](./backup-restore.md)) | |
| DNS / SSL provider | Cloudflare, registrar, cloud LB, etc. | |
