# forms-multidest — coordinator progress

Brief: `origin/cloud/feature-briefs:.cloud-coord/forms-multidest-brief.md` (wins over every other file).

## STEP 0
`cloud-proof: Linux vm /home/user/Tovu forms-multidest` — Tovu `7733e4a3`, Jini `898b2bf1` (both pushed to `cloud/forms-multidest`).
Base check: PASS (registry.ts, pull.ts, 0018 migration present on `origin/restructure/apps-website-phased` @ `910e7f8ed`); `origin/cloud/forms-codex-wip` @ `33142fa5` present (includes `jini/` copies and `wip-app-ts-formdelivery-only.patch`).

## Personas
Coordinator: software-architect, code-inspection, security `skills.md` — all three loaded 2026-10-20.
Subagents: programmer + tdd (+ database for F3, + security for F4/F5); F8 code-inspection + security + red-team. Load confirmations recorded per lot below.

## Setup (2026-10-20)
- Node: container had v22.22.0; installed v24.22.0 from the nodejs.org tarball (sha256 verified) into `~/.local/node24`; every command sources `/tmp/fm-env.sh` (PATH + TOVU/JINI/PGHOST).
- Jini: session checkout `/home/user/Jini`, `cloud/forms-multidest` from `origin/general-work`; `pnpm install --frozen-lockfile` 27 s; `pnpm --no-bail -r build` ~110 s — only `integrations` fails tsc (its own test files), dist emitted. Push to AINSEP/Jini: OK.
- Tovu: `npm ci` root + apps/admin + apps/site-chat: 52 s, all exit 0. `link:jini` OK (57 links, symlinks into `/home/user/Jini/packages`). `@tovu/sdk` build OK.
- Postgres: PostgreSQL 16 binaries present (`/usr/lib/postgresql/16`); cluster initdb'd at `/tmp/fm-pg/data`, socket `/tmp`, roles `la`/`root`/`postgres` (trust). Postgres-dialect tests CAN run (PGHOST=/tmp). Stop it at the end.
- Worktrees: Jini `../wt-j-F1`, `../wt-j-F2` (offline pnpm install OK, dist copied).
- Pre-push hook: Tovu proof push passed the hook.

## Reuse (existing mechanisms)
- Jini outbox worker/drainer/claims/leases (`infra/events/outbox`) — delivery jobs are ordinary outbox rows.
- Jini webhook backoff `computeBackoffMs` (`integrations/src/webhooks/delivery.ts:34`, 8 attempts, 5 min → 6 h) — injected into the delivery retry policy by Tovu (cms does not depend on integrations).
- Tovu `pullFromFormDestination` + `importRemoteFormSubmissions` (pull path), `core.forms` settings namespace, custom-credential vault, form-destinations registry.

## WIP review (Codex P1/P2, `33142fa5`)
Reference copies: `/tmp/fm-wip.patch`, `/tmp/fm-wip-app.patch`, `/tmp/fm-wipx/` (new Tovu files), `/tmp/fm-wip-jini/` (Jini files). ~560 new Tovu lines + Jini delivery/pull-coordinator/outbox edits. Kept/dropped per lot below.

## Lots
| Lot | Status | Branch SHA | Merge SHA | Notes |
|---|---|---|---|---|
| F1 | running | | | |
| F2 | running | | | |
| F3 | waiting F2 | | | |
| F4 | waiting F1, F3 | | | |
| F5 | waiting F3 | | | |
| F6 | waiting F4, F5 | | | |
| F7 | — | | | |
| F8 | — | | | |
| F9 | — | | | |

## Coverage / RED / complexity debt / removed checks / bugs / security
(filled per merge)

## Next
F1 + F2 in flight. On F2 merge: rebuild `@jini-ai/cms`, start F3.
