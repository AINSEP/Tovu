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
| F1 | MERGED (Jini) | d6998d71 | ff to d6998d71 (pull --rebase flattened the --no-ff merge; later merges use --rebase=merges) | personas OK; cx max 9/5; tsc OK; outbox 45/45 + importers (infra 4, cms seo 52); worker/policy 100/100/100/100 (coordinator rerun); guard = base (26 pre-existing); RED 12/12; WIP: kept shape, dropped throw-wedge (fallback to default policy, logged) |
| F2 | MERGED (Jini) | 57688b37 | 40ee5379 | personas OK; cx max 7/4; tsc OK; cms/forms 400/400; errors.ts 100% (coordinator rerun), deliver-job 50% branch (phase A pins only); guard = base; no vendor names; cms rebuilt; contract ratified → Tovu `.cloud-coord/forms-multidest-contract.md` |
| F3 | MERGED (Tovu) | a7a9a734 | 0ff24f5e | personas OK (programmer+tdd+database); RESUMED coordinator re-verified: cx 0 over 9; root tsc 0; typecheck:tests 0; F3 tests + migration/outbox/fresh-db importers 179/179 (Postgres INCLUDED); form-delivery-repo.ts 100 line / 98.31 branch / 100 fn, 0019 100/100/100 (coordinator rerun); repo checks = base (boundaries 1069→1070 errors: +1 instance of the repo-wide `isolated-catalog-home` test-helper deep import, 623 on base; architecture + outbox-bridge fail identically on base). F3 note: binding validation (F4) must reject duplicate bindingIds (ux_form_delivery_jobs_binding would abort the plan transaction). |
| F4 | waiting F1, F3 | | | |
| F5 | waiting F3 | | | |
| F6 | waiting F4, F5 | | | |
| F7 | — | | | |
| F8 | — | | | |
| F9 | — | | | |

## Coverage / RED / complexity debt / removed checks / bugs / security
(filled per merge)

## Resume log
- 2026-10-20 06:18Z: fresh coordinator resumed after the 05:46Z usage-limit stop. The previous F3 merge (997c1a9e) was never pushed; origin coordinator was at 235960d1. Re-merged origin/cloud/forms-multidest-F3 (a7a9a734) as 0ff24f5e and re-verified from scratch. Setup redone: Node v24.22.0 tarball (sha256 OK) in ~/.local/node24 via /tmp/fm-env.sh; Jini install 18 s + build 95 s (integrations tsc fails on its own tests, as before); Tovu npm ci x3 40 s; link:jini OK; sdk OK; Postgres 16 cluster /tmp/fm-pg (socket /tmp, roles la/root). Coordinator personas (software-architect, code-inspection, security) re-loaded.

## Next
F4 + F5 in parallel.

## Review notes for phase B / F8
- Tovu `InMemoryEventBus.publish` runs handlers serially; the first throw skips later handlers and retries the whole `form.submission.received` row (planning is idempotent; email/webhook handlers re-run on retry — pre-existing semantics).
- Status: first in-flight attempt (`processing`, attempts 1) reads `retrying`.
- Outbox `lastError` stores `error.message` verbatim (F1 note) — delivery path only ever throws FormDeliveryError(code).
