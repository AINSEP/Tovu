# FULL VERIFY 2026-10-29 — RESULTS (report only, no product code touched)

Run: Sonnet 5.5, started 19:45Z, finished ~22:20Z. Tovu `cloud/verify-1029`, Jini `cloud/fixes-1029-work` (HEAD 0bdcc6ac). Everything raw is in `raw/*.txt` (listed per section). Baseline for deltas = the numbers quoted in BRIEF ("10-28 evening"); the 10-28 RESULTS file is not in the repo, so only the brief's figures are used.

**Environment notes that affect every number (read first)**
- Tovu `npm ci` fails: `@jini-ai/cookie-consent@^0.6.13` is not on npm (ETARGET). Local uncommitted workaround: every `@jini-ai/*` dep → `next`, `@jini-ai/*` overrides removed, `npm install --legacy-peer-deps`, then `link:jini` to `/home/user/Jini/packages`. This edit (package.json/lock files of root, admin, desktop, site-chat, sdk) is NOT committed; it is the direct cause of 2 failing Tovu tests (`sdk-public-api`, `release-manifests`, see §1).
- `--legacy-peer-deps` dropped peers; I installed `@testing-library/dom`, tiptap collaboration/y-tiptap/node-range, highlight.js, yjs, y-protocols into `apps/admin` with `--no-save` (raw/14*.txt). First-pass admin typecheck (5165 errors) and admin vitest (49 suites) were ENV noise; kept in `raw/first-pass-env-broken/`.
- **Jini `@jini-ai/ui` does not build** (REAL, see §Jini): its tsc step fails on the undeclared `@jini-ai/ui-kit/react` import, so the post-tsc copy steps (css/fonts) never ran and `dist/styles/*` is missing. Workaround to unmask downstream: ran the post-tsc copy/tailwind steps by hand + symlinked `ui/node_modules/@jini-ai/ui-kit` (raw/16-*.txt). Jini results are therefore given twice: first pass (raw/jini-vitest) and re-run after workaround (raw/jini-vitest-rerun-*).
- 4 cores, 15 GB, load ≈10–14 for most of the run → timeouts/flakes inflated.
- **Shard 7 hit my own 4000 s `timeout` (exit 124) after ~357/357 files: its tests ran (4 failures recorded) but no usable lcov was merged (a 7.8 MB `shards/7/lcov.info` existed after the SIGTERM but I did not validate it and then deleted it with the other per-shard lcovs to keep the commit small — my mistake; it may have been a complete file) → Tovu coverage below EXCLUDES shard 7's test files (lower bound).** Shard 3 was stuck in slow CLI-serve tests; I killed it and re-ran as 3a/3b/3c (one test file was killed by me in the process; it passed/failed as part of 3a–c).

## §0 One screen

| Suite | Result | vs 10-28 evening |
|---|---|---|
| Jini build (`pnpm -r build`) | 8 pkgs fail tsc: examples/reference-web, agent-runtime, http-kit, infra, integrations, mcp, plugins, ui (mostly *test* files in tsc, `toHaveBeenCalledExactlyOnceWith` missing in vitest 2.1.9 types, 1 undeclared dep) | n/a |
| Jini typecheck | 15 errors in 8 pkgs (provider-plugins 5, integrations 3, ui 2, 1 each http-kit/infra/plugins/agent-runtime/mcp) | n/a |
| Jini `pnpm guard` | **5 violations** (2 L3-undeclared-edge ui→ui-kit/react, 2 SI-domain platform→net, 1 HW3 module-state devops css-urls.ts) | 19 → 5 |
| Jini `test:scripts` | 5 failed / 400 passed (coupling-isolation.test.ts) | n/a |
| Jini vitest (38 pkgs) | first pass: 18 pkgs exit≠0; after ui-asset workaround real test failures: agent-plugins 1, cookie-consent 3, db 3, mcp 1, plugins 2, provider-plugins 2, server 1, user-management 1, chat 1, ui 2 (=17 tests) + desktop-host OOM; the rest are *coverage-threshold* failures (agent-runtime, diagnostics, infra, integrations, platform, sandbox, desktop-host…) | n/a |
| Jini complexity:strict | now runs. **43 errors** (all `no-restricted-syntax`), 577 warnings (was 620 problems) | 1810→620 problems |
| Tovu typecheck root / e2e / scripts / tests | 5 / 5 / 8 / 20 errors | tests 56 → 20 |
| Tovu typecheck admin / site-chat / desktop preload,renderer,live-verify | 0 / 0 / 0,0,0 (after env fixes); desktop-main 1 | — |
| Tovu node:test (9 shard files; shard 7 partial) | 28 943 tests run (shards 0–6 incl. 3a–c; shard 7 count unknown), **35 failing entries** (31 distinct tests + 4 file-level) in 26 files | 129 tests/63 files → 35/26 |
| Tovu admin vitest | 12 676 tests: 1 failing (`main-entry-signed-in`, timeout, persists alone) after env fixes (first pass had 49 suites failing on missing peers) | — |
| Tovu desktop `npm test` | 2 failing of 2 535 (taskkill mock; loading-overlay stale) | — |
| Tovu route coverage (333 files, shard 7 excluded) | lines **99.41 %**, branches **79.65 %**, funcs **98.45 %**; `check-route-coverage-floor` **PASSED** (floors 99/68/93 — brief expected fail) | — |
| Tovu all-files | 3313 files, 1241 NEVER-LOADED (inflated by missing shard 7), lines 85.73 % | — |
| Jini coverage | per package table below; 274 production files <100 % | — |
| Complexity | Tovu 0 errors / 5 warnings; Jini 43 errors / 577 warnings | — |
| Boundaries (depcruise) | **1 error**, 316 warnings (167 errors → 1) | 167 → 1 |
| check-architecture | **FAILED** (1 hard-constraint regression: 31 NEW cross-feature edges; cycles runtime-only 5, largest SCC 22) | — |
| madge | website **5**, admin **16** (14 own, 2 Jini-dist), desktop **4** (2 own, 2 Jini-dist) cycle groups | 28/97/90 → 5/16/4 |

