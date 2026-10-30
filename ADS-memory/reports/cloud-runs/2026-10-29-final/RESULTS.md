# FINAL VERIFY 2026-10-29/30 — RESULTS (report only; no product code committed)
Run 00:33Z → ~03:10Z (~157 min of the 195-min cap). Tovu @ ab01f88b (cloud/final-1029), Jini @ 545a7369 (cloud/final-1029). Node 24.22, Sonnet 5.5, no subagents. Every tool output is in `raw/*.txt` (listed per section). Delta column = vs `cloud/reverify-1029-results`.

**Important ENV caveats (all local, uncommitted):** (1) Tovu `npm ci` fails (ETARGET `@jini-ai/cookie-consent@^0.6.13`, `raw/tovu-npm-ci.txt`) → every `@jini-ai/*` dep was rewritten to `file:/home/user/Jini/packages/<pkg>` in the 6 package.json files + `npm install --no-package-lock`. This makes (a) **two kysely copies** (Tovu's and Jini's pnpm copy) → nearly all Tovu tsc errors are ENV, and (b) two manifest-pin tests fail because of my override. (2) Jini `plugin-ui-ux-design` and `provider-plugins` BUILDS fail (REAL, §1b), so Tovu consumed a partial Jini dist. (3) Playwright expects chromium-1248; symlinked to the installed -1243 (before that: ENV failures). (4) Shard lcov files were merged by me per-file (max hit count) — a lenient union; classify-coverage-gaps got the same merged file for both the unit and integration tier (tiers not separable from my shards) so its unit/integration columns are identical.

## §0 One screen
| Area | Result | Delta vs reverify |
|---|---|---|
| Jini install | OK | = |
| Jini build `pnpm --no-bail -r build` | **2 failures**: plugin-ui-ux-design (esbuild "Top-level await … cjs" in scripts/assemble-agent-plugin-package.ts:60), provider-plugins (scripts/build.ts:186 "Usage: build.ts <plugin-id> <destination-package-dir>") — `raw/jini-build.txt` | 9 → 2 |
| Jini `pnpm -r typecheck` | **exit 0, 0 errors** | 19 → 0 |
| Jini `pnpm guard` | **10 violations** (9 R2-deep-path in new plugin-* packages, 1 SI-dependency ui→ui-kit) — `raw/jini-guard.txt` | 6 → 10 |
| Jini `test:scripts` | 4 failed / 464 passed (2 files) + 1 error | 5 → 4 |
| Jini vitest (45 pkgs, with coverage) | test failures in 6 pkgs: chat 1, db 3, plugin-catalog 2, user-management 1 (+ test:scripts). 11 more pkgs exit 1 **only** from coverage thresholds. | cookie-consent, cli(tests), plugins, provider-plugins, server, ui, mcp, agent-plugins, admin now pass tests |
| Jini commerce `test:coverage` | exit 0, 100% stmts/br/fn/lines in report tail | 2 fail → 0 |
| Jini complexity:strict | **54 errors / 74 warnings** (43 no-restricted-syntax, 8 cognitive, 3 cyclomatic) `raw/jini-complexity.txt` | = (54/74) |
| Jini plugin split | guard:plugins exit 0, check-plugin-isolation exit 0, provider artifact integration test 8/8 pass; 7/9 tarballs pack OK, **plugin-catalog & plugin-ui-ux-design `pnpm pack` FAIL** (prepack build fails) | new |
| Tovu typecheck | root **241**, scripts 231, tests 1020, admin **0**, desktop-main 117, desktop-preload 0, desktop-renderer 0, site-chat 0, e2e (inside root) — essentially all are kysely-duplicate ENV (§1a) | root 5→241 (ENV), admin 3→0, desktop 1→117 (ENV), site-chat 0, tests 34→1020 (ENV), scripts 8→231 (ENV) |
| Tovu node:test (8 shards, coverage, ALL files run) | 33,391 tests, 33,324 pass, **28 ✖ (file+test)** → after solo rerun: 5 FLAKY/ENV pass, render-form (3) ENV-fixed, 2 ENV(manifest pin), rest REAL/STALE | shards fully completed this time |
| Tovu admin vitest | 13,544 pass / **1 fail** (flaky, passes solo) / 2 skipped; cov L 99.34 / Br 98.19 / Fn 98.75 | 4 → 1; cov 99.33/98.19/98.75 ≈ |
| Tovu desktop `npm test` | part1 1839/1850 pass 1 fail; part2 (renderer+contracts, run manually because `&&`) 699/702, 3 fail | 1 → 4 |
| Tovu route coverage (merged, 333 files) | lines **99.99%**, branches **79.64%**, funcs **99.25%** — floor (99/68/93) **PASSES** (expected fail did not occur) | was 92.14/79.98/83.93 partial |
| Tovu all-files coverage | 3096 files, 1049 NEVER-LOADED; lines 89.18% (runner-only 99.79%), branches 73.34%, funcs 63.75% | new |
| Tovu complexity:strict | **0 errors, 4 warnings** | 0/3 |
| Tovu check:boundaries | **0 errors, 16 warnings** (15 no-deep-imports, 1 only-composition-constructs-concrete-adapters) | 53 → 16 warn |
| Tovu check-architecture | **FAILED** (ratchet): runtime propagation 3.06→3.66, hubs 335→346; all-import propagation 15.52→12.54, API surface 821→766; largest SCC (runtime) **22**; mutual-pair cycles 5 | SCC 33→22, prop 3.80→3.66, hubs 367→346 |
| madge circular | website **0**, admin **6** (4 own-code, 2 Jini-dist), desktop **2** (both Jini-dist) | 8/6/8 → 0/6/2 |

