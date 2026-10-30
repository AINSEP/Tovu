# VERIFY + FIX 2026-10-30 — RESULTS
Run 04:33Z → ~06:10Z. Tovu `cloud/verify-1030` = f7c5d6e3 (R1 ad8a49c74 + DI 561bba06 + brief). Jini `cloud/verify-1030` = 722547e4 (R1). Node 24.22, Sonnet 5.5, no subagents. Fixes: Tovu `cloud/verify-1030-fixes` (HEAD d3482abe), Jini `cloud/verify-1030-fixes` (813e3071). Raw output in `raw/` (links below).

ENV caveats (local, uncommitted, same as 10-29): Tovu `@jini-ai/*` → `file:` rewrite + overrides removed, `npm install --no-package-lock --ignore-scripts`; contracts+sdk built. ~1200 "two kysely copies" TS errors and release-manifests / product-telemetry / sdk-public-api semver failures are ENV (counted, not listed). Postgres 16 had to be `apt-get update` + installed mid-run (shards ran before it existed); Chromium NOT set up → render-form-layout is ENV.
Shards ran from the *unmodified* main tree (fixes were developed in a separate worktree). Step-6 mutations were live in the main tree for ~2 min while shards ran (reverted; see log) — no failure below looks attributable to it.

## §0 One screen
| Area | Result (verify-1030 as given) | After my fixes (fixes branches) |
|---|---|---|
| Jini install / `pnpm -r build` | OK / exit 0, 0 errors (`raw/jini-build.txt`) | – |
| Jini `pnpm -r typecheck` | exit 0 | – |
| Jini `pnpm guard` | exit 0 | – |
| Jini `test:scripts` | 1 fail / 469 pass (coupling-isolation) | 20/20 in that file pass |
| Jini vitest agent-runtime 4296, daemon 3838, chat 3777, user-management 520, ui 8754, provider-plugins, plugin-catalog, plugin-* (7 pkgs) | all pass | – |
| Jini vitest db | **1 fail** / 717 pass (loads-without-driver, §1) | unfixed |
| Jini plugin-ui-ux-design vitest | "No test files found" → exit 1 (not a failure) | – |
| Tovu node:test (2788 files in 8 shards, 3 at a time, `--test-concurrency=1`, no coverage) | **65 files non-zero** (`raw/failing-files.txt`) | – |
| …after solo re-run | 28 pass (25 = `*.postgres.*` ENV once PG ran; 3 FLAKY) / **37 still fail** (`raw/rerun-status.txt`) | 9 more pass on fixes branch; 27 still fail (`raw/rerun-fix-status.txt`) |
| Tovu typecheck root | 256 errors, **21 non-kysely** (`raw/tc-root-nonkysely.txt`) | **3 non-kysely** left |
| Tovu typecheck:e2e | 246, **21 non-kysely** (`raw/tc-e2e-nonkysely.txt`) | not re-run |
| Tovu admin tsc | 0 | – |
| Tovu desktop tsc: preload 0, renderer 0, live-verify 0, **main 1** (`desktop-host-signals.ts:25`) | | not re-run |
| Tovu typecheck:tests | 1071, **62 non-kysely** (`raw/tc-tests-nonkysely.txt`) | not re-run |
| Tovu admin vitest AssistantDock+skills | 775/775 pass (70 files) | – |
| Tovu complexity:strict | **0 errors**, 5 warnings (`raw/complexity-strict.txt`) | not re-run (edits are 1-line) |
| Tovu check:boundaries | **2 errors** (no-deep-imports:features/post ×2), 35 warnings | **0 errors**, 35 warnings |
| RED check (7 tests) | all 7 FAIL as required | mutation → all GREEN (§2) |

Delta vs 10-29 (`cloud/final-1029-results`, `cloud/fixtest-1029-results`): Jini typecheck 0→0; Jini guard 10→**0**; Jini build 2 fails→**0**; Jini test:scripts 4→**1**; Jini vitest failing pkgs 6→**1** (db); Tovu boundaries 0 errors→2 errors (new, DI) ; Tovu complexity 0→0; Tovu shard failures 28 (final) → 37 after solo rerun (all of the new ones are DI cascades, §1); admin vitest 1 flaky→0; admin tsc 0→0; non-kysely root TS errors: new 21 (DI) vs ~0 before.

## §1 Every failing test (solo re-run = `raw/rerun/*.txt`; fix-branch re-run = `raw/rerun-fix/*.txt`; shard output only for first run)
Class: REAL = real code/test defect, STALE = test out of date, ENV = environment, FLAKY = passed solo. Trace: R1 / DI (561bba06) / earlier.

