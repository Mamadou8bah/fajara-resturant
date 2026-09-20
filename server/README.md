# Fajara API

Independent NestJS + Prisma + Socket.IO backend for Fajara Restaurant Services.

## Stack

- NestJS / Prisma / PostgreSQL (Neon for hosted staging)
- Socket.IO realtime
- Deploy: **Render** ([`render.yaml`](./render.yaml))

## Local

```bash
cp .env.example .env
pnpm install
pnpm generate
docker compose up -d
pnpm migrate:deploy   # or: pnpm push  (dev only)
pnpm seed
pnpm dev
```

API defaults to `http://localhost:4000` (`/api`, `/realtime`).

## Staging (Render + Neon)

1. Create a Render Web Service from this app (`server/` as root, or this repo alone).
2. Use Blueprint [`render.yaml`](./render.yaml) (monorepo path: `server/render.yaml`).
3. Set env from [`.env.staging.hosted.example`](./.env.staging.hosted.example):
   - `DATABASE_URL` — Neon **pooled** connection string
   - `SEED_OWNER_PASSWORD`
   - `CORS_ORIGIN` / `PUBLIC_WEB_URL` — web app HTTPS origin (Netlify)
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Web Push (`npx web-push generate-vapid-keys`)
4. Deploy — pre-deploy runs `pnpm migrate:deploy && pnpm seed`.

Health check: `GET /api/health`

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Watch API |
| `pnpm build` / `pnpm start:prod` | Production |
| `pnpm migrate:deploy` | Apply migrations |
| `pnpm seed` | Idempotent staging/dev seed |
| `pnpm release:staging` | migrate + seed (local/CI) |

Env templates: `.env.example`, `.env.staging.example`, `.env.staging.hosted.example`, `.env.production.example`.
