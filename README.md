# Fajara Restaurant Services

Two **independent** applications (can be deployed or split into separate repos):

| App | Path | Host (staging) |
|-----|------|----------------|
| **API** | [`server/`](server/README.md) | Render + Neon |
| **Web** | [`client/`](client/README.md) | Netlify |

Shared product docs live in [`docs/`](docs).

## Quick start

[docs/setup.md](docs/setup.md)

```bash
# API
cd server
cp .env.example .env
pnpm install && pnpm generate
docker compose up -d
pnpm migrate:deploy && pnpm seed
pnpm dev

# Web (separate terminal)
cd client
cp .env.example .env
pnpm install && pnpm dev
```

## Deploy separately

- **API:** [`server/render.yaml`](server/render.yaml) — Root / Blueprint path = `server`
- **Web:** [`client/netlify.toml`](client/netlify.toml) — Base directory = `client`
- Cross-link CORS and `NEXT_PUBLIC_*` URLs — [docs/environments.md](docs/environments.md) §B

Each app has its own `package.json`, lockfile, env templates, and `.gitignore`.

## Docs

- API: [docs/api.md](docs/api.md)
- Environments: [docs/environments.md](docs/environments.md)
- Backup / restore: [docs/backup-restore.md](docs/backup-restore.md)
- Staging UAT (AC-01…12): [docs/uat.md](docs/uat.md)
- Accessibility: [docs/a11y.md](docs/a11y.md)
- Phase 1 gaps (AUTH/PAY): [docs/srd-waivers.md](docs/srd-waivers.md)
