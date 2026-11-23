# P9-SEC owner decisions

- **OD-1 APPROVED (owner, 2026-11-22 ~1:45 PM PT):** move `/auth/me` and `/auth/me/password-status` to Jini with the other five auth routes. Regenerate the route-table pin with `UPDATE_ROUTE_TABLE_PIN=1`; the ONLY allowed fixture change is the 14 handler-name substitutions `[forwardRejection]` -> `[<anonymous>]` (snapshot lines 52-53 across the 7 variants). Any other diff in the pin = stop and report. U-AUTH-3's T half is unblocked.

## 2026-11-23 ~1:50 PM PT — coordinator decisions under standing owner rules (owner may override)
Basis: owner 11-22 "build Jini parity (owner controls, Shared Keys, site-key reveal) BEFORE the swap", owner 11-22 "inject everything; never ask import-vs-inject", owner 11-22 K3 YES (product copy via a field on an existing args object).
- **OD-2: option 1** — the four routes get a host `onError` that calls `res.req.next(error)` (Tovu host only, no Jini change), pinned by throw-from-repository tests comparing status/body/headers with base. Fallback (optional `next` on `JsonRoutePorts.onError` args) only if the pin fails.
- **OD-3 (a) allow** `RootKeyPort.reveal?` (site-key reveal parity was explicitly requested).
- **OD-3 (b) allow** publish `verify` adapter factory + `executionMode`/`lastVerification` fields.
- **OD-3 (c) allow** `SecurityApiPort.sharedKeys?` / `useProjectKey?` + masked `tokenHint` (Shared Keys parity was explicitly requested).
- **OD-3 (d) smallest option** — no new token; host passes `refreshSignal?` on `security()`'s existing optional args.
- **Settings "owner decision 1" (`LEGACY_SITE_TITLE`)**: resolved by K3 — the literal stays in Tovu and is passed in through a field on the existing args object; `site-title.ts` and dependents move.