### Jini
| File / test | Class | Trace | Cause |
|---|---|---|---|
| scripts/__tests__/coupling-isolation.test.ts:107 "declares the shared secret-input owner…" | STALE | **R1** | R1's own test asserts `devDependencies['@jini-ai/ui-kit']='workspace:^'` + optional peer, but R1's commit message and package.json keep ui-kit a regular dependency. **Fixed** 813e3071 (asserts dependencies + no peer). *Judgement call: it changes the assertion to follow R1's stated decision — flag for owner.* |
| packages/db `loads-without-driver.test.ts` "POSITIVE CONTROL: ./owner-store requires kysely in the empty fixture" (`expected +0 not to be +0`; test:225-229) | REAL/STALE | **R1** ("db DDL back in the kernel") | `./owner-store` no longer fails to load without kysely, i.e. either the kernel move removed the kysely load (then `kernel:true` for that subpath is stale) or owner-store now bypasses it. Not fixed: needs a design call; weakening the control is forbidden. |

### Tovu — still failing after fixes (27 files; first error lines in `raw/rerun-fix/`)
RED (expected, no fix yet; 3 files): tool-registrations.themes, tool-catalog-query.entries, discover-themes-staging-exclusion — §2.
Earlier, not R1/DI (same cause as 10-29 lists): content-post-list-filters (`search aliases… conflicting spellings never read`: completed vs failed — fixtest #4/#5), worker-import-graph (handlebars 173 / liquid 130 vs budget 165/125; 10-29: 176/133), installed-extension-tools.executable-tools (deepEqual field order; fixtest #10), products.route "static-export marker" (final: site-exporter, unexamined), no-vendor-in-core (new pair `features/site-inspection/tool-registrations.ts: resend 1` — line 100 text "Resend w…"; the 10-29 pair was `assistant-tool-approval-policy.ts: github 2`, so R1 fixed that one and a different one is flagged now; vendor-name scan hits the English word, the fix needs the owner's reviewed-exception policy or rewording — not done).
ENV: render-form-layout (3, Chromium not installed).
**DI 561bba06 regressions left (REAL, not small/obvious → not fixed):**
| Test | First error | Likely cause |
|---|---|---|
| plugin-runtime/install-tool.unit "with no env injected the gate reads process.env at call time"; content/agent-plugins/fly/host-signals.test.mjs (policy matrix, many cases) | `Cannot read properties of undefined (reading 'hosted')` plugin-runtime/install.ts:14 | `sitePluginLocalInstallEnabled` fallback passes `deps.hostSignals` that is undefined when no composition root injects it; the old env-derived `hosted` (FLY_APP_NAME) is gone. Needs an owner decision on where default host signals come from (plugin-runtime may not import other features). |
| content/agent-plugins/google-workspace sheets-admin.security + vertical-slice | `withExtensionApprovalPolicy is not a function` | `.mjs` tests import it from a module that moved with the DI refactor |
| content/agent-plugins/resend/resend-mcp.test.mjs | `reading 'apply'`, `reading 'siteDir'` | tests build deps without the new `credentials` / paths ports |
| content/agent-plugins/cloudflare/contribution-migration.test.mjs | `"path" argument … undefined` | same family (paths port missing) |
| agent-plugins/__tests__/unit/tool-registrations.unit (1 of 5 left) | `reading 'loadSafe'` | connect fixture lacks `credentials` port (`connect-tool.ts:489`) |
| settings/form-delivery-concurrency.integration (3) | `required.bindings.isConflict is not a function` | fixture binding repo lacks new port method (also tsc TS2741) |
| server/__tests__/unit/stock-content-dirs | `missing resolver bundledAgentPluginsDir` | resolver moved (`composition/site-paths`) |
| admin-http/.../h4-sites.unit | deepEqual bundled token catalog | catalog port wiring |
| composition/agent-plugin-connections.vertical-slice, booted-request-layouts (1 each) | deepEqual / strictEqual | wiring changed by DI; not diagnosed |
Typecheck (root, non-kysely, after fixes): `tool-catalog-manifest.ts(387,54)`, `(448,59)`, `(560,81)` — `AgentPluginMcpPort` missing `notifyRosterChanged` in the Pick given to `TovuPluginHostDeps`; `externalMcpOAuth` typed `ExternalMcpOAuthService | AgentPluginOAuthPort` where only the port is allowed. e2e: `development/e2e/support/plugin-install-fixtures.ts:77` (`env` not in `Pick<AgentPluginPathsPort,"siteDir">`); desktop-main: `src/desktop-host-signals.ts:25` (needs `bundledSourceRoot`). Tests-tsc 62 non-kysely (list in raw): fixtures missing new port members (`postRead`, `isConflict`, `bundledSourceRoot`, `keyring`, `postRepo`, `externalMcpServerRepo`), `InMemoryExternalMcpServerRepo` no longer exported from assistant index.

### Tovu — FLAKY (failed in shard, pass solo): tool-registrations.widgets-authorization (first run: `Jini/packages/db/src/core/index.ts` "does not provide an export named 'restorePointFilename'" while Jini vitest/build ran concurrently — ENV contention), install-tool-update.unit (`uploaded bytes do not match` — passed solo in main tree, failed once solo in worktree: timing-dependent, treat as FLAKY), vault-boot.integration.
### Tovu — ENV: 25 `*.postgres.*` files (no PG server during shards; all 25 pass once PG running), release-manifests / product-telemetry / sdk-public-api (semver vs my `file:` rewrite; pass in the unrewritten fix worktree), pg-fixture.unit (needs PG).

## §2 The 7 RED tests (must fail now)
| Test | Result now | Why | Mutation (scratch, reverted; diff `raw/mutation-step6.diff`) | After |
|---|---|---|---|---|
| discover-themes-staging-exclusion ×4 (dot-folder cases) | FAIL 4 of 8 | `discoverThemes` returns `.claude`, `hidden-theme` alongside `tovu-starter` (theme.ts:~901) | `if (name.startsWith(".")) return false;` after the staging-prefix check | 8/8 GREEN |
| tool-catalog-query.entries ×2 (`content_read.content_region`, `content_read.form`) | FAIL 2 of 4 | `describe_tool` → NOT_FOUND "no catalog entry for tool id" | describe fallback `id === "content_read" \|\| id.startsWith("content_read.")` → family | 4/4 GREEN |
| tool-registrations.themes ×1 (theme_write_file missing theme) | FAIL 1 of 27 | message "theme 'apple' was not found — discovered themes are: hb, plain…" never names `theme_duplicate` | append "Create it first with theme_duplicate, then retry." (note: the message lives in `features/theme/asset-operations.ts:133`, not `assistant/…`) | 27/27 GREEN |
Raw: `raw/red-*.txt`, `raw/green-*.txt`. None of the mutations were committed.

## §3 Fixes pushed (one commit per fix; all on `cloud/verify-1030-fixes`)
Jini: `813e3071` coupling-isolation (above).
Tovu (base f7c5d6e3):
- `9c16f70b` theme/static-render.ts re-import `withElementKeptIfAttributed` → fixes tsc TS2304 ×2 and menu-html-mode, menu-authored-html, widget-body-embeds (all pass solo).
- `7c214b4f` composeAgentPluginPreferences clock type → fixes tsc TS2344/TS18046 (agent-plugin-service-ports.ts:43,51).
- `c05b3807` PostRecord via features/post door in plugin-runtime ×2 → check:boundaries 2→0 errors.
- `402e6570` `keyring.activeKey({})` (external-mcp-oauth.ts:743) + `apiConnections?` on `AssistantToolRegistryDeps` → tsc TS2554, TS2339 ×2.
- `4df80e3d` composePluginCredentials takes host `HttpClientPort` → tsc TS2322 ×5 call sites.
- `9a0fd0a3` automatic-agent-plugins.integration imports `getEffective` → 28/28 pass.
- `b8f4b539` plugins-set-enabled-busy imports `InMemoryExternalMcpServerRepo` from external-mcp → 4/4 pass.
- `d93b6716`, `52aa8754`, `643262ea`, `2af7198d` bundled-inactive-gating, agent-plugin-tool-search-ranking, skill-supporting-files.chat, tool-supporting-files: drop `.js` on `#src/` imports → 8/3/1/4 pass.
- `2c2b1ea2`, `388a6e7f` layout-b-memory (11/11), agent-plugin-tool-revocation (6/6): import isolated-catalog-home. `d3482abe` agent-plugins tool-registrations.unit: same import, 4 of 5 failures fixed, 1 left.
No eslint-disable / ts-ignore / skips / casts / allow-list entries added. Re-runs of the fixed files were done solo; the full shard set was **not** re-run on the fixes branch, and typecheck was re-run for root only; complexity:strict and depcruise-warnings were not re-run after the final commits (depcruise errors re-run: 0). The fixes branch's package.json files are the unrewritten originals (rewrites stay local).

## §4 NOT RUN / left unfixed
- Fixes beyond "small and obvious": all DI items in §1's DI table (host-signals default, paths/credentials port fixtures, tool-catalog-manifest typing); db owner-store control; no-vendor-in-core `resend`; chromium-dependent render-form-layout (no browser set up).
- Not re-run on fixes branch: full shards, typecheck:e2e/tests/desktop, complexity:strict.
- Not run: Tovu desktop `npm test`, coverage, check-architecture (not in this brief).
- Concerns: (1) the DI commit says "not yet test-run"; it left ~21 non-kysely tsc errors and ~15 failing test files — "pure refactor" is not yet true. (2) R1's coupling test contradicted R1's own package.json decision. (3) the brief's step-6 pointer `asset-operations.ts` is under `features/theme/`, not `assistant/`.
