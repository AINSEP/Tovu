# deps-split — design for splitting Tovu `composition/deps.ts` (SEQUENCE H1 steps 3-5, unblocks error-system E3)

Run: design run 2026-11-18, branch `plan/design-deps-split-2026-11-17` (from `origin/refactor/terra` `ada11733`).
Facts base: Tovu `origin/refactor/import-cycle-b` **`f0613d9e`** = `origin/refactor/terra` + import-cycle-b merged (fast-forward: `git merge-base origin/refactor/terra origin/refactor/import-cycle-b` = `ada11733`, terra is 0 commits ahead).
Inputs: `origin/refactor/import-cycle-b:cloud-results/import-cycle-b.md` §"SEQUENCE H1", `origin/plan/reconcile-2026-11-16:reconcile/SEQUENCE.md` §H1, `origin/plan/size-designs-2026-11-16:size-designs/01-tovu-composition-deps.md` (rev 2) and `02-tovu-composition-app.md`, `origin/plan/error-system-design-2026-11-16:designs/error-system/DESIGN.md` §4 row E3, owner decisions `2026-11-17-OWNER-DECISIONS-ANSWERED.md`, the 47 lessons (`reconcile/LESSONS-FOR-DESIGN-BRIEFS.md`).

**Relationship to size design 01.** Design 01 rev 2 was measured on `integ/wave-b-r2` (3,168 lines, closure 1081-3066). Since then 132 lines left the file and most of the closure became one-line calls into existing composition helpers (`storeBoundServicesFor`, `composePluginRuntime`, `startSettingsRegistration`, …). Every line number, count and slice range in design 01 is stale. This document **supersedes design 01 for execution**: it keeps design 01's accepted rules (root owns order and mutable cells; later bindings as getters; five late contracts kept apart; literal as ordered contiguous runs; no `LateRef`; file keeps its name) and re-derives every fact on `f0613d9e` with committed scripts.

All facts below are produced by these commands (Tovu root, after `npm ci`; outputs committed in `work/`):

```bash
node designs/deps-split/work/closure-census.cjs .      > designs/deps-split/work/closure-census.tsv   # 215 statements of composeSiteRouteDeps
node designs/deps-split/work/literal-keys.cjs .        > designs/deps-split/work/literal-keys.tsv     # 260 literal properties + 15 post-assembly writes
node designs/deps-split/work/module-census.cjs .       > designs/deps-split/work/module-census.tsv    # 308 imports + 37 module statements
node designs/deps-split/work/deps-importers.cjs . --rows > designs/deps-split/work/deps-importers.tsv  # importers by symbol + text-only mentions
npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs apps/website/src/server/runtime/composition/deps.ts  # owner limits as errors
```

## 1. What `deps.ts` holds today (census on `f0613d9e`)

### 1.1 Size

| measure | value | command |
|---|---|---|
| physical lines | 3,036 | `wc -l apps/website/src/server/runtime/composition/deps.ts` |
| import declarations | 308, lines 1-414 (four of them after the re-export, 411-414) | `head -1 work/module-census.tsv` |
| code lines (eslint, blanks+comments skipped) | 1,910 | `work/limits-base.txt` line "File has too many lines (1910)" |
| `composeSiteRouteDeps` | lines 954-2934, 1,195 code lines, 215 top-level statements | `head -1 work/closure-census.tsv`; limits-base |
| other function over 50 | `configureSiteSharing` 2837-2912, 68 code lines | limits-base |
| statements over 50 code lines inside the closure (not functions) | `trashFollowUpHooks` Map 1391-1458 (62), `publishContentApplyPort` 2013-2076 (58), the `routeDeps` literal 2134-2714 (373) | `awk -F'\t' '$3>40' work/closure-census.tsv` |
| debt rows | `size-debt.json:1258` (`<file>`, value 1926) and `:1265` (`composeSiteRouteDeps#1`, 1199); `error-gate-debt.json:2238` (`catch-reads-error`, 2) | `grep -n 'composition/deps.ts' development/scripts/{size-debt,error-gate-debt}.json` |

### 1.2 Exports and importers (symbol-aware)

`work/deps-importers.tsv`: **68 files** import `deps.ts` statically or dynamically (5 production/tooling, 63 test/support); 167 more mention the path as text.

| export (line) | prod importers | test importers | destination |
|---|---|---|---|
| `export { builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir, siteDir, type SitePathResolverOptional } from "./site-paths.js"` (398) | `src/index.ts` (`defaultContentDbPath`, `siteDir`), `development/scripts/backfill-slug-collision-defaults.ts:79` (`builtInThemesDir`) | 7 rows (`grep -P '\t(import)\t.*(builtInThemesDir|defaultContentDbPath|mediaUploadsDir|siteDir)' work/deps-importers.tsv`) | **deleted** (owner rule: no re-export shells). Importers import `./site-paths.js` by symbol; mixed imports split |
| `CreateSiteRouteDepsOverrides` (424) | 0 | 1 (`deps-observability-wiring.integration.test.ts:10`) | `site-deps/overrides.ts` |
| `createSiteRouteDeps` (830) | 4 (`cli/commands/{export,serve,serve-listen}.ts`, `src/index.ts`) | 57 | stays |
| `siteIdentityFor` (903) | 0 | 1 (`deps-provider-plugin-boot.integration.test.ts:15`) | `site-deps/provider-identity.ts` |
| `createSiteRouteDepsForWorkspace` (3004) | 0 | 5 | stays |

Two base facts found by the census:
- `development/scripts/__tests__/site-plugin-directories.test.mjs:11` imports `pluginsInstallDir` **from `deps.ts`, which does not export it** (it lives in `site-paths.ts:301`; `grep -n 'pluginsInstallDir' apps/website/src/server/runtime/composition/deps.ts` shows only the call at 1106). The file is not in `npm test`'s globs (only three named `.mjs` files are), so it is a dead red test. Sheet S1 repoints it to `site-paths.ts` and runs it once (`node --import tsx --test development/scripts/__tests__/site-plugin-directories.test.mjs`).
- `app.ts` **no longer imports `deps.ts`** (`grep -n "deps.js'\|/deps\"\|composition/deps" apps/website/src/server/runtime/composition/app.ts` → only the unrelated `newsletter/deps.js` type import at 111). The comment block 399-410 ("closes the `deps.ts` <-> `app.ts` cycle") and `.dependency-cruiser.mjs:104` describe a cycle that no longer exists. The comments move verbatim (why-comment gate); the stale claim is listed for the coordinator, not rewritten inside a move.

