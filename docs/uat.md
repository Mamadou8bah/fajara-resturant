# Staging UAT — acceptance checklist (AC-01…AC-12)

Run on **Staging** with representative devices (Chrome Android tablet + desktop Chrome). Record pass/fail, tester, date, and notes.

| ID | Scenario | Pass criteria | Result | Tester | Date |
|----|----------|---------------|--------|--------|------|
| AC-01 | Order to kitchen | Guest or waiter submits; exactly one order round; KDS shows ticket; floor/cashier update; retry same `clientRequestId` does not duplicate | | | |
| AC-02 | Split billing | Settle with `guestId` leaves other guests unpaid; table stays open. UI: **All guests** or per-guest share on Checkout | | | |
| AC-03 | Mixed tender | D500 cash + D700 other method → one settlement, two payment rows totaling bill | | | |
| AC-04 | Table move | Move open session to free table; same session id; orders/guests preserved; logged | | | |
| AC-05 | Batch production | Confirm cooked-rice (or configured) batch; inputs decrease once; output increases by yield | | | |
| AC-06 | Direct egg consumption | Prepare dish with eggs → stock −N; cancel before prepare → no deduction | | | |
| AC-07 | Waste after preparation | Void after prepare → stock not restored to raw; exception recorded | | | |
| AC-08 | Stock count | Post count with variance → adjustment movement with reason/actor | | | |
| AC-09 | Till close | Close till → expected/actual/variance stored; approval when over threshold | | | |
| AC-10 | Realtime reconnect | Kill network on KDS → reconnect → authoritative tickets refetch before live updates | | | |
| AC-11 | Security | Unauthorized role denied on protected API even if UI bypassed | | | |
| AC-12 | Historical integrity | Archive menu item/employee → history/receipts still show snapshots | | | |

## Device matrix (DEV-001…003)

| Target | Browser / device | Smoke | Pass |
|--------|------------------|-------|------|
| Guest ≥360px | Chrome Android (current + previous major) | QR join, order, call waiter | |
| Guest | Safari iOS (current + previous major) | Same | |
| Staff ≥768px | Chrome Android tablet | Orders, KDS, Floor, Checkout | |
| Staff desktop | Chrome desktop | Same + Settings | |

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tester | | | |
| Reviewer | | | |

Critical/High defects must be resolved or explicitly deferred before production.
