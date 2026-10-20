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
| F4 | MERGED (Tovu) | 4bc8f6e1f (incl. fix F7a) | 45c606447 | personas OK; 323k tokens/138 calls (OVER 300k ceiling). First verify RED: cross-site-read-catalog (forms_delivery_status had no peer reader) → F7a (113k tokens) supplied the peer site's read-only SqlFormDeliveryRepo reads (forSubmission/recentUnfinished) + peer-isolation pin. cx: nothing new/worsened (pre-existing over-9 unchanged, identical on base). Conflicts with F5 in routes/types.ts + deps.ts resolved as unions; F5's duplicate readAutoPull removed in favour of F4's readFormsAutoPull (via settings barrel). |
| F5 | MERGED (Tovu) | 636ba4744 | 46c048ec2 | personas OK; 306k tokens/130 calls (OVER 300k ceiling). Classifier: principalHoldsOwnerWildcard + principalHoldsBuiltinAdminRole (identity feature), explicit AdminSignInPort (CreateAppOptions → createCoreModule → registerAuthRoutes) on password login + desktop boot-session + local boot-session; lease proof FORM_PULL_LEASE_MS = 2 × 10 pages × 2 requests × 15 s = 600 s, host now caps each pull request at 15 s (pull.ts). cx nothing new/worsened. form-pull-triggers.ts 100/100/100 (subagent). |
| F7b | MERGED (Tovu) | 120ea5441 | (merge after cc452f863) | transfer/vault parity pins for 0018 (pre-existing base gap) + 0019 tables: plans + job index copied (ids only; outbox rows travel in the same snapshot; omitting plans would re-plan = duplicate delivery), form_receiver_pulls EXCLUDED (new reason `running-lock`). 163k tokens. |
| F6 | MERGED (Tovu) | 05b067014 | (see log) | personas OK; 272k tokens/70 calls. 10/10 groups PASS (coordinator rerun 10/10, no 'connection is not open' line): P1 pull→plan (2 frozen jobs, key [sid,bindingId], no IP); drain1 A completed / B retrying attempts 1 nextRetryAt +10 min (adapter retryAfter beat 2.5 min backoff) code rate-limited; drain2 same job id/key/payload, A called once; replay adds nothing; binding edits after planning change nothing; non-retryable → failed attempts 1, no retry after +48 h; restart recovers claimed jobs after the 30-min worker lease. P2 autoPull OFF → 0 pulls; ON → 1 startup pull, sign-in within 60 s pulls nothing; manual during in-flight → already-running. Mutation check: 7 product breaks each failed its group. |
| F7 | not needed beyond F7a/F7b (F6 found no product failure) | | | |
| F7 | — | | | |
| F8 | — | | | |
| F9 | — | | | |

## Coverage / RED / complexity debt / removed checks / bugs / security
(filled per merge)

## Resume log
- 2026-10-20 06:18Z: fresh coordinator resumed after the 05:46Z usage-limit stop. The previous F3 merge (997c1a9e) was never pushed; origin coordinator was at 235960d1. Re-merged origin/cloud/forms-multidest-F3 (a7a9a734) as 0ff24f5e and re-verified from scratch. Setup redone: Node v24.22.0 tarball (sha256 OK) in ~/.local/node24 via /tmp/fm-env.sh; Jini install 18 s + build 95 s (integrations tsc fails on its own tests, as before); Tovu npm ci x3 40 s; link:jini OK; sdk OK; Postgres 16 cluster /tmp/fm-pg (socket /tmp, roles la/root). Coordinator personas (software-architect, code-inspection, security) re-loaded.

## Next
F8 review (phase B), then F9 fixes + phase C tests, then end-of-build suites.

## Combined F4+F5 verify (coordinator, merged state cc452f863)
- root tsc 0; typecheck:tests 0; 592 lot+importer test files: 6766 tests, 6752 pass, 6 fail, 8 skipped. 4 fail identically on base (database-transfer tool-registrations.postgres ×3 expect host 'localhost' vs PGHOST=/tmp; theme-colour-contract missing content tokens.json). 2 (commerce-strip-parity) = 0018/0019 tables missing from parity pins → F7b; after F7b: parity + vault-boundary + exclusions 21/21, typecheck:tests 0.
- repo checks: boundaries 1070 (= post-F3), outbox-bridge 5 (= base), inventory OK, architecture API surface 661 vs base 660 (+1: deps.ts → platform/db/repos/form-delivery-repo, same pattern as every Sql repo; no barrel exists).
- Test hygiene (pre-existing): the suite leaves chat.db, content/themes/.preview-refresh.json, sites/tovu-dev/agent-plugins/ in the repo root; removed by hand.

## Review notes for phase B / F8
- F6: form-submissions.ts:91 starts a background processOutbox after a pull that stop() never awaits → closing the store mid-drain logs 'database connection is not open' (rows recover after the 30-min worker lease).
- F6: composition clock fixed at deps.ts:1172 (Date); planning timestamps + pull lease use wall clock, so the 60 s 'recent' window cannot be driven by a fake clock.
- F5: per-receiver pull failure log (form-submissions.ts pullOne catch) includes receiver origin + redacted stack; now emitted at startup/sign-in.
- F5: stopServingWithinGrace waits on the pull with no limit (≤ ~300 s).
- F5: a page import that throws can leave forms[].imported > report counts.
- F5: forms_pull_submissions catalog description does not mention per-form counts.
- F7b: a copied DB carries pending outbox delivery jobs; source + copy running together can both deliver (pre-existing for all outbox jobs; idempotencyKey helps only where the destination honours it).
- SECURITY (F4 finding b, coordinator-confirmed): Jini `core/settings/agent-write-denylist.ts` confirmation list holds only core.privacy + core.instructions.custom, so the assistant's `settings_set_value` can write `core.forms.deliveryBindings` (and `core.forms.receiver`) without a human confirmation card → a prompt-injected agent could add a binding that copies every submission to another installed destination/saved connection. Fix needs a Jini core/settings change (outside this build's Jini scope) or a host-side rule: OWNER DECISION.
- F4: planner throw (missing submission) retries the whole form.submission.received row and re-runs email/webhook handlers (pre-existing bus semantics).
- F4: `enforceFormDeliveryBindingsWrite` uses `as unknown as JsonValue` (settings/form-delivery.ts:90).
- F4: the settings chokepoint validates before authorizing (rule text only, never values).
- Tovu `InMemoryEventBus.publish` runs handlers serially; the first throw skips later handlers and retries the whole `form.submission.received` row (planning is idempotent; email/webhook handlers re-run on retry — pre-existing semantics).
- Status: first in-flight attempt (`processing`, attempts 1) reads `retrying`.
- Outbox `lastError` stores `error.message` verbatim (F1 note) — delivery path only ever throws FormDeliveryError(code).