Source-reading consumers (break when code moves even though they import nothing; lesson 45). Command: `grep -rnE "composition/deps\.ts|\"deps\.ts\"|DEPS_PATH|DEPS_SOURCE" apps development .dependency-cruiser.mjs | grep -E "__tests__|\.test\.|development/"`:

| consumer | what it anchors | handled in |
|---|---|---|
| `server/__tests__/unit/composition-boot-order.unit.test.ts:113,146,183` | prelude order inside `createSiteRouteDeps`/`openCompositionStore`; awaits after the first boot promise **by exact text** (4 lines); "no `db` identifier in the body" | S3 (prelude helpers), S5-S13 (each stage repoints its anchors; the 4-await list becomes a per-file list) |
| `platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts:38-40,265-266` | `deps.ts` text contains the orphan warning call | S5 |
| `server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts:127` | parses `deps.ts` with ts | stays valid (`createSiteRouteDepsForWorkspace` stays); re-run each sheet |
| `server/__tests__/integration/production-readiness-boot.integration.test.ts:168` | `compositionReferences(deps.ts, app.ts)` | S2 makes it read `deps.ts` + `site-deps/**` |
| `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts:164` | exact list of files calling `.formSubmissionsAutoPull` | S12 (list entry `deps.ts` → `site-deps/slices/forms.ts`) |
| `server/runtime/composition/__tests__/wiring-identity.test.ts:213` | `BASELINE_OWNER_FILES` names `deps.ts` as the one owner of `createTovuAgentPluginLifecycle(` | S5 (entry swapped, count stays 11) |
| `server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts:164` | `deps.ts`, `app.ts` in a forbidden-import list | S2 adds `site-deps/` prefix |
| `development/scripts/__tests__/dependency-cruiser.test.ts:29` | path list | S2 |
| `development/scripts/check-capability-inventory.ts:20` | **gate tool** reads `deps.ts` text for capability names (`npm run check:inventory`) | S2 reads `deps.ts` + `site-deps/**` |
| `server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:20` | dynamic import URL of `deps.ts` | stays valid |
| `cli/__tests__/unit/serve-command-wiring.unit.test.ts:196` | `mock.module` of the `deps.ts` path (own package) | stays valid (path kept) |

### 1.3 The closure grouped by domain (statement index → code lines)

Statement indices are rows of `work/closure-census.tsv` (column 1). "Comment lines above a statement travel with it." `await` = a top-level await in the closure today.

