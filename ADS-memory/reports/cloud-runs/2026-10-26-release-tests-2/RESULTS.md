# RESULTS — release-1026 tests run 2

## 2026-10-27T00:55:45Z — STARTED
Tovu HEAD 8cbefadf (cloud/release-1026 checked out OK). Node on image: v22.22.0 (need 24). Starting setup.

## 2026-10-27T01:02:35Z — PROGRESS: setup + build gates + targeted reruns
Setup: Node 24.22.0; Jini cloned from cloud/release-1026; cookie-consent dep pointed at file:/root/Jini (package.json/lock edits NOT committed); `npm ci` fails with the edited dep (lock mismatch) so `npm install` used; link:jini ok (60 links); sdk built AFTER link; desktop @jini-ai symlinked.

### Build gates
- Jini `pnpm --no-bail -r build`: **exit 0, no failing packages** (was failing in run 1).
- Tovu typecheck: `apps/website/tsconfig.json` does not exist (brief path). `npx tsc -p tsconfig.json --noEmit` (repo's `npm run typecheck` root config) against linked Jini: **0 errors** (run 1 had ~13). Note: `tsc -p apps/site-chat/tsconfig.json` gives 61 errors (react not resolvable from that config) — ENV/config artifact, not the gate.

### Targeted reruns (alone)
1. publish-agent-tools.unit.test.ts "publish cards can save distinct unattached project keys…" — FAIL, test line 1248: `assert.equal(rows.every(row => !row.isDefault), true)` → actual false, expected true (strictEqual `false !== true`). i.e. at least one of the 3 vault rows saved unattached is marked isDefault. Class: UNSURE→likely REGRESSION (still failing after the fix).
2. provider-plugins.unit.test.ts "env configured: product catalog projection…" — FAIL, line 776 deepStrictEqual: actual has an extra second event `{name:'site_created', properties:{}, userId:'00000000-0000-4000-8000-000000000001'}` after the expected `site_created {source:'admin',…}`. Class: UNSURE→likely REGRESSION (duplicate site_created emitted with empty properties).
3. agent-plugin-search-discovery negative control (13/14 pass, 1 fail): 
   - "What plugins are installed on the site?" → top hit **search_agent_plugin_local (9.044)**, then content_read.plugin (8.960), agent_plugins_install (7.961), plugins_install (7.624), agent_plugins_update (7.559). Test expects content_read.plugin first → FAIL (cannibalization by new tool).
   - "Can you show me which plugins are enabled versus disabled?" → top hit **content_read.plugin (18.327)** → PASS.
   (The brief's "…enabled" phrasing = the second one; only the "installed" phrasing is cannibalized.)

## 2026-10-27T01:18:05Z — PROGRESS: test lists complete (soak next)

### Jini (vitest, 28 packages + scripts + commerce). Executed counts; no files failed to LOAD.
| area | files run | pass | fail | skip |
|---|---|---|---|---|
| admin | 3 | 41 | 0 | 0 |
| agent-plugins | 12 | 172 | 0 | 0 |
| agent-runtime | 8 | 351 | 0 | 0 |
| agentic | 5 | 105 | 0 | 0 |
| analytics | 6 | 43 | 0 | 0 |
| capability-providers | 1 | 3 | 0 | 0 |
| chat | 44 | 895 | 0 | 0 |
| cms | 23 | 779 | 0 | 0 |
| commerce (kernel cfg, whole pkg 34 files; + node:test catalog 46/46) | 34 | 603 | 0 | 0 |
| cookie-consent | 9 | 128 | 0 | 0 |
| core | 10 | 338 | 0 | 0 |
| daemon | 27 | 854 | 0 | 0 |
| db | 5 | 84 | 0 | 0 |
| desktop-host | 3 | 34 | 0 | 0 |
| devops | 5 | 115 | 0 | 0 |
| diagnostics | 9 | 120 | 0 | 0 |
| infra | 3 | 80 | 0 | 0 |
| integrations | 8 | 401 | 0 | 0 |
| mcp | 11 | 440 | 0 | 0 |
| oauth | 2 | 60 | 0 | 0 |
| platform | 19 | 460 | 0 | 0 |
| plugins | 8 | 124 | 0 | 0 |
| protocol | 1 | 10 | 0 | 0 |
| provider-plugins | 15 | 233 | 1 | 0 |
| server | 4 | 53 | 0 | 0 |
| ui | 18 | 452 | 0 | 0 |
| ui-kit | 1 | 4 | 0 | 0 |
| user-management | 5 | 133 | 0 | 0 |
| vibecoding | 10 | 190 | 0 | 0 |
| scripts/__tests__ | 2 | 99 | 0 | 0 |

Listed-but-not-test-files (helpers/fixtures, not executed): test-support.ts, claude-filesystem.live.canary.ts, scenario.ts, parity-contract.ts, fenced-fixtures.ts, fixtures.ts, resolver-fixtures.ts, ai-trace-scenario.ts, server/fixture.ts, vibecoding/filesystem.ts, ui controls.test.ts.snap, db settings-revision.fixture.ts. db `settings-revision.postgres.test.ts` not collected by vitest config (ENV, Postgres). commerce `npm test` script is broken on this vitest as written (--maxWorkers without --minWorkers → "minThreads and maxThreads must not conflict"); run with --minWorkers=1.

Jini failures:
- provider-plugins observability-sentry.test.ts "release reaches the private client and delivered event without global initialization or default integrations" — AssertionError deepStrictEqual: actual integrations `[{name:'SpanStreaming', setup:[Function]}]`, expected `[]` (line 208). **PRE-EXISTING** (Sentry SpanStreaming). No Invalid-URL/cms subpath-isolation failures this run (cms 779/779 pass; scripts check-subpath-isolation passes).

### Tovu
node:test (website + content + development/scripts + site-chat + sdk; 240 files, 8 batches of 30; counts include subtests): 
| batch | tests | pass | fail | skip |
|---|---|---|---|---|
| 00 | 530 | 527 | 0 | 3 |
| 01 | 358 | 356 | 1 | 1 |
| 02 | 757 | 755 | 1 | 1 |
| 03 | 420 | 420 | 0 | 0 |
| 04 | 308 | 308 | 0 | 0 |
| 05 | 291 | 291 | 0 | 0 |
| 06 | 671 | 668 | 3 | 0 |
| 07 | 293 | 291 | 2 | 0 |
Total 3628 tests, 3616 pass, 12→(7 distinct failures listed below; some counted in reruns) — see exact list below. No MISSING files and no module-not-found load failures in the node:test batches. (Sum of fail column = 7.)
apps/admin (vitest, 45 files): **1200 pass / 0 fail / 0 skip**.
apps/desktop (its npm test = whole suite, superset of 26 listed): 1797 tests, 1782 pass, 5 fail, 10 skip.

Tovu failures:
1. agent-plugin-search-discovery negative control "What plugins are installed on the site?" — top hit search_agent_plugin_local (see above). UNSURE (probably REGRESSION: new tool outranks content_read.plugin).
2. publish-agent-tools "publish cards can save distinct unattached project keys…" — `false !== true` at test line 1248 (rows.every(!isDefault)). UNSURE/REGRESSION (not in known list).
3-5. site-consent.test.ts ×3 ("live HTML is gated and static export returns 409…", "cached OFF cannot bypass consent after publishing ON…", "live defaults show consent; exports omit defaults…") — `200 !== 409` (lines 120, 243, 348). **Expected** (consent-ON static export, owner decision pending).
6. provider-plugins.unit.test.ts "env configured: product catalog projection…" — extra duplicate site_created event (see above). UNSURE/REGRESSION.
7. sdk-public-api.unit.test.ts "SDK external type contracts are declared package dependencies…" — actual '^0.6.10' vs expected '^0.4.0 || ^0.5.0' (line 142). **Expected** (sdk-public-api range test).
Desktop:
8-10. main-agent-runtime-wiring.test.ts "quit waits for owned runtime disposal even without sites…", main-shutdown-wiring.test.ts "before-quit waits on in-flight teardowns…" and "Quit during a card Stop waits for its tracked teardown…" — `ReferenceError: productDisposers is not defined` (evalmachine, wiring-test evals a main.ts excerpt that references productDisposers). **REGRESSION** (main.ts / test out of sync on this branch).
11. nested-sites-migration.test.ts — LOAD FAILURE: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode` at apps/website/src/platform/site-dir/local-site-supervisor.ts:13 (`constructor(readonly code: string)`) — the desktop runner uses Node strip-only TS. **REGRESSION** (load failure; website file imported by desktop test uses non-strippable syntax).
12. site-dir-store.test.ts "initSiteDir creates a complete blank site with the requested name through Tovu's actual CLI" (16s) — deepStrictEqual: actual `[{id:'page-blog'}]`, expected `[]` (line 563). UNSURE (blank site now ships a page-blog; maybe CLI/template drift, or env tool path).
Not seen this run (vs known list): purpose-scoped-mailer, site-exporter live site, mcp-ui ask-choice, telemetry-reporter Invalid URL — all passed.

## Correction to the Tovu node:test total above
Sum over the 8 batches: 3628 executed (incl. subtests), **3616 pass / 7 fail / 5 skip**. (Earlier line "12→(7…" was garbled.) Total Tovu failures incl. desktop+admin: 7 node:test + 5 desktop (3 ReferenceError, 1 load failure, 1 site-dir-store) = 12 distinct; admin 0.

## Comparison with run 1
Jini: run 1 had cms/db/platform/ui/devops failures and 2 packages failing tsc; run 2 has **only the Sentry SpanStreaming failure** and a clean `pnpm -r build` (exit 0). Tovu: run 1 admin consent-i18n failure is gone (1200/1200); the search-discovery negative control ("…installed on the site?") is STILL failing; the two reruns (publish-agent-tools, provider-plugins) STILL fail.

## Server soak (record-only, `TOVU_SOAK_RECORD_ONLY=1 npm run test:soak:server`, exit 0, 1.3 min)
commit 1bde8079, linux x64, node 24.22.0, warm-up 500, workload 3000 requests, limit 15%. Metric = heapUsed (MiB):
- warm-up floor (baseline) **121.9** → final floor **119.2** = **-2.2% growth**, tailGrowth +0.2%. Verdict pass, wouldFail=false.
- RSS (MiB) by checkpoint: 611.5 (0) → 759.8 (500) → 767.8 (1000) → 768.6 (1500/2000) → 769.5 (2500/3000): one-time +150 MiB step during the first 500 requests, then flat.
- "Multiple copies of chat.db" / chat.db: **0 occurrences** in the soak log. The samples contain a single pid (24137, the serve process); the agent daemon is not sampled, so its RSS is not available and I cannot positively confirm from samples that the daemon stayed up for the whole soak — only that no crash message appeared and the test passed.
Build for the soak: `npm run build` / `admin:build` refuse to run while linked Jini (check-no-linked-jini guard), so I ran the same underlying steps (`npm run build:server`, `vite build` in apps/admin), both exit 0; no code touched.

## What this did NOT test
- Desktop Electron memory soak (needs display); desktop UI; real PostHog/Sentry/Grafana delivery; Postgres-backed tests (db settings-revision.postgres.test.ts not collected); Playwright/browser journeys; UI look.
- Desktop suite was run as its whole `npm test` (1797 tests) rather than only the 26 listed files.
- `tsc -p apps/website/tsconfig.json` (path in the brief) doesn't exist; used root tsconfig.json (0 errors). typecheck:e2e/typecheck:tests/scripts not run.
- Not run against the published npm Jini versions (linked local Jini @ cloud/release-1026); package.json/lock edits for cookie-consent are local-only, NOT committed.

## 2026-10-27T01:21:28Z — DONE
All lists, build gates, reruns, search-discovery measurement and soak completed within caps; no product code or tests edited. Summary of non-expected failures needing a look: publish-agent-tools (isDefault), provider-plugins duplicate site_created, search-discovery cannibalization, desktop productDisposers ReferenceError x3, desktop nested-sites-migration strip-only TS load failure, desktop site-dir-store page-blog. Expected still-failing: site-consent x3, sdk-public-api range, Sentry SpanStreaming.
