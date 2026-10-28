# Overnight analysis 2026-10-28 — RESULTS (report only; no product code changed)

Analysis ran on Tovu `cloud/analysis-1028` @ 7d229106 and Jini `cloud/analysis-1028` @ f68294e6, Node 24.22, Sonnet 5.5. **Tovu was analysed from a scratch copy** (see §6/setup note). Raw data: `raw/`.

## §0 Summary (one screen)

| Step | Result |
|---|---|
| 1 Tests — Jini | 48,751 tests; **16 fail** (12 files, 8 pkgs, all deterministic on re-run); 8 more pkgs red only on coverage thresholds; `test:scripts` 3 + 3 (infra-retirement gates) fail; typecheck: 26 errors (provider-plugins); `pnpm guard` 41 violations; build 0 failures |
| 1 Tests — Tovu | website/plugins/sdk node:test **32,833 tests, 247 fail** (≈60 ENV: no Postgres/chromium; rest triaged in §1) + **1 hanging test file**; admin vitest 13,724 tests / **32 fail**; desktop 2,538 tests / **2 fail**; root tsc exit 0 |
| 2 Coverage | Tovu website-side lcov 89.2 % lines / 75.4 % br / 63.2 % fn, **1,044 files never loaded**; route floor FAIL (82.9 % vs 88 %); admin 99.4 % lines. Jini: 102 production files at 0 %; per-package in §1 table |
| 3 Complexity (>10) | Jini 88 prod functions (54 cyclomatic / 34 cognitive); Tovu 169 (94 / 75); both `complexity:strict` scripts are broken as written (sonarjs plugin missing from CLI rule object) |
| 4 Architecture | Tovu check:architecture FAIL: 31 new module cycle pairs, SCC 0→61, back-edges to composition root 0→12; dependency-cruiser 1,334 errors; madge 212/183/172 file cycles (website/admin/desktop); Jini cycles small; direct vendor imports (sharp, better-sqlite3) in website core |
| 5 d6310d697 | 7 findings (1 high-risk URI-reuse issue), 3 dead/unverified |

**Top 10 to fix first (risk-ranked)**
1. **Tovu clean install is broken**: `npm ci` E404 — `@jini-ai/cookie-consent` is not on npm (package.json:134). CI/Docker builds depending on the registry fail; also `@tovu/sdk` typecheck fails against registry `@jini-ai/plugins@0.6.10`.
2. **Hanging test** `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — 2 subtests fail and the process never exits (a full `npm test` shard stalls until killed). Likely leaked timer in durable-run recovery.
3. **Architecture regression**: 31 new mutual module pairs, one 61-module SCC, 12 back-edges into the composition root (`platform`↔everything, `assistant`↔features). Verify whether the committed baseline is stale, then fix top edges.
4. **Jini `@jini-ai/db` peer conflict**: `@jini-ai/infra ^0.3.4` vs other packages' `^0.6.10` — no common version (scripts test `peer-range-compatibility`); breaks consumers' installs.
5. **Jini↔Tovu UI contract drift**: password-reveal button no longer "Show password" (Jini ui/user-management tests + 3 Tovu admin files); AG-UI boundary markers now emit status events (admin ×4 + Jini agentic/chat).
6. **`page.highlight` NaN/Infinity durationMs now throws instead of clamping** (agentic `page-capabilities.ts:60` vs executor clamp; 5 failing tests) — behavioural regression.
7. **Desktop renderer `ResourcesChip is not defined`** (websites-width test) — runtime ReferenceError candidate in apps/desktop renderer.
8. **Rendered pages now contain `jini-consent` markup / worker graph pulls forms services** (≈9 Tovu route tests, `worker-import-graph`) — Jini cms/cookie-consent changes leaking into public pages and the handlebars worker.
9. **d6310d697**: `surfaceUri`-keyed receipts can close a later card re-emitted under the same `ui://` URI (outcome-after-confirmation, retries); receipts over all history with no ordering; changeset says patch for a breaking template-URL change.
10. **Theme drift** `content/themes/__original-themes__/static/tovu-theme` ≠ shipped theme (2 canaries) + `identity` policy / `fs_write_files` batch opt-out / `s3` blob store env mismatch — small, high-confidence drifts. (Also: `complexity:strict` broken in both repos; `area-coverage-floors.json` missing; Jini guard N1 "Tovu" strings in cookie-consent.)


## §1 Failing tests

**Setup/typecheck findings (all REAL, not test failures)**
- `npm ci` in Tovu **fails** (E404 `@jini-ai/cookie-consent@^0.6.12` is not published on npm; package.json:134). Any registry-only install is broken. Analysis used a copy with cookie-consent → local `file:` path.
- `@tovu/sdk` build against the registry `@jini-ai/plugins@0.6.10` fails typecheck (`PluginProviderContribution/Factory/Resource` not exported by `@jini-ai/plugins/host`; `packages/sdk/src/index.ts:155,164`) — SDK declares `^0.6.10` but uses newer exports.
- `npm run typecheck` (root `tsc -p tsconfig.json`) after link: **exit 0**. (Admin/desktop/site-chat tsc configs, `typecheck:tests`, `typecheck:scripts` NOT RUN.)
- Jini `pnpm -r typecheck`: **26 errors, all in `packages/provider-plugins`** — `src/analytics-posthog/consent-adapter.ts` uses `Document` and `src/__tests__/analytics-posthog-anonymous.test.ts` uses `document`/`location` but tsconfig has no DOM lib (14+3+2 errors), plus type errors in `telemetry-reporter.test.ts`, `observability-opentelemetry.test.ts`, `analytics-posthog-browser.test.ts`. Other packages typecheck clean. Root `tsc -p scripts/tsconfig.json` NOT RUN.
- Jini `pnpm install --frozen-lockfile` OK; `pnpm -r build` OK for every package (0 failures).
- Jini `pnpm run complexity:strict` as scripted **fails** (config error "sonarjs plugin not defined": CLI `--rule` object has no plugin; `package.json:20`) — it can never pass in this form. I used an equivalent scratch config.

