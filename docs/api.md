# Server API overview (Phase 1)

Base URL: `http://localhost:4000/api`  
Auth: `Authorization: Bearer <accessToken>` unless marked public.

## Auth
| Method | Path | Notes |
|--------|------|-------|
| GET | `/auth/employees` | Public — approver list |
| POST | `/auth/login/pin` | Public — `{ email, pin }` |
| POST | `/auth/login/password` | Public — Owner/Manager |
| POST | `/auth/logout` | Revoke session |
| POST | `/auth/lock` | Lock = revoke |
| GET | `/auth/me` | Current staff |
| POST | `/auth/approval-pin` | Manager overlay (PERM-002) |
| PATCH | `/auth/pin` | Change own PIN |
| PATCH | `/auth/password` | Change own password |

## Operations
- **Employees** `/employees` — CRUD + archive; pay fields Owner/Manager only; performance
- **Tables** `/tables` — CRUD, archive, QR rotate/export (PNG), reservation status + partySize
- **Sessions** `/sessions` — open, move (AC-04), guests, accept, cleaning
- **Menu** `/menu` — categories, items, modifiers, specials
- **Guest** `/guest/*` — public QR menu, join, call waiter, submit order, prior orders by `deviceToken`; `GET /guest/table/:number` resolves table → QR token in development/staging only
- **Orders** `/orders` — submit, transitions, void/comp/remake, waiter views
- **Kitchen** `/kitchen` — KDS tickets + transitions
- **Payments** `/payments` — settle (split/mixed, no double-bill), bill preview, refund, method correction, receipt (+waiter)
- **Till** `/till` — open/close/variance, paid-in/out
- **Inventory** `/inventory` — stock (manage/limited), receive, count, waste, movements
- **Production** `/production` — batch confirm (AC-05)
- **Recipes** `/recipes` — dish/batch recipes + theoretical cost
- **Suppliers** `/suppliers` — basic CRUD
- **Shifts** `/shifts` — types, weekly/monthly, templates (+ apply), copy-last-week
- **Payroll** `/payroll` — pay-period tracking (not statutory)
- **Reports** `/reports` — dashboard (REP-001), sales-trend (REP-002), margins, yield-variance, EOD, sales history (`mine` / `cashierId` scope), cashier-summary, CSV, handoff JSON
- **Retention** `/retention/anonymize-guest-names` — SEC-010 guest display-name anonymize
- **Audit** `/audit/activity` — insert-only activity log
- **Notifications** `/notifications` — list; `PATCH :id/delivered`, `PATCH :id/seen`, resolve; Web Push: `GET /notifications/push/vapid-public-key` (public), `POST /notifications/push/subscribe` (staff), `POST /notifications/push/subscribe/guest` (public + deviceToken), unsubscribe variants
- **Settings** `/settings` — public subset + Owner manage
- **Health** `/health`

## Local bootstrap

```bash
cd server
cp .env.example .env
pnpm install
pnpm generate
pnpm migrate:deploy
pnpm seed    # creates Owner (see SEED_* env vars)
pnpm dev
pnpm test:ac # AC-01…AC-12 invariant suite
```

Fresh local DB: `pnpm migrate:deploy`. Disposable experiments only: `pnpm push`.