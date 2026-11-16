# 01 — Tovu `apps/website/src/server/runtime/composition/deps.ts`

Measured at `origin/integ/wave-b-fixed`: 3,168 lines (1,949 code), 302 import declarations (lines 1-408).
`composeSiteRouteDeps` is lines 1081-3066 (1,986 raw / 1,201 code). Not exempt (`size-exceptions.json` `_comment` names it).

## 1. Current shape

| lines | responsibility |
|---|---|
| 410-548 | default on-disk paths (`siteThemesDir`, `builtInContentSeedDbPath`, `builtInSeedUploadsDir`, `pluginsInstallDir`, `defaultDatabaseJournalDbPath`, `defaultChatDbPath`, `resolveShareDirectory`, `isInsideAny`) |
| 562-731, 905-909 | `CreateSiteRouteDepsOverrides` + override resolvers (`assertOverridesPairedOrAbsent`, `resolveThemesDirOverride`, `resolveSiteBindingOverride`, `resolveSiteBackupSources`, `resolveWorkspaceIdOverride`, …) |
| 735-897 | store opening (`prepareCompositionStorage`, `openCompositionStore`, `resolveChatDbPath`) and owner sweeps |
| 932-1074 | admin password reset from env; public entry `createSiteRouteDeps`; provider-config and site-identity helpers |
| 1085-1120 | **bootstrap**: buffered lifecycle tracker, agent inventory, site binding, agent-plugin layout + lifecycle, preset registry, skills layout, theme seeding |
| 1123-1196 | **storage/media**: kernel, uploads dir, deferred media credentials, object-store ports, blob store, store-bound services, workspace id, trust revocations, chat db + orphan warning, media provider registry |
| 1207-1246 | post-search backfill, clock/id, tool-audit reporter, plugin activation repo, plugin runtime |
| 1250-1315 | **identity + settings**: identity deps, settings principals, password reset, settings repos, the 14-step `ensure*Setting` chain, site-title preservation |
| 1323-1415 | **boot data chain** (serialized on purpose): nav bindings → newsletter module → comments module → media transform; blob hydration |
| 1424-1488 | outbox, bus, origin boot (`registerBootOrigin`), origin registry, redirect repo + hit sink |
| 1496-1677 | **trash**: registry, repo, taxonomy follow-up hooks (62), adapters map (43), service, `removePlugin`/`removeUser`/`isInTrash` |
| 1679-1715 | redirects write deps + three bus/phase registrations |
| 1720-1745 | database journal db, ledger/migration/run repos, restore points, introspection |
| 1752-1824 | content repos (entries, taxonomy, widgets, forms, content types), `wireCoreResolvers`, comments module |
| 1832-1886 | runtime mode, site key sources, members, newsletter keyring/hooks |
| 1917-2021 | assistant secret keyring, `normalizeSiteVaultAtBoot`, external MCP, project store/keys, provider config, custom credentials, provider plugins, observability binding |
| 2032-2088 | mail resolution + durable outbox; outbound HTTP clients |
| 2095-2264 | post/media repos, change sets, publish-content repos + apply port (58), themes roster, guarded outbound client, public origin, agent-plugin connections, SEO, consent |
| 2265-2848 | **the `routeDeps` literal**: 584 lines, about 270 keys, 6 spreads (`...identity`, `...agentPluginConnections`, `...resolvedMailer…`, `...compositionApprovalOverrides`, `...compositionConsentOptions`, one conditional) |
| 2849-3065 | post-assembly mutation: widget adoption, forms, site search, commerce, plugin host, drain hook, media-credential release, site sharing (`configureSiteSharing`, 68), imports, consent, content analytics |
| 3068-3168 | trailing helpers, `createSiteRouteDepsForWorkspace` |

Two structural facts drive the design:

1. **It is one closure with six late bindings**: `routeDeps` (read inside closures created at 1108-1115 before it exists), `lifecycleTracker`, `bindSharedApiOAuth`, `formCollectionProviders`, `provideMediaCredentials`/`mediaCredentials`, `routeDepsBuiltForPluginHost`, `resolveRouteDeps`/`routeDepsBuilt`.
2. **`app.ts` `createRouteDeps` (lines 469-1732) is its in-memory twin** with the same sections in the same order (design 02). The two must get the same slice names so a later pass can merge them.