## §1 Failing tests

### 1a Tovu (node:test) — all 35 entries, re-run alone once (raw/rerun-a,b,c; table: raw/34-tovu-failing-tests-table.md; full error text raw/33-shard-failures.json, raw/shards/*/spec.txt)
Classes: **REAL** = code/test mismatch in repo, **STALE** = test no longer matches refactored code, **ENV** = this container / my local setup, **FLAKY** = passes alone.

| # | shard | file | test | alone re-run | first error line |
|--|--|--|--|--|--|
| 1 | 0 | apps/site-chat/src/__tests__/SiteAssistantActivation.test.ts | apps/site-chat/src/__tests__/SiteAssistantActivation.test.ts | PASS → FLAKY |   'test failed' |
| 2 | 0 | apps/website/src/server/inbound/admin-http/routes/sites/__tests__/unit/h4-site-effects.unit.test.ts | sites settings validate every root before calling the settings writer | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| 3 | 0 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts | hasConcurrentLiveRun gates whether this run may read/pass a stored resumeSessionId | FAIL (persists) |   AssertionError [ERR_ASSERTION]: this test's own anchor (the agentExecutor.run call) must still exist verbatim |
| 4 | 0 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts | the context-loss check runs, and refuses the run (finish + return), strictly before agentExecutor.run is calle | FAIL (persists) |   AssertionError [ERR_ASSERTION]: this test's own anchor (the agentExecutor.run call) must still exist verbatim |
| 5 | 1 | apps/site-chat/src/__tests__/SiteAssistantHeader.test.ts | apps/site-chat/src/__tests__/SiteAssistantHeader.test.ts | PASS → FLAKY |   'test failed' |
| 6 | 1 | apps/website/src/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts | native fallback guidance stops after one denial and confines genuine shell gaps for every CLI | FAIL (persists) |   AssertionError [ERR_ASSERTION]: The input did not match the regular expression /no ~\/\.claude\/tool-results or other CLI spill-file reads/. Input: |
| 7 | 1 | content/agent-plugins/vercel/targets/__tests__/vercel.test.mjs | returns the last known deployment state once polling exhausts its 30-attempt budget without a terminal readySt | FAIL (persists) |   'test timed out after 20000ms' |
| 8 | 1 | content/agent-plugins/vercel/targets/__tests__/vercel.test.mjs | includes teamId (preferred over teamSlug) or teamSlug in the query string when configured | FAIL (persists) |   AssertionError [ERR_ASSERTION]: expected ["/v2/files","/v13/deployments","/v13/deployments/dpl_never_ready","/v13/deployments/dpl_scoped"] to equal ["/v2/files","/v13/d |
| 9 | 1 | development/scripts/__tests__/unit/script-inventory-characterization.unit.test.ts | write-path CLI resolves table mutations, bare/property callers and unresolved ports | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| 10 | 2 | apps/site-chat/src/__tests__/SiteAssistantWidget.confirmation.test.ts | apps/site-chat/src/__tests__/SiteAssistantWidget.confirmation.test.ts | PASS → FLAKY |   'test failed' |
| 11 | 2 | apps/site-chat/src/__tests__/entries.test.ts | main mounts the React widget, runs a queued highlight, and creates its own root when a page has none | PASS → FLAKY |   Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@jini-ai/ui-kit' imported from /home/user/Jini/packages/ui/dist/react/components/SecretInput.js |
| 12 | 2 | apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-site.integration.test.ts | apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-site.integration.test.ts | PASS → FLAKY |   'test failed' |
| 13 | 2 | apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts | a receiver trickling bytes forever is cut off by the total deadline through the guarded client | PASS → FLAKY |   AssertionError [ERR_ASSERTION]: the receiver was still sending when it was cut off |
| 14 | 2 | packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts | SDK external type contracts are declared package dependencies for standalone consumers | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| 15 | 3a | apps/website/src/assistant/persistence/__tests__/release-manifests.test.ts | root/admin/site-chat select the same new chat release and preserve the UI override | FAIL (persists) |   TypeError [Error]: Invalid comparator: next |
| 16 | 3b | apps/website/src/features/site-backup/__tests__/share-delivery.integration.test.ts | no delivery returns a private ZIP download and a clear link-setup message | PASS → FLAKY |   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| 17 | 3c | content/agent-plugins/github-pages/targets/__tests__/github-pages.test.mjs | proceeds to the reachability wait using whatever Pages URL it already has when the build poll exhausts its 30- | FAIL (persists) |   'test timed out after 20000ms' |
| 18 | 3c | content/agent-plugins/github-pages/targets/__tests__/github-pages.test.mjs | keeps polling past a builds/latest entry with a non-string commit or status field before matching the real bui | FAIL (persists) |   AssertionError [ERR_ASSERTION]: expected 4 to be 3 |
| 19 | 4 | apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts | stock resolvers work from a dist/src module layout independently of cwd | FAIL (persists) |   AssertionError [ERR_ASSERTION]: missing resolver builtInThemesDir |
| 20 | 4 | development/scripts/__tests__/dead-path-sweep.test.ts | dead-path sweep: no path reference outside the known-broken register resolves to nothing | FAIL (persists) |   AssertionError [ERR_ASSERTION]: a path reference under development/scripts or the db tooling points at a file that does not exist |
| 21 | 4 | development/scripts/__tests__/dead-path-sweep.test.ts | generated coverage artifacts are not reported as dead paths | FAIL (persists) |   AssertionError [ERR_ASSERTION]: development/coverage/lcov.unit.info's parent directory should exist |
| 22 | 5 | apps/website/src/features/plugins/store/__tests__/store-plugin.dialects.test.ts | an order INSERT failure rolls back the preceding stock and version update | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Missing expected rejection. |
| 23 | 5 | apps/website/src/features/plugins/store/__tests__/store-plugin.dialects.test.ts | an order INSERT failure rolls back the preceding stock and version update | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Missing expected rejection. |
| 24 | 5 | apps/website/src/features/webhooks/__tests__/seal-aad-invariant.test.ts | the CLI exits successfully and prints OK when the real repository has no seal violations | PASS → FLAKY |   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| 25 | 5 | apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts | workspaceIdOverride supplied: the db opened for validation is the SAME handle the returned deps read from (not | FAIL (persists) |   AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: |
| 26 | 5 | apps/website/src/server/inbound/admin-http/routes/pages/__tests__/unit/h4-delete.unit.test.ts | page delete compensates a failed audit write using its captured page | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| 27 | 5 | apps/website/src/server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts | default boot adapters preserve a failed onboarding token over a conflicting ambient token and retry it | FAIL (persists) |   AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: |
| 28 | 6 | apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts | real core tree has only reviewed pattern exceptions, each with its exact current total | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: |
| 29 | 6 | apps/website/src/features/site-export/__tests__/site-exporter.test.ts | live site: a request carrying the static-export marker gets no widget AND a never-store Cache-Control | FAIL (persists) |   AssertionError [ERR_ASSERTION]: /products: visitor-specific consent and live comments stay private; owner-OFF public pages stay cacheable |
| 30 | 6 | content/agent-plugins/resend/__tests__/resend-mcp.test.mjs | resend_account_connection_is_key_based | FAIL (persists) |   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| 31 | 6 | development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts | brand icon CLI keeps the letter and removes the disconnected frame from the simplified master | FAIL (persists) |   AssertionError [ERR_ASSERTION]: build-brand-icons: full-logo artwork (170,170)-(1089,1089) is not fully inside the 904px crop at (178,178); it would be clipped. |
| 32 | 7 | apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts | no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) | FAIL (persists) | (shard killed before summary; name only) |
| 33 | 7 | apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop.routes.pins.test.ts | plan uploads a selected file's bytes the peer is missing before staging the bundle | PASS → FLAKY | (shard killed before summary; name only) |
| 34 | 7 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts | Defect 1 wiring — the conversation/session binding must be written at DISPATCH | FAIL (persists) | (shard killed before summary; name only) |
| 35 | 7 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts | Defect 1 wiring — run starts must be serialized per conversation | FAIL (persists) | (shard killed before summary; name only) |

**Classification (persisting failures; line numbers where the log gave them)**
- FLAKY (pass alone, 8 rows): site-chat Activation/Header/Widget.confirmation/entries — originally `ERR_MODULE_NOT_FOUND @jini-ai/ui-kit` from Jini ui dist (ENV, fixed by my symlink; passes now); duplicate-pglite-site, webhook-delivery-worker.shutdown (timing under load 10+), share-delivery, seal-aad-invariant, backstop.routes.pins.
- ENV: `h4-site-effects` (test hardcodes macOS `/private/tmp`, Linux says "Sites folder is unavailable"); `sdk-public-api` and `release-manifests` ("Invalid comparator: next") caused by my local `next` dep override; `dead-path-sweep` "generated coverage artifacts" needed `development/coverage/` which did not exist when shard 4 ran; `desktop tovu-server-failures.test.ts:97` (Windows taskkill mock — `t.mock.method(childProcess,"execFileSync")` records nothing under Node 24.22 → likely STALE/REAL for the named-import form; re-ran alone, still fails).
- STALE (source-text anchor/snapshot tests): `agent-daemon-server.session-resume-wiring` (×2) and `session-binding-wiring` (×2): "this test's own anchor (the agentExecutor.run call) must still exist verbatim" — the Codex refactor of the agent daemon server moved/renamed the anchored code; `assistant-system-overlay` (overlay text lacks "no ~/.claude/tool-results or other CLI spill-file reads"); `script-inventory-characterization` and `af-cli-characterization` ("full-logo artwork (170,170)-(1089,1089) is not fully inside the 904px crop"); desktop `loading-overlay.test.ts:49` (`SiteStartPanel is not defined` — App.tsx:912 `SiteStartPanel` is now its own function, the test evals only `SiteWorkspace`).
- REAL (production behaviour changed, needs a human): `stock-content-dirs` ("missing resolver builtInThemesDir"), `store-plugin.dialects` ("an order INSERT failure rolls back…" — Missing expected rejection, ×2), `create-sqlite-route-deps-for-workspace.integration` (handle identity), `h4-delete` (page delete compensating audit failure), `agent-plugin-token-boot-order` (failed onboarding token not preserved), `no-vendor-in-core.boundary` ("Vendor knowledge belongs in its plugin" — new uncovered file/vendor/count pairs, probably the ToolContributor/composition relocation), `site-exporter` (/products consent/live-comment cache headers), `resend-mcp` (`resend_account_connection_is_key_based`), `no-raw-sqlite.boundary` (ratchet grew), `vercel.test.mjs:715,821` and `github-pages.test.mjs` (20 s timeouts + call-count mismatches "expected 4 to be 3" — polling loops; could also be timer behaviour under load, unverified).
- Admin vitest: `src/__tests__/unit/main-entry-signed-in.unit.test.tsx:33` times out at 30 s importing `../../main`; fails alone too (raw/40d-admin-rerun-single.txt). Class: REAL or ENV (cold import under load) — not resolved.
- Desktop: 2 failing (`src/tovu-server-failures.test.ts:97`, `src/renderer/loading-overlay.test.ts:49`); `npm test` chains with `&&`, so the 702 renderer/contracts tests were run separately (raw/41b-*.txt): 701 pass. Both persist alone.

### 1b Jini failing tests (raw/jini-vitest/*.txt first pass; raw/jini-vitest-rerun-*; names raw/18-jini-failing-tests-list.txt, detail raw/17*-*.txt)
Root cause #1 (REAL): `packages/ui/src/react/components/SecretInput.tsx:2` and `SecretInput.hooks.ts:2` import `@jini-ai/ui-kit/react`, which is not in `packages/ui/package.json` → ui `tsc` fails (build + `pnpm guard` L3 ×2), `dist/styles` never copied, and everything depending on ui dist breaks in the first pass (admin 15 suites, chat 46, ui 33, user-management 8 suites, Tovu desktop renderer, Tovu site-chat). With the workaround: admin 0 failures, user-management 1, chat 1, ui 2.
Root cause #2 (REAL): tests call `expect(...).toHaveBeenCalledExactlyOnceWith` (not in vitest 2.1.9) → tsc errors in plugins/mcp/provider-plugins builds and runtime failures `mcp tool-server.test.ts:132`, `plugins loader.unit.test.ts:40` (×2), `provider-plugins exporter-completion-m2.unit.test.ts:14,15,28,29` (×2).
Others (class): agent-plugins `set-enabled-compatibility` (activation observers) REAL?; cookie-consent `bundle.smoke.test.ts` ×3 (needs built `dist/client.min.js`; ENV — build step not part of vitest); db `import-isolation` + `loads-without-driver` ×2 ("shared/ddl.adapter.js" expected to load, REAL); server `tests/storage/loads-without-driver` (needs packed server, ENV); user-management `Users.coverage.test.tsx` password toggle (REAL?); chat `turn-usage-w2g.unit.test.ts` (REAL?); ui `agent-icon-generation.unit.test.ts` ×2 (REAL? icon data URIs); desktop-host first pass: `FATAL ERROR: heap out of memory / Worker exited unexpectedly` (ENV, 15 GB box, 2 workers).
`pnpm run test:scripts`: 5 failures in `scripts/__tests__/coupling-isolation.test.ts` (platform OS-helper isolation: `command`, `process`, `proxy-env`, model-discovery, `@jini-ai/platform./http/guarded crosses no domain boundary`) — same root as guard SI-domain below. Raw: raw/05-jini-test-scripts.txt.
Coverage-threshold failures (tests pass but vitest exits 1): agent-runtime (99.77/99.59/99.78 vs 99.9/…/100), desktop-host (L 99.53), diagnostics (L 94.91), infra (B 99.02), integrations (L 99.98, B 99.96), platform (F 99.65), sandbox (L 99.78, B 98.59). See `raw/jini-vitest/<pkg>.txt`.

### 1c Jini guard (raw/04-jini-guard.txt) — all 5 violations
1. `L3-undeclared-edge packages/ui/src/react/components/SecretInput.hooks.ts: ui → @jini-ai/ui-kit/react`
2. `L3-undeclared-edge packages/ui/src/react/components/SecretInput.tsx: ui → @jini-ai/ui-kit/react`
3. `SI-domain packages/platform/src/http/guarded/client.ts: ./http/guarded (http) reaches src/net/effective-port.ts (net) via ../../net/effective-port.js`
4. `SI-domain packages/platform/src/mail/builtin-providers.ts: ./mail (mail) reaches src/net/effective-port.ts (net) via ../net/effective-port.js`
5. `HW3-module-state packages/devops/src/static-export/css-urls.ts: Module state must be instance-owned…`
Plus note: "27 stale debt occurrences; remove them from scripts/hardwiring-debt.json" (HW3: 137 total, 1 new).

### 1d Jini typecheck errors (all 15, raw/03-jini-typecheck.txt)
http-kit `__tests__/verified-origin-allowlist-boundaries.unit.test.ts(8,59) TS2345`; infra `events/outbox/__tests__/fenced-worker.test.ts(10,43) TS2322`; plugins `host/__tests__/unit/loader.unit.test.ts(40,24) TS2339 toHaveBeenCalledExactlyOnceWith`; integrations `saved-requests/__tests__/credential-description-w2g.unit.test.ts(11,10) TS2540; (11,46) TS7006; (11,56) TS7006`; agent-runtime `ai-trace/__tests__/sink-policy.unit.test.ts(39,18) TS2352`; ui `SecretInput.hooks.ts(2,87)`/`SecretInput.tsx(2,47)` TS2307; provider-plugins `__tests__/analytics-posthog-consent.test.ts(46,7) TS18046`, `__tests__/unit/exporter-completion-m2.unit.test.ts(14,20),(15,27),(28,20),(29,27) TS2339`; mcp `server/__tests__/tool-server.test.ts(132,17) TS2339`.

### 1e Tovu typecheck errors (all listed in raw/26-tovu-typecheck-all-errors.txt)
- Root/e2e/scripts/tests share 4 production errors: `apps/website/src/assistant/duplicate-resource-registry.ts(97,10) TS2352`; `…/admin-http/routes/system/assistant-permanent-deletes.ts(23,46) TS2769, (23,76) TS18046, (26,70) TS2488`; `…/composition/tool-catalog-manifest.ts(422,52) TS2345 DnsRouteDeps not assignable to SavedHostingDeps` (the ToolContributor generic work).
- scripts adds `development/evals/tool-search-eval-registry.ts(89,48),(91,90),(92,97) TS2314` (generic types now need 2 type args).
- desktop-main: `apps/website/src/platform/site-dir/site-trash.ts(87,3) TS2322 string|undefined`.
- typecheck:tests adds 11 test-file errors (access-token-tool, import-access-token, h4-magic-link, h4-site-effects, h4-sites, site-consent-policy ×3, h4-oidc ×2, h4-pages, provider-settings-required) — 20 total, was 56.

## §2 Coverage gaps
Tovu route coverage (shard 7's tests excluded): 333 route files, 29 with any uncovered line, 212 uncovered lines total. Top 50 by uncovered lines: raw/74-top50-route-uncovered.md; full per-file JSON raw/route-coverage-per-file.json; floor check raw/71-*.txt; gap classification raw/classify-coverage-gaps.txt (also 72-*). All-files report raw/coverage-all-files/ (json+md). Top 10:

| 1 | inbound/admin-http/routes/publish-content/backstop.ts | 69.4 | 72.3 | 72.0 | 83 |
| 2 | inbound/admin-http/routes/users/delete.ts | 58.9 | 100.0 | 50.0 | 30 |
| 3 | inbound/admin-http/routes/posts/autosave.ts | 92.8 | 53.5 | 83.3 | 14 |
| 4 | inbound/admin-http/routes/fs-files/folder-picker.ts | 82.1 | 100.0 | 40.0 | 12 |
| 5 | inbound/admin-http/routes/newsletter/resume-campaign.ts | 72.2 | 57.1 | 100.0 | 10 |
| 6 | inbound/admin-http/routes/content-types/lifecycle.ts | 92.4 | 50.0 | 100.0 | 7 |
| 7 | inbound/admin-http/routes/taxonomy/merge-term.ts | 95.7 | 60.7 | 100.0 | 7 |
| 8 | inbound/admin-http/routes/system/credential-copy.ts | 90.6 | 97.3 | 100.0 | 6 |
| 9 | inbound/admin-http/routes/agent-plugins/set-enabled.ts | 98.3 | 97.9 | 100.0 | 5 |
| 10 | inbound/admin-http/routes/system/server-logs.ts | 93.0 | 80.0 | 100.0 | 4 |

Jini per-package coverage (vitest v8, first pass; raw/jini-coverage-per-package.json; every production file <100 % lines/branches/functions: raw/jini-files-under-100.json = 274 files, examples/ and provider-plugins bundles excluded). **provider-plugins (2.12 % lines) and commerce (4.01 %) look like measurement artefacts** (provider-plugins plugins/* bundles; commerce has only 3 tests / 9 tests and no `test:coverage` script — `cd packages/commerce && pnpm test:coverage` not available, ran plain vitest: 3 files/9 tests pass).

| package | lines | branches | funcs |
|--|--|--|--|
| admin | 91.72 | 99.32 | 95.03 |
| agent-plugins | 99.52 | 99.84 | 99.86 |
| agent-runtime | 99.77 | 99.59 | 99.78 |
| agentic | 100 | 100 | 100 |
| analytics | 100 | 99.32 | 100 |
| artifacts | 100 | 100 | 100 |
| capability-providers | 100 | 100 | 100 |
| chat | 99.85 | 99.36 | 99.78 |
| cli | 100 | 100 | 100 |
| cms | 99.98 | 99.9 | 100 |
| commerce | 4.01 | 39.7 | 39.7 |
| cookie-consent | 99.79 | 99.88 | 99.38 |
| core | 99.14 | 99.81 | 99.82 |
| daemon | 99.75 | 99.63 | 100 |
| db | 100 | 99.56 | 100 |
| desktop-host | 99.53 | 98.76 | 100 |
| devops | 100 | 100 | 100 |
| diagnostics | 94.91 | 99.63 | 99.76 |
| http-kit | 100 | 100 | 100 |
| infra | 100 | 99.02 | 100 |
| integrations | 99.98 | 99.96 | 100 |
| mcp | 99.82 | 99.06 | 100 |
| memory | 100 | 100 | 100 |
| oauth | 100 | 99.89 | 100 |
| platform | 99.97 | 99.81 | 99.65 |
| plugins | 99.55 | 99.22 | 99.75 |
| protocol | 100 | 100 | 100 |
| provider-plugins | 2.12 | 97.06 | 94.88 |
| registry | 100 | 100 | 100 |
| sandbox | 99.78 | 98.59 | 100 |
| search | 100 | 100 | 100 |
| server | 99.76 | 98.16 | 94.52 |
| sidecar | 100 | 100 | 100 |
| sqlite | 100 | 100 | 100 |
| ui-kit | 97.23 | 100 | 98.57 |
| ui | 95.18 | 99.82 | 97.03 |
| user-management | 90.11 | 99.53 | 96.5 |
| vibecoding | 99.05 | 96.99 | 97.14 |

Worst 15 Jini files by uncovered lines:
- packages/provider-plugins/plugins/observability-opentelemetry/0.6.13/server/index.mjs — L 0% B 0% F 0% (19829 uncovered lines)
- packages/provider-plugins/plugins/observability-sentry/0.6.13/server/index.mjs — L 0% B 0% F 0% (12894 uncovered lines)
- packages/provider-plugins/plugins/analytics-posthog/0.6.13/server/index.mjs — L 0% B 0% F 0% (9442 uncovered lines)
- packages/provider-plugins/plugins/ai-trace-langfuse/0.6.13/server/index.mjs — L 0% B 0% F 0% (4162 uncovered lines)
- packages/user-management/src/react/users/Users.tsx — L 0.55% B 100% F 0% (538 uncovered lines)
- packages/admin/src/seo/react/pages/SeoPage.tsx — L 1.2% B 100% F 0% (492 uncovered lines)
- packages/commerce/src/payments/ledger/rows.ts — L 0% B 100% F 100% (362 uncovered lines)
- packages/ui/src/features/execution/react/components/ByokProviderForm.tsx — L 0.61% B 100% F 0% (322 uncovered lines)
- packages/commerce/src/payments/ledger/repo.memory.ts — L 0% B 0% F 0% (318 uncovered lines)
- packages/commerce/src/payments/ledger/repo.sql.ts — L 0% B 0% F 0% (293 uncovered lines)
- packages/commerce/src/payments/accounting/apply-evidence.ts — L 0% B 0% F 0% (246 uncovered lines)
- packages/commerce/src/catalog/repo.ts — L 0% B 0% F 0% (233 uncovered lines)
- packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx — L 0.89% B 100% F 0% (222 uncovered lines)
- packages/ui/src/features/execution/react/components/ExecutionTab.tsx — L 1.06% B 100% F 0% (186 uncovered lines)
- packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts — L 3.4% B 100% F 0% (170 uncovered lines)

## §3 Complexity
- **Tovu** (`raw/tovu-complexity.json.gz`, summary raw/51-*.txt): **0 errors, 5 warnings** — `apps/admin/src/lib/api.ts:693,818,1014` sonarjs/redundant-type-aliases; `migrations/0002_drop_empty_legacy_chat_tables.ts:28` too-many-break-or-continue-in-loop; `migrations/0020_vault_api_connection_kind.ts:66` no-inconsistent-returns. (Brief expected ~0 outside old migrations — met.)
- **Jini** (`pnpm run complexity:strict` no longer aborts; json via `-f json -o`: `raw/jini-complexity.json.gz`, text raw/06-*.txt): **43 errors, 577 warnings** (620 problems = the number the fix session reported). All 43 errors are rule `no-restricted-syntax` (host-neutrality messages) — 29 "Use host-neutral messages and injected wire constants", 9 "Specification IDs belong in rationale comments, never runtime strings", 4 "Consumer product identities belong to the host", 1 "Consumer source paths are forbidden". Per file: cms/src/consent/express/index.ts 8, search/src/tools.ts 4, db/src/recovery/degraded-banners.ts 4, admin/src/seo/messages.en.ts 4, plugins/src/host/plugin-format.ts 3, core/src/origin-validation.ts 2, chat/src/store/runtime/history-tools.ts 2, admin/src/seo/react/hooks/SeoPage.hooks.ts 2, … ; full file:line list = `raw/06c-jini-complexity-errors.txt`. **No `complexity` or `sonarjs/cognitive-complexity` error remains.** Warning mix is in raw/06*.txt (top: expression-complexity 60, super-linear-regex 48, too-many-break-or-continue 40, elseif-without-else 36, nested-conditional 35).

## §4 Architecture
- `npm run check:boundaries -- --output-type err-long` (raw/60-*.txt): **317 violations = 1 error + 316 warnings** (5604 modules, 37053 deps). The single error: `no-deep-imports:features/post: apps/website/src/server/inbound/public-http/http/site/render-context.ts → apps/website/src/features/post/post.ts`. Warnings by rule: no-deep-imports (contracts/headless 79, assistant 56, platform/mail 23, features/webhooks 21, settings 15, taxonomy 12, entries 7, analytics 6, navigation 3, platform/http 2, +1 each redirects/presentation/newsletter/forms/content-types/contracts-core-events) = 227; only-composition-constructs-concrete-adapters 36; no-circular 28; no-non-seam-deep-imports-from-tool-registration-caller 19 (theme 8, settings 3, media 3, platform/http 2, contracts/headless 2, assistant 1); plugin-loading-internals-confined-to-plugin-runtime 3.
- `check-architecture.ts` (raw/61-*.txt): **FAILED, 1 hard-constraint regression** — 31 NEW cross-feature edges (436 total; e.g. asset-transfer→media/theme, publish-content→post/theme/deployments, site-search→members/post, object-storage→deployments, pages→post; full list in the file). Improved: propagation cost all-import 15.52→12.93, runtime-only 3.06→3.00, API surface 821→802, bidirectional hubs 335→321. Runtime-only module cycles 5 mutual pairs, largest SCC 22, back-edges into composition root 0.
- madge (`--extensions ts,tsx --ts-config`, cycles incl. type imports; raw/62-*.txt, classified raw/64-*.json, raw/65-madge-summary.md): website **5** cycle groups (all around `assistant/index.ts → byok-tool-surface.ts → tool-registrations.ts → host-contracts.ts/external-mcp/deps.ts/plugin-runtime/tool-registrations.ts/agent-plugins/*`; largest SCC ≈ 11 files: assistant/{index,byok-tool-surface,tool-registrations,host-contracts}, features/agent-plugins/{tool-registrations,access-token-tool,switch-on-saved-token,apply-connect-defaults}, features/external-mcp/deps, features/plugin-runtime/tool-registrations). admin **16** = (a) own-code 14, (b) website-only 0, (c) Jini dist 2, (d) mixed 0; desktop **4** = own 2, website-only 0, Jini dist 2, mixed 0. Own-code cycle members are listed in raw/65-madge-summary.md (14 admin: lib/api↔settings-effective-reads; panels.tsx→Placeholder→nav; WidgetPickerDialog(.hooks); MediaPickerDialog↔JiniMediaPicker.hooks (+jini-admin modules/seo-module); panels→comments→modules.hooks; pages rules/use-page-editor/page-editor-dependencies/use-theme-pages; hooks/use-standing-draft-autosave↔lib/standing-draft-local-backup; posts use-post-editor/save.rules/state.rules; panels→media-panel; 2 desktop: sites-mcp-tools→add-site-pointer→site-dir-store→tovu-server→sites-mcp-registration; renderer/use-site-workspace.hooks↔site-theme-preview.hooks). Website production files imported by admin: 6 (platform/html/slug, features/post/slug, features/site-backup/share-policy, contracts/core/credential-copy, credential-token, admin-locales); by desktop: 10 (list in raw/65-madge-summary.md). Caveat: the desktop graph also reaches website files through `apps/desktop/src/scripts/*`.

## §5 NOT RUN / caveats
- Tovu shard 7 coverage (lcov lost to my 4000 s timeout) → route/all-files coverage and the 1241 NEVER-LOADED are lower bounds; not re-run (would need ~65 min).
- `typecheck:e2e`/`scripts` run via tsc directly; no `knip`, `semgrep`, e2e/playwright journeys, lint beyond complexity, no Jini `examples/` build fix, no `pnpm -r test` equivalent beyond per-package vitest (done with `--coverage`, 2 workers).
- Jini first-pass vitest numbers were taken before the ui-asset workaround; re-run only for user-management, admin, chat, ui (not for db/cookie-consent/etc.).
- Tovu failing tests were re-run alone ONCE each, at load ≈ 4–10.
- `check-route-coverage-floor` was merged from 9 shard lcovs by `raw/scripts-used/merge-lcov.js` (union of hits, not the repo's own merge), tier-split unit/integration not possible — classify-coverage-gaps used the merged file for both tiers.
- Commerce: no `test:coverage` script exists.
- Per brief, nothing committed except this directory. Local uncommitted Tovu edits remain in the working tree of the cloud container only (package.json/lock files).