**Jini test failures: 16 failing tests in 12 files / 8 packages (+ 8 packages red only on coverage thresholds)** — all 12 failing files fail again when re-run alone ⇒ none FLAKY.
Classification & likely cause:
- STALE TEST — `platform/src/secrets/__tests__/exports.test.ts`: expects `@jini-ai/core: ^0.6.12`, manifest now `^0.6.13` (version bump 0.6.13 `f8056e2c`).
- STALE TEST — `platform/src/__tests__/integration-contracts.test.ts:12`: expects some subpath `jini.entries` = "node", manifest says "universal" (new browser-safe entry not in the test's `browserSafeEntries`).
- STALE TEST (or REAL regression) — `scripts/__tests__/coupling-isolation.test.ts` ×2: `packages/platform/src/shell.ts` now reaches process helper; `agent-runtime/src/core/model-discovery-shared.ts` moved (file moved to `core/`).
- REAL BUG (manifest) — `scripts/__tests__/peer-range-compatibility.unit.test.ts`: `@jini-ai/db` peers `@jini-ai/infra ^0.3.4` conflict with chat/cms/commerce/daemon/integrations `^0.6.10` — no common version.
- REAL BUG or STALE — agentic ×5 (`capability.l077…`, `page-executor.l077…`, `page-executor.test.ts`): `page.highlight` with NaN/Infinity `durationMs` now throws `"durationMs" must be a number, received number` instead of clamping to 3000 (`agentic/src/core/page-capabilities.ts:60` schema validation runs before the executor's clamp; driver doc `page-driver.ts:75` says the executor clamps). Also null-validation messages ("received null" vs "received object").
- REAL/STALE — chat ×3 `store/__tests__/loads-without-driver.test.ts:79` (sqlite/pglite/postgres entries): subprocess import of a peer unexpectedly succeeds (`expect(status).not.toBe(0)`) — peers resolvable in the pnpm workspace; likely ENV (hoisting) or layering regression.
- ENV likely — `desktop-host/src/__tests__/sidecar.test.ts:77` (SIGTERM vs SIGKILL timing on the container), `plugins/src/host/__tests__/unit/discovery.unit.test.ts` (rethrow of non-ENOENT read faults: running as root, no EACCES).
- STALE TEST — `ui/.../agent-handles.test.tsx:204` toggle title "Hide" and `user-management/.../people.test.tsx` button name "Show new password" (label change `Show or hide Client secret` — see `agent-handles.ts`).
- STALE/ENV — `provider-plugins/.../observability-sentry.test.ts` (extra `SpanStreaming` integration — Sentry SDK version), `platform/.../asset-cache-boundaries.test.ts` (415 vs `url is not a cacheable e…` error text — message changed).
- Coverage-threshold failures (exit 1 with no failing test): agent-runtime (lines 99.89 < 99.9, funcs 99.7 < 100), diagnostics (lines 94.74 < 100, funcs 98.1), http-kit (branches 99.19 < 100), infra (branches 99.02 < 100), and others in table below.
- Jini `test:scripts`: see §4.


### Tovu website/plugins/sdk (node:test, 8 shards of ~349 files, `--test-concurrency=1`, 2–4 shards at a time)
Totals (shards 1-4,6-8 + shard 9 = shard 5 re-run minus its hanging file): **32833 tests, 32530 pass, 247 fail, 37 skipped, 19 cancelled.** 86 files contain failures; 129 failures are ENV (no Postgres server / no chromium / scratch copy not a git repo). `apps/admin` and `apps/desktop` results: see "Admin/desktop" below. Shard 5 originally hit its 50-min timeout inside **`apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts`**, which (alone, 300 s limit) fails 2 subtests ("a pending Ask card answered/dead: preserves one card and the same turn across the default probe window") and then **never exits (HANG, REAL BUG candidate — leaked timer/handle in durable-run recovery)**.

| class | failures | file | first error |
|---|---|---|---|
| TRIAGE | 27 | content/agent-plugins/google-workspace/__tests__/sheets.contract.test.mjs | AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false / Caught error: / Error: This plugin call already |
| ENV | 22 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | 'test did not finish before its parent and was cancelled' |
| ENV | 17 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | Error: failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such |
| ENV | 15 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | Error: postgres: psql request failed / at sql (apps/website/src/features/database-transfer/__tests__/pg-test-db.ts:23:25) / at async recreateDatabase  |
| TRIAGE | 10 | apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / { / accepted: true, / +   challengeId: '66d4c803-f9 |
| TRIAGE | 9 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts | AssertionError [ERR_ASSERTION]: The assistant could not start this execution attempt. / at failRunBeforeStart (apps/website/src/server/inbound/assista |
| ENV | 8 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | Error: failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" fa |
| TRIAGE | 7 | apps/website/src/__tests__/index-boot.characterization.test.ts | AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false / Caught error: / ReferenceError: processBuildRel |
| ENV | 7 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | Error: postgres: psql request failed / at sql (apps/website/src/features/database-transfer/__tests__/pg-test-db.ts:23:25) / at async recreateDatabase  |
| ENV | 6 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | Error: failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file |
| TRIAGE | 6 | apps/website/src/server/__tests__/integration/credentials-real-composition.unrun.integration.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / { / +   isDefault: false, / -   isDefault: true, |
| TRIAGE | 6 | apps/website/src/features/pages/__tests__/html-document-store.go-live.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / [ / +   'page-1-content.saved-2', / 'page-1-entry.u |
| ENV | 6 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | Error: failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or |
| ENV | 4 | apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts | Error: failed to drop fixture database "tovu_seed_content_store_pg_fixture_twice": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" fa |
| ENV | 4 | apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | Error: failed to drop fixture database "tovu_migrations_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such  |
| ENV | 4 | apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | Error: failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such  |
| TRIAGE | 4 | apps/website/src/features/site-search/__tests__/cms-search.test.ts | AssertionError [ERR_ASSERTION]: one event for the published page's real change; none for an unchanged save or a draft / + actual - expected / [ / [ /  |
| TRIAGE | 4 | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / false !== true / at TestContext.<anonymous> (apps/website/src/platform/db/__te |
| ENV | 3 | apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell / ╔═ |
| TRIAGE | 3 | apps/website/src/server/runtime/composition/modules/__tests__/route-modules.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'GET /api/admin/v1/workspac |
| TRIAGE | 3 | content/agent-plugins/s3-compatible/__tests__/media-store.integration.test.mjs | Error: Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'. / at readMediaStoreEnv (apps/website/src/features/object-storage/media-store.ts:66:11) / |
| ENV | 3 | apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | Error: failed to drop fixture database "tovu_form_delivery_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed:  |
| TRIAGE | 3 | apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / + '<section id="jini-consent" class="jini-consent" data- |
| ENV | 3 | apps/website/src/platform/db/kernel/__tests__/kernel.postgres.test.ts | Error: failed to drop fixture database "tovu_kernel_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file |
| ENV | 3 | apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | Error: failed to drop fixture database "tovu_kernel_ops_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file o |
| ENV | 3 | apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts | Error: failed to drop fixture database "tovu_r1f2_init_env": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or  |
| TRIAGE | 2 | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | AssertionError [ERR_ASSERTION]: handlebars-worker.ts pulled in forms services: /home/user/Jini/packages/cms/dist/forms/write-service.js, /home/user/Ji |
| TRIAGE | 2 | apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / [ |
| ENV | 2 | apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts | Error: failed to drop fixture database "tovu_entry_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such f |
| ENV | 2 | apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts | Error: failed to drop fixture database "tovu_site_key_dependent_data_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: N |
| ENV | 2 | apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts | Error: failed to drop fixture database "tovu_r1f_create_site_route_deps": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No  |
| TRIAGE | 2 | apps/website/src/features/identity/__tests__/wiring.test.ts | AssertionError [ERR_ASSERTION]: the owner policy stays exactly its seeded wildcard / + actual - expected / [ / '*', / +   'visitor-tools.manage' |
| ENV | 2 | apps/website/src/features/navigation/__tests__/repo.compare-and-set.postgres.test.ts | Error: failed to drop fixture database "tovu_menu_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such fi |
| TRIAGE | 2 | apps/website/src/server/__tests__/integration/widgets-regions-real-composition.unrun.integration.test.ts | AssertionError [ERR_ASSERTION]: fixture: initSite seeds no authored pages / + actual - expected / + [ / +   { / +     post: { |
| TRIAGE | 2 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts | AssertionError [ERR_ASSERTION]: this test's own anchor (the agentExecutor.run call) must still exist verbatim / at TestContext.<anonymous> (apps/websi |
| ENV | 2 | apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts | Error: failed to drop fixture database "tovu_init_site_occupied": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such fil |
| TRIAGE | 2 | apps/website/src/server/__tests__/admin-post-update-rollback-ledger.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / [ / { / aggregateId: '9c6f3b8b-8a8c-431b-8148-c36a7 |
| TRIAGE | 2 | apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-i18n.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / [ / 'Please enter {label}.', / 'Please select {labe |
| ENV | 2 | apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts | Error: failed to drop fixture database "tovu_open_site_store_failure": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No suc |
| ENV | 2 | apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts | Error: failed to drop fixture database "tovu_unreadable_owner_entries_repair_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5 |
| TRIAGE | 2 | apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts | AssertionError [ERR_ASSERTION]: invalid sessions must get the anonymous denial / ... Skipped lines / '<section id="jini-consent" class="jini-consent"  |
| TRIAGE | 2 | apps/website/src/features/site-export/__tests__/site-exporter.test.ts | AssertionError [ERR_ASSERTION]: /: live comments stay private; other live pages stay publicly cacheable / + actual - expected / + 'private, no-store'  |
| TRIAGE | 2 | apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected "actual" to be reference-equal to "expected": / + actual - expected / { / +   findById: [AsyncFunction: findB |
| TRIAGE | 2 | content/agent-plugins/s3-compatible/__tests__/env-declaration.test.mjs | Error: Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'. / at readMediaStoreEnv (apps/website/src/features/object-storage/media-store.ts:66:11) / |
| TRIAGE | 1 | apps/website/src/assistant/__tests__/batch-tool-inputs.test.ts | AssertionError [ERR_ASSERTION]: a tool that asks per call would ask once per item: opt it out / + actual - expected / + [ / +   'fs_write_files' / + ] |
| ENV | 1 | apps/website/src/features/theme/__tests__/shipped-site-theme-drift.canary.test.ts | Error: Command failed: git ls-files -z -- content/themes/__original-themes__/static/tovu-theme / fatal: not a git repository (or any of the parent dir |
| TRIAGE | 1 | apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts | AssertionError [ERR_ASSERTION]: content/themes/__original-themes__/static/tovu-theme no longer matches what 'tovu theme sync-originals' generates from |
| ENV | 1 | apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'agent_tool_attempts', |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts | AssertionError [ERR_ASSERTION]: the exact bare fallback body, not merely a 500 status / + actual - expected / + '<section id="jini-consent" class="jin |
| TRIAGE | 1 | packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / + '^0.6.10' / - '^0.4.0 // ^0.5.0' / ^ |
| TRIAGE | 1 | apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / + [ / +   'members (password_hash)' / + ] |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/http/site/__tests__/form-theme-colours.test.ts | AssertionError [ERR_ASSERTION]: content/themes/__original-themes__/static/tovu-theme/css/theme.css drifted from content/themes/static/tovu-theme/css/t |
| TRIAGE | 1 | content/agent-plugins/fly/deploy-configs/__tests__/fly.test.mjs | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / ... Skipped lines / 'app = "tovu"\n' + / 'primary_region |
| TRIAGE | 1 | apps/website/src/assistant/__tests__/credential-setup-search.test.ts | AssertionError [ERR_ASSERTION]: credential_save search misses: save a repository host source control credential: source_control_get_capabilities, site |
| TRIAGE | 1 | apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'agent_plugin_connect', |
| TRIAGE | 1 | apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / + 'waiting' / - 'finalized' |
| ENV | 1 | apps/website/src/features/forms/__tests__/repo.postgres.test.ts | Error: failed to drop fixture database "tovu_forms_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such  |
| TRIAGE | 1 | apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /<label for="form-contact-email">Email \*<\/label><input type="email" i |
| TRIAGE | 1 | apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts | AssertionError [ERR_ASSERTION]: the daemon's drain claimed these rows and published them to its own subscriber-less bus, so the serving process never  |
| TRIAGE | 1 | apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts | ReferenceError [Error]: assertContentDbFileName is not defined / at createSiteRouteDepsForWorkspace (evalmachine.<anonymous>:3:5) / at TestContext.<an |
| TRIAGE | 1 | apps/website/src/server/__tests__/visitor-assistant-safety.integration.test.ts | AssertionError [ERR_ASSERTION]: Bash / at TestContext.<anonymous> (apps/website/src/server/__tests__/visitor-assistant-safety.integration.test.ts:304: |
| TRIAGE | 1 | apps/website/src/features/__tests__/features-no-server-imports.boundary.test.ts | AssertionError [ERR_ASSERTION]: src/features/INFO.md: features must not import server/framework code. Offending edges: / apps/website/src/features/ana |
| ENV | 1 | apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.postgres.test.ts | Error: failed to drop fixture database "tovu_resolve_workspace_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: N |
| TRIAGE | 1 | apps/website/src/server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts | AssertionError [ERR_ASSERTION]: required subscribers are independent of the current registry / + actual - expected / { / 'entry.published': 1, / 'entr |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-types-style.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / ... Skipped lines / '/* Tokens are NOT defined here — th |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-friendly.test.ts | AssertionError [ERR_ASSERTION]: en / 6 !== 5 / at TestContext.<anonymous> (apps/website/src/server/inbound/public-http/http/site/__tests__/form-valida |
| TRIAGE | 1 | content/agent-plugins/s3-compatible/__tests__/credential-card.test.mjs | TypeError [Error]: Cannot read properties of undefined (reading 'map') / at TestContext.<anonymous> (file://content/agent-plugins/s3-compatible/__test |
| TRIAGE | 1 | apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts | AssertionError [ERR_ASSERTION]: the spawned tovu serve process must export at least one span to the OTLP collector configured via OTEL_EXPORTER_OTLP_E |
| TRIAGE | 1 | apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts | AssertionError [ERR_ASSERTION]: Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: / + actual - expected / + [ / +   'apps/adm |
| ENV | 1 | apps/website/src/features/members/__tests__/member-external-identities.postgres.test.ts | Error: failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" fa |
| ENV | 1 | apps/website/src/features/post/__tests__/repo.postgres.test.ts | Error: failed to drop fixture database "tovu_post_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such f |
| TRIAGE | 1 | apps/website/src/features/site-guide/__tests__/plugin-contributions.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'how-tovu-works-content', |
| ENV | 1 | apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts | 'test failed' |
| TRIAGE | 1 | apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / + [] / - [ / -   'member@example.com' |
| TRIAGE | 1 | apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/files.integration.test.ts | AssertionError [ERR_ASSERTION]: fixture precondition: discovery must surface the traversal id, got charts-recharts, content-analyzer, word-count, inno |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / + actual - expected / + '<section id="jini-consent" class="jini-consent" data- |
| TRIAGE | 1 | apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts | AssertionError [ERR_ASSERTION]: <html><meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39; &#39;unsafe-inline&#39;; object-sr |
| TRIAGE | 1 | apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'seed', |
| TRIAGE | 1 | apps/website/src/server/__tests__/identity-routes.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / [ / '*', / +   'visitor-tools.manage' |
| TRIAGE | 1 | apps/website/src/server/__tests__/route-async-guards.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: / 204 !== 500 / at TestContext.<anonymous> (apps/website/src/server/__tests__/ro |
| TRIAGE | 1 | apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts | AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: / assert.ok(result.body.includes("This is your home page.")) / at TestConte |
| TRIAGE | 1 | apps/website/src/features/theme/__tests__/set-active-theme-tool.test.ts | AssertionError [ERR_ASSERTION]: Missing expected rejection. / at async TestContext.<anonymous> (apps/website/src/features/theme/__tests__/set-active-t |
| TRIAGE | 1 | apps/website/src/platform/db/__tests__/parity/vault-boundary-parity.test.ts | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected / ... Skipped lines / [ / 'agent_tool_attempts', |
| TRIAGE | 1 | apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts | AssertionError [ERR_ASSERTION]: New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) inst |
| TRIAGE | 1 | apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/uninstall.integration.test.ts | AssertionError [ERR_ASSERTION]: precondition failed: discovery must surface the malicious-id record for this test to mean anything / at TestContext.<a |
| TRIAGE | 1 | apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts | ReferenceError [Error]: pickedFolder is not defined / at eval (eval at evaluateDaemonExpression (file://apps/website/src/server/inbound/assistant/__te |

**Triage notes (read the code, not just the error):**
- STALE TEST — `create-sqlite-route-deps-for-workspace.integration.test.ts` and `index-boot.characterization.test.ts`: `ReferenceError: assertContentDbFileName is not defined` — tests slice a function's source into a vm; the function (`deps.ts:641`) now calls the helper defined at `deps.ts:650`, which the vm slice lacks.
- STALE TEST — `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts`: expects `@jini-ai/plugins` range `^0.4.0 || ^0.5.0`, manifest has `^0.6.10`.
- JINI/TOVU VERSION SKEW (5 files, ~9 failures): `pages.route.test.ts`, `pages.edge-paths.route.test.ts`, `pages.member-access.route.test.ts`, `pages-branch-coverage.integration.test.ts`, `taxonomy-render-surface…`: rendered pages now contain `<section id="jini-consent" …>` from the linked local Jini cookie-consent (unpublished 0.6.13+) — expected bodies don't. Real if Tovu intends that markup; otherwise the test needs the new fixture. Also `worker-import-graph.test.ts` ("handlebars-worker.ts pulled in forms services" via Jini `cms/dist/forms/write-service…`) — a Jini cms change drags forms services into the worker graph (REAL, boundary).
- REAL (boundary tests that mirror §4): `features-no-server-imports.boundary.test.ts`, `no-vendor-in-core.boundary.test.ts` (vendor knowledge outside plugins).
- REAL/STALE — `identity/wiring.test.ts`, `identity-routes.test.ts`: owner policy now contains `visitor-tools.*` entries beyond the seeded wildcard; `batch-tool-inputs.test.ts`: tool `fs_write_files` is not opted out of per-item asking; `credential-setup-search.test.ts`, `mcp-ui-tool-calls.test.ts`, `site-guide/plugin-contributions.test.ts`, `database-transfer/exclusions.unit.test.ts`: expected tool/catalog lists drifted from what the code now registers.
- `content/agent-plugins/google-workspace/__tests__/sheets.contract.test.mjs` (27 failures): all fail the same validation function → one shared cause (contract schema), single fix.
- `content/agent-plugins/s3-compatible/*`: `Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'` (`features/object-storage/media-store-env.ts`): the s3 store is no longer accepted by core env parsing → plugin/core mismatch. `fly.test.mjs`: expected `app = "tovu"` config text differs.
- `agent-daemon-server.session-binding/resume-wiring.unit.test.ts` (11): "The assistant could not start this execution attempt" at `failRunBeforeStart`; resume test says its source anchor (`agentExecutor.run` call) "must still exist verbatim" → source-anchor tests broken by a refactor (STALE).
- `member-magic-link / credentials / widgets-regions .unrun.integration.test.ts` (18): `accepted: true` extra field / `isDefault` / seeded pages — behavioural drift of real-composition tests (STALE or REAL; these files are named "unrun", i.e. were not being executed before).
- `shipped-*theme*drift.canary` (3): one is ENV (`git ls-files` in a non-git copy); `form-theme-colours` + `shipped-theme-original-drift` say `content/themes/__original-themes__/static/tovu-theme` drifted from `content/themes/static/…` — REAL drift, run `tovu theme sync-originals`.


### Tovu apps/admin (vitest, coverage) and apps/desktop (node:test)
- **apps/admin:** 13,724 tests, **32 failed** in 14 files (27 suites reported failed); coverage 99.40 % lines / 98.45 % branches / 98.71 % functions. (Run without `--minWorkers`: the installed vitest rejects that flag — the brief's command line is invalid for admin.)
  - Cross-repo drift, one cause (Jini UI changed the password-reveal control; button no longer named "Show password"): `credential-input-autocomplete`, `Users.autofill`, `Users.unit` (≥4 failures) — mirrors Jini `user-management/people.test.tsx` and `ui/agent-handles.test.tsx`. REAL contract drift between linked Jini and Tovu admin (or the Jini change is a regression).
  - i18n: `untranslated-copy.unit.test.ts` (10, `ASSISTANT_DOCK_DICT` has untranslated es/… entries e.g. `"Normal"`), `trash-i18n`, `dictionary-lookup-sinks` — missing translations (REAL, small).
  - `admin-screens-manifest.unit.test.ts`: `apps/website/…/admin-screens.generated.ts` drifted from `ADMIN_PANELS` — regenerate (REAL).
  - `settings-tabs.test.ts` (4): telemetry keys order/set changed (`telemetry.content`, `telemetry.metrics` …) — STALE TEST or REAL.
  - `assistant-transport.ag-ui` (4: START/END boundary markers now emit a `status` AgentEvent), `closed-stream`, `durable-run-subscription` (2), `shared-stream-adapters` (1): behaviour of AG-UI/durable run adapters changed vs tests (STALE TEST likely; matches Jini chat/agentic changes).
  - `assistant-user-bubbles.unit.test.tsx` (2): `TypeError: not of type 'Element'` — test setup (jsdom) issue (ENV/STALE). `AssistantDock.chat-settings`: default-grant checkbox not checked (REAL or stale).
- **apps/desktop:** 1,832 + 706 tests (two node:test invocations), **2 failures**: `src/renderer/websites-width.test.ts` "Websites fits at 375px…" → `ReferenceError: ResourcesChip is not defined` (REAL BUG: component referenced without import/definition); one dialog layout test "narrow collapsed multi-tab content fills the dialog…" (layout/jsdom, ENV-ish). Vitest was not used by desktop (no vitest dep).


### Jini — per-package (vitest, `--coverage`)

| package | tests | failed tests | suites failed | line% | branch% | func% |
|---|---|---|---|---|---|---|
| ex:minimal-host | 3 | 0 | 0 | 5.55 | 66.66 | 66.66 |
| ex:nlweb-demo | 18 | 0 | 0 | 100 | 100 | 100 |
| ex:reference-desktop | 4 | 0 | 0 | 22.76 | 80 | 85.71 |
| ex:reference-web | 46 | 0 | 0 | 9.97 | 71.51 | 47.91 |
| admin | 2814 | 0 | 0 | 99.91 | 99.92 | 99.95 |
| agent-plugins | 1485 | 0 | 0 | 99.32 | 99.65 | 99.72 |
| agent-runtime | 4246 | 0 | 0 | 99.89 | 99.48 | 99.7 |
| agentic | 1479 | 5 | 6 | 100 | 100 | 100 |
| analytics | 193 | 0 | 0 | 100 | 99.05 | 97.82 |
| artifacts | 204 | 0 | 0 | 100 | 100 | 100 |
| capability-providers | 197 | 0 | 0 | 100 | 100 | 100 |
| chat | 3741 | 3 | 1 | 100 | 99.7 | 100 |
| cli | 575 | 0 | 0 | 100 | 100 | 100 |
| cms | 4286 | 0 | 0 | 99.97 | 99.75 | 100 |
| commerce | 4 | 0 | 0 | 4.01 | 39.7 | 39.7 |
| cookie-consent | 142 | 0 | 0 | 99.79 | 99.88 | 99.37 |
| core | 1524 | 0 | 0 | 99 | 99.58 | 99.63 |
| daemon | 3723 | 0 | 0 | 99.89 | 99.17 | 99.31 |
| db | 697 | 0 | 0 | 99.55 | 99.21 | 98.52 |
| desktop-host | 678 | 1 | 2 | 99.91 | 99.3 | 100 |
| devops | 1024 | 0 | 0 | 100 | 100 | 100 |
| diagnostics | 873 | 0 | 0 | 94.74 | 98.92 | 98.1 |
| http-kit | 534 | 0 | 0 | 100 | 99.19 | 100 |
| infra | 144 | 0 | 0 | 100 | 99.02 | 100 |
| integrations | 1939 | 0 | 0 | 99.98 | 99.92 | 99.82 |
| mcp | 1427 | 0 | 0 | 99.89 | 99.33 | 100 |
| memory | 332 | 0 | 0 | 100 | 100 | 100 |
| oauth | 707 | 0 | 0 | 100 | 99.89 | 100 |
| platform | 2834 | 3 | 4 | 99.97 | 99.73 | 99.64 |
| plugins | 743 | 1 | 2 | 98.97 | 98.57 | 98.97 |
| protocol | 92 | 0 | 0 | 100 | 98.8 | 100 |
| provider-plugins | 258 | 1 | 1 | 2.07 | 96.6 | 94.79 |
| registry | 349 | 0 | 0 | 100 | 100 | 100 |
| sandbox | 125 | 0 | 0 | 99.78 | 98.59 | 100 |
| search | 320 | 0 | 0 | 100 | 100 | 100 |
| server | 459 | 0 | 0 | 99.73 | 97.96 | 94.19 |
| sidecar | 209 | 0 | 0 | 100 | 100 | 100 |
| sqlite | 8 | 0 | 0 | 100 | 100 | 100 |
| ui-kit | 203 | 0 | 0 | 96.68 | 99.83 | 99.28 |
| ui | 8707 | 1 | 2 | 99.8 | 99.99 | 99.93 |
| user-management | 1104 | 1 | 2 | 100 | 100 | 100 |
| vibecoding | 301 | 0 | 0 | 96.41 | 92.09 | 91.61 |

### Jini — failing tests (all re-run alone: all 12 files fail again → none flaky)

| pkg | file | test | first error |
|---|---|---|---|
| agentic | packages/agentic/src/core/__tests__/capability.l077.characterization.test.ts | L077 input validation order and shallow semantics validates {"name":null} as "name" must b | AssertionError: expected '"name" must be a string, received null' to be '"name" must be a string, received obj…' // Object.is equality /     |
| agentic | packages/agentic/src/core/__tests__/capability.l077.characterization.test.ts | L077 input validation order and shallow semantics accepts null for an object schema becaus | AssertionError: expected '"data" must be a object, received null' to be null /     at /home/user/Jini/packages/agentic/src/core/__tests__/ca |
| agentic | packages/agentic/src/core/__tests__/page-executor.l077.characterization.test.ts | L077 remaining page verbs clamps highlight duration NaN to 3000 | Error: promise rejected "Error: page.highlight: "durationMs" must …" instead of resolving /     at _Assertion.__VITEST_RESOLVES__ (file:///h |
| agentic | packages/agentic/src/core/__tests__/page-executor.l077.characterization.test.ts | L077 remaining page verbs clamps highlight duration Infinity to 3000 | Error: promise rejected "Error: page.highlight: "durationMs" must …" instead of resolving /     at _Assertion.__VITEST_RESOLVES__ (file:///h |
| agentic | packages/agentic/src/core/__tests__/page-executor.test.ts | page.highlight falls back to the default for a nonsensical duration | Error: page.highlight: "durationMs" must be a number, received number. Expected input: {"type":"object","properties":{"handle":{"type":"stri |
| chat | packages/chat/src/store/__tests__/loads-without-driver.test.ts | sqlite entry loads with core, diagnostics, db and Kysely, validates invocation, and leaves | AssertionError: expected +0 not to be +0 // Object.is equality /     at /home/user/Jini/packages/chat/src/store/__tests__/loads-without-driv |
| chat | packages/chat/src/store/__tests__/loads-without-driver.test.ts | pglite entry loads with core, diagnostics, db and Kysely, validates invocation, and leaves | AssertionError: expected +0 not to be +0 // Object.is equality /     at /home/user/Jini/packages/chat/src/store/__tests__/loads-without-driv |
| chat | packages/chat/src/store/__tests__/loads-without-driver.test.ts | postgres entry loads with core, diagnostics, db and Kysely, validates invocation, and leav | AssertionError: expected +0 not to be +0 // Object.is equality /     at /home/user/Jini/packages/chat/src/store/__tests__/loads-without-driv |
| desktop-host | packages/desktop-host/src/__tests__/sidecar.test.ts | createNodeSidecarLauncher shutdown force-kills a child that never exits on its own | AssertionError: expected 'SIGTERM' to be 'SIGKILL' // Object.is equality /     at /home/user/Jini/packages/desktop-host/src/__tests__/sideca |
| platform | packages/platform/src/__tests__/asset-cache-boundaries.test.ts | createAssetCache boundaries refuses an unsupported content-type with 415 naming the header | AssertionError: expected AssetCacheError: url is not a cacheable e… { status: … } to match object { status: 415, …(1) } / (1 matching proper |
| platform | packages/platform/src/__tests__/integration-contracts.test.ts | each published subpath declares its intended runtime and preserves its targets | AssertionError: expected 'universal' to be 'node' // Object.is equality /     at /home/user/Jini/packages/platform/src/__tests__/integration |
| platform | packages/platform/src/secrets/__tests__/exports.test.ts | retains published subpaths and declares adapter dependencies as optional peers | AssertionError: expected { '@jini-ai/core': '^0.6.13' } to deeply equal { '@jini-ai/core': '^0.6.12' } /     at /home/user/Jini/packages/pla |
| plugins | packages/plugins/src/host/__tests__/unit/discovery.unit.test.ts | site discovery edges falls back to the folder name for a non-object manifest and rethrows  | Error: promise resolved "[ { id: 'broken', …(7) }, …(3) ]" instead of rejecting /     at _Assertion.__VITEST_REJECTS__ (file:///home/user/Ji |
| provider-plugins | packages/provider-plugins/src/__tests__/observability-sentry.test.ts | release reaches the private client and delivered event without global initialization or de | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: / + actual - expected /  / + [ / +   { / +     name: 'SpanStreami |
| ui | packages/ui/src/features/source-config-list/agent-handles.test.tsx | SourceConfigField markup labels the toggle by the field it reveals, so the label does not  | Error: expect(element).toHaveAttribute("title", "Hide") // element.getAttribute("title") === "Hide" /  / Expected the element to have attrib |
| user-management | packages/user-management/src/admin/react/__tests__/people.test.tsx | composable users screen reset guards mismatch, preserves failures and reveals independentl | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Show new password" /  / Here are the acces |

## §2 Coverage (Jini; Tovu see §2b)

Files with 0% line coverage (non-test, summed across packages): **102**.

30 largest uncovered production files (Jini, by uncovered lines):

| file | uncovered lines | line% | lines |
|---|---|---|---|
| packages/provider-plugins/plugins/observability-opentelemetry/0.6.13/server/index.mjs | 19732 | 0 | 19732 |
| packages/provider-plugins/plugins/observability-sentry/0.6.13/server/index.mjs | 12828 | 0 | 12828 |
| packages/provider-plugins/plugins/analytics-posthog/0.6.13/server/index.mjs | 9439 | 0 | 9439 |
| packages/provider-plugins/plugins/ai-trace-langfuse/0.6.13/server/index.mjs | 4162 | 0 | 4162 |
| examples/reference-web/src/daemon.ts | 510 | 0 | 510 |
| packages/commerce/src/payments/ledger/rows.ts | 362 | 0 | 362 |
| examples/reference-web/src/WebMcpLab.tsx | 322 | 0 | 322 |
| packages/commerce/src/payments/ledger/repo.memory.ts | 317 | 0 | 317 |
| examples/reference-web/src/A2uiLab.tsx | 293 | 0 | 293 |
| packages/commerce/src/payments/ledger/repo.sql.ts | 293 | 0 | 293 |
| examples/reference-web/src/AgentLab.tsx | 271 | 0 | 271 |
| packages/commerce/src/payments/accounting/apply-evidence.ts | 246 | 0 | 246 |
| examples/reference-web/src/McpUiLabHost.tsx | 238 | 0 | 238 |
| packages/commerce/src/catalog/repo.ts | 233 | 0 | 233 |
| examples/reference-web/src/LabExpense.tsx | 226 | 12.74 | 259 |
| examples/minimal-host/src/index.ts | 204 | 0 | 204 |
| examples/reference-web/src/LabPages.tsx | 190 | 0 | 190 |
| examples/reference-web/src/daemon-transport.ts | 180 | 21.05 | 228 |
| packages/commerce/src/catalog/repo.rows.ts | 165 | 0 | 165 |
| packages/commerce/src/payments/accounting/plan-evidence.ts | 154 | 0 | 154 |
| examples/reference-web/src/App.tsx | 149 | 0 | 149 |
| packages/commerce/src/payments/ledger/migrations/0001_payments_ledger.ts | 148 | 0 | 148 |
| packages/provider-plugins/plugins/payments-stripe/0.6.13/server/index.mjs | 147 | 0 | 147 |
| packages/commerce/src/payments/ingest/worker.ts | 137 | 0 | 137 |
| packages/commerce/src/payments/ops/common.ts | 125 | 0 | 125 |
| examples/reference-desktop/src/main.ts | 123 | 0 | 123 |
| packages/commerce/src/payments/ops/capture-void.ts | 123 | 0 | 123 |
| examples/reference-web/mcpui-view-src/mcp-app.ts | 119 | 0 | 119 |
| packages/commerce/src/payments/ops/intent.ts | 110 | 0 | 110 |
| packages/commerce/src/payments/ops/refund.ts | 110 | 0 | 110 |

## §2b Coverage — Tovu (node:test lcov, all 8 shards merged with `coverage-all-files`)
Whole-repo (apps/ packages/ content/ roots): **lines 284549/318978 = 89.2%, branches 75.4%, functions 63.2%**, 3054 files, **1044 NEVER-LOADED (0%)**. Caveat: apps/admin and apps/desktop renderer code is exercised by vitest/desktop tests, not these lcovs, so those areas read artificially low here. `check-route-coverage-floor`: line 82.85% (floor 88%), branch 80.20% (68%), funcs 65.08% (floor 93%) → FAIL. `check-area-coverage-floor`: FAIL — `development/scripts/area-coverage-floors.json` is missing from the repo. `classify-coverage-gaps`: 276 route files below tier threshold of 497 scanned — **ARCHITECTURE_DEBT 176** (complexity ≥ 10 blocks coverage; many admin-http routes sit at complexity exactly 10 vs the gate's max 9) and **TEST_GAP 100** (clean complexity, tests missing). Full text: raw/classify-coverage-gaps.log.

Per-area (lines / branches / functions %, files, never-loaded), lowest 25 areas with ≥ 15 files:

| area | files | never-loaded | lines% | branches% | funcs% |
|---|---|---|---|---|---|
| apps/admin | 798 | 798 | 0.0 | 0.0 | 0.0 |
| apps/desktop | 188 | 188 | 0.0 | 0.0 | 0.0 |
| content | 145 | 50 | 87.3 | 83.7 | 74.2 |
| apps/site-chat | 29 | 5 | 98.2 | 95.6 | 95.6 |
| apps/website | 1892 | 3 | 99.5 | 96.7 | 95.1 |

30 largest uncovered production files (Tovu, uncovered lines):

| file | status | uncovered | total lines |
|---|---|---|---|
| apps/desktop/main.ts | NEVER-LOADED | 535 | 535 |
| apps/website/src/server/inbound/assistant/agent-daemon-server.ts | NEVER-LOADED | 487 | 487 |
| apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | NEVER-LOADED | 470 | 470 |
| apps/desktop/src/renderer/App.hooks.ts | NEVER-LOADED | 461 | 461 |
| apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | NEVER-LOADED | 456 | 456 |
| apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | NEVER-LOADED | 337 | 337 |
| apps/desktop/src/project-ipc.ts | NEVER-LOADED | 336 | 336 |
| apps/admin/src/App.hooks.ts | NEVER-LOADED | 286 | 286 |
| apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | NEVER-LOADED | 285 | 285 |
| apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | NEVER-LOADED | 279 | 279 |
| apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | NEVER-LOADED | 250 | 250 |
| apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 212 | 212 |
| apps/desktop/src/stage-payload-lib.ts | NEVER-LOADED | 212 | 212 |
| apps/desktop/src/tovu-server.ts | NEVER-LOADED | 204 | 204 |
| apps/desktop/src/smoke-packaged-chat-gate.ts | NEVER-LOADED | 181 | 181 |
| apps/desktop/src/renderer/use-find-in-page.hooks.ts | NEVER-LOADED | 180 | 180 |
| apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | NEVER-LOADED | 177 | 177 |
| apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 175 | 175 |
| apps/admin/src/features/security/rules.ts | NEVER-LOADED | 173 | 173 |
| apps/admin/src/lib/api.ts | NEVER-LOADED | 167 | 167 |
| apps/desktop/src/stage-payload-run.ts | NEVER-LOADED | 165 | 165 |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | NEVER-LOADED | 155 | 155 |
| apps/admin/src/features/media/rules.ts | NEVER-LOADED | 153 | 153 |
| apps/desktop/src/renderer/workspace-chat-transport.ts | NEVER-LOADED | 153 | 153 |
| apps/admin/src/features/roles/hooks/use-roles.hooks.ts | NEVER-LOADED | 152 | 152 |
| apps/admin/src/App.tsx | NEVER-LOADED | 150 | 150 |
| apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | NEVER-LOADED | 149 | 149 |
| apps/desktop/src/tracked-sites.ts | NEVER-LOADED | 149 | 149 |
| apps/desktop/src/site-process-registry.ts | NEVER-LOADED | 146 | 146 |
| apps/desktop/src/site-dir-store.ts | NEVER-LOADED | 144 | 144 |


## §3 Complexity (CCN ≤ 10 and cognitive ≤ 10)

### Jini: 88 production functions over limit (54 cyclomatic, 34 cognitive); +79 in tests

Per area (cyc/cog): examples/reference-web 9/5, scripts/lib 8/6, packages/chat 3/3, scripts/check-engine-boundaries.ts 3/3, scripts/check-subpath-isolation.ts 3/3, packages/daemon 4/1, scripts/check-package-layers.ts 3/2, packages/agent-plugins 2/2, packages/plugins 2/1, packages/agentic 1/1, packages/cms 2/0, packages/provider-plugins 1/1, scripts/check-chatpane-public-surface.ts 1/1, scripts/check-extensionless-imports.ts 1/1

40 worst:

| file:line | name | rule | value |
|---|---|---|---|
| scripts/check-subpath-isolation.ts:214 | (anon) | cognitive-complexity | 122 |
| scripts/check-engine-boundaries.ts:340 | (anon) | cognitive-complexity | 71 |
| scripts/check-subpath-isolation.ts:99 | (anon) | cognitive-complexity | 53 |
| scripts/check-subpath-isolation.ts:214 | auditSubpathIsolation | complexity | 53 |
| scripts/check-package-layers.ts:74 | check | complexity | 48 |
| scripts/check-engine-boundaries.ts:340 | checkEngineBoundaries | complexity | 47 |
| examples/reference-web/src/A2uiLab.tsx:71 | (anon) | cognitive-complexity | 44 |
| scripts/lib/walk-imports.ts:66 | (anon) | cognitive-complexity | 37 |
| examples/reference-web/src/daemon-transport.ts:89 | toAgentEvent | complexity | 32 |
| scripts/lib/source-neutrality.ts:31 | (anon) | cognitive-complexity | 32 |
| examples/reference-web/src/daemon-transport.ts:89 | (anon) | cognitive-complexity | 30 |
| examples/reference-web/src/daemon-transport.ts:168 | (anon) | cognitive-complexity | 30 |
| scripts/check-engine-boundaries.ts:226 | (anon) | cognitive-complexity | 28 |
| scripts/lib/walk-imports.ts:139 | visit | complexity | 28 |
| scripts/check-subpath-isolation.ts:99 | exportEntries | complexity | 26 |
| examples/reference-web/src/playground-request.ts:97 | decodePlaygroundRunRequest | complexity | 25 |
| scripts/check-extensionless-imports.ts:137 | (anon) | cognitive-complexity | 24 |
| scripts/lib/source-neutrality.ts:31 | checkSourceNeutrality | complexity | 24 |
| examples/minimal-host/src/index.ts:44 | main | complexity | 22 |
| examples/reference-web/src/A2uiLab.tsx:71 | streamA2uiRun | complexity | 20 |
| examples/reference-web/src/playground-request.ts:97 | (anon) | cognitive-complexity | 20 |
| scripts/check-package-layers.ts:74 | (anon) | cognitive-complexity | 20 |
| scripts/lib/walk-imports.ts:66 | stripComments | complexity | 20 |
| scripts/lib/peer-range-compatibility.ts:19 | (anon) | cognitive-complexity | 19 |
| scripts/check-agentic-dom-purity.ts:122 | checkAgenticDomPurity | complexity | 18 |
| scripts/lib/pack-jini-packages.ts:70 | (anon) | cognitive-complexity | 17 |
| examples/reference-web/src/daemon-transport.ts:168 | streamRun | complexity | 16 |
| scripts/check-extensionless-imports.ts:137 | checkExtensionlessImports | complexity | 16 |
| examples/reference-web/src/daemon-transport.ts:227 | startRun | complexity | 15 |
| packages/agent-plugins/src/lifecycle/bundled-source-archive.ts:332 | (anon) | cognitive-complexity | 15 |
| scripts/check-chatpane-public-surface.ts:109 | (anon) | cognitive-complexity | 15 |
| scripts/check-engine-boundaries.ts:226 | loadPackageRecords | complexity | 15 |
| examples/reference-web/src/LabExpense.tsx:331 | LabExpenseReceipt | complexity | 14 |
| scripts/lib/peer-range-compatibility.ts:19 | assertCompatiblePeerRanges | complexity | 14 |
| scripts/lib/self-test.ts:118 | runGuardSelfTest | complexity | 14 |
| scripts/lib/self-test.ts:118 | (anon) | cognitive-complexity | 14 |
| packages/agentic/src/core/capability.ts:122 | (anon) | cognitive-complexity | 13 |
| packages/analytics/src/ingest.ts:344 | ipMatchesRange | complexity | 13 |
| packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts:176 | (anon) | cognitive-complexity | 13 |
| scripts/check-engine-boundaries.ts:132 | (anon) | cognitive-complexity | 13 |

Files with most violations: examples/reference-web/src/daemon-transport.ts (6); scripts/check-engine-boundaries.ts (6); scripts/check-subpath-isolation.ts (6); scripts/check-package-layers.ts (5); scripts/lib/walk-imports.ts (5); examples/reference-web/src/playground-request.ts (3); packages/plugins/src/host/provider-contributions.ts (3); examples/reference-web/src/A2uiLab.tsx (2); examples/reference-web/src/daemon.ts (2); packages/agent-plugins/src/lifecycle/bundled-source-archive.ts (2); scripts/check-chatpane-public-surface.ts (2); scripts/check-extensionless-imports.ts (2)

### Tovu: 169 production functions over limit (94 cyclomatic, 75 cognitive); +244 in tests

Per area (cyc/cog): development/scripts 47/55, apps/website 37/17, apps/admin 7/3, apps/desktop 2/0, apps/site-chat 1/0

40 worst:

| file:line | name | rule | value |
|---|---|---|---|
| development/scripts/check-architecture.ts:657 | (anon) | cognitive-complexity | 74 |
| development/scripts/coverage-changed.ts:166 | (anon) | cognitive-complexity | 74 |
| development/scripts/check-architecture.ts:657 | main | complexity | 67 |
| development/scripts/coverage-changed.ts:166 | runCoverageChanged | complexity | 65 |
| development/scripts/coverage-changed.ts:236 | (anon) | cognitive-complexity | 60 |
| development/scripts/coverage-changed.ts:236 | (anon) | complexity | 56 |
| development/scripts/check-idle-motion.ts:128 | (anon) | cognitive-complexity | 53 |
| development/scripts/coverage-changed-discovery.ts:99 | (anon) | cognitive-complexity | 46 |
| development/scripts/check-outbox-bridge.ts:120 | (anon) | cognitive-complexity | 42 |
| development/scripts/lib/dead-path-sweep.ts:79 | (anon) | cognitive-complexity | 42 |
| development/scripts/coverage-changed-discovery.ts:99 | discoverTests | complexity | 41 |
| development/scripts/write-path-inventory.ts:304 | (anon) | cognitive-complexity | 35 |
| development/scripts/coverage-changed-model.ts:220 | (anon) | complexity | 34 |
| development/scripts/coverage-changed-discovery.ts:39 | (anon) | complexity | 33 |
| development/scripts/check-openapi-contract.ts:236 | (anon) | cognitive-complexity | 32 |
| development/scripts/coverage-changed-model.ts:220 | (anon) | cognitive-complexity | 32 |
| development/scripts/coverage-changed-model.ts:106 | (anon) | cognitive-complexity | 30 |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:260 | up | complexity | 29 |
| development/scripts/lib/admin-route-walk.ts:64 | (anon) | cognitive-complexity | 29 |
| development/scripts/write-path-inventory.ts:257 | (anon) | cognitive-complexity | 28 |
| apps/website/src/server/runtime/composition/modules/assistant-byok.ts:603 | run | complexity | 27 |
| development/scripts/check-architecture.ts:388 | (anon) | cognitive-complexity | 27 |
| development/scripts/check-idle-motion.ts:128 | checkIdleMotion | complexity | 27 |
| development/scripts/lib/dead-path-sweep.ts:233 | (anon) | cognitive-complexity | 27 |
| development/scripts/lib/openapi-operations.ts:58 | (anon) | cognitive-complexity | 27 |
| development/scripts/check-theme-replaced-elements.ts:152 | (anon) | cognitive-complexity | 26 |
| development/scripts/coverage-changed-discovery.ts:39 | (anon) | cognitive-complexity | 26 |
| development/scripts/lib/dead-path-sweep.ts:79 | stripComments | complexity | 26 |
| development/scripts/lib/dead-path-sweep.ts:437 | (anon) | cognitive-complexity | 26 |
| development/scripts/check-openapi-contract.ts:236 | main | complexity | 25 |
| development/scripts/coverage-changed-model.ts:52 | (anon) | cognitive-complexity | 25 |
| development/scripts/check-test-baseline.ts:129 | (anon) | cognitive-complexity | 24 |
| development/scripts/check-admin-api-routes.ts:49 | (anon) | cognitive-complexity | 23 |
| development/scripts/coverage-changed-model.ts:106 | parseImage | complexity | 23 |
| development/scripts/report-churn-hotspots.ts:130 | (anon) | cognitive-complexity | 23 |
| apps/website/src/server/runtime/composition/modules/assistant-byok.ts:603 | (anon) | cognitive-complexity | 22 |
| development/scripts/check-outbox-bridge.ts:120 | stripCommentsAndStrings | complexity | 22 |
| development/scripts/check-outbox-bridge.ts:195 | (anon) | cognitive-complexity | 22 |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:260 | (anon) | cognitive-complexity | 21 |
| development/scripts/check-outbox-bridge.ts:337 | (anon) | cognitive-complexity | 21 |

Files with most violations: development/scripts/coverage-changed-model.ts (15); development/scripts/coverage-changed.ts (8); development/scripts/lib/dead-path-sweep.ts (8); development/scripts/check-architecture.ts (7); development/scripts/coverage-changed-discovery.ts (7); apps/website/src/platform/db/migrations/0012_secrets_vault.ts (6); development/scripts/write-path-inventory.ts (6); development/scripts/check-outbox-bridge.ts (5); development/scripts/check-admin-api-routes.ts (4); development/scripts/coverage-all-files.ts (4); development/scripts/lib/admin-route-walk.ts (4); apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts (3)


## §4 Modularity, DI, tangling

### Tovu — dependency-cruiser (`npm run check:boundaries`, exit 54)
3007 violations (**1334 errors**, 1673 warnings), 5533 modules. Top rules (count): `no-deep-imports:platform/site-dir` 941 err; `no-circular` 428 warn; `no-deep-imports:assistant` 376 warn; `…:features/webhooks` 353 warn; `…:contracts/headless` 180 warn; `…:features/post` 125 err; `…:features/theme` 65 err; `…:features/media` 64 err; `…:features/deployments` 51 err; `…:platform/routing` 38 err; `only-composition-constructs-concrete-adapters` 30 warn; `domain-no-direct-assistant-tool-registration` (features/agent-plugins/* → assistant/index.ts). Raw: this tool has no baseline of its own, so "new vs existing" is not separable here.

### Tovu — `check:architecture` vs committed baseline (FAILED, 3 hard-constraint regressions)
| metric | baseline | now |
|---|---|---|
| module cycles (mutual pairs, runtime) | – | **31 NEW pairs** (assistant↔platform, assistant↔server, assistant↔features/agent-plugins, assistant↔features/external-mcp, platform↔server, platform↔{identity,media,forms,settings,post,plugins,publish-content,site-backup,vendor-credentials,custom-credentials,database-transfer}, features/agent-plugins↔{api-connections,custom-credentials,external-mcp,member-login}, features/analytics↔server, features/comments↔plugins, features/custom-credentials↔{deployments,source-control}, features/deployments↔vendor-credentials, features/entries↔widgets, features/fs-files↔{media-import,theme}, features/media↔publish-content, features/newsletter↔plugins, features/post↔theme) |
| largest strongly-connected component | 0 | **61** modules (of 73) |
| back-edges into composition root | 0 | **12** |
| module API surface (files exposed) | 393 | 821 (non-blocking) |
| propagation cost all-import / runtime | 15.94 / 2.22 % | 20.72 / 4.61 % (non-blocking) |
| bidirectional hubs | 195 | 494 (25.2 % of files) |
Caveat: the baseline file is committed (`development/scripts/check-architecture.baseline.json`); the jump 0→61 suggests the baseline is stale vs. the int/main-1027 merge, or `platform` became a hub imported by and importing most features. Verify before treating all 31 as regressions of last night.

### Cycles (madge --circular)
See list below the DI section. Tovu website/admin/desktop each show 170–210 file-level cycles (very large tangled core; website 212). Jini cycles are small and local (core 2, ui 16, admin 14, chat 12, agent-runtime 10, daemon 9, mcp 9, server 8, cms 7, devops 7); madge also reports cross-package "cycles" through other packages' `dist/*.d.ts` (excluded from the Jini count).

### Cross-package / deep imports
- Tovu → Jini internals: only 1 occurrence of a deep `@jini-ai/*/dist|src` import found by grep (`@jini-ai/core/dist/x.js`, likely in a test/doc); public entry points are otherwise used.
- Jini `pnpm run test:scripts` (hardwiring etc.): **vitest part: 3 fail / 399 pass**; node:test part (`check-hardwiring.test.ts` + `infra-retirement.integration.test.ts`): `check-hardwiring` itself passes, **3 `infra-retirement` gates fail** ("Tovu consumers have no imports/re-exports of the retired package", "…manifests have no dependency on the retired package", "j05 final state removes the infra workspace") — by-design gates that stay red while Tovu still depends on `@jini-ai/infra` (`package.json:142 "@jini-ai/infra": "^0.5.4"`, deprecated shim).
- Jini `pnpm guard`: **41 violations** — N1-consumer-identity 10 (string "Tovu" in `packages/cookie-consent/src/{client/dom,node/index,plugins,policy}.ts` …), HW3-module-state 9 (e.g. `packages/platform/src/asset-cache.ts`, `packages/ui/.../InfoTip.hooks.tsx`), R13-model-fallback-freshness 6 (info/skips, codex/agy binaries absent = ENV), SI-domain 5, SI-dependency 4, L1-layer-edge 4, L0-unlisted-package 4, R8-package-metadata 2 (cookie-consent exports `./client.min.js`, `./banner.css` lack `jini.entries`), HW2-vendor-adapter 2 (`packages/mcp/src/server/stdio-hosting.ts`), SI-resolution 1. Full list: `raw/jini-guard-list.txt`.

### DI / vendor-in-core findings (Tovu `apps/website/src`, owner rules: vendor code in plugins; ports as args; no ambient env)
- **Direct `sharp` import in core:** `features/image-transform/image-ops.ts:1` (`import sharp …`, `open()` at l.80 builds `sharp(source…)` itself), and sharp usage in `features/media/view-image-tool.ts`, `features/web-screenshot/screenshot-image.ts`, `server/inbound/public-http/routes/site/media-rendition.ts`, `server/runtime/composition/modules/media.ts`, `…/deps.ts`, `…/app.ts`.
- **Direct DB drivers in features/assistant (not kernel adapters):** `better-sqlite3` imported in `assistant/tool-catalog-query.ts:1` (and `new Database(":memory:")` l.102), `features/database-transfer/sqlite-source.ts`, `platform/site-dir/move-sites-home.ts` (platform layer → arguably OK); drivers in `platform/db/kernel/drivers/{sqlite,postgres,pglite-socket}.ts` are the legitimate adapters.
- **`process.env` reads outside composition/config:** 94 non-test files reference `process.env` (excluding paths with config/composition/bootstrap). Heaviest: `server/runtime/composition/deps.ts` (30, a composition root: ok), `server/inbound/assistant/agent-daemon-server.ts` (16), `cli/commands/serve.ts` (12), `server/runtime/composition/app.ts` (10), `src/index.ts` (9), `server/runtime/lifecycle/daemon-supervisor.ts` (7), `server/inbound/admin-http/routes/system/assistant-subagents.ts` (5), `assistant/daemon-access.ts` (5 — business logic reading ambient env).
- Headless browser: `platform/headless-browser/lazy-browser.ts` and `features/sites/site-preview/playwright-site-preview-capture.ts` reference vendor runtime directly.

### 20 most tangled modules
Not computed per-module (cap): the strongest evidence is the SCC of 61/73 modules and the 31 new mutual pairs above. Hub candidates by cycle membership: `platform` (in ≥14 pairs), `assistant` (4), `features/agent-plugins` (5), `features/custom-credentials` (4), `server` (3), `features/plugins` (3), `features/media` (2), `features/deployments` (2), `features/theme`, `features/post`, `features/fs-files`, `features/settings`, `features/identity`, `features/forms`, `features/entries↔widgets`, `features/newsletter`, `features/analytics`, `features/comments`, `features/vendor-credentials`, `features/database-transfer`. For Jini: highest cycle counts are `ui`, `admin`, `chat`, `agent-runtime`, `daemon`, `mcp`.


### Cycles (madge)

- Tovu apps/website/src: **212** cycles; shortest: `features/post/post.ts > features/post/go-live.ts`; `features/media/index.ts > features/media/bootstrap.ts`; `features/post/repo.ts > features/post/search-index.ts`; `features/theme/theme.ts > features/theme/theme-files.ts`
- Tovu apps/admin/src: **183** cycles; shortest: `panels.tsx > media-panel.ts`; `lib/api.ts > lib/settings-effective-reads.ts`; `panels.tsx > components/Placeholder.tsx > nav.ts`; `features/pages/rules.ts > features/pages/hooks/use-page-editor.hooks.ts`
- Tovu apps/desktop/src: **172** cycles; shortest: `renderer/use-site-workspace.hooks.ts > renderer/site-theme-preview.hooks.ts`; `../../../packages/sdk/dist/hooks.d.ts > ../../../packages/sdk/dist/index.d.ts`; `../../website/src/features/post/post.ts > ../../website/src/features/post/go-live.ts`; `../../website/src/features/media/index.ts > ../../website/src/features/media/bootstrap.ts`
- Jini packages/*/src: **60** cycles (excluding cycles resolved into other packages' dist): admin 12 (e.g. `seo/models.ts > seo/rules.ts`); agent-plugins 1 (e.g. `admin-surfaces/protocol.ts > admin-surfaces/theme.ts`); agent-runtime 9 (e.g. `types.ts > model-discovery-types.ts`); agentic 3 (e.g. `skills/install/ports.ts > skills/install/github.ts`); analytics 2 (e.g. `product/index.ts > product/fanout.ts`); chat 4 (e.g. `core/messages.ts > core/user-text-redaction.ts`); cms 6 (e.g. `forms/ports.ts > forms/write-service.ts`); core 2 (e.g. `tool-input-normalization.ts > tool-registry.ts`); daemon 1 (e.g. `http/research-tavily.adapter.ts > http/research.ts`); db 2 (e.g. `transfer/copy-engine.ts > transfer/plan.ts`); integrations 1 (e.g. `media-providers/task-lifecycle.ts > media-providers/task-store.ts`); mcp 2 (e.g. `federation/messages.ts > federation/trust.ts`); plugins 2 (e.g. `host/ports.ts > host/contributions.ts`); ui 9 (e.g. `features/skills/react/components/SkillRow.tsx > features/skills/react/components/SkillRow.labels.ts`); user-management 2 (e.g. `core/builtin-permissions.ts > core/permissions.ts`); vibecoding 2 (e.g. `tools.ts > session.ts`)

## §5 Review of Jini d6310d697


Scope: 13 files, +265/−21 (chat ask-choice replay; cms plugin-export URL strictness). Reviewed against current Jini HEAD
`f68294e6` (follow-ups `2417bbc5`, `866c4f95` have already landed on top: URL_ATTRIBUTES trimmed back to
`href/src/action`; `SurfaceCardContent` split into `answeredSurface`). Findings below are those still true at HEAD. Report only.

### Risky / likely bugs
1. **PLAUSIBLE — outcome/confirmation resources that re-emit under the same `ui://` URI get hidden as "answered".**
   `packages/chat/src/react/hooks/useAnsweredCards.ts` `recordedCardAnswers` (~l.31-49) keys receipts by `surfaceUri` = resource URI.
   `packages/ui/src/features/mcp-ui/surfaces/outcome.ts:22,159` documents re-emitting the outcome "under the SAME `ui://` URI the confirmation used".
   Any surface whose URI is reused (outcome after confirmation, retry of the same entity+version — `form.ts:417` says URIs are keyed by entity/version, not per-instance)
   will match an earlier receipt and render as a closed "Answered" card; `run-activity.ts` `hasSurfaceReceipt` (~l.146) likewise suppresses
   "awaiting-answer" for the second question. The only producer in the monorepos (Tovu `apps/website/src/assistant/ask-choice-tool.ts:199`)
   makes URIs unique with `Date.now()`, so it is safe today only by producer convention — nothing in Jini enforces/documents that
   `surfaceUri` must be instance-unique. Two questions for the same principal within one ms would also collide. Needs a test with a re-emitted URI.
2. **`answeredSurfaces` is computed over ALL events including receipts from earlier turns** (`run-activity.ts:~290-296`, `deriveRunActivity`):
   any receipt anywhere closes every card with that URI, with no ordering check (receipt index must be > card index). Same root cause as #1.
3. **`surfaceQuestionInput` now lets producer `_meta` override the real tool-call `input`** (`mcp-ui-question-input.ts:~36-42`):
   `hasQuestionOptions({input: context})` is tested BEFORE `input`, so a resource's metadata silently replaces the model's actual question
   in transcript labels / answer text. The meta is untrusted-ish display data from the resource; only a shape check (`hasQuestionOptions`) guards it.
   Display-only, but the answer text recorded to history is derived from it (`surfaceAnswerLabel`).
4. **`surfaceQuestionTitle` falls back to `resource.resource.uri`** (`McpUiSurfaceCard.tsx` ~l.175-180) — the doc comment says it keeps
   "opaque resource identity out of the accessible title" but the fallback returns exactly that URI when there is no title. It also runs
   `surfaceQuestionInput` → `DOMParser` parse of the whole HTML (`markupQuestion`) on every render of every card (no `useMemo`), O(html) per render.
5. **`pendingQuestionIndex` reset is over-broad** (`run-activity.ts:~172-181`): ANY `tool_use`/`tool_result` clears the waiting state, including the
   `tool_result` of the ask tool itself if it returns before the user answers, and unrelated parallel tool results while a question is genuinely pending.
   Result: "waiting for you" status flickers off while the card is still unanswered. Not covered by a test (test only covers receipt-closes-card).
6. **cms `plugin-export.ts` is now a behavioural break shipped as a `patch` changeset** (`.changeset/cms-plugin-export-static-urls.md`):
   any existing template with a literal `href="/pricing"`, `href="#top"`, `action="/x"` or `mailto:` now throws and the embed silently falls back
   (`resolvePluginExportEmbeds` swallows every error, l.~140, with no diagnostics hook invoked). Should be minor/major and the swallow should log.
7. **`HOST_URL_SLOT` says "hostLinks or assets" but matches ANY `host.<name>`** (`plugin-export.ts:~46`): `{{host.anything}}` passes the shape check;
   only `assertLocalUrl` (starts with `/`) stops a non-link host value. Error text overstates the guarantee, and `host.hostLinks.<x>` (dotted) does NOT match the regex,
   so a template using the nested `hostLinks` form is refused though the message names it as the allowed form — verify what `host` actually contains.

### Dead / unverified code
8. `AcceptedChatInput.surfaceUri` / `answerText` have no producer inside Jini (grep: only readers in `useAnsweredCards.ts`, `run-activity.ts`); the sole writer is Tovu's ask-choice tool. No Jini-side contract test pins the producer shape.
9. `SURFACE_QUESTION_META_KEY` is exported from `question-answer.ts` and `core/index.ts` via `export *` — widens the public API of `@jini-ai/chat/core` (consumed by Tovu `ask-choice-tool.ts:3` and an admin test).
10. Style: unused `_options = {}` params on new helpers (`hasSurfaceReceipt`, `idleSignal`, `surfaceQuestionTitle`) follow repo convention but are noise; `hasSurfaceReceipt`'s doc says "O(1)" while `answeredSurfaces` building is O(e) per `deriveRunActivity` call (re-scans all events on every call).

### Tests added by the commit
`run-activity.test.ts` (+31), `surface-question-replay.test.tsx` (+87), `plugin-export.unit.test.ts` (+43). None exercises: URI reuse (#1/#2), meta-vs-input precedence (#3), ask-tool tool_result while pending (#5).


## §6 NOT RUN

Nothing was cut for time; items below were NOT RUN or only partly run (counts):
- Tovu `check-src-complexity-drift.ts`, `check-admin-complexity-drift.ts` — not run (plain eslint scan used instead; 413 findings, 169 prod).
- Tovu typecheck: only root `tsc -p tsconfig.json` ran (exit 0). NOT RUN: `typecheck:e2e`, `typecheck:scripts`, `typecheck:tests`, admin/desktop/site-chat per-app tsc (3 configs + desktop's 4).
- Jini root `tsc -p scripts/tsconfig.json`; Jini `examples/*` typecheck beyond `pnpm -r` (examples were included in `-r`).
- Tovu shard 5 (349 files) timed out; re-run as shard 9 without the hanging file (348 files) — the hanging file was run alone (300 s limit, HANG). `site-chat` tests are inside the website globs.
- Tovu failing tests were NOT individually re-run to decide FLAKY (only the hang file and all 12 Jini failing files were re-run). Tovu classes are from reading the error text, with a minority checked in code (marked above).
- Step 2: Tovu `check-area-coverage-floor` could not run (floors json missing in repo). Per-route "no test at all" list not produced (see classify log: 100 TEST_GAP files). Jini routes/tools with no test: not computed.
- Step 4: per-module "20 most tangled" ranking not computed numerically (fan-in×fan-out); cycle-membership list in §4 is derived from `check-architecture` output. Tovu "deep import past package exports" check was a single grep (1 hit). The `new X()` / process.env DI scan is grep-based on `apps/website/src` only (not admin/desktop/Jini src).
- Cycle lists: only counts + shortest examples are in RESULTS; full madge outputs are in `raw/`.
- Coverage numbers for Tovu `apps/admin` come from vitest; website coverage from node:test lcov only (no `development/coverage/lcov.info` from the official `test:cov` run).
- Env notes: no Postgres server (≈60 `.postgres.*` failures), no chromium (render-form-layout ×3), scratch Tovu copy is not a git checkout (theme drift canary ×1; I `git init`-ed it only for the coverage script).