## 2. Target shape

A composition root is the one place where "one function knows everything" is legitimate, so the split is by *feature slice with typed inputs and outputs*, not by line count. Each slice is a function `composeX(input, options = {})` whose input type names exactly the upstream values it reads and whose result is a named object. No slice reads a closure variable.

```
server/runtime/composition/
  site-route-deps.ts                 root: createSiteRouteDeps, createSiteRouteDepsForWorkspace,
                                     composeSiteRouteDeps (≈45 code lines: one call per slice)        ~190
  site-deps/
    overrides.ts                     CreateSiteRouteDepsOverrides + the 8 override resolvers           ~210
    default-paths.ts                 the 8 path helpers (410-548) with their comments                  ~150
    open-store.ts                    prepareCompositionStorage, openCompositionStore, chat db path,
                                     owner sweeps                                                      ~140
    late-ref.ts                      createLateRef<T>(name): { get, set, isSet }                       ~40
    base.ts                          SiteCompositionBase type + composeBase (bootstrap 1085-1120,
                                     kernel, workspaceId, clock, idGen, onStoreClose, late refs)       ~180
    slices/
      media-storage.ts               1132-1150, 1195-1196 (blob store, object-store ports, providers)  ~120
      chat-store.ts                  1171-1190 (chat db, orphan warning)                               ~50
      plugin-runtime.ts              1213-1246                                                         ~80
      identity.ts                    1250-1261 (identity, principals, password reset)                  ~70
      settings.ts                    1262-1315 (repos, ensure chain as a data list, site title)        ~130
      boot-data.ts                   1323-1415 (the serialized chain; comments move verbatim)          ~150
      events-origin.ts               1424-1486 (outbox, bus, origin boot + registry)                   ~110
      trash.ts                       1500-1521, 1650-1677 (registry, repo, service, remove*)           ~110
      trash-follow-ups.ts            1522-1589 (taxonomy/form follow-up hooks)                         ~90
      trash-adapters.ts              1590-1646 + theme adapter registration (2140-2143)                ~90
      redirects.ts                   1487-1488, 1679-1715                                              ~80
      database-recovery.ts           1720-1745                                                         ~60
      content-repos.ts               1752-1800 (repos + wireCoreResolvers)                             ~100
      comments.ts                    1801-1824                                                         ~50
      site-keys-members.ts           1832-1886                                                         ~100
      assistant-secrets.ts           1917-1937                                                         ~60
      provider-credentials.ts        1950-2013 (project store/keys, provider config, custom
                                     credentials, provider plugins, revision watch)                    ~140
      observability.ts               2014-2021 (binds lifecycleTracker late ref, instruments kernels)  ~40
      mail.ts                        2032-2053                                                         ~60
      outbound-http.ts               2061-2088, 2210-2229                                              ~90
      content-publish.ts             2095-2129, 2132-2136, 2144-2207 (post/media repos, publish-
                                     content repos, apply port, theme roster)                          ~190
      agent-plugins.ts               2232-2264 (connections, admin surfaces, SEO, consent ready)       ~80
    route-deps/                      the literal, one fragment builder per owner
      trash-fragment.ts, content-fragment.ts, assistant-fragment.ts, credentials-fragment.ts,
      site-fragment.ts, observability-fragment.ts, identity-members-fragment.ts, mail-fragment.ts,
      comments-plugins-fragment.ts, publish-fragment.ts, deploy-fragment.ts          11 files, 50-90 each
      assemble.ts                    spreads the fragments in the ORIGINAL key order                   ~70
    after-assembly/
      forms.ts                       2856-2899                                                         ~70
      site-search.ts                 2906-2918                                                         ~40
      commerce.ts                    2922-2947                                                         ~50
      plugin-host.ts                 2949-2964 (host, runtime attach, drain, media-credential release) ~50
      site-sharing.ts                2966-3061 (configureSiteSharing split in 3, configureSiteImports) ~130
      consent-analytics.ts           3062-3064, 3088-3107                                              ~50
```

About 45 files, largest ~210 lines. `deps.ts` is deleted; its 158 test importers and 30+ production importers are repointed to `site-route-deps.ts` (or to `site-deps/default-paths.ts` / `overrides.ts` for the names they actually use).

