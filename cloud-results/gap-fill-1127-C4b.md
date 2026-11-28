PARTIAL run C4b | jobs 0/1 | tests added 177 | files 100% 38/56 | bugs 0 | left: job 13 — 2 files (assembly-phases fns 213, 221; site-import-backend merged figure not re-measured), 16 files hold only documented EXCEPTIONS

# Gap fill 2026-11-27, round 4 run C4b (Tovu website; job tv-w62-cov-web-13)

Unattended Opus run. Started 03:11 UTC; setup done 03:14; first dispatch 03:14; last dispatch 05:35; report 05:45 UTC. **Subagents run in total: 17** (13a, 13b, 13c, 13d; 13a2, 13d2, 13b2, 13c2; 13a3, 13e, 13c3, 13f; 13g, 13h; 13g2, 13h2 after the container restart; 13i). At most 4 ran at once, each in its own worktree (/home/user/wt/13a-d) on its own `c4b/<id>` branch off the current job-branch head. Whenever one returned with files LEFT, a fresh one was dispatched on the updated LEFT list (the round-3 loop). The coordinator cherry-picked every subagent commit onto `codex/tv-w62-cov-web-13` and pushed after each landing (49 pushes, all fast-forward; subagents never pushed).

**Container restart at ~05:16 UTC** killed 13g and 13h mid-run. Disk survived; no source mutation was left on disk (checked). 13g2/13h2 resumed from their uncommitted test edits, checked them, rewrote one that a mutation survived, and committed.

Not done: no RemoteTrigger, no `--no-verify`, no force-push. No guard, threshold or coverage-config edits, no ts-ignore/expect-error, no `as any`, no skips. **No production code changed**: the whole diff 13ce3ba8..head touches only test files (checked with `git diff --name-only`). No existing assertion was weakened: every `-` line was reviewed by the coordinator (imports moved to dynamic imports after `mock.module`, rig signatures, type fixes, and assertions replaced by stronger exact ones — listed below). Tests added 177 (`test(` lines added), removed 0.

**gitleaks was NOT run** (not installed; per the round-3 brief no download). Instead the coordinator grepped the whole diff for key/token/secret/password/bearer and checked it by eye: only short low-entropy fakes (`tok-a`, `key-b`, `key-c`, `test-only`, `pw-reset-7`). Run `gitleaks protect`/`detect` on the branch before merging.

"files 100%" = files at 100/100/100 lines/branches/functions excluding source-map artefacts (doc-comment / blank / type-only lines, and a lone declaration line whose function ran). 56 file rows in the table below (C3b LEFT rows + 3 files the corrected merger exposed + 2 re-checks): 38 at 100/100/100, 16 hold only documented EXCEPTIONS, 2 have work left.

## Final pushed SHAs
| job | branch | C3b head -> C4b head | commits | tests added | typecheck:tests |
|---|---|---|---|---|---|
| tv-w62-cov-web-13 | codex/tv-w62-cov-web-13 | 13ce3ba8 -> **64009b22** | 52 | 177 | 0 errors (13f on b81593f2+fixes; 13g2 and 13h2 on df3fb0b0 / 25341bb1, whole project) |

**Final check by the coordinator at the final head: all 51 test files this run changed, run together: 448 tests, 448 pass, 0 fail (99 s).** Earlier: 13e ran all 44 at 9a5c3715 together: **410 tests, 410 pass, 0 fail** (74 s). 13f ran the 39 site-deps test files + 2 boot integration tests: 175/175 pass.