## §1 Failing tests / errors
### 1a Typecheck (all lines in raw)
Files: `raw/tovu-typecheck.txt` (241), `tovu-typecheck-scripts.txt` (231), `tovu-typecheck-tests.txt` (1020), `tovu-typecheck-desktop-main.txt` (117). Every one is TS2345/TS2322 "Kysely<…> from /home/user/Tovu/node_modules/kysely vs /home/user/Jini/node_modules/.pnpm/kysely@0.29.6" (`#private` mismatch) = **ENV** caused by file: linking. Non-kysely lines: root 1 (site-search/index-state-store.ts:124 – ExpressionBuilder, same family), tests 6 (ask-choice-tool.test.ts:407 TS2351, install-tool.unit.test.ts:38 TS2345, pages/tool-registrations.test.ts:136 TS2351 +3) → possibly REAL; see raw. Admin/site-chat/desktop-renderer/preload: **0 errors** (first pass before `npm install` in those apps showed 5687/15/157/2 missing-module errors → `raw/first-pass-before-app-install/`).

### 1b Jini
- **Build**: see §0. plugin-ui-ux-design: esbuild TransformError at scripts/assemble-agent-plugin-package.ts:60 (top-level await in cjs bundle). provider-plugins: scripts/build.ts:186 requires args but the package build script passes none. Both REAL.
- **guard** (full list `raw/jini-guard.txt`): R2-deep-path ×9: plugin-ai-trace-langfuse/__tests__/package.test.ts, plugin-analytics-posthog/__tests__/pack.test.ts (×2), plugin-catalog/scripts/generate.ts (×2: ../../core/plugin-directory.js, ../../plugins/src/host/node/install.js), plugin-fixture-provider/__tests__/package.test.ts, plugin-observability-opentelemetry/…/pack.test.ts, plugin-observability-sentry/…/pack.test.ts, plugin-payments-stripe/…/package.test.ts; SI-dependency packages/ui/package.json (@jini-ai/ui-kit used by 1/23 closures → optional peer + dev dep). (R13 MF3 notes = informational.) REAL.
- **test:scripts** (`raw/jini-test-scripts.txt`): coupling-isolation ×3 (command/process/proxy-env "reaches only its existing OS owners"), guard-drift-cli "reports success when no drift" (expected log called), + error "pack-jini-packages: pnpm-workspace.yaml has no top-level packages: list". REAL/STALE.
- **vitest failures** (`raw/jini-vitest/<pkg>.txt`): chat turn-usage-w2g "legacy boundary data without an id splits every reply…" (AssertionError deep-equal); db import-isolation "scans every production TypeScript file…" + loads-without-driver ×2 ("migrate/owner-store loaded shared/ddl.adapter.js"); plugin-catalog catalog.test.ts ×2 ("records agent file digests…", "'ui-ux-design' matches its real package…"; ui-ux-design plugin.json missing because its build fails → REAL-via-build); user-management Users.coverage "UserResetPasswordDialog reveals only the new-password field…" (icon path mismatch). Coverage-threshold-only failures (all tests pass): agent-runtime, cli, diagnostics, infra, integrations, mcp, platform, sandbox, server, ui, desktop-host — messages in each raw file.
- Not re-run alone (time): above Jini failures.

