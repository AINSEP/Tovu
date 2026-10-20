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
| F8 | DONE (read-only review = phase B) | — | — | personas OK (code-inspection, security, red-team); 229k tokens/60 calls. 3 High (H1 agent can write core.forms bindings/receiver with no card — Tovu TOVU_CONFIRMATION_SETTINGS, so NOT an owner decision; H2 any vault credential can be bound to any delivery adapter, kit.fetch unrestricted; H3 frozen answers survive permanent delete in outbox_events), 6 Medium, 8 Low, 10 trims. Accepted list: `.cloud-coord/forms-multidest-f8-accepted.md`. DEFERRED (owner): M6 inline admin-route drains also run due delivery jobs (each ≤60 s); L8 inject composition clock; T9 rename site-title-write chokepoint; T10 outbox-retry-policies home. |
| F9J | MERGED (Jini) | f2223b4f | 8f7b832b | 145k tokens. M2 (processing ≤1 attempt → pending), L1 (failed start retried, no unhandled rejection, half-install undone), T4 (FORM_SUBMISSION_RECEIVED_EVENT exported from cms/forms/types, 3 copies unified), T5, T6+L7 why-comments. Coordinator: cms/forms 409/409, infra events 45/45, tsc cms+infra 0, guard 26 (= base), cx nothing new (submitForm 18/16 pre-existing, literal swap only). cms/infra dist rebuild deferred until no Tovu lot is mid-test. |
| F9A | MERGED (Tovu) | 2b78bf9c8 | (merge after 9eab3cf25 line) | 220k tokens. H1 core.forms deliveryBindings + receiver always need a human card; H2 connection port requires worksFor ∋ adapterId, per-attempt kit {fetch,timeouts,now} host-bound via Jini resolveRequestTarget; M5 wider secret keys/values incl. Basic + URL userinfo, ref fields checked; L5 write via chokepoint (new settings/form-delivery-write.ts to avoid a cycle); L4 cast removed; T8 barrel trimmed. Coordinator: 44 files 620/620 (incl. vertical slice), tsc 0, typecheck:tests 0, cx 0 new; removed why-comments reworded/moved (checked). Reported: plugins in-process can bypass kit via globalThis.fetch; cross-origin redirect relies on undici stripping Authorization. |
| F9B | MERGED (Tovu) | fc2b480f7 | 5bc3a13f2 | 322k tokens/152 calls (OVER 300k ceiling). H3 purge scrubs frozen answers + fails unfinished jobs (SqlFormDeliveryRepo.scrubPurged in the purge transaction); M1 gone source → empty plan + one log line, delivery subscribed after webhooks; M3 stop grace 1 s (store closes ≤4 s after signal) + tracked post-pull drain (FormsAutoPullPort.drained); M4 300 s pull budget, lease 375 s; L3 committed-page counts; L6 real frozen-payload check on SQL outbox; T1/T2/T3/T7 trims; L2 README. README conflict with F9A resolved as union. Coordinator (after Jini cms+infra rebuild with F9J): 155 files 2026/2028 pass, 0 fail, 2 skipped; tsc 0; typecheck:tests 0; cx nothing new. Reported: outbox-repo markDelivered/markFailed are unconditional → an attempt in flight during a purge can reset its job to pending and retry with blank answers → F9C. |
| F9C | folded into phase-C lot C3 (outbox-repo markDelivered/markFailed only from processing) | | | |
| C2 | MERGED (Tovu) | c7c68b2d3 | (merge after 47c4b5ef0 line) | 205k tokens. 199→252 tests across 16 importer files; 40 RED checks all caught (/tmp/fm-C2/red.txt). Coordinator coverage rerun (50 importer files, 617/617): form-delivery.ts 100/100/100, deliver.ts 100/100/100, connection-port.ts 100 branch/100 fn/97.22 line (line 22 = export line artifact). Subagent rows: form-delivery-write, form-destination-manifest 100/100/100; pull.ts 100/100 (3-8 doc header); import-remote-submissions 100/100 (type-declaration lines); settings tool-registrations 95.24 branch (lines 82,107 pre-existing, unchanged). typecheck:tests 0. Pinned (reported, not fixed): raw vendor-prefixed token under an innocent config key (e.g. header.value) is not caught by shape. Notes: core.forms.autoPull not card-protected (low; changes no destination). |
| C4 | MERGED (Tovu) | aad753227 | (merge after C2) | 219k tokens. +4 composition/form-delivery tests (new file), form-pull-triggers 2→5, form-submissions 13→20, vertical slice 10→11 (stopped trigger refuses sign-in pulls), serve-export-teardown asserts trigger stop. 47 RED checks all caught. Coordinator coverage rerun: composition/form-delivery.ts 100/100/100, form-pull-triggers.ts 100/100/100 (with admin-local-boot-session-route.test), form-submissions.ts 100 line / 97.83 branch / 100 fn (230-231 = failureDetail, unchanged by this build). Wiring files: every changed line covered (subagent lcov vs diff). index.ts not importable: source pin only. typecheck:tests 0. |
| C1 | MERGED (Jini) | 530ab11e | 01bc4a22 | 195k tokens. cms/forms 409→509, outbox+merge-surface 48→56. Coordinator coverage rerun (all 45 forms test files): all 10 delivery/*.ts + forms/{index,notify-subscriber,submit-service,types}.ts 100/100/100 (submit-service was 93.61 branch on base); worker/policy 100 (subagent fresh run; ports.ts types-only). cms 509/509, infra events 53/53, tsc cms+infra 0, guard 26 (= base). RED: every mutant caught except deliver-job `typeof error === 'object'` guard (redundant: a malformed error throws in the constructor → same retryable delivery-failed; kept as defensive). Notes: planner freeze passes field objects by reference (site-authored schema, not secret); a throwing release in withFormPullLease's finally replaces the result (lease expires). |
| C3 | MERGED (Tovu) | b60279e5d | (merge after C1 progress) | 252k tokens/101 calls. F9C shipped as `status IN ('pending','processing')` (not 'processing' only): Jini recordOverrun writes `pending` on timeout and the late outcome must still land, else a late success re-delivers — pinned first (ca580b39e, green on old adapter, red with processing-only). Settled rows (delivered/failed) are never rewritten; purge-during-attempt tests red before / green after on sqlite, pglite, Postgres 16. Accepted change: a late success after a cap-seal stays `failed` (no re-delivery either way). Tests: repo dialects 22→32, repo postgres 1→2, outbox contract 48→54, jini parity 5→7, forms tools 50→57, new retry-policies unit 7, new 0019 step 8, exclusions 5→6. 49 RED mutants caught. Coordinator rerun (14 files, 237 tests, 236 pass): form-delivery-repo.ts 100/100/100, outbox-repo.ts 99.35 line (151 = declaration artifact) / 100 branch / 100 fn; 1 fail = postgres-baseline (publish_history.config_fields_json text vs jsonb) — FAILS IDENTICALLY ON BASE. tsc 0, typecheck:tests 0. |: phase C full tests — C1 Jini (cms/forms/delivery + outbox), C2 settings + form-destinations, C3 repo/migration/outbox/status tool (+F9C), C4 composition/pull triggers/sign-in | | | |

## Coverage / RED / complexity debt / removed checks / bugs / security
(filled per merge)

## Resume log
- 2026-10-20 06:18Z: fresh coordinator resumed after the 05:46Z usage-limit stop. The previous F3 merge (997c1a9e) was never pushed; origin coordinator was at 235960d1. Re-merged origin/cloud/forms-multidest-F3 (a7a9a734) as 0ff24f5e and re-verified from scratch. Setup redone: Node v24.22.0 tarball (sha256 OK) in ~/.local/node24 via /tmp/fm-env.sh; Jini install 18 s + build 95 s (integrations tsc fails on its own tests, as before); Tovu npm ci x3 40 s; link:jini OK; sdk OK; Postgres 16 cluster /tmp/fm-pg (socket /tmp, roles la/root). Coordinator personas (software-architect, code-inspection, security) re-loaded.

## Next (superseded below)
F9C (outbox-repo conditional transitions), then phase C full tests (coverage recipe + RED per new file), then end-of-build suites.

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

## End of build (running 10:16Z)
Jini build+vitest infra/cms + guard → Tovu `TEST_CONCURRENCY=2 npm test`, admin vitest, tsc, typecheck:tests, 4 repo checks → same Tovu suite + admin on base (wt-base @ 910e7f8ed) → `npm run gates -w apps/desktop`. Script /tmp/fm-coord/eob.sh, logs /tmp/fm-coord/eob/.

## End of build — RESULTS (2026-10-20, coordinator)
- Jini (cloud/forms-multidest @ 01bc4a22): infra vitest 64/64 (11 files); cms vitest 2667/2668 — the 1 fail is media/video-frames.ffmpeg "temporary files that cannot be removed" (chmod 0o500 has no effect as root; no media file in this diff); guard 26 (= base).
- Tovu whole suite (`TEST_CONCURRENCY=2 npm test`, build @ c034cc08e): 23162 tests, 23081 pass, 45 fail, 36 skipped. Base (910e7f8ed): 22944 tests, 22860 pass, 48 fail, 36 skipped.
  - Build-only failure: no-raw-sqlite.boundary (scanner's `.run()` pattern matched two non-SQLite port calls) → F9D (654617630, merged e7dc8ba11): `trigger.run({})` + local port renamed `importPage`; boundary + form-submissions + form-pull-triggers 31/31 after merge; F9D tsc 0, typecheck:tests 0.
  - Base-only failures fixed by this build: commerce-strip-parity, vault-boundary-parity (F7b), tiptap-render-contract (not touched by this build: treat as flaky).
  - Shared (fail identically on base): database-transfer tool-registrations.postgres ×3 (expects host localhost), default-credential-exposure ×2, theme-colour-contract, playwright-page-capture redirect, vault-hot-path ×2, vault-read-parity(.postgres) ×10, vault-write-parity ×3, postgres-baseline (publish_history.config_fields_json text vs jsonb), render-form-layout ×3, theme-preview-refresh, route-modules 'forms-admin', development/eslint-rules single-fetch-query-provider ×10, development/scripts check-idle-motion, dead-path-sweep ×2, openapi-contract-fixtures, repair-site ×2.
- Admin vitest: build 11945 pass / 5 fail / 2 skipped; base identical 5 (Users.unit, account-protections, untranslated-copy ×3). apps/admin untouched.
- Root tsc 0; typecheck:tests 0.
- Repo checks vs base: boundaries 1071 vs 1069 (+2 = test files importing the repo-wide isolated-catalog-home helper, 623 such on base); architecture: API surface 661 vs 660 (deps.ts → form-delivery-repo), hub count 391 vs 390 (non-blocking warning), back-edges 9 = base; inventory OK; outbox-bridge 5 = base.
- Desktop gates (owed for 910e7f8ed; this build does not touch apps/desktop): `npm run gates -w apps/desktop` → "No workspaces found" (apps/desktop is not a workspace). Ran `cd apps/desktop && npm ci --ignore-scripts` (ELECTRON_SKIP_BINARY_DOWNLOAD) + `npm run gates`: with registry @jini-ai → typecheck FAIL (registry Jini lacks readLoginShellEnvironment, createToolGapCollector). With desktop's @jini-ai symlinked to the local Jini checkout: tree-quiet PASS, typecheck PASS, complexity PASS, js-backslide PASS, tests FAIL, coverage FAIL — the failing tests are websites-width ×2 (Playwright wants chromium_headless_shell-1228, container has a different revision: environment) and coverage follows from them. Swift helper / macOS gates: NOT RUN (Linux).
- Subagent tokens (approx): F4 323k, F5 306k, F9B 322k (all three OVER the 300k ceiling), F6 273k, C3 252k, F8 229k, F9A 220k, C4 219k, C2 205k, C1 195k, F7b 164k, F9J 145k, F7a 113k, F9D 96k; avg ≈ 219k. Hand-offs: none.

## Owner merge order
1. Jini `cloud/forms-multidest` (01bc4a22) → general-work first; rebuild cms + infra (and publish/link) .
2. Tovu `cloud/forms-multidest` → restructure/apps-website-phased, with link:jini to the merged Jini.
3. LOCAL DB: the owner's local DB has the stale WIP `0019_form_delivery_and_pull` applied (stale checksum) — drop that migration's tables + its ledger row before running this branch (new id `0019_form_delivery_plans`).

## Deferred / follow-ups (owner)
- F8 M6: inline admin-route `processOutbox` drains also run due delivery jobs (each ≤60 s) → saving a post can wait behind a down destination; fix = inline drains skip FORM_DELIVERY_EVENT.
- F8 L8: inject the composition clock so the 60 s window is fake-clock testable; T9 rename site-title-write chokepoint; T10 outbox-retry-policies home.
- C2 pinned (reported, not fixed): a raw vendor-prefixed token under an innocent config key (e.g. header.value) is not caught by shape.
- core.forms.autoPull is writable by the assistant without a card (low: changes no destination).
- Plugins run in-process: a delivery plugin calling globalThis.fetch bypasses the host-bound kit (needs a sandbox).
- A copied DB carries pending delivery jobs; source + copy running together can both deliver (pre-existing for all outbox jobs).
- C3: a late success after a timeout cap-seal stays `failed` (no re-delivery).
- P5: admin bindings/status UI; email durable jobs; manual retry action.
