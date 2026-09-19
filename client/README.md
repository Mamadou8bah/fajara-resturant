# Fajara Web

Independent Next.js app — staff PWA and guest QR menu for Fajara Restaurant Services.

## Stack

- Next.js 15 / React 19 / Tailwind
- Socket.IO client → API realtime
- Deploy: **Netlify** ([`netlify.toml`](./netlify.toml))

## Local

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` at a running API (default local: `http://localhost:4000/api` and `…/realtime`).

## Staging (Netlify → Render API)

1. New Netlify site from this app (`client/` as base directory, or this repo alone).
2. Build uses [`netlify.toml`](./netlify.toml).
3. Set env from [`.env.staging.hosted.example`](./.env.staging.hosted.example):
   - `NEXT_PUBLIC_APP_ENV=staging`
   - `NEXT_PUBLIC_API_URL=https://<api>.onrender.com/api`
   - `NEXT_PUBLIC_WS_URL=https://<api>.onrender.com/realtime`
4. On the API, set `CORS_ORIGIN` + `PUBLIC_WEB_URL` to this site’s HTTPS origin.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Local Next.js |
| `pnpm build` / `pnpm start` | Production |

Env templates: `.env.example`, `.env.staging.example`, `.env.staging.hosted.example`, `.env.production.example`.