## Setup (what worked)
- Node 24.22.3 from the nodejs.org tarball (sha256 checked) at /opt/node24 (not preinstalled this time).
- Jini at integ/merge-28-2026-11-26 d1ced6c5: `pnpm install --frozen-lockfile` first FAILED: better-sqlite3 rebuild hit `gyp_main.py: Permission denied` (corepack's bundled node-gyp file not executable). **Fix: `chmod +x ~/.cache/node/corepack/v1/pnpm/10.33.2/dist/node_modules/node-gyp/gyp/gyp_main.py`**, then install + `pnpm -r build` green.
- Tovu: `npm ci --ignore-scripts` (root, apps/site-chat), `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`, `tsc -p packages/contracts` and `packages/sdk`.
- Worktrees with node_modules symlinked (root, site-chat, admin, desktop) and contracts/sdk dist copied; a shared `flock` serialized heavy runs on 4 CPUs.
- Coverage: node `--experimental-test-coverage --enable-source-maps --test-coverage-include=**/<file>` over the relevant tests, every lcov SF record for the source merged.
- **New trap 1 (site-deps):** most `site-deps/*.ts` are imported only by the composition root, so "importers by basename" finds only source-scan characterization tests (they load nothing) and coverage shows "no SF record". Test sets must be listed explicitly (unit tests + boot integration tests); each figure below names its set.
- **New trap 2 (merger):** the run's first merger keyed anonymous functions by line, so two arrows on one line were summed and an uncalled one hidden; and import-only SF records (module loaded, nothing called) contribute phantom `2:1:0`/`3:1:0` branches and "uncovered" interface lines. 13f wrote a corrected merger (anonymous functions keyed by position on the line; import-only records dropped; type-only lines from the TypeScript AST). It exposed real gaps in identity-settings, provider-identity, project-keys, database-journal, route-deps-members-mail, site-sharing — all then closed or documented. Later figures use it.

## BUGs
None new. BUG-2 (packages/contracts/src/routines.ts:52) untouched. One suspected bug was cleared: the assembly-phases draft that "lost" `overrides.nativeApprovalMemory` passed the overrides in `createSiteRouteDeps`'s ignored first argument (deps.ts:67-70); the test was wrong, not production.

## For the owner to decide
1. **gitleaks** not run (see top).
2. **Collaborator `mock.module` recorders.** 13a2/13a3/13b used `mock.module` on collaborator factory modules (never the module under test), spreading the real module and recording the closures the unit hands over, then calling those closures for real (precedent: site-deps boot-phases.unit, bootstrap-reporting.unit). Confirm this fits "boundary-only mocking"; the alternative is a full boot per closure. Every module-level recorder is reset per compose (an audit found and fixed 7 that were not).
3. **Refactor candidates — unreachable code (EXCEPTION, not fake-tested):**
   - site-deps/trash-service.ts:45 `onError` closure (composeTrashService passes no `onChanged`, the only caller of onError).
   - site-deps/identity-settings.ts:201 `nowMs: () => clock.nowMs()` (identityServiceDepsFrom, inbound/admin-http/routes/users/deps.ts:100, builds its own clock from `nowIso`); also :197 recovery-storage branch reachable only by deleting `identity.recoveryCodes` (createSqliteIdentityRouteDeps always sets it) — tested that way, but a candidate.
   - site-deps/site-imports.ts:31 supervisor arm (needs TOVU_ENABLE_SITE_SWITCHER + a real localSiteSupervisorForHost spawning sites; inject the supervisor).
   - site-deps/assembly-phases.ts:312 boot-work drain while-body (a while->if mutation survives any hermetic boot; inject the drain).
   - serving-app.ts:152 `if (isLeaseOwner()) await whenInterrupted()` is unobservable: composeAssistantRoutines resolves `ready` only after the owner's bootRepaired settles (assistant-routines.ts:281/297), so line 151's await already orders it. Drop 152 or resolve `ready` earlier. (Line 151, the real barrier, is now pinned by a test.)
   - provider-plugins.ts:309 (`gatedPort` always assigns `consentAdapter` on product_analytics ports); site-import-index-state.ts:163 (prepareRetry only runs under the lock with state cutover); visitor-page-targets.ts:30 (`id === 'index'` never true: NON_ROUTABLE_THEME_PAGE_IDS); site-guide-tools.ts:119 (readSearchTopic always returns a string — give readSiteGuideInput a discriminated return type); media-bytes-deps.ts:26 (event_json is TEXT on both dialects) and :95 (read-only `unlink` stub never called); site-portability.ts:33; reset-owner.ts:43 (recoveryCodes always set, features/identity/wiring.ts:415); trash-follow-up-hooks.ts:65, :69 (Proxy non-function side).
   - Artefacts, not code: product-telemetry.ts:124 x3 (branches on the three `import()` calls, all executed); site-deps/self-hosted-update-supervisor.ts (interface only).
4. **Equivalent mutation noted:** route-deps-publish-credentials.ts:91 `kind: "vendor"` survives because Jini SourceControlCredentialSetVaultAdapter (integrations/src/vendor-credentials/vault-adapter.ts:203) ignores the kind; the test is proven with a different mutation.
5. **Pre-existing reds seen (files not touched; not fixed):** source-scan characterization tests: "index.ts main(): the content.db schema guard…", "B03 / B09 / B16: the call keeps the moved statements' place in composeSiteRouteDeps", "L1: the run calls sit where their entries sat", "L1: each run returns its keys in tip order", "H3: the calls keep their place and the root declares none of the functions"; deps-provider-plugin-boot "a project store that can't open (EACCES…)" (container runs as root); site-consent.test:138 "a receipt write failure issues no cookie…" and site-cookie-consent.errors.unit:20 (flaky: passed on rerun); install-upload-update.unit:294 "retired package cleanup failure…"; byok-google-catalog:148 "EVERY wired tool's outbound Gemini schema…" (unexpected 'agent-pause' domain); "CATALOGS_BY_DOMAIN has an entry…"; "tovu serve actually runs runBootLifecycle…" (timeout); seen under load in importer runs: "import keeps starter radio and URL form markup active…", "plugin schema failures keep kernel diagnostics private…", "two connections: thinning apply waits…", "undo reference written during apply keeps its target", "stock seed: blob hydration and the publish-content seed hash…".

## tv-w62-cov-web-13 — PARTIAL (2 files with work left)
Branch codex/tv-w62-cov-web-13, 13ce3ba8 -> **64009b22**. Landed commits (cherry-picked, in order): 97ddcccdbd, 76d0f3142f, 983b3422e0, 407292d569, 841eccf467, aa9900893e, 0168e2584c, 8cb9647540, ddb8bda4f3, 28051b51aa, 041d6a1ef0, d6650c5919, f3f58a19b2, 1e059cb761, ec67f92579, b39d96c051, 32d61b6bdc, bfde5cc128, 38f2bba427, 1f21e9850e, 1ccf842f50, b85acee8d1, 8fbbf273c8, 4c4b536ef3, dd2e800e3b, ff8b386ee8, 07dd7740bc, e66ae8dca2, 26de69014c, 5e7c5763b7, 1623b81742, e997a7bc02, 08db1c164a, 98eb6bd1e2, 9a5c371579, d3cfe0cd71, 654a2e7baf, 46fb14f5f4, 573c4e2dbb, cd9dc7169d, 664dd5c4bd, b81593f2bc, 83e798324e, f2d34209f7, 8a454f0c82, 55b7bc9bf1, 01cfb65600, 95d2078d43, bbfd98c58b, 25341bb18f, df3fb0b0af, 64009b2250.

### Coverage (L/B/F; counts excluding artefacts; test set per subagent note)
| file | before | after |
|---|---|---|
| site-deps/store-basics.ts | 38/39, 6/6, 4/6 | **100/100/100** |
| site-deps/identity-settings.ts | 200/200, 29/35, 25/28 | 100/100, F 28/29 (201 EXCEPTION) |
| site-deps/route-deps-assistant-mcp.ts | 125/130, 7/7, 6/12 | **100/100/100** |
| site-deps/after-assembly-forms-search.ts | 99/103, 5/6, 4/10 | **100/100/100** |
| site-deps/agent-plugin-bootstrap.ts | 51/54, 4/4, 3/7 | **100/100/100** |
| site-deps/shared-oauth-commerce.ts | 31/37, 3/5, 2/4 | **100/100/100** |
| site-deps/content-resolvers-comments.ts | 85/86, 2/2, 1/7 | **100/100/100** |
| site-deps/plugin-runtime.ts | 39/39, 3/3, 2/4 | **100/100/100** |
| site-deps/mail-http.ts | 94/94, 5/6, 4/8 | **100/100/100** |
| site-deps/trash-service.ts | 46/46, 2/2, 1/6 | 100/100, F 6/7 (45 EXCEPTION) |
| site-deps/pre-assembly.ts | 39/40, 6/6, 5/6 | **100/100/100** |
| site-deps/route-deps-comments-plugins.ts | 198/201, 4/4, 3/9 | **100/100/100** |
| site-deps/boot-phases.ts | 100/81.3/57.1 % | **100/100/100** |
| site-deps/route-deps-site-providers.ts | 99.1/72.7/46.7 % | **100/100/100** |
| site-deps/provider-config.ts | 96.7/75/50 % | **100/100/100** |
| site-deps/outbound-connections.ts | 100/100/80 % | **100/100/100** |
| site-deps/publish-apply.ts | 98.9/100/60 % | **100/100/100** |
| site-deps/overrides.ts | 100/86.4/100 % | **100/100/100** |
| site-deps/events-origin.ts | 98.2/42.9/100 % | **100/100/100** |
| site-deps/boot-data.ts | 99.3/100/58.3 % | **100/100/100** (with the overrides boot test) |
| site-deps/site-keys-members.ts | 100/57.1/100 % | **100/100/100** |
| site-deps/open-store.ts | 100/76/75 % | **100/100/100** |
| site-deps/assembly-phases.ts | 97.5/61.5/41.2 % | L 122/122, B 25/26, F 15/17 (LEFT fns 213, 221; 312 EXCEPTION) |
| site-deps/media-storage.ts | F 50 % (closures 57-61) | **100/100/100** (with deps boot tests for arm 51) |
| site-deps/provider-identity.ts | transaction closures at 45 | **100/100/100** (62/62, 35/35, 13/13) |
| site-deps/route-deps-publish-credentials.ts | closures 91, 93, 102 | **100/100/100** (59/59, 17/17, 14/14) |
| site-deps/route-deps-content-chat.ts | 62/120, 4/4, 3/5 | **100/100/100** |
| site-deps/site-sharing.ts | merged 112/112, 31/32, 15/17 | **100/100/100** (112/112, 40/40, 17/17) |
| site-deps/site-imports.ts | 27-35 uncovered | L 23/23, B 5/6, F 3/3 (31 EXCEPTION) |
| site-deps/database-journal.ts (exposed by merger) | 27/27, 3/3, 2/3 | **100/100/100** |
| site-deps/route-deps-members-mail.ts (exposed) | 111/111, 3/3, 2/3 | **100/100/100** |
| site-deps/project-keys.ts (exposed) | 21/21, 15/15, 6/6 with integration tests | **100/100/100** (+1 test closing an assertion gap) |
| site-deps/site-update-binding.ts (re-check) | — | **100/100/100** confirmed with all importers |
| site-deps/trash-follow-up-hooks.ts (re-check) | 100/87/100 | L 83/83, B 21/23, F 13/13 (83 form-scrub arm now tested by 13i; 65, 69 EXCEPTION) |
| site-deps/self-hosted-update-supervisor.ts | never measured | EXCEPTION: interface only |
| source-control-key-binding.ts | 98.1/96.9/100 % | **100/100/100** (all importers) |
| plugin-credential-cards.ts | 98.8/95.1/81.8 % | **100/100/100** (line 1 import artefact) |
| site-import-backend.ts | F 84.6 % (F@75, F@82) | both functions tested; merged figure not re-measured |
| serving-app.ts | 151-152 | 151 covered and pinned; 152 EXCEPTION (unobservable) |
| provider-plugins.ts | 99.6/97.1/98.8 % | 100/99.65/100 (309 EXCEPTION) |
| site-import-index-state.ts | 100/88.1/97.6 % | 100/98.99/100 (163 EXCEPTION) |
| product-telemetry.ts | 99.6/92.7/93.3 % | 99.61/97.67/100 (124 x3 artefact) |
| site-paths.ts | 99.7/92.3/100 % | **100/100/100** (37 non-spawning importers) |
| retention-policies/database-copies.ts | 100/87.5/100 % | **100/100/100** |
| retention-policies/media-bytes-deps.ts | 100/91.8/90.9 % | 100/98.2/95.5 (26, 95 EXCEPTION) |
| visitor-page-targets.ts | 89.7/80/77.8 % | 100/90.5/100 (30 EXCEPTION) |
| site-guide-tools.ts | 100/92.2/100 % | 100/98.25/100 (119 EXCEPTION) |
| site-cookie-consent.ts | 98.4/89.5/87.5 % | **100/100/100** (8 importers) |
| retention.ts | 100/100/95 % | **100/100/100** |
| publish-content-manifest.ts | 100/80/100 % | **100/100/100** |
| publish-content-seed-hash.ts | 100/100/87.5 % | **100/100/100** |
| site-import-backfill.ts | — | 100/100/100 already (SKIPPED-ALREADY-COVERED) |
| site-portability.ts, reset-owner.ts | B 94.1 / 91.7 % | unchanged: only EXCEPTIONS (33; 43) |
| storage-secret.ts:102, vault-boot.ts 327-328/348 | — | earlier EXCEPTIONS, untouched |

### LEFT (exact)
- site-deps/assembly-phases.ts fn 213 (pre-assembly.ts:74 `embedConsentOff`, reached only by a plugin export render) and fn 221 (route-deps-assistant-mcp.ts:175 `applyAccess`, reached only when an external MCP OAuth connect completes).
- site-import-backend.ts: merged figure over all importers not re-measured after F@75/F@82 tests.

### Tests added, each with the mutation that turned it red (applied, red, restored; source diff empty)

#### 13a
13a (c4b/13a: efa37bc3, a3f76c74 -> landed 407292d5, 0168e258). 18 tests, 5 new files. 100/100/100: store-basics.
store-basics 38/39,6/6,4/6 -> 39/39,8/8,6/6; trash-service 46/46,2/2,1/6 -> 46/46,7/7,5/6; route-deps-comments-plugins 198/201,4/4,3/9 -> 198/201,9/9,6/9; route-deps-assistant-mcp 125/130,7/7,6/12 -> 125/130,11/11,9/12; shared-oauth-commerce 31/37,3/5,2/4 -> 36/37,9/10,3/4; after-assembly-forms-search 99/103,5/6,4/10 -> 99/103,6/7,5/10 (fn 142 via existing search-plugin-activity test).
Measured: create-site-route-deps-boot-options.integration (before) + 5 new unit tests + search-plugin-activity.unit (after).
Mutations: trash-service: randomUUID->fixed id; .finally(invalidate) removed (x2); `!== null`->`=== null`; store-basics: log prefix changed; tag [tool-audit]->[audit]; shared-oauth-commerce: inventory({})->inventory({all:true}), re-check throw removed; route-deps-comments-plugins: providerPlugins.reapply removed; defaultProvider->undefined; .bind(deps.commerceCatalog) removed; workspaceId pinned at composition time; route-deps-assistant-mcp: optional args overridden in routeDeps().set; formCollectionProviders dropped; workspaceId->"site-x". Not mutation-proven (pin exact errors): trash-service "no registered adapter", "restore consults policy"; shared-oauth-commerce "no shared OAuth service", "binds site identity".
EXCEPTION: trash-service.ts:45 onError closure unreachable (composeTrashService passes no onChanged) — refactor candidate.

#### 13a2
13a2 (c4b/13a2: 6af27d355d, 4d6dbe145d, 695aa445cc, 05c60ebf46, 3613583e8d, 360f0d3f51, 44a9a598c7, 884bdf3edd, a62761db55). 57 tests in measured set pass; touched files typecheck clean. 9 files -> 100/100/100.
Set: create-site-route-deps-boot-options.integration + site-deps/__tests__/{store-basics, trash-service, route-deps-comments-plugins, route-deps-assistant-mcp, shared-oauth-commerce, search-plugin-activity, agent-plugin-bootstrap, plugin-runtime, pre-assembly, mail-http, identity-settings, after-assembly-forms-search}.unit.
identity-settings 200/200,29/35,25/28 -> 200/200,42/42,28/28; route-deps-assistant-mcp 125/130,11/11,9/12 -> 130/130,16/16,14/14; after-assembly-forms-search 99/103,6/7,5/10 -> 103/103,12/12,10/10; agent-plugin-bootstrap 51/54,4/4,3/7 -> 54/54,9/9,7/7; shared-oauth-commerce 36/37,9/10,3/4 -> 37/37,14/14,4/4; plugin-runtime 39/39,3/3,2/4 -> 39/39,5/5,4/4; mail-http 94/94,5/6,4/8 -> 94/94,11/11,8/8; pre-assembly 39/40,6/6,5/6 -> 40/40,11/11,6/6; route-deps-comments-plugins 198/201,9/9,6/9 -> 201/201,16/16,9/9.
Method: mock.module recorders for collaborator factories (precedent boot-phases.unit, bootstrap-reporting.unit); module under test never mocked; shared-oauth-commerce.unit and route-deps-comments-plugins.unit switched static import -> dynamic import after the mocks (no existing assertion changed). Owner may want to confirm collaborator mocks fit "boundary only".
Mutations: agent-plugin-bootstrap: productTracker fresh tracker; resolveDeps {}; pluginHost getter undefined; family "agent-plugin"->"theme"; no-host throw removed. plugin-runtime: productTracker fake; outbox()->{}. pre-assembly: Error message->String(error); String(error)->"unknown"; warn added on success; `=== true`->Boolean(...); ->false. mail-http: .email->.name; caller workspaceId->own; outbox args dropped; notifyRosterChanged replaced; override spread removed. shared-oauth-commerce: ?? 'owner'->'client'; workerOwner forced true; :memory: ternary removed; `projectSiteId ||` removed; observability dropped; send options dropped. identity-settings: list returns []; save no-op; :memory: early return removed; creationTimeZone ternary forced; siteDir dropped from name / timezone; each half of `db || store` removed; error message changed. route-deps-comments-plugins: routeDeps() copied; `themeId === undefined`->truthy; consentAudit spread removed; runExportSite options copied; tool_audit code changed; diagnostic re-wrapped. route-deps-assistant-mcp: ...optional dropped; themes []; workspaceId changed; activeThemeId ""; `.ready` negated; workspaceId pinned "site-7"; withTempRoot dropped; applyAccess -> agentPluginMcp.applyAccess. after-assembly-forms-search: loop over slice(1); allSettled->all; message dropped; ignore caller workspace; contributions replaced; sealer swapped; sessions repo swapped.
Refactor candidate: identity-settings.ts:197 recovery-storage branch reached only by deleting identity.recoveryCodes before identityReady (createSqliteIdentityRouteDeps always sets it).

#### 13a3
13a3 (c4b/13a3: f8fd13cfba, a8d77f5ed6, 193d3d9d54). 100/100/100: site-deps/content-resolvers-comments.ts (85/86,2/2,1/7 -> 86/86,10/10,7/7; new content-resolvers-comments.unit alone). serving-app.ts 151-152 covered (new serving-app-routine-boot.integration: real SQLite site, routines eligible, real lease; records whether routine beacon exists when chat repair runs).
Method: wireCoreResolvers / createCommentsModule / createCommentsCapability as mock.module recorders spreading the real modules; closures run against real media resolution, menu page-target resolver, comment target lookup, in-memory SQLite kernel.
Mutations: eager formCollectionProviders() read (x2 tests); mediaRepo undefined; mediaContentTypeStore undefined; post repo -> findById null; `=== true` -> `!== false`; posts.findById -> null; entityId: id -> ws; commentsCapability: commentsModule. serving-app: line 151 barrier removed; isLeaseOwner -> () => false.
EXCEPTION: serving-app.ts:152 `if (isLeaseOwner()) await whenInterrupted()` unobservable: composeAssistantRoutines resolves ready only after the owner's bootRepaired settles (assistant-routines.ts:281/297); non-owner whenInterrupted already resolved. Line 151 is the real barrier (pinned). Refactor: drop 152 or resolve ready before boot repair.

#### 13b
13b (c4b/13b: 69918846 boot-phases.unit; 25104d5a 9 unit files — boot-data, events-origin, open-store, outbound-connections, overrides, provider-config, publish-apply, route-deps-site-providers, site-keys-members; those 9 NOT mutation-proven nor typechecked by 13b -> handed to 13b2).
Before -> after: boot-phases 100/81.3/57.1 -> 100/100/100 (own unit test); route-deps-site-providers 99.1/72.7/46.7 -> 100; provider-config 96.7/75/50 -> 100; outbound-connections 100/100/80 -> 100; publish-apply 98.9/100/60 -> 100; overrides 100/86.4/100 -> 100; events-origin 98.2/42.9/100 -> 100; boot-data 99.3/100/58.3 -> 100 (with create-sqlite-route-deps-overrides.integration); site-keys-members 100/57.1/100 -> 100/90/100; open-store 100/76/75 -> 100/86.4/93.8; assembly-phases 97.5/61.5/41.2 unchanged.
boot-phases mutations (all red): storage phase routeDeps:()=>lifecycleTracker(); workspaceId:()=>settingsRepo(); contentTypeRepo:()=>entryRepo; activeTraceparent:()=>undefined; entryRefsRepo:()=>entryRepo; trash-adapters assetBlobRepo:()=>mediaRepo(); trash-service postRepo:()=>mediaRepo(); formCollectionProviders:()=>routeDeps(); mediaContentTypeStore:()=>postRepo(); console.error prefix dropped; bindSharedApiOAuth:()=>undefined; `?? Promise.resolve(["x"])`; providerRevisions({siteId: workspaceId}); reapply({}); readSite workspaceId ""; pending.slice(0); capture(input, undefined); chat instrumentStorageKernel removed; trace-parent activeTraceparent:()=>undefined; publishContentBundleRepo: undefined. Disposal-order swap unproven (script no-op).
EXCEPTION: site-deps/self-hosted-update-supervisor.ts is interface-only (no runtime code).
Open question: assembly-phases integration — createSiteRouteDeps with overrides.nativeApprovalMemory returned deps.nativeApprovalMemory undefined (possible bug or wrong test) -> 13b2 to investigate.

#### 13b2
13b2 (c4b/13b2: bc67a66759 type fixes, e20074ccf3 assembly-phases.integration, f480d3e635 open-store, ce16482d8a site-keys-members, 652710e9d2 audit fixes). Typecheck: no errors in its files.
assembly-phases draft was WRONG, not production (no BUG): overrides go in createSiteRouteDeps's 2nd argument (deps.ts:67-70); rewritten as 4 tests.
open-store 99.3/70.4/93.8 -> 100/100/100 (open-store.unit + characterization); site-keys-members 100/90/100 -> 100/100/100 (33:3:0 siteBinding?.dir was real, now tested); assembly-phases 97.5/61.5/41.2 -> 97.5/95.2/64.7 (assembly-phases.integration alone).
All 30 of 13b's tests proven red under >=1 mutation (B1, E1-E4, O1-O2, C1, V1-V6, P1-P4, A1-A2, R1-R7, K1-K3; list in /home/user/wt/scratch/13b2/m1.py); no padding, nothing deleted.
New mutations: assembly-phases.integration: remove nativeApprovalMemory / approvalIdentityForRun / outboundTestOrigins spread (each); drop .trim(); `trim() || undefined` -> trim(); outboundTestOrigins spread always applied; staticSiteContext readDeps reads boot-time siteDisplayName; bindCredentialsHostPorts readDeps {}; publish-credentials getter other workspace; siteName -> workspaceId; beforeStoreClose drain registration removed. open-store.unit: siteDir: overrides.siteBinding?.dir -> undefined; in-memory anchor `false ?`; drop `overrides?.db !== undefined ||`; onError no-op; drop `await opened.close()`; sqliteOpen not passed through. site-keys-members.unit: drop siteDir: siteBinding?.dir. events-origin.unit (strengthened: full origin port 8443 source workspace-setting; warning text): configured branch if(false); warn message replaced. Recorders reset per compose in publish-apply, route-deps-site-providers, boot-phases (re-proved A1, R2, R7).
assembly-phases.ts LEFT: lines 346-349; fns 213 (plugin-export embedConsentOff), 220 (preferences write), 221 (external-MCP onConnected), 242 (exportSiteBound), 345/351 (analyticsExcluded / isExcluded need analytics on + valid consent receipt); branch 312:11:0 drain while-loop body (while->if mutation survived a draft test, so dropped; refactor: inject the boot-work drain).
Pre-existing reds: "index.ts main(): the content.db schema guard…"; "B16: the call keeps the moved statements' place in composeSiteRouteDeps" (site-keys-members.characterization).

#### 13c
13c (c4b/13c: 8bd06799, 7efd37a0, b9d0eb24, 4d4e2d69). 100/100/100: source-control-key-binding.ts (all importers L106/106 B70/70 F21/21).
plugin-credential-cards 98.8/95.1/81.8 -> 98.8/100/100 (line 1 import artefact); media-storage F50 -> F 8/8 (media-storage.unit only; B 10/11, 51 overrides.uploadsDir arm taken by deps boot tests); provider-identity: both transaction closures at 45 covered (unit only F10/12; other 2 fns from deps-provider-plugin-boot.integration); site-import-backend F@75, F@82 tested; route-deps-publish-credentials closures 91, 93, 102 tested.
Mutations: media-storage: wrapFetch returns fetchFn untracked (57); workspaceId()->"x" (60); bundledContributionSources->()=>[] (59); workspaceId()->"" (61). provider-identity: withAttachedProject transaction dropped (45); replaceRepo transaction dropped (45). canonical-credential-lifecycle: NotFound translation/rethrow -> return undefined (107-108); `?? null` -> `?? {length:0,last4:null}` (79). plugin-credential-cards: default readFile returns '{}' (44); default loadContributions no items (52). site-import-backend: readJsonAt throws (82); authority log ()=>{} (75). route-deps-publish-credentials: 2 tests NOT mutation-verified by 13c (planned l.91 kind->"vendor", l.93 workspaceId->"ws-a") -> handed to 13c2.
EXCEPTION: site-imports.ts:31 supervisor arm (needs TOVU_ENABLE_SITE_SWITCHER + a real local-site supervisor spawning a site process). Artefacts media-storage.ts:1, plugin-credential-cards.ts:1.

#### 13c2
13c2 (c4b/13c2: e542f35880, ee14b87073, 0953799541, 5a9d3e12aa). 100/100/100: site-deps/route-deps-content-chat.ts (62/120,4/4,3/5 -> 120/120,10/10,9/9; set: 3 existing route-deps-content-chat.* tests + new .trash.unit).
site-imports.ts (site-imports.unit): L 23/23, B 5/6, F 3/3 (31:4:0 supervisor arm EXCEPTION). site-sharing.ts (site-sharing.unit alone): B 23/27 -> 25/28, F 11/16 -> 12/16 (fn 78, l.131 peer-success now covered; fns 81, 82 and l.107 not-ok arm left).
Typecheck: fixed media-storage.unit l.55 (wrapFetch possibly undefined) and 3 errors in the new trash test.
Mutations: route-deps-publish-credentials.unit "each fall back": l.91 source-control half built with VendorCredentialSetVaultRepo({vault,kind:"vendor",vendor:true}); l.102 repo: () => projectVault!.repo ("kind: vendor" alone is EQUIVALENT: Jini SourceControlCredentialSetVaultAdapter vault-adapter.ts:203 ignores kind). "saving workspace": l.93 workspaceId "ws-a". site-imports.unit (expected name "portable": import-backend.ts:143 displayName ?? verified.name; archive name "Portable"): l.33 drop encodeURIComponent; l.34 report logs nothing; l.31 no-supervisor arm returns running; l.26 if(true). route-deps-content-chat.trash.unit: l.93 COMMENT->POST; l.101 REDIRECT->MEDIA; l.103 bindRemoveEntity instead of bindWidgetRemoval; l.110 POST->MEDIA; l.119 work() without trashTransaction; l.120 entityPolicy false; l.123 map snapshotted at assembly; l.113 caller deps spread last; l.129 postGoLiveCandidates undefined; l.127 db: trashRegistry; l.77 siteBackupSanitize dropped; l.155 clock read once. site-sharing.unit: l.78 now: () => Date.now(); l.131 httpClient: guardedOutboundHttpClient; l.131 apiKey "stale".
EXCEPTION: site-imports.ts:31 supervisor arm (needs TOVU_ENABLE_SITE_SWITCHER + real localSiteSupervisorForHost + spawned sites; refactor: inject the supervisor).
Pre-existing reds: route-deps-content-chat.characterization "L1: the run calls sit where their entries sat", "L1: each run returns its keys in tip order".

#### 13c3
13c3 (c4b/13c3: ce9a571529). site-sharing.ts -> 112/112, 40/40, 17/17 (merged: site-sharing.unit + site-share-wiring.integration + site-sharing.characterization.unit; merged before 112/112, 31/32, 15/17).
Tests: site-share-wiring.integration "a backup share packs the booted site's theme and bundled plugin package without bundled-file credential warnings" (real createSiteRouteDeps, seeded vercel plugin, backend.create backup, verifySiteImport: theme bytes, mcp.json byte-equal, plugins [agent, vercel], no warnings) -> l.81 createBundledFilePolicy -> "scan" (labeled-secret warning appears); l.82 themesDir -> uploadsDir (theme missing). site-sharing.unit "a saved object store whose credential does not resolve is skipped…" -> l.107 `return resolved;` (revoke no longer rejects).
Pre-existing red: "H3: the calls keep their place and the root declares none of the functions" (site-sharing.characterization.unit).

#### 13d
13d (c4b/13d: 264f6ddb, cf1be17e, 99bc0f06, c3b8dcb2, f82414ef, 5978421c -> landed 983b3422, 8cb96475, ddb8bda4, 28051b51, 041d6a1e, d6650c59). typecheck: no errors in touched files (exit not captured). After-figures NOT re-measured by 13d (expected from mutation-proven branches) — re-measured by 13d2.
SKIPPED-ALREADY-COVERED: site-import-backfill.ts.
Before -> expected after: site-paths 99.7/92.3/100 -> 100 (364 artefact); database-copies 100/87.5/100 -> 100; media-bytes-deps 100/91.8/90.9 -> br26, fn95 left; visitor-page-targets 89.7/80/77.8 -> :30 index branches left; site-guide-tools 100/92.2/100 -> 119 left; site-cookie-consent 98.4/89.5/87.5 -> 100; retention 100/100/95 -> 100; publish-content-manifest 100/80/100 -> 100; publish-content-seed-hash 100/100/87.5 -> 100; product-telemetry 99.6/92.7/93.3 -> 124 x3, 247, fns 145, 151 left.
Mutations: site-path-resolvers.unit: drop `|| dbPath === ""` (177); `if(false)` (330); drop isInMemoryDbPath early return (331); `false ?` at 350 + mode 0o755; delete first refuse(...) (356). database-copies: delete `if (signal.aborted) break`. media-bytes-deps: drop status clause; drop sha clause; drop payload check (79); drop storageKeys clause; drop Array.isArray; stat `{size: size as number}`. visitor-page-targets.unit: drop occupied/auth/standalone filters, label change; drop tier check; drop reserved check; matched||refused -> each operand alone. site-guide-tools: drop conflict throw; drop alias note. site-cookie-consent-deps.unit: ignore legacy region header; skip trim. site-cookie-consent.test: ignore isExcluded; default true. retention.test: drop policyId. publish-content-manifest.unit (new): return null; always refuse. product-telemetry.unit: new Error(''); stack undefined; unguarded dispose; warn?.(); `?? false`. seed-hash.load-deps.unit: drop diagnostic.
EXCEPTION candidates: visitor-page-targets.ts:30 (index always excluded by NON_ROUTABLE_THEME_PAGE_IDS); site-guide-tools.ts:119 (search always has topic; type-narrowing guard); site-portability.ts:33 (rethrow only if early read fails while restore succeeds — code comment says restore fails first); reset-owner.ts:43 (createSqliteIdentityRouteDeps always sets recoveryCodes, wiring.ts:415); media-bytes-deps.ts:26 (event_json always string: jsonText column); media-bytes-deps.ts:95 (read-only unlink stub, never called); product-telemetry.ts:247 (default loadProductProviders failure swallowed into identical noop outcome); product-telemetry.ts:124 (dynamic-import line branches, likely artefact).
Reds seen in untouched importers (some load-timing): "retired package cleanup failure keeps the published update...", "import keeps starter radio and URL form markup active...", "plugin schema failures keep kernel diagnostics private...", "two connections: thinning apply waits...", "undo reference written during apply keeps its target", "CATALOGS_BY_DOMAIN has an entry...", "tovu serve actually runs runBootLifecycle..." (timeout), "stock seed: blob hydration and the publish-content seed hash...", 11 spawned `tovu serve` tests (~20 s each) in the provider-plugins importer run.

#### 13d2
13d2 (c4b/13d2: 52a3a1af89, d0c3a67519, 5e355070f6, ffb91ac401, e697730825, 242a1a008e, 1971c60d88). typecheck: no errors in touched files.
provider-plugins 99.6/97.1/98.8 -> 100/99.65/100 (set: provider-plugins.unit, plugin-runtime.provider-plugins, provider-live-enable.integration, provider-settings-required.unit, provider-config-source.unit; branch 309 EXCEPTION). site-import-index-state 100/88.1/97.6 -> 100/98.99/100 (import-history-mode.integration; branch 163 EXCEPTION). product-telemetry -> 99.61/97.67/100 (fns 145, 151 and line 247 now covered; 124 x3 artefact).
Re-measured (verified): 100/100/100 database-copies, retention, publish-content-manifest, publish-content-seed-hash, site-paths (37 non-spawning importers; 364 declaration artefact), site-cookie-consent (8 importers; 52 artefact). media-bytes-deps 100/98.2/95.5 (br 26, fn 95 EXCEPTION); visitor-page-targets 100/90.5/100 (line 30 EXCEPTION); site-guide-tools 100/98.25/100 (119 EXCEPTION).
Mutations: provider-plugins.unit: remove failed() at 310; rethrow at 310; remove failed() at 315; 193 return true->false; 472 if(false); 390 ?? "restart"; 469 default no-op; 383 [item]. import-history-mode.integration: 142 if(false); 97 !isFile dropped; 97 destination check dropped; 109 always throws; 111 directory check dropped; 111 mode check dropped; 109 === "EEXIST"; 68 returns file; 69 directory as file; 69 other as file; 85/86 each of four kinds -> "file"; 223 finished: true. product-telemetry.unit: 145 no longer throws; 151 info removed; 151 info logs to console (standalone plugin test fixture extended with content.read capability + opt-in probeHost input); 247 options.loadProviders!; 120 default resolver throws. visitor-page-targets.unit: each filter clause on line 31 removed. site-guide-tools.test: 132 options -> {}.
EXCEPTIONS: provider-plugins.ts:309 (gatedPort always assigns consentAdapter on product_analytics ports); site-import-index-state.ts:163 (prepareRetry only reached under lock with current always cutover); product-telemetry.ts:124 x3 (import() transpile artefacts; run in default-loader test); visitor-page-targets.ts:30; site-guide-tools.ts:119 (readSearchTopic always returns a string — refactor: discriminated return type); media-bytes-deps.ts:26, :95; site-portability.ts:33; reset-owner.ts:43.
Reds in untouched files: site-consent.test:138 "a receipt write failure issues no cookie…"; site-cookie-consent.errors.unit:20 "consent failures retain redacted diagnostics…"; install-upload-update.unit:294 "retired package cleanup failure…"; byok-google-catalog:148 "EVERY wired tool's outbound Gemini schema…" (unexpected 'agent-pause' domain); route-deps-content-chat.characterization "L1: …" scans.

#### 13e
13e verify+audit (c4b/13e: cd59bdeaac, db29165ac7). All 44 changed test files together at 9a5c3715: 410 tests, 410 pass, 0 fail (74 s). tsc tests: exit 2, 7 errors all in this run's files: 3 its own (fixed db29165ac7), content-resolvers-comments.unit (76) (fixed by 13a3 193d3d9d54), route-deps-content-chat.trash.unit (91, 149) (fixed by 13c2 5a9d3e12aa).
Fixes: trash-service.unit restore test now asserts adapter unhide exact args; mail-http.unit "guarded client is built" now asserts the built client refuses https://10.0.0.1 with EgressRefusedError + exact message (red when line 118 createClient returns an unguarded client); module-level recorders reset per compose in mail-http, agent-plugin-bootstrap, pre-assembly. 16 tests before/after (none added or deleted).
Reported for other files: never-reset recorders in content-resolvers-comments, publish-apply, boot-phases, route-deps-site-providers; events-origin weak assertions (scheme/host only; warn count only); open-store "closing the store closes it" never checks close; trash.unit chat.close() not in t.after; site-import-backend.unit real clock Date.now() + redundant assert.ok.

#### 13f
13f (c4b/13f: 67f4fc61ad). Full tsconfig.tests.json typecheck: 0 errors (at 67f4fc61 = b81593f2 + its commit).
content-resolvers-comments.unit: clearRecordings() per compose (mutation: wireCoreResolvers guarded to run once per process — 4/8 red before, 7/8 after). trash.unit chat.close -> t.after. site-import-backend.unit: firstIndexedWriteAt fixed literal 1_800_000_000_000 (mode.ts:36,43,53 needs only a safe integer > 0); redundant assert.ok removed (authority log ()=>{} still red).
Table: one run of 39 site-deps test files + 2 integration tests: 175/175 pass. 31/42 runtime site-deps files at 100/100/100 excl. artefacts on that set. Found lcov-merge.mjs keyed anonymous functions per line and summed two on one line -> hid gaps (identity-settings:201, provider-identity:45#2, project-keys:32#2, site-sharing). Better merger: /home/user/wt/scratch/13f/merge2.mjs.

#### 13gh
13g/13g2 (c4b/13g: 2bb2a23b80, e136d2918b, 523cfb381e; 13g killed by the container restart at ~05:16, 13g2 resumed from its uncommitted edits). Whole-project tsc tests: 0 errors.
100/100/100: database-journal.ts (27/27,3/3,2/3 -> 27/27,4/4,3/3), provider-identity.ts (62/62,34/34,12/13 -> 62/62,35/35,13/13), route-deps-members-mail.ts (111/111,3/3,2/3 -> 111/111,4/4,3/3), project-keys.ts (21/21,15/15,6/6 — already covered by deps-provider-plugin-boot / other-site-keys integration tests; new test closes an assertion gap: providerUsage replaced by a constant survived before). Set: unit tests for identity-settings, provider-identity, project-keys, boot-phases, database-journal, route-deps-members-mail + deps-provider-plugin-boot, other-site-keys, create-site-route-deps-boot-options, create-sqlite-route-deps-overrides integration.
Mutations: database-journal.unit: inFlightRestorePointIds({workspaceId}) -> {workspaceId:"site-other"}; route-deps-members-mail.unit: getter captures registry at assembly; provider-identity.unit (2 tests): allowed: async () => true; keyId: credentialId -> siteId; project-keys.unit: providerUsage constant; reapply -> async () => "now"; providerUsage passed {pluginId:"other"}.
EXCEPTION: identity-settings.ts:201 anon#1 `nowMs: () => clock.nowMs()` unreachable: identityServiceDepsFrom (inbound/admin-http/routes/users/deps.ts:100) builds its own clock from nowIso. Refactor: pass only nowIso, or use deps.clock.nowMs.
Pre-existing red: deps-provider-plugin-boot "a project store that can't open (EACCES…)" (container runs as root).

13h/13h2 (c4b/13h: 6390190e26, d3bfd47980; 13h killed by the restart, 13h2 resumed and rewrote its uncommitted test because a snapshot mutation survived it). tsc tests 0 errors.
assembly-phases.ts -> L 122/122, B 25/26, F 15/17 (assembly-phases.integration alone); 6390190e26 covered 346-349, 242, 345, 351; d3bfd47980 covers 220.
Mutations: line 220 routeDeps copied once and reused; line 220 stale set. (6390190e26's mutations: see 13h commit; not reported because 13h was killed.)
LEFT: assembly-phases fn 213 (pre-assembly.ts:74 embedConsentOff — needs a plugin export render), fn 221 (route-deps-assistant-mcp.ts:175 applyAccess — needs an external MCP OAuth connect). EXCEPTION: 312 drain while-body (refactor: inject the boot-work drain).
Re-measured with all importers (merge2): site-update-binding.ts 29/29, 20/20, 6/6 = 100/100/100; trash-follow-up-hooks.ts L 83/83, B 20/23, F 13/13 (65, 69 EXCEPTIONS; 83:19:0 form scrub reachable -> 13i).
Pre-existing red: boot-phases.unit "B09: the call keeps the moved statements' place in composeSiteRouteDeps" (source scan).

#### 13i
13i (c4b/13i: c0c5f280df). trash-follow-up-hooks.integration "purging a trashed form scrubs the delivery jobs planned under that form id: answers blanked, unfinished job failed" (job for a submission id with no submission row, so only the {formId} scrub reaches it; pending/null/{email} -> failed/"delivery-failed"/{}) -> line 83 `entityType === "form"` -> `"never"` (red). trash-follow-up-hooks.ts B 20/23 -> 21/23 (merge2 over that file + form-file-cleanup.integration); left 65, 69 EXCEPTIONS.