| # | domain | statements | code lines | awaits | makes (used later) |
|---|---|---|---|---|---|
| A1 | lifecycle buffer (root cells) | 1-2 | 962-963 | | `pendingLifecycleEvents`, `let lifecycleTracker` |
| A2 | agent-plugin bootstrap: inventory, site binding, layouts, lifecycle owner, MCP presets, themes dir + seeding | 3-11 | 964-989 | | `assistantAgentInventory`, `resolvedSiteBinding`, `agentPluginLayout`, `agentPluginLifecycle`, `federatedMcpPresetRegistry`, `skillLayout`, `resolvedThemesDir` |
| A3 | media storage: uploads dir, media-credential promise, object-store ports, blob store | 12-17 | 992-1019 | | `kernel`, `resolvedUploadsDir`, `mediaCredentials`, `provideMediaCredentials` (let), `mediaStorePorts`, `blobStore`, `mediaIsRemoteByEnv`, `isMediaRemote` |
| A4 | store prelude: store-bound services, workspace id, trust revocations, chat orphans, media providers, search backfill, clock/ids, tool-audit reporter, activation repo | 18-31 | 1022-1087 | 19, 20, 23, 25 | `storeBound`, `workspaceId`, `publishTrustRevocations`, `chatDbPath`, `chat`, `mediaProviders`, `postSearchBackfillReady`, `clock`, `idGen`, `reportToolAuditError`, `pluginActivationRepo` |
| B1 | plugin runtime | 32-33 | 1091-1115 | | `let routeDepsBuiltForPluginHost`, `pluginRuntime` |
| B2 | identity + settings registration + site title chain (12 `ensure*` links) | 34-46 | 1119-1184 | | `identity`, `settingsPrincipals`, `adminPasswordResetReady`, `presentationRepo`, `settingsRepo`, `settingsReady`, 6 `*Ready`, `siteTitlePreservationStore`, `siteDisplayName`, `siteTimeZone`, `siteTitleSettingsDeps`, `siteSettingsReady`, `siteTitleReady` |
| B3 | serialized boot data chains: menus, newsletter, comments module install, media transform, seed blob hydration | 47-55 | 1192-1284 | | `menuRepo`, `navLocationBindingRepo`, `menuBindingsReady`, `newsletterListRepo`, `newsletterReady`, `commentsReady`, `transformDefinitionRepo`, `mediaTransformReady`, `blobHydrationReady` |
| C1 | events + verified origin | 56-63 | 1293-1355 | | `outbox`, `bus`, `REPO_ROOT`, `devCapabilityScheme`, `originBoot`, `originReady`, `originRegistry` (hoisted `registerBootOrigin`) |
| C2 | redirect + rendition repos | 64-66 | 1356-1365 | | `redirectRepo`, `redirectHitSink`, `assetRenditionRepo` |
| C3 | trash: registry, repo, follow-up hooks, adapters, service, removers | 67-81 | 1369-1546 | | `trashRegistry`, `sqliteTrashDb`, `trashRepo`, `taxonomyFollowUp*`, `formDeliveryRepo`, `trashFollowUpHooks`, `pluginTrashAdapter`, `trashAdapters` (Map, mutated by G2), `trashTransaction`, `trash`, `removePlugin`, `removeUser`, `isInTrash` |
| C4 | redirects write deps + 3 store-close registrations | 82-85 | 1548-1584 | | `redirectsWriteDeps` |
| D1 | database journal + ledger/migrations/restore points | 86-95 | 1589-1614 | | `databaseJournal*`, `databaseLedgerRepo`, `migrationRunsRepo`, `publishContentRunRepo`, `restorePointsRepo`, `dbOps`, `databaseIntrospection` |
| D2 | content repos (entries, taxonomy, widgets, refs, forms, content types) | 96-108 | 1621-1644 | | 12 repos + `let formCollectionProviders` (105) |
| D3 | core widget resolvers (process-global registry) | 109 | 1652-1669 | | — |
| D4 | comments module + capability | 110-111 | 1670-1693 | | `commentsModule`, `commentsCapability` |
| E1 | site keys, members, newsletter keyring, assistant keyring/sealer | 112-120 | 1701-1789 | | `runtimeMode`, `siteDirForKeyring`, `siteKeySourcesList`, `memberRepo`, `newsletter*`, `siteAssistantSecretKeyring`, `siteAssistantSecretSealer` |
| E2 | vault normalization, assistant credentials, external MCP, site references | 121-126 | 1795-1821 | 121 | `siteAssistantCredentialRepo`, `externalMcpServerRepo`, `externalMcpOAuthDevices`, `siteReferenceRepo`, `projectKeyReferences` |
| E3 | provider config + custom credentials | 127-130 | 1822-1843 | 127 | `savedProviderConfig`, `projectId`, `projectVault`, `projectStore`, `projectSiteId`, `providerConfigSource`, `customCredentialSetRepo` (hoisted `compositionCustomCredentials`) |
| E4 | provider plugins boot, dispose registration, project keys, provider-revision watch | 131-136 | 1844-1882 | 131 | `providerPlugins`, `let bindSharedApiOAuth` (133), `projectKeys` (hoisted `compositionProjectKeys`) |
| E5 | observability binding (writes 2 root cells, 1 process-global) | 137-143 | 1883-1890 | | `observability`, `tracker`, `aiTraceSink` |
| F1 | mail | 144-146 | 1901-1922 | | `mailResolveDeps`, `resolvedMailer`, `mailDurableOutboxReady` |
| F2 | content HTTP clients | 147-150 | 1930-1957 | | `customCredentialsHttpClient`, `siteBackupHttpClient`, `outboundTestOrigins`, `mediaImportHttpClient`, `publishContentPeerHttpClient` (hoisted `composeContentHttpClients`) |
| G1 | content + publish stores, owner form-file protection | 151-161 | 1964-1998 | 155 (`if (owner) await protectExistingFormFiles`) | `postRepo`, `changeSets`, `mediaRepo`, `assetBlobRepo`, `mediaContentTypeStore`, `publishContent*` |
| G2 | theme roster, theme trash adapter (**mutates `trashAdapters`**), `removeTheme` | 162-166 | 2001-2012 | | `siteThemes`, `themeTrashAdapter`, `removeTheme` |
| G3 | publish apply port | 167 | 2013-2076 | | `publishContentApplyPort` |
| H1 | guarded outbound client, MCP OAuth ports, public origin | 168-171 | 2079-2098 | | `guardedOutboundHttpClient`, `externalMcpOAuthHttpPorts`, `derivedPublicOrigin` |
| H2 | agent-plugin connections (**root writes `bindSharedApiOAuth`** at 173), admin surfaces refresh | 172-174 | 2101-2117 | | `agentPluginConnections`, `adminSurfaceHandlersReady` |
| H3 | readiness + SEO + route-deps promise + consent readiness + plugin exports + agent MCP | 175-182 | 2119-2133 | | `siteAppBootWork`, `seoDeps`, `sitemapService`, `let resolveRouteDeps`, `routeDepsBuilt`, `siteConsentReady`, `pluginExports`, `agentPluginMcp` |
| L | the `routeDeps` literal | 183 | 2134-2714 | | 260 properties (`work/literal-keys.tsv`) |
| I1 | resolve + legacy widget adoption | 184-186 | 2715-2735 | | `widgetAdoptionReady` |
| I2 | forms: submissions, destination, pull, delivery | 187-192 | 2740-2765 | | 6 `routeDeps.*` writes |
| I3 | site search | 193 | 2772-2784 | | `routeDeps.siteSearch` |
| I4 | commerce (+ hoisted `compositionSharedOAuth`, used **by the literal** at 2267) | 194-199 | 2788-2815 | | `commerceBinding` |
| I5 | plugin host: boot-work map, host, **root writes `routeDepsBuiltForPluginHost`** (202), runtime attach, boot drain, media credentials | 200-205 | 2817-2832 | | — |
| I6 | site sharing (68-line hoisted fn), site imports | 206-210 | 2834-2929 | | `savedKeys` |
| I7 | consent + analytics | 211-213 | 2930-2932 | 213 | — |