### 1c Tovu node:test shards (per-shard summaries: `raw/shard-N.txt`, reruns `raw/rerun-*.txt`, `rerun-status*.txt`)
Per shard tests/pass/fail/skipped: 1: 4340/4335/1/4 · 2: 4245/4231/9/5 · 3: 4140/4138/1/1 · 4: 4111/4097/5/9 · 5: 4239/4229/5/5 · 6: 4098/4085/5/8 · 7: 4539/4532/2/5 · 8: 3679/3677/0/2.
| Test (file) | Solo rerun | Class | Cause |
|---|---|---|---|
| apps/site-chat/src/__tests__/{SiteAssistantActivation, SiteAssistantHeader, SiteAssistantWidget.directives, user-bubble-theme, vanilla-host.confirmation}.test.ts (file-level) | PASS | ENV (site-chat deps were not installed when shards ran) | pass after `npm install` in apps/site-chat |
| render-form-layout.test.ts ×3 (form hidden by stylesheet, fallback colors, checkbox inline) | FAIL then PASS after chromium symlink | ENV | `browserType.launch: Executable doesn't exist … chromium_headless_shell-1248` |
| agent-daemon-import-graph "walk resolves relative and #src imports…" | FAIL | REAL | assertion "extensionless `#src/` import" (test:131) |
| agent-daemon-server.page-navigate-error-rewrap "imports withPageNavigateErrorRewrap from the Tovu-side rewrap module" | FAIL | REAL/STALE | source-text regex for `import { withPageNavigateErrorRewrap } from "#src/assistant/rewrap-page-navigate-error"` not found (test:24) |
| no-vendor-in-core.boundary "real core tree has only reviewed pattern exceptions" | FAIL | REAL | new uncovered pair `apps/website/src/assistant/assistant-tool-approval-policy.ts: github 2` (test:194) |
| no-raw-sqlite.boundary "no new raw SQLite outside the storage kernel" | FAIL | REAL | `platform/db/sqlite/fresh-content-db.ts: $client 1 -> 2` (test:83) |
| worker-import-graph handlebars-worker / liquid-worker | FAIL | REAL | handlebars 176 modules (budget 165); liquid 133 (budget 125) |
| domain-no-direct-tool-registration.boundary | FAIL | REAL | value-imports of assistant/mcp-services.js from features/agent-plugins/{executable-tools/register.ts, memory-tools.ts, tool-registrations.ts}, plugin-runtime/capability-tool-registrations.ts, skills/tool-registrations.ts |
| release-manifests "root/admin/site-chat select the same new chat release…" | FAIL | ENV | semver "Invalid comparator: file:/home/user/Jini/packages/chat" (my override) |
| product-telemetry "Tovu declares no production vendor plugins…" | FAIL | ENV | manifest has `file:…/plugin-catalog` vs expected `^0.7.0` (my override) |
| sdk-public-api "SDK external type contracts are declared package dependencies" | FAIL | ENV | `file:/home/user/Jini/packages/plugins` vs `^0.6.13` (my override) |
| skill-supporting-files.chat.integration "transcript contains the installed ui-ux-design foundations reference" | FAIL | REAL (Jini side) | ERR_PACKAGE_PATH_NOT_EXPORTED './ui-ux-design/skills/ui-ux-design/references/foundations.md' in @jini-ai/agent-plugins exports (ui-ux-design moved out; Tovu test not updated / plugin-ui-ux-design failed to build) |
| check-menu-href-allowlist-sync "live: jini:isAllowedHref, render.ts:safeHref, static-render.ts:safeHref agree" ×2 | FAIL | STALE | "could not find the SAFE_HREF_RESOLUTION_BASE/ORIGIN const pair in apps/website/src/features/theme/render-contract.ts" |
| fly bundled-package "every operator-supplied value … marked as placeholder"; fly.test "renderFlyToml escapes variable values…" + "…DEL control character" | FAIL | STALE/ENV | strict deepEqual on `[Object: null prototype]` vs plain object (Node 24 strictness) |
| dead-path-sweep ×2 | FAIL | ENV | references to development/coverage/*, ADS-memory/.local-artifacts/* that don't exist in a fresh checkout (list in `raw/rerun-development_scripts___tests___dead-path-sweep.test.ts.txt`) |
| dependency-cruiser.test.ts (file) | FAIL | ENV | JSON.parse "Unexpected end of JSON input" (test:61) — depcruise output empty; not diagnosed |
| site-exporter "live site: a request carrying the static-export marker gets no widget AND a never-store Cache-Control" | FAIL | REAL (unexamined) | see raw |
Shard 8: 0 failures.

### 1d Tovu admin / desktop
- admin: use-assistant-runtime-preferences.hooks "keeps the optimistic reply until stored reply length agrees…" (expected 'detailed', got 'short') — **FLAKY** (4/4 pass solo, `raw/rerun-admin-runtime-prefs.txt`).
- desktop part1: tovu-server-failures.test.ts "the default Windows stop invokes taskkill for the whole tree and waits for child exit" — fails solo too; Linux host → ENV (expected [taskkill…], actual []).
- desktop part2 (`raw/tovu-desktop-test-part2.txt`): "Websites fits at 375px with every nav control and header action inside the page", "narrow collapsed multi-tab content fills the dialog…", "the loading overlay on the Site view says 'Loading <site>…'" — not re-run alone (time) → UNCLASSIFIED (likely browser/ENV).
- Desktop staging tests are inside these suites (not separately run).

## §2 Coverage gaps
- Route (merged lcov, `raw/route-coverage-per-file.json`, 333 files; floor output `raw/route-coverage-floor.txt`): only **2 files** have uncovered lines: system/site-key.ts (3 lines, L99.52 Br75.48 Fn90.48), posts/autosave.ts (2 lines, L98.97 Br77.86). Lowest branch%: users/write-policy-permission.ts 54.55, publish-content/import.ts 62.67, pages/get-by-id.ts 63.64, posts/get-by-id.ts 65, users/attach-policy.ts 65, system/custom-credentials.ts 65.04, posts/update.ts 65.14. NB: my merge takes max hits per shard, so branches are an upper bound.
- All-files: `raw/coverage-all-files.md/json`: 1049 never-loaded files, 89.18% lines. classify output: `raw/classify-coverage-gaps.txt` (branch-gap list; unit==integration, see caveat).
- Admin vitest: L 99.34 / Br 98.19 / Fn 98.75 (`raw/tovu-admin-coverage-summary.json`).
- Jini per package (lines/branches/funcs, `raw/jini-package-coverage.json`): 100/100/100 → agentic, artifacts, capability-providers, devops, http-kit, memory, protocol, registry, search, sidecar, sqlite, user-management. Lowest: diagnostics 94.91/99.63/99.76, ui-kit 97.29/100/98.57, provider-plugins 97.35/98.23/98.88, vibecoding 99.05/96.99/97.14, server 99.76/98.15/94.52, desktop-host 99.53/98.76/100, sandbox 99.78/98.59/100, plugin-catalog 80/96.66/80; plugin-* (langfuse, posthog, fixture, otel, sentry, stripe) report 0/0/0 (no source measured / tests live in __tests__ against provider-plugins build).
- **148 Jini production files under 100%** → `raw/jini-files-under-100.json` (top 50 by uncovered lines below).

| pkg | file | lines | br | fn | uncov lines |
|---|---|---|---|---|---|
| plugin-observability-opentelemetry | packages/plugin-observability-opentelemetry/plugins/observability-opentelemetry/0.7.0/server/index.mjs | 0 | 0 | 0 | 19829 |
| plugin-observability-sentry | packages/plugin-observability-sentry/plugins/observability-sentry/0.7.0/server/index.mjs | 0 | 0 | 0 | 12894 |
| plugin-analytics-posthog | packages/plugin-analytics-posthog/plugins/analytics-posthog/0.7.0/server/index.mjs | 0 | 0 | 0 | 9442 |
| plugin-ai-trace-langfuse | packages/plugin-ai-trace-langfuse/plugins/ai-trace-langfuse/0.7.0/server/index.mjs | 0 | 0 | 0 | 4162 |
| plugin-payments-stripe | packages/plugin-payments-stripe/plugins/payments-stripe/0.7.0/server/index.mjs | 0 | 0 | 0 | 296 |
| diagnostics | packages/diagnostics/src/web-evidence/__tests__/web-evidence-playwright.port-check.ts | 0 | 0 | 0 | 161 |
| core | packages/core/src/args-convention.typecheck.ts | 0 | 0 | 0 | 43 |
| agent-plugins | packages/agent-plugins/core/persistent-state.d.ts | 0 | 0 | 0 | 25 |
| plugin-fixture-provider | packages/plugin-fixture-provider/plugins/fixture-provider/0.7.0/server/index.mjs | 0 | 0 | 0 | 22 |
| provider-plugins | packages/provider-plugins/vitest.coverage.config.ts | 0 | 0 | 0 | 21 |
| agent-runtime | packages/agent-runtime/src/model-discovery-yaml.ts | 78.12 | 78.37 | 90.9 | 14 |
| plugin-catalog | packages/plugin-catalog/scripts/generate.ts | 80 | 96.66 | 80 | 14 |
| ui-kit | packages/ui-kit/src/react/secret-reveal.hooks.ts | 12.5 | 100 | 0 | 14 |
| ui-kit | packages/ui-kit/src/react/SecretInput.tsx | 15.38 | 100 | 0 | 11 |
| desktop-host | packages/desktop-host/src/render-bridge.ts | 92.03 | 83.92 | 100 | 9 |
| plugins | packages/plugins/src/host/node/module-snapshot.ts | 94.26 | 97.5 | 94.73 | 9 |
| daemon | packages/daemon/src/agent-executor/events.ts | 98.87 | 98.1 | 100 | 8 |
| vibecoding | packages/vibecoding/src/node/store.ts | 97.91 | 94.05 | 100 | 8 |
| daemon | packages/daemon/src/agent-executor/launch.ts | 99.12 | 98.71 | 100 | 7 |
| provider-plugins | packages/provider-plugins/scripts/build.ts | 95.48 | 92.68 | 100 | 6 |
| vibecoding | packages/vibecoding/src/node/project.ts | 97.9 | 95.33 | 90.19 | 6 |
| agent-runtime | packages/agent-runtime/src/claude-filesystem-policy.ts | 96.71 | 95.41 | 93.33 | 5 |
| agent-runtime | packages/agent-runtime/src/ai-trace/recorder.ts | 97.47 | 94.65 | 96.55 | 5 |
| plugins | packages/plugins/src/host/node/discovery.ts | 97.5 | 98.11 | 100 | 5 |
| cms | packages/cms/src/seo/feed.ts | 90.24 | 100 | 100 | 4 |
| core | packages/core/src/settings/__tests__/principal-lookup.typecheck.ts | 0 | 100 | 100 | 4 |
| provider-plugins | packages/provider-plugins/src/observability-opentelemetry/index.ts | 95.34 | 97.87 | 100 | 4 |
| server | packages/server/src/lifecycle/__tests__/boot-lifecycle.test.ts | 97.89 | 100 | 91.3 | 4 |
| server | packages/server/src/owner-store/backup.ts | 96.22 | 94.56 | 100 | 4 |
| agent-runtime | packages/agent-runtime/src/ai-trace/sinks.ts | 96.8 | 98.43 | 100 | 3 |
| agent-runtime | packages/agent-runtime/src/providers/tool-turn.ts | 98.96 | 99.54 | 100 | 3 |
| chat | packages/chat/src/core/util/validate.ts | 97.94 | 98.41 | 100 | 3 |
| cookie-consent | packages/cookie-consent/src/client.min.ts | 0 | 0 | 0 | 3 |
| daemon | packages/daemon/src/tool-result-media.ts | 95.45 | 98.18 | 100 | 3 |
| daemon | packages/daemon/src/agent-executor/mcp-bridge.ts | 98.86 | 99.29 | 100 | 3 |
| daemon | packages/daemon/src/http/db-ops.ts | 97.6 | 97.43 | 100 | 3 |
| daemon | packages/daemon/src/http/delegated-tools.ts | 97.82 | 98.68 | 100 | 3 |
| daemon | packages/daemon/src/http/terminals.ts | 98.35 | 98.88 | 100 | 3 |
| mcp | packages/mcp/src/bin/serve.ts | 98 | 97.29 | 100 | 3 |
| mcp | packages/mcp/src/client/client.ts | 98.39 | 98.88 | 100 | 3 |
| vibecoding | packages/vibecoding/src/html/node/parse5-region-parser.ts | 98.2 | 98.83 | 100 | 3 |
| cli | packages/cli/src/run-command.ts | 98.95 | 99.18 | 100 | 2 |
| cms | packages/cms/src/forms/email-sender-fields.ts | 95.34 | 96.66 | 100 | 2 |
| commerce | packages/commerce/src/payments/provider-module-guard.ts | 95.74 | 100 | 93.75 | 2 |
| core | packages/core/src/text/sanitize-untrusted-text.ts | 97.97 | 97.4 | 100 | 2 |
| desktop-host | packages/desktop-host/src/electron/electron-url-capture.ts | 98.58 | 94.04 | 100 | 2 |
| mcp | packages/mcp/src/server/adapters/stdio-codec.ts | 83.33 | 85.71 | 100 | 2 |
| platform | packages/platform/src/asset-cache.ts | 99.11 | 98.4 | 100 | 2 |
| plugin-analytics-posthog | packages/plugin-analytics-posthog/plugins/analytics-posthog/0.7.0/server/posthog-browser.js | 0 | 0 | 0 | 2 |
| ui | packages/ui/src/features/execution/react/components/AgentDiagnosticRow.tsx | 96.77 | 95.23 | 100 | 2 |

## §3 Complexity
- Tovu (`raw/tovu-complexity-messages.txt`, json `raw/tovu-complexity.json`): **0 errors, 4 warnings** — apps/admin/src/lib/api.ts:693,818,1014 sonarjs/redundant-type-aliases; apps/desktop/src/stage-payload-run.ts:120 sonarjs/too-many-break-or-continue-in-loop.
- Jini (`raw/jini-complexity.txt`, now runs to completion): 54 errors (43 no-restricted-syntax, 8 sonarjs/cognitive-complexity, 3 complexity), 74 warnings (18 redundant-type-aliases, 12 todo-tag, 5 regex-complexity, 5 no-inconsistent-returns, 4 no-hardcoded-passwords, 4 no-clear-text-protocols, 3 super-linear-regex, rest singletons). Every message is in the txt.

## §4 Architecture
- dependency-cruiser (`raw/tovu-check-boundaries.txt`, run with `--output-type err-long`): 0 errors, 16 warnings — 15 `no-deep-imports:<feature>` (e.g. server/routes/types.ts → features/entries/public-list.ts, features/analytics/forwarding.ts, features/analytics/contracts.ts, …) + 1 only-composition-constructs-concrete-adapters; every pair in the raw file. 5626 modules, 37,210 dependencies.
- check-architecture (`raw/tovu-check-architecture.txt`): exit 1; metrics in §0; TRADE DETECTED (runtime propagation +0.6pts, hubs +11 vs improvements in all-import propagation and API surface).
- madge (`raw/madge-{website,admin,desktop}.json`, graphs `madge-graph-*.json`): website 0 cycles. admin 6: (c) Jini dist ×2 [chat/dist/react/hooks/useUserTextGuard.d.ts↔react/index.d.ts; ui/dist/features/panel-kit/helpers/standing-draft-local-backup.d.ts↔hooks/use-standing-draft-autosave.hooks.d.ts]; (a) own-code ×4: components/WidgetPickerDialog/WidgetPickerDialog.tsx↔.hooks.tsx; components/MediaPickerDialog/MediaPickerDialog.tsx↔JiniMediaPicker.hooks.ts; features/pages/hooks/use-theme-pages.hooks.ts↔lib/theme-page-publish-state.ts; features/pages/rules.ts↔hooks/use-theme-pages.hooks.ts (last two share a 3-file SCC). No website-only (b) or mixed (d) cycles. desktop: 2, both Jini dist (same two). Website files imported by admin: **112** (`raw/website-files-imported-by-admin.txt`), by desktop: **261** (`raw/website-files-imported-by-desktop.txt`) — includes transitive graph nodes; test files excluded.
- Largest SCC (runtime-only, check-architecture): 22 members.

## §5 NOT RUN / cut
- Solo reruns of Jini failures; solo reruns of the 3 desktop part-2 failures and dependency-cruiser/site-exporter diagnosis.
- Unit/integration-tier coverage split (not separable); precise cross-shard branch merge.
- Jini `pnpm pack` tarball file lists for plugin-catalog and plugin-ui-ux-design (pack fails); the other 7 lists are in `raw/jini-pack/*-files.txt`. Confirmed: **@jini-ai/agent-plugins tarball (272 files) contains no ui-ux-design files**; each plugin-* tarball contains only its own `plugins/<id>` payload (otel tarball also has plugins/package-license).
- Tovu e2e/playwright journeys, desktop staging tests as a separate run, `typecheck:e2e` is part of root typecheck only.
