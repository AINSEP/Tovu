# RESULTS — round-1 test fixes verification (2026-10-28, REPORT ONLY)

Tovu `cloud/tests-1028` @ HEAD (d604dcce), Jini `fix/analysis-1028`. Node 24.22.0, Postgres 16 (trust, role `la`, socket + TCP 5432), chromium -1243 symlinked as -1228.
Command per file: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 <file>`.

## §0 Summary
- Files run: **55** (46 changed test files + 9 listed unchanged files, de-duplicated).
- First pass: **41 pass / 14 fail**. The sdk failure was an artifact of my local `file:` override and passes with original manifests, so **13 real failing files**.
- Re-run alone: all 13 reproduce (none FLAKY). serve-command Article VIII test re-run with `--test-name-pattern` also fails again; the whole-file re-run hit the 600 s timeout (first pass took 580 s, so that file is borderline on this container).

Failing files (real):
1. apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts (1 test; whole-file rerun times out at 600 s)
2. apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts (T1)
3. apps/website/src/features/site-export/__tests__/site-exporter.test.ts (missing helper)
4. apps/website/src/platform/db/__tests__/parity/vault-boundary-parity.test.ts
5. apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts (unchanged-list file)
6. apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts (syntax error)
7. apps/website/src/server/__tests__/integration/widgets-regions-real-composition.unrun.integration.test.ts (sqlite + pglite)
8. apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts (unchanged-list file; both workers)
9–13. routes/site/__tests__/{pages-branch-coverage.integration, taxonomy-render-surface.integration, pages.edge-paths.route, pages.member-access.route, pages.route} — missing helper

Not failing: packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts — failed only because of MY local `file:` override of `@jini-ai/plugins` in package.json (env artifact); with original manifests: 13/13 pass. All other listed files (incl. batch-tool-inputs, credential-setup-search, form-field-types-style, form-theme-colours, both theme drift canaries) PASS.

## §1 Failing tests

### A. Missing helper `apps/website/src/server/__tests__/helpers/default-consent-page.ts` (files 3, 9–13 — 6 files)
`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/Tovu/apps/website/src/server/__tests__/helpers/default-consent-page.ts'`, imported (`assertDefaultConsentPage`) e.g. at routes/site/__tests__/pages.route.test.ts:20. The file is not in the snapshot commit d604dcce nor on `origin/cloud/analysis-1028` and not gitignored → it was an untracked file in the local Codex tree that never got committed. Fix: add the helper. (Re-run alone: same.) Note: these 6 files' real assertions are therefore UNVERIFIED.

### B. member-magic-link-real-composition.unrun.integration.test.ts
`Transform failed with 1 error: …test.ts:139:73: ERROR: Expected ")" but found "Max"`. Root cause: line 114 opens a template literal with a backtick but closes it with `"` (`` assert.ok(mail[0].html?.includes(`href="https://localhost:3000/signin#magic=${token}&amp;redirect=%2Fmembers%2Fonly")); ``) — the only odd-backtick line in the file. Not flaky (fails at parse).

### C. widgets-regions-real-composition.unrun… (both `[sqlite]` and `[pglite]`)
`AssertionError: fixture: only the template-owned Blog listing is seeded; no Page claims the home route` at test.ts:230-231; actual pages are `[blog, privacy]` (extra `privacy` page `177965b0-…`). A default consent/privacy page is now seeded on init (consent feature, e.g. `server/runtime/composition/site-consent.ts`), the fixture's `deepEqual` expectation is stale. Re-run: same. 8 other tests in file pass.

### D. vault-boundary-parity.test.ts — "a transfer copies the same tables as before minus the retired ones"
`deepStrictEqual` (test.ts:55): actual contains `mail_activity_attempts` and `mail_suppression_removals`, expected list does not. `LATER_COPIED` (test.ts ~line 22-30) lacks tables added by later migrations (e.g. 0033_mail_activity_message.ts). Add them (with a why comment) or exclude via exclusions.ts. Re-run: same.

### E. postgres-baseline.test.ts — "applies on an empty database and matches schema.postgres.ts at head"
`table publish_history`: migration yields `config_fields_json text`, schema expects `config_fields_json jsonb` (schema.postgres.ts:836 `jsonText("config_fields_json")`; migrations/0016_publish_destination_history.ts:9 `ADD COLUMN config_fields_json text`). Column type mismatch between baseline migration and postgres schema; fix in the migration (jsonb for PG) or schema. Re-run: same.

### F. worker-import-graph.test.ts (both)
`handlebars-worker.ts loaded 161 rendering modules (budget 150)`, `liquid-worker.ts loaded 119 rendering modules (budget 110)` (test.ts:77 `WORKER_MODULE_BUDGETS`). No forbidden db/agent module leaked (earlier asserts passed); only the budget is exceeded by 11 / 9 modules. Caveat: this run uses Jini linked via `link:jini` from the `fix/analysis-1028` source, so Jini-side module fan-out could differ from the published packages; cannot separate here. Re-run: same.

### G. copy-engine.postgres.test.ts — T1
`input did not match /violates check constraint/. Input: 'Error: tovu_transfer_fixture_4348: psql request failed'` (test.ts:364 → pg-test-db.ts:23). Jini `packages/db/src/transfer/postgres-target.ts:87-95` (`failureFrom`, from security commit c5fded4b "private provider/DB errors") now collapses every psql error to the generic `psql request failed`. Test expectation is stale vs Jini; assert on the generic message (or on SQLSTATE if exposed). 13 other tests pass. Re-run: same. (Postgres here is a real server, so this is not env.)

### H. serve-command.integration.test.ts — Article VIII proof
`AssertionError: a readiness or startup span cannot substitute for the uniquely named content request` (test.ts:729; `collector.receivedCount() > 0` passed at ~725, so spans ARE exported but none has `http.target == requestPath`). 16/17 tests pass in first pass (580 s). Re-run of the single test alone: fails identically (not flaky). Whole-file rerun timed out at 600 s. Likely cause not isolated: either request span lacks the `http.target` attribute (newer OTel semconv uses `url.path`) or is exported later than the `10 s × loadFactor` deadline (BSP 5 s batch) on this slow container. I did not trace instrumentation (no time/judgement budget for it) — treat as UNDETERMINED, env-timing possible.

## §2 Not run / caveats
- apps/admin, apps/desktop: skipped per instructions.
- Tovu local-only changes (never committed, reverted/ignored for push): package.json + packages/sdk/package.json + package-lock.json (`file:` deps for @jini-ai/cookie-consent and @jini-ai/plugins, not on npm), `link:jini` symlinks (`JINI_PACKAGES_DIR=/home/user/Jini/packages`). The SDK test is the only one sensitive to this.
- Tests were run against Jini `fix/analysis-1028` linked source, not published packages (G and F may depend on that).
- Jini build: `pnpm --no-bail -r build` finished; one WARN that `packages/mcp/dist/bin/serve.js` was absent when the bin link was created (not investigated; no tested file depended on it).
- Playwright/browser tests: none in this set needed chromium.