Module-level code outside the closure (`work/module-census.tsv`, column "uses-module-decls" = its callers' graph):

| group | declarations (lines incl. comments) | users |
|---|---|---|
| overrides | `CreateSiteRouteDepsOverrides` 417-503, `assertOverridesPairedOrAbsent` 504-520, `pluginFailureThresholdOverride` 521-533, `resolveThemesDirOverride` 551-560, `resolveSiteBindingOverride` 561-570, `compositionApprovalOverrides` 644-650, `resolveWorkspaceIdOverride` 760-771 | root, A2, A4, B1, literal |
| store opening | `hydrateContentDbIfNeeded` 534-550, `prepareCompositionStorage` 651-659, `StoreCloseRegistration` 660-666, `openCompositionStore` 667-721, `resolveChatDbPath` 722-732, `startOwnerSweeps` 733-751, `startOwnerChatExpirySweep` 752-759 | `createSiteRouteDeps`, A4 (`resolveChatDbPath`) |
| provider identity | `providerPluginBoot` 844-848, `composeProviderConfig` 849-871, `credentialProject` 872-884, `acceptedSiteId` 885-891, `siteIdentityFor` 892-908, `projectStoreFor` 909-928 | E3, E4, test |
| single-user helpers | `resolveSiteBackupSources`+`readTovuVersion` 571-604 (literal), `createSiteDisplayNameSource` 605-618 + `compositionSiteDisplaySources` 2935-2947 (B2), `compositionSiteKeySources` 619-643 (E1), `applyAdminPasswordResetFromEnvIfConfigured` 772-821 (B2), `logMediaProviderRefusals` 929-936 (A4), `AgentPluginIdentityAdmission`+`agentPluginIdentityAdmission` 937-947 (A2), `flushLifecycleEvents` 2948-2954 (E5), `compositionConsentOptions` 2955-2964 (literal), `configureVisitorConsentAnalytics` 2965-2975 (I7) | one each (verify: `grep -c '<name>(' deps.ts` = definition + 1 call) |
| module singleton | `consoleLogger = createConsoleLogger({ prefix: "" })` 416 | 8 uses: 1056, 1202, 1220, 1236, 1259, 1282, 2726, 2730 (`grep -n consoleLogger deps.ts`) |

### 1.4 Construction order and late-bound reads

The closure is not a pipeline. `closure-census.cjs` column "forward(late)" lists reads of a binding that a **later** statement declares; every one is inside a nested function (column "deferred"; none in "eager" — `awk -F'\t' '$9!="" {print $1, $9}' work/closure-census.tsv`, and the eager column of row 183 holds only the hoisted `compositionSharedOAuth`). Making any of them an ordinary argument evaluates it in the TDZ at boot (lesson 3).

| reader (stmt, lines) | reads later | declared at | contract today (kept) |
|---|---|---|---|
| 7 lifecycle owner 978-985 | `lifecycleTracker` (let), `routeDeps` | 963 / swap 1887; 2134 | buffer-then-swap; `routeDeps` closure read (TDZ throw if early) |
| 16 `mediaStorePorts` 1006-1018 | `observability`, `workspaceId`, `settingsRepo`; awaits `mediaCredentials` | 1883, 1032, 1132; promise 1005 resolved 2831 | closure reads inside a lazily called port; **awaited promise** never "too early" |
| 33 `pluginRuntime` 1092-1115 | `routeDepsBuiltForPluginHost` (let), `contentTypeRepo`, `outbox` | 1091 set 2819; 1643; 1293 | **optional**: `getPluginHost()` returns `undefined` during provider boot; `deferDeclaredContentTypePorts({ build })` |
| 74 follow-up hooks 1391-1458 | `mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps` | 1977, 1964, 1978, 1635, 2134 | closure reads inside hooks |
| 76 adapters 1464-1515, 78 `trash` 1520-1532, 110 comments 1670-1689 | `mediaRepo`, `entryRefsRepo`, `postRepo`, `assetBlobRepo` | as above | closure reads |
| 109 `wireCoreResolvers` 1652-1669 | `mediaRepo`, `mediaContentTypeStore`, `postRepo`, `routeDeps`, `formCollectionProviders` (let) | 1977, 1981, 1964, 2134; 1637 swap 1884 | closure reads; **fallback-then-swap** (empty registry until providers boot) |
| 135 `compositionProjectKeys` 1863-1877 | `bindSharedApiOAuth` (let) | 1858, set 2113 | **domain error**: "Shared connections are not available yet. Reopen this saved connection and try again." |
| 145 mailer 1910-1918 | `mailDurableOutboxReady` | 1922 | closure read |
| 162-166 themes 2001-2012 | — | — | **mutates** `trashAdapters` (Map from 1464) after `siteThemes` exists; `removeTheme` needs `trash` (1520) |
| 180 consent readiness 2125-2130 | awaits `routeDepsBuilt` | promise 2123, resolved 2715 | **awaited promise** |
| 181 plugin exports 2131 | `routeDeps` | 2134 | closure read |
| literal 2134-2714 | `routeDeps` (9 keys: 2255, 2267, 2632, 2640, 2644, 2645, 2710, 2712, 2713) | itself | closure reads inside arrows |

### 1.5 Shared mutable state

| cell | kind | writer(s) | readers | owner after split |
|---|---|---|---|---|
| `pendingLifecycleEvents`, `lifecycleTracker` | closure `const` + `let` | 963, 1887 (swap), 1888 (flush) | A2 (`productTracker`), B1 | root |
| `routeDepsBuiltForPluginHost` | `let` | 2819 | B1 `getPluginHost` | root |
| `formCollectionProviders` | `let` | 1637, 1884 | D3, literal 2486 | root |
| `bindSharedApiOAuth` | `let` | 1858, 2113 | E4 `bindOAuth` | root |
| `resolveRouteDeps` / `routeDepsBuilt` | `let` + promise | 2122-2123, resolved 2715 | H3 consent readiness | root |
| `provideMediaCredentials` / `mediaCredentials` | `let` + promise | 1004-1005, resolved 2831 | A3 `mediaStorePorts` | A3 slice result (the resolver is returned; I5 calls it) |
| `trashAdapters` | `Map` | 1464; `.set(THEME_ENTITY_TYPE)` 2010 | `trash` service | C3 slice result; G2 receives it and calls `.set` verbatim |
| `siteAppBootWork` | `Set` | 2119; app boot work adds | I5 drain 2829 | H3 result |
| `routeDeps` | object, **15 writes after assembly** (`grep -P '\twrite\t' work/literal-keys.tsv`: 2735, 2747-2749, 2755-2756, 2772, 2813-2814, 2818, 2822, 2862, 2909, 2922, 2930) | root + I slices | everyone | root; I slices receive it as a value (it exists by then) |
| `consoleLogger` | **module** singleton in `deps.ts:416` | — | 8 uses | stays the one module line; passed down as input `logger` (no slice builds its own; E3 count stays 17) |
| `siteAppBootWorkByDeps` | **module** `WeakMap` in `site-app-boot-work.ts` | I5 (2817) | `app.ts` | unchanged; module-identity pin `sqlite-create-site-app-module-identity.integration.test.ts` |
| server-log trace reader | **process-global** `let traceIds` in `platform/server-logs/index.ts:37` | E5 `setServerLogTraceReader` (1886) | log buffer | unchanged, called once at the same position |
| widget core resolvers | **process-global** registry in `@jini-ai/cms/widgets` | D3 `wireCoreResolvers` (1652) | renderers | unchanged, called once at the same position |

The split adds **no** module-level cell: every new file declares only functions and types (S-gate command `grep -nE '^(let|const|var) ' apps/website/src/server/runtime/composition/site-deps -r` must print nothing except `const` function-free literals listed in the sheet).

## 2. Target split

### 2.1 Files (every file ≤500 code lines, every function ≤50 code lines, complexity ≤10)

```
server/runtime/composition/
  deps.ts                       imports (≈40) + consoleLogger (416, kept) + createSiteRouteDeps + composeSiteRouteDeps (root, ≤50)
                                + createSiteRouteDepsForWorkspace (+ its comment 2976-3003). Imports of createApp/exportSite stay
                                LAST here (module evaluation order, §4 R5) and are passed down as values.             ≈190
  site-paths.ts                 (existing) — gains nothing; the re-export at deps.ts:398 is deleted
  site-deps/
    overrides.ts                overrides group (§1.3)                                                                 ≈160
    open-store.ts               store-opening group                                                                    ≈150
    provider-identity.ts        provider-identity group                                                                ≈110
    stages/                     one function per stage: calls its slices in today's order, returns their merged results
      foundation.ts  A1-A4 · boot-data.ts B1-B3 · events-trash.ts C1-C4 · content-data.ts D1-D4 · keys-providers.ts E1-E4 ·
      mail-http.ts F1-F2 · publishing.ts G1-G3 · connections.ts H1-H3 · after-assembly.ts I1-I7                       ≤60 each
    slices/                     one responsibility per file; helpers with ONE user travel into that user's file
      agent-plugin-bootstrap.ts A2 (+agentPluginIdentityAdmission) · media-storage.ts A3 · store-prelude.ts A4 (+chat-orphan
      warning as a module fn, +logMediaProviderRefusals) · plugin-runtime-boot.ts B1 · identity-settings.ts B2 (+applyAdminPassword…,
      +compositionSiteDisplaySources, +createSiteDisplayNameSource) · boot-chains.ts B3 · events-origin.ts C1 (+registerBootOrigin)
      · redirect-media-repos.ts C2 · trash-follow-ups.ts C3a (stmts 67-74, 4 fns §2.4) · trash-adapters.ts C3b (75-76, 3 fns) ·
      trash-service.ts C3c (77-81) · redirects.ts C4 · database-journal.ts D1 · content-repos.ts D2 · core-resolvers.ts D3 ·
      comments.ts D4 · site-keys.ts E1 (+compositionSiteKeySources) · assistant-secrets.ts E2 · provider-config.ts E3
      (+compositionCustomCredentials) · provider-plugins.ts E4 (+compositionProjectKeys) · observed-stores.ts E5 (+flushLifecycleEvents)
      · mail.ts F1 · content-http-clients.ts F2 · content-stores.ts G1 · themes.ts G2 · publish-apply.ts G3 (2 fns) ·
      outbound-origin.ts H1 · agent-connections.ts H2 (2 fns) · readiness.ts H3 · widget-adoption.ts I1 · forms.ts I2 ·
      site-search.ts I3 · commerce.ts I4 (+compositionSharedOAuth) · plugin-host.ts I5 (2 fns) · site-sharing.ts I6a (5 fns) ·
      site-imports.ts I6b · consent-analytics.ts I7 (+configureVisitorConsentAnalytics)                               ≤150 each
    route-deps/
      context.ts                type SiteRootContext = { stage results…, late getters, createApp, exportSite, overrides, dbPath, logger }
      assemble.ts               spreads the runs in literal order; returns NewsletterRouteDeps & ByokToolSurfaceDeps
      <run>.ts × ≈15            ordered contiguous runs of the literal (§2.5), each one function ≤50 code lines
  guarded-outbound-http.ts      the guarded client both roots build (design 02 §2.5); created in S11; the memory root's
                                `memory-deps/slices/outbound-http.ts` (on base) is repointed in the same commit
```

No file under `site-deps/` imports `app.ts`, `deps.ts` or another slice's **function**; a slice may import another slice's **result type** (`ReturnType<typeof composeX>`), never call it. Stages import slices; the root imports stages, `route-deps/assemble.ts`, `open-store.ts`, `overrides.ts`. Graph is a tree: `deps.ts → stages → slices`, `deps.ts → route-deps → (types of stages)`. `npm run check:boundaries` `no-circular` (warn) gets no new row.

### 2.2 The root after the split (shape; the sheets fix exact text)

```ts
async function composeSiteRouteDeps({ dbPath, opened }: ComposeInput, { overrides = {} }: ComposeOptional = {}) {
  const pendingLifecycleEvents: PendingLifecycleEvents = [];                       // A1, today 962
  let lifecycleTracker: LifecycleCapture = bufferingTracker({ pending: pendingLifecycleEvents });  // today 963 (inline arrow kept)
  let routeDepsBuiltForPluginHost: PluginHostHolder | undefined;                     // today 1091
  let formCollectionProviders = () => createFormCollectionRegistry({});              // today 1637 (pure arrow; moved up, nothing reads it earlier)
  let bindSharedApiOAuth: BindSharedApiOAuth | undefined;                            // today 1858 (undefined until H2; moved up)
  let resolveRouteDeps!: (deps: RouteDeps) => void;                                  // today 2122-2123 (promise creation moved up;
  const routeDepsBuilt = new Promise<RouteDeps>(resolve => { resolveRouteDeps = resolve; });  //  nothing awaits it before H3)
  const late = { routeDeps: () => routeDeps, lifecycleTracker: () => lifecycleTracker, pluginHost: () => routeDepsBuiltForPluginHost?.pluginHost,
    formCollectionProviders: () => formCollectionProviders(), bindSharedApiOAuth: () => bindSharedApiOAuth,
    settingsRepo: () => bootData.settingsRepo, observability: () => keys.observability, publishing: () => publishing,
    contentData: () => contentData, eventsTrash: () => eventsTrash, routeDepsBuilt };
  const foundation = await composeFoundationStage({ opened, dbPath, logger: consoleLogger, late }, { overrides });
  const bootData = await composeBootDataStage({ foundation, dbPath, logger: consoleLogger, late }, { overrides });
  const eventsTrash = composeEventsTrashStage({ foundation, bootData, opened, late });
  const contentData = composeContentDataStage({ foundation, bootData, eventsTrash, dbPath, opened, late });
  const keys = await composeKeysProvidersStage({ foundation, bootData, eventsTrash, opened, late }, { overrides });
  formCollectionProviders = () => keys.providerPlugins.formCollectionProviders?.() ?? createFormCollectionRegistry({});  // today 1884
  setServerLogTraceReader({ traceIds: () => keys.observability.activeTraceIds?.() });                                 // today 1886
  lifecycleTracker = keys.tracker;                                                                                     // today 1887
  bindObservedStores({ pending: pendingLifecycleEvents, tracker: keys.tracker, kernel: foundation.kernel, chat: foundation.chat, observability: keys.observability });  // 1888-1890
  const mailHttp = composeMailHttpStage({ … }, { overrides });
  const publishing = await composePublishingStage({ … }, { overrides });
  const connections = composeConnectionsStage({ …, late }, { overrides });   // returns agentPluginConnections; H2's 173 below
  …                                                                           // (see §2.3 for the three root writes in H2/I5)
  const routeDeps = assembleSiteRouteDeps({ foundation, bootData, eventsTrash, contentData, keys, mailHttp, publishing, connections, late,
    overrides, dbPath, createApp, exportSite, logger: consoleLogger });
  resolveRouteDeps(routeDeps);                                                                                         // today 2715
  await composeAfterAssemblyStage({ routeDeps, …, late, setPluginHostDeps: … });   // §2.3
  return routeDeps;
}
```

`late.*` getters close over root `const`s declared further down (`routeDeps`, `bootData`, `keys`, `publishing`, …): reading one too early throws the same `ReferenceError` class as today; only the binding name in the message changes (`publishing` instead of `mediaRepo`). That is the one visible diagnostic change (programming-error path only), as accepted in design 01 §5 row 10.

### 2.3 Wiring order and the three root writes inside later stages

Order is today's statement order, stage by stage (§1.3). Three root cells are written **between** statements of a stage today; exact order is kept by splitting that stage's slice into two functions and doing the write in the root (or the stage) between them:

| write (today) | before | after | how |
|---|---|---|---|
| `lifecycleTracker = tracker` 1887, `formCollectionProviders = …` 1884, `setServerLogTraceReader` 1886 | E4 (providers boot) | 1888-1890 | root does 1884, 1886, 1887 in that order (3 lines, above); `bindObservedStores` does 1888-1890 |
| `bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind` 2113 | 2101-2112 | 2115-2117 (admin-surface refresh **starts async work** that may resolve shared OAuth) | `connections` stage = `composeAgentConnections` (172) → stage returns; root writes 173; root calls `refreshAdminSurfaces` (174) and H3 `composeReadiness`. Root lines +3 |
| `routeDepsBuiltForPluginHost = routeDeps` 2819 | 2817-2818 (boot-work map, `pluginHost`) | 2822 `pluginRuntime.attachEnabledPluginsAtBoot()` (may call `getPluginHost()` synchronously) | `plugin-host.ts` exports `attachPluginHost` (2817-2818) and `startPluginRuntime` (2822-2832); `composeAfterAssemblyStage` takes `required.markPluginHostReady: () => void` — the root passes `() => { routeDepsBuiltForPluginHost = routeDeps; }` — and calls it between the two. This is the only write callback; it closes over the root's own cell, so write authority stays in the root (lesson 20) |

If the root exceeds 50 code lines after S13 (`npx eslint … deps.ts` reports `composeSiteRouteDeps`), the fallback is fixed now so no executor improvises: H2's three lines (173 write, 174 call, H3 call) move into `composeConnectionsStage` with `required.setBindSharedApiOAuth: (bind) => void` built by the root the same way as `markPluginHostReady`.

### 2.4 Function limits inside slices (in-place splits first, S4)

| today (lines) | code | becomes |
|---|---|---|
| `trashFollowUpHooks` Map 1391-1458 | 62 | `snapshotMediaRepo({ mediaRepo, assets })` (1397-1408) · `snapshotPostRepo({ postRepo, posts })` (1409-1413) · `formAttachmentPurger(required)` (`prepareRemoval` body 1393-1424) · `composeTrashFollowUpHooks(required)` (the Map) |
| `trashAdapters` Map 1464-1515 | 43 | `mediaTrashAdapter(required)` (1469-1483) · `userTrashAdapter(required)` (1484-1503) · `composeTrashAdapters(required)` (Map + registry entries 1507-1514) — under 50 today, split because two entries are 15-20-line closures and the stage must stay ≤60 |
| `publishContentApplyPort` 2013-2076 | 58 | `publishContentPorts(required)` (`ports` object 2026-2071) · `composePublishContentApplyPort(required)` |
| `configureSiteSharing` 2837-2912 | 68 | `shareHostKit(required)` (2849-2859) · `shareStaticSite(required)` (2864-2874) · `shareDelivery(required)` (2875-2905) · `configureSiteSharing(required)` (try/catch, registry, backend) |
| hoisted `Record<string, never>` / no-arg functions: `warnCompositionChatOrphans` 1044, `registerBootOrigin` 1328, `compositionCustomCredentials` 1838, `compositionProjectKeys` 1863, `composeContentHttpClients` 1936, `resolveCompositionPublicOrigin` 2092, `compositionSharedOAuth` 2788, `compositionCommerce` 2803, `configureSiteSharing` 2837, `configureSiteImports` 2915 | — | each becomes a module function `(required, optional = {})` with its real inputs, **called at the same position**. Late reads stay getters: `compositionProjectKeys` gets `getBindSharedApiOAuth`; everything else it reads exists before its call (closure-census "eager" column of the calling statement) |

Every moved function takes `(required, optional = {})` (owner rule); positional `createSiteRouteDeps(_required = {}, { dbPath, overrides })` is existing API with 61 callers and is not changed.

### 2.5 The literal as ordered contiguous runs

Runs are cut at existing blank/comment group boundaries (`work/literal-keys.tsv` column 5) and spread in file order, so key order, initializer evaluation order and overwrite precedence (`...identity` 2376 then `principalRepo`/`removeUser`/`isInTrash` 2377-2381; `...agentPluginConnections` 2282; `...compositionConsentOptions` 2292; `...resolvedMailer.operations` 2414; `...bindCredentialsHostPorts` 2712) are identical by construction. First key of each run (S13 regenerates exact lines; a run over 50 code lines is cut again at its next boundary):

`site-trash` 2135 · `posts-chat` 2183 · `settings-assistant` 2209 · `external-mcp` 2252 · `readiness-consent` 2284 · `site-binding` 2301 · `observability-providers` 2343 · `identity-redirects-members` 2376 · `mail-menus-webhooks` 2401 · `media-newsletter` 2441 · `forms-taxonomy-db` 2485 · `tools-comments` 2533 · `plugins` 2575 · `publish-content` 2601 · `export-site-app` 2623 (receives `createApp`, `exportSite` from the context — no import of `app.ts`) · `deploy-credentials` 2649 · `clients-static` 2700.

Each run is `export function <run>RouteDeps(required: SiteRootContext, _optional = {})` returning one object literal; `assemble.ts` declares its return type `NewsletterRouteDeps & ByokToolSurfaceDeps`, so a dropped key is a compile error there. Pattern and naming follow the memory root's fragments (`origin/wave2/size02-step5:apps/website/src/server/runtime/composition/memory-deps/route-deps/assemble.ts`); result types are **not** shared between the two roots (design 02 §2.5).

## 3. H1 steps 3, 4, 5 and what E3 needs

| H1 step | requires | status on `f0613d9e` (command) | this design |
|---|---|---|---|
| 3 — R8a step 5 use line for `composition/jini-daemon-runtime.ts` "if ready, otherwise waits for 6" | that no daemon lane still needs to add a line to `deps.ts` | **satisfied by absence**: R8's Tovu binding landed in `server/inbound/assistant/{agent-daemon-scope,daemon-runtime-ports}.ts`; `git diff --name-only $(git merge-base origin/wave2/daemon-r8 f0613d9e) origin/wave2/daemon-r8 -- apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/runtime/composition/app.ts` prints nothing; same for `wave2/daemon-r7` (both touch only `composition/modules/assistant.ts` or a `modules/__tests__` file inside `composition/`); `ls apps/website/src/server/runtime/composition/jini-daemon-runtime.ts` → absent | nothing to do; sheet S0 re-runs the command (STOP if it prints a file) |
| 4 — freeze → size 01 (`deps.ts`) | `deps.ts` frozen for every other lane; size-02 step 6 needs a shared `guarded-outbound-http.ts` (size 01 step 6) | not started: 3,036 lines | sheets S0-S13 (this design replaces size 01). The freeze check is in INDEX §"Freeze" |
| 5 — size-02 steps 4-7 (memory root; `createRouteDeps` joins `memory-route-deps.ts`) → unfreeze | memory root slices + literal fragments + `createRouteDeps` moved out of `app.ts` + shared guarded client | **partial**: `memory-deps/slices/` exists on base; literal fragments are on open branch `origin/wave2/size02-step5` (`73d5d31a`, not merged); `createRouteDeps` still at `app.ts:216` (`grep -n 'export function createRouteDeps' apps/website/src/server/runtime/composition/app.ts`); `memory-route-deps.ts` is 10 lines | not designed here (owned by size-02). Dependency both ways is one file: S11 creates `guarded-outbound-http.ts` and repoints the memory root's copy, which **exists on the base** (`git ls-files apps/website/src/server/runtime/composition/memory-deps/slices/outbound-http.ts` prints it) |

**What E3 needs to start** (error-system DESIGN §4 row E3: "one catalog + one reporter in the Tovu composition root; one host logger factory replaces the 17 bare `createConsoleLogger` calls and passes `diagnostics`; must not read a reporter at module scope"):

1. H1 steps 4 and 5 merged (unfreeze) — E3 edits `deps.ts`/`app.ts` and SEQUENCE forbids that during the freeze.
2. In `deps.ts`: one module line builds the logger (`deps.ts:416` today, kept) and **every** slice that logs receives it as `required.logger` (S5-S12). E3 then replaces that one line with the host logger factory call and adds the reporter beside it; no slice changes. Proof command after S13: `grep -rn 'createConsoleLogger' apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/runtime/composition/site-deps` prints exactly one line (deps.ts).
3. The 17-call inventory is unchanged by the split: `grep -rn 'createConsoleLogger(' apps/website/src --include=*.ts | grep -v __tests__ | grep -vc '\.test\.'` = 17 before and after (S-gate).
4. A typed insertion point for the reporter: `SiteRootContext` and every stage's `required` carry `logger`; E3 widens the same field set with `reporter` in `route-deps/context.ts` and the stage input types (one type, not 30 signatures).
5. E2 present: `refactor/error-e0-e2` is merged into the base (`git merge-base --is-ancestor origin/refactor/error-e0-e2 f0613d9e` → exit 0).

## 4. Risks and pins

| # | risk | pin (fails when the risk happens) | sheet |
|---|---|---|---|
| R1 | a late read becomes eager (TDZ at boot) | `late.*` getters only; new `site-root.late-contracts.pin.test.ts`: (a) project-key `bindOAuth` before H2 rejects with the exact "Shared connections are not available yet…" text, (b) `getPluginHost()` is `undefined` inside a fake `overrides.bootProviderPlugins`, (c) lifecycle events captured before provider boot reach the fake tracker in order, (d) form resolvers answer from the empty registry before provider boot, (e) `mediaStorePorts().resolveSharedCredential` awaits until after-assembly | S0 |
| R2 | key dropped/reordered or overwrite precedence changes | `site-root-route-deps-shape.pin.test.ts`: `Object.keys(routeDeps)` in order + `typeof` per key against a committed snapshot (`createSiteRouteDeps({}, { dbPath: ":memory:" })`); behaviour checks: user removed via `routeDeps.removeUser` is found by `routeDeps.isInTrash` (the `...identity` versions would not); `removePlugin`/`removeTheme`/`removeMember` go through `routeDeps.trash` | S0 |
| R3 | boot order / awaits shift (SQLite writes serialized by promise chains) | `composition-boot-order.unit.test.ts` keeps every assertion, repointed per moved anchor; the "4 awaits after the first boot promise" assertion becomes "the awaits of each stage file, in stage order, concatenate to the same 4 lines plus the stage calls"; new `site-root.boot-chains.pin.test.ts` records `settingsRepo` definition writes (12 `ensure*` in order) and that `installCommentsDataModule` starts after the newsletter install settles | S0, each stage |
| R4 | lazy init contracts merge (optional vs fallback vs domain error vs promise) | R1 tests, one per contract; sheets forbid a shared helper | S0 |
| R5 | module evaluation order changes (`app.ts`, `exportSite` evaluated earlier) | `createApp`/`exportSite` imports stay the last imports of `deps.ts`; `site-deps/**` never imports `app.ts` (`grep -rn "app.js\"\|features/site-export" apps/website/src/server/runtime/composition/site-deps` prints nothing); `no-first-party-require.boundary.test.ts`, `site-export-real-composition` tests | S13 |
| R6 | a process-global write is duplicated or reordered | `setServerLogTraceReader`, `wireCoreResolvers`, `siteAppBootWorkByDeps.set` each appear once under `composition/` excluding memory root (`grep -rn` per name, counted in the sheet); module-identity integration test | S8, S9, S12 |
| R7 | teardown: store closes before registrations/boot drains | `create-site-route-deps-failure-release.integration.test.ts`, `sqlite-shutdown.integration.test.ts` stay green; S0 adds the recording-store test of design 01 §4 ("teardown lifetime", via `overrides.store`/`onStoreOpened`/`bootProviderPlugins`/`openProjectStore`) | S0 |
| R8 | tests/tools that read `deps.ts` text go red elsewhere (lesson 45) | every sheet runs the 11 consumers of §1.2 + `npm run check:inventory`, not only touched files | all |
| R9 | concurrent lanes edit `deps.ts` | freeze check (INDEX) before every sheet; D0c's one import line lands first | all |
| R10 | an undefined identifier survives a move (seen on `refactor/size-tovu`) | both tsc configs + the route tests per commit | all |
| R11 | why-comments lost | `npm run check:why-comments` per commit; review with `git diff --color-moved=zebra` | all |
| R12 | Postgres/PGlite variants not runnable here | `create-site-route-deps.postgres.test.ts` needs Postgres; record "not run" per sheet; PGlite variant runs | all |

## 5. Owner rules check

| rule | how |
|---|---|
| no package above domains; packages state a contract, Tovu wires it | composition stays in Tovu; nothing moves to Jini; no new package |
| no re-export shells / forwarders | `deps.ts:398` deleted, importers repointed (S1); no `export … from` in `site-deps/**` (gate grep) |
| ports / DI, no module-level singletons | stages/slices take values + named getters; zero new module cells (§1.5 grep); logger passed in |
| API args `(required, optional = {})` | every moved function; 10 hoisted functions get real inputs (§2.4); two positional exceptions are existing API (listed) |
| no `vi.mock` of another package's internals | tests use `overrides` seams and interface fakes; website tests run on `node --test` (no vitest) |
| functions ≤50, complexity ≤10, files ≤500 | `work/limits.eslint.config.mjs` per commit on every touched file |
| why-comments move | `check:why-comments` per commit |
| every commit green; characterization first | S0 before any move; gates "no new line beyond the base output" (lesson 44) |

## 6. Lessons applied (1-47)

1 graph not line ranges: §1.3/1.4 from census; slices follow statement groups, late reads via getters. 2 inventory: §1.2, §1.3, §1.5, `work/*.tsv`. 3 late reads: §1.4. 4 inputs/outputs/owners first: §1.5, §2.3. 5 migration graph: INDEX order + per-sheet prerequisites. 6 failing-capable pins: §4. 7 distinct contracts: R1/R4. 8 limits inside files: §2.4 + eslint per commit. 9 host binding stays in Tovu: §5. 10 lanes as prerequisites + path-keyed debt: INDEX overlap table; debt rows recomputed by `check:size`, never re-keyed. 11 real seams/commands: `tsconfig.json`/`tsconfig.tests.json`, `node --test` with tsx. 12 behavioural port compatibility: getters keep call-time reads; no signature changes of called features. 13 security gates: `guardedOutboundHttpClient` policy literal moves verbatim, pinned by `toEqual` in S11. 14 streaming: n/a (no stream route here). 15 owner constraints = acceptance: §5. 16-21: n/a to a move (no concurrency/no-op/transport/quota/type-generalising/finalizer change); 20's write-authority point applied in §2.3. 22 import classification: `verbatimModuleSyntax` not set in `tsconfig.json`; type-only imports used for result types (`import type`). 23-26: n/a (no protocol, no error-system change, no package move, no env rename). 27 exceptions applied before planning: positional `createSiteRouteDeps`, design 01 decisions. 28 browser assets: n/a (server only). 29 one contract per sheet: STOPs are commands; no "coordinator applies later" inside a sheet. 30 intermediate states compile alone: each sheet ends green; S(n) never needs S(n+1). 31 characterize, never invent: S0. 32 module location as behaviour: R5; no `import.meta.url` in the moved code (`grep -n 'import.meta' deps.ts` → none). 33 different evidence: n/a. 34 diagnostic metadata: logger passed intact. 35 deadlines: n/a. 36 wire names: n/a. 37 text lints by language: the eslint config targets `.ts` only. 38-39: n/a. 40 STOPs in fenced blocks, tested on a planted case (INDEX). 41 eslint limits command named. 42 collision table: INDEX. 43 facts regenerated on the exact base: S0 re-runs the four scripts and STOPs on drift. 44 base gate preflight + "no new line": INDEX "Base outputs". 45 all source readers per commit: R8. 46 why-comments by machine. 47 link script covers every app: setup block names `link-jini.mjs` and checks `apps/desktop`.