### Module map (signatures)

```ts
// late-ref.ts — replaces `let x!: T` + closure capture. get() before set() throws
// ReferenceError(`Cannot access '${name}' before initialization`) — the same error class the TDZ gives today.
export function createLateRef<T>({ name }: { name: string }, _options = {}): LateRef<T>

// base.ts
export interface SiteCompositionBase {
  dbPath: string; store: SiteStore; kernel: StorageKernel; chat: StorageKernel;
  onStoreClose: (r: { registration: StoreCloseRegistration }) => void;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  siteBinding: SiteBinding; themesDir: string; uploadsDir: string; workspaceId: string;
  clock: Clock; idGen: IdGen;
  agentPluginLayout; agentPluginLifecycle; skillLayout; federatedMcpPresetRegistry; assistantAgentInventory;
  late: { routeDeps: LateRef<RouteDeps>; lifecycleTracker: LateRef<Tracker>; pluginHostOwner: LateRef<{ pluginHost?: PluginHost }>;
          bindSharedApiOAuth: LateRef<BindSharedApiOAuth>; formCollectionProviders: LateRef<() => FormCollectionProviders>;
          mediaCredentials: Deferred<PublishCredentialSource> };
}
export async function composeBase(required: { dbPath: string; opened: OpenedStore }, options: { overrides?: … } = {}): Promise<SiteCompositionBase>

// every slice
export function composeTrash(input: { base: SiteCompositionBase; events: EventsSlice; content: ContentReposSlice; … }, options = {}): TrashSlice
// every fragment: pure, synchronous, returns Pick<RouteDeps, …>
export function trashRouteDeps(input: { trash: TrashSlice; content: ContentReposSlice }, _options = {}): Pick<RouteDeps, 'trash' | 'removePost' | …>
```

Dependency direction: `site-route-deps.ts → after-assembly → route-deps → slices → base → late-ref`. Slices import features and `#src/platform`; nothing under `site-deps/` imports `site-route-deps.ts`. A slice may take another slice's *result type* as input, never call another slice.

### Rules the executor must keep

- **Statement order is behaviour.** The root calls slices in today's order (table above, top to bottom). Promise chains (`settingsReady → … → siteTitleReady`, `newsletterReady → commentsReady → mediaTransformReady`) stay chained in the same order; they serialize SQLite writes at boot. `onStoreClose` registrations happen in the same sequence (close order derives from registration order; step 0 pins the sequence).
- **`lifecycleTracker` buffer**: 1089-1090 create a buffering stub; 2018-2019 swap it and flush. Keep as `late.lifecycleTracker` initialised with the buffering stub (a `LateRef` created with an initial value), not as an empty ref.
- The two nested hoisted functions (`warnCompositionChatOrphans`, `registerBootOrigin`, `configureSiteSharing`, `configureSiteImports`) currently take `Record<string, never>` placeholders because they read the closure. When moved they take their real inputs: `(required, options = {})` — that removes four `Record<string, never>` signatures.
- The 14 `.then(() => ensureXSetting(...))` links (1284-1302) become `const SITE_SETTING_DEFINITIONS = [ensureAdminInterfaceSettingDefinitions, …] as const` reduced into the same chain in the same order. The two ensure-functions with a different argument shape (`(deps, { systemPrincipalId })` vs `({ deps, systemPrincipalId })`) get a 2-line adapter in the list, not a signature change.
- Fragments preserve **spread precedence**: in `assemble.ts` each spread/key sits at the position it has today. Step 0 produces the ownership table that proves it.

## 3. Step order (each step = one commit that typechecks and passes the pinned tests)

