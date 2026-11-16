# Wave-B r2 re-check — 2026-11-16 (unattended; only merges + this report committed)

**Verdict: GO for merging into refactor/terra, conditional.** All type/lint/size/guard gates are green in both repos; Jini tests are green except 2 pre-existing/known; Tovu admin is green except the known recharts-0.7.0 pin. The website still has 35 NEW-class + 13 KNOWN failing files (down from 85 non-ENV), mostly assertion-shape/format drift, not crashes. The human should decide on those and on the charts-recharts pin (needs re-review).

## Merge (Tovu `integ/wave-b-r2` = `integ/wave-b-fixed` + web-a + web-b + tsc, `--no-ff`, pushed; Jini untouched at `origin/integ/wave-b-r2` 02edbb68)
- web-a: clean. web-b: 5 conflicts. tsc: 9 conflicts (4 files overlapped with web-b's already-resolved ones). All test-only except one port type.
- Resolutions (nothing dropped; kept the stricter or more correct version):
  - `api-connections/__tests__/support/starting-browser.ts`, `platform/observability/__tests__/fixtures/otel-sdk.ts`, `consent/ensure-privacy-defaults.test.ts`: same code both sides, differed only by comment/formatting → kept web-a.
  - `settings/publish-content.round-trip.test.ts`: kept web-b's `handler.inspect!(...)` (type-safe, same runtime).
  - `trash/member-adapter.test.ts`, `members/repo.contract.test.ts`: kept web-a's stricter `{ items, nextCursor }` / cursor-continuation assertions over tsc/web-b's `.items`-only (union: no assertion lost).
  - `webhooks/tool-registrations.model-facing-errors.test.ts`: identical assertion, kept web-b comment.
  - `post/publish-content.test.ts`, `publish-content/repo-handler.test.ts`, `server/routes/member-oidc-auth.test.ts`: formatting/destructuring-equivalent → kept web-a.
  - `server/routes/member-password-auth.test.ts`: took tsc's uniform `register({ app, deps })` — every registrar (incl. `/me`) takes object args; web-a's `(app, deps)` loop was wrong.
  - `form-destinations/port.ts`: kept single-arg `loadRegistry` (matches composition `deps.ts`).
- After resolving: the 9 conflicted test files run 264/264 pass. No merge-fallout fixes were needed.

## Jini (detached `origin/integ/wave-b-r2`)
| gate | prev (11-16 recheck) | now |
|---|---|---|
| `pnpm --no-bail -r build` | 1 pkg failed (daemon) | **0 failures** |
| `pnpm -r typecheck` | 10 errors / 2 pkgs | **0** |
| `pnpm guard` | 79 violations | **0** |
| `check:size` | FAIL | **pass** (259 debt, 8 exceptions) |
| `check:complexity` | pass | pass (17 entries) |
| `pnpm -r test` | ~12 failing pkgs | see below |

Tests (full `pnpm -r test` hit my 25-min cap under CPU contention; unfinished pkgs re-run alone):
- cookie-consent `bundle.smoke.test.ts` gzip headroom 23 B < 32 B — **KNOWN**.
- plugin-fixture-provider `__tests__/package.test.ts` expects `0.6.19`, got `0.7.1` — **PRE-EXISTING** (same assertion and version on origin/refactor/terra).
- agent-plugins `lifecycle-reconciliation.unit.test.ts` (2 × 5 s timeouts) — **flake under load**; passes 9/9 alone.
- user-management (hung at cap) → alone 1233/1233 pass; examples minimal-host 3/3, neutral-host 66+13 todo, reference-web vitest 54/54; reference-web `e2e/*.mjs` — **ENV** (`playwright` package missing).
- Everything else passed: chat, daemon, admin, agent-runtime, sqlite, vibecoding, ui, cms, … all green (previous failures in these are gone).

## Tovu (`integ/wave-b-r2`, Jini linked, contracts + sdk built OK)
| gate | integ/wave-b-fixed | now |
|---|---|---|
| `tsc -p tsconfig.json` | 1 | **0** |
| `tsc -p tsconfig.tests.json` | 142 | **0** |
| apps/admin tsc | 0 | 0 |
| apps/site-chat tsc / tests | 0 / 189 pass | 0 / **189 pass** |
| apps/admin vitest (`--maxWorkers=2`) | 8 failed / 14472, 12 files | **0 failed tests / 14472** (14470 pass, 2 skip); 1 file fails to load: `recharts-bundle-integer-ticks.unit.test.ts` (Jini has `charts-recharts/0.7.1`, not the 0.7.0 pinned dir) — **KNOWN** |
| desktop tsc main / preload / renderer | 61 / 0 / 0 | **61** / 0 / 0 (unchanged; mostly `../website/**` re-checked under desktop config + `desktop-agent.ts`, 3 `*-ipc.test.ts`; not edited) |
| website node:test FULL (3005 files, 76 batches) | 1323 files: 333 failed subtests, 112 failing files (27 ENV, 85 non-ENV) | **3005 files: 33778 tests, 33515 pass, 208 fail + 19 cancelled; 90 failing files: 41 ENV, 35 NEW, 13 KNOWN; non-ENV failed subtests 85+** |

Website non-ENV list with first error lines: `cloud-results/web-fail-files-r2.txt` (48 lines). ENV = postgres/psql (not available), playwright browsers (not installed), cancelled postgres parent tests.
Notes: `cli/__tests__/integration/{serve,adopt}-command` are very slow (20–50 s per test); batch 072 timed out at 840 s, so I re-ran its files one by one — all pass except `introspect-command` and `serve-command` (the injected seed failure test) which are in the list as NEW, `storage-move.postgres` ENV. The 85-failing-subtest comparison with the earlier 85 files is not like-for-like (earlier run covered only changed + importer files).

## Known open items (status, not fixed)
- charts-recharts 0.7.0 pin vs Jini 0.7.1 — still failing (admin 1 file; website `recharts-package-pin` 3 subtests). Needs human re-review.
- Jini outbox `lastError` loses `FormDeliveryError` codes — still failing (form-delivery*, forms-notification-restart).
- agent-daemon-core-rpc in-memory agentSessions — still failing (1).
- app-federation-reload listener — still failing (1).
- cookie-consent gzip headroom — Jini test, still failing.
- media BM25 tie (`import-local-file-search`) — still failing.
- webhook-delivery-worker / describeErrorForLog format — still failing (`webhook-delivery-worker.shutdown`, `describe-error-for-log`, `fatal-boot-failure`, `process-error-guards`).
- L244 no-op patch bumps version 1→2 — still failing (`l244-characterization`, 4).

## Highlights of NEW-class website failures (human triage; no terra baseline was run)
`observability-middleware` (5), `settings-events-resume` (5), `index-boot.characterization` (5), `forms-response` (3), `worker-import-graph` (4, handlebars-worker names `@jini-ai` root barrels), `agent-daemon-import-graph` (1 forbidden module), `no-vendor-in-core` / `no-raw-sqlite` boundary tests, `shipped-theme-original-drift.canary` (run `tovu theme sync-originals`), `boot-site-dir.integration` (`workspaces` has no column `version`), `byok-message-attachments` (`res.status is not a function`), `component-catalog-routes` (daemon exited at boot).
