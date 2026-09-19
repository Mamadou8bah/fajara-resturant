# Phase 1 — known gaps / deferred items

These items are **not** fully implemented as originally specified. They are accepted product decisions for Phase 1 launch unless product owners reopen them.

| ID | Original intent | Product decision | Rationale |
|----|-----------------|------------------|-----------|
| **AUTH-001** | Employee-select + PIN on shared devices | Email + PIN (or password for Owner/Manager) | Shared-device picker deferred |
| **AUTH-005 / AUTH-006 / AUTH-008** | Lock Screen, Switch User, inactivity auto-lock | Not implemented | Explicitly deferred; logout remains |

## Previously deferred — now implemented

| ID | Status |
|----|--------|
| **PAY-003** | Settle-by-guest **and** settle-all in Checkout UI |
| **PAY-005** | Cash received + change capture on Cash tenders |
| **RCT-001** | Receipt shows cash received and change when present |

## Stack note (not a defect)

An earlier stack sketch mentioned Supabase. Implementation uses NestJS + Prisma/PostgreSQL + Socket.IO + Cloudinary. Capabilities map to V1 scope; hosting ownership remains an open go-live decision ([environments.md](./environments.md)).

## Reopening a deferred item

1. Agree the change with product owners.
2. Update this file and the checklist in [uat.md](./uat.md).
3. Implement and re-test the affected AC rows.