0. **Characterization first** (no source change): add `composition/__tests__/site-route-deps.shape.characterization.test.ts` — builds deps through `createSiteRouteDeps` on a temp site and records (a) `Object.keys(routeDeps)` in order, (b) `typeof` per key, (c) identity groups (keys whose values are the same object), (d) the ordered list of `onStoreClose` registrations (wrap `opened.onStoreClose` through the existing override seam and record `registration.name`/index). Snapshot committed. Also generate `size-designs/work/deps-key-ownership.tsv` (key, line, owning fragment) with a 30-line ts-morph script; it is the checklist for step 5.
1. Move path helpers → `default-paths.ts`, overrides → `overrides.ts`, store opening → `open-store.ts`. Repoint importers (codemod on the import specifier; `git grep -l "composition/deps"`). `deps.ts` keeps only the root + compose function.
2. Add `late-ref.ts` (+ unit test). Convert the six late bindings inside `composeSiteRouteDeps` in place, one commit each. No code moves yet.
3. Extract `composeBase` (1085-1163 minus media).
4. Extract slices top to bottom, **one slice per commit**, replacing the block with `const x = composeX({ base, … })` and destructuring the names the rest of the function still uses. After each: `tsc -p apps/website`, the characterization test, the 11 source-pinned tests (see §4).
5. Split the literal: for each fragment, cut its keys into `route-deps/<x>-fragment.ts`, replace them in place with `...xRouteDeps({ … })`. Finish with `assemble.ts`.
6. Extract the after-assembly files.
7. Rename `deps.ts` → `site-route-deps.ts` (`git mv`), repoint all importers, update `size-debt.json` (remove the `deps.ts` file entry and `composeSiteRouteDeps#1` + nested entries; `check:size` prints the stale ones).

## 4. Tests

- Pins that already exist and must stay green unmodified: `composition/__tests__/wiring-identity.test.ts`, `create-sqlite-route-deps-for-workspace.integration.test.ts`, `design-c-package-themes-dir-wiring.integration.test.ts`, `dev-capability-origin-scheme.integration.test.ts`, `create-app-event-subscriptions-once.integration` (red on base — record, do not fix).
- **11 tests read `deps.ts` as text** (`composition-boot-order.unit.test.ts`, `serving-app-boot-wiring.unit.test.ts`, `no-site-key-ensure-import.boundary.test.ts`, `agent-daemon-real-spawn.test.ts`, …). They assert anchors and their relative order. When an anchor moves, repoint the test's `readCode(path)` to the new file and, where the test compares the order of two anchors that now live in different files, assert the order of the two slice **calls** in `site-route-deps.ts` plus each anchor's presence in its slice. Never delete an assertion; test count before/after must match (`honest-testing`).
- New: `late-ref.test.ts`; one fake-based unit test per slice that has branching (`events-origin` 3 origin kinds, `site-sharing`, `boot-data` failure logging) using in-memory repos, not the SQLite store.

## 5. Risks

| risk | de-risk |
|---|---|
| spread precedence / key loss in the ~270-key literal | step-0 key snapshot + ownership TSV; `satisfies Pick<RouteDeps, …>` on every fragment so a dropped key is a type error in `assemble.ts` |
| boot promise order changes (SQLite write races) | chains stay chained; step-0 test records resolution order of the `*Ready` promises |
| TDZ-dependent closures | `LateRef` with identical error class; converted before any move (step 2) |
| tsc misses an undefined identifier after a move (reported on `refactor/size-tovu`) | run eslint `no-undef` on each new file and the route tests, not only tsc |
| executor "tidies" a slice | brief forbids changing any call's arguments; diff per slice must be move-only apart from the destructuring line |

## 6. Interaction with planned work

- `LANES.md`: `deps.ts` and `app.ts` are the only Tovu files several untangle lanes touch; the coordinator serializes edits and each R lane adds `composition/jini-<lane>.ts`. **Run this split before wave C or after wave E, not during.** Recommended: before — the lanes then add a one-line call in `site-route-deps.ts` instead of editing a 3k-line closure.
- `CLASSIFY-files.tsv` row for `deps.ts`: only the media HTTP client (`createNodeMediaHttpClient` duplicate) moves to Jini `@jini-ai/integrations/media-providers/node`; it lives in `slices/outbound-http.ts` after this split, isolated for that move.
- Generic candidates to flag, not move here: `late-ref.ts` (→ `@jini-ai/core`), the "ensure definitions in order" reducer (→ `@jini-ai/core/settings`).
- `refactor/size50-tovu-website` skipped `deps.ts` on purpose; no overlap.

## 7. Estimate

≈45 commits. Sonnet executor **≈1.05M tokens** (step 0: 60k; steps 1-3: 150k; 22 slices × 25k; fragments 170k; after-assembly 70k; rename + debt 50k). Risk: **high**.
