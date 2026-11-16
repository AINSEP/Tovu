# 01 — Tovu `apps/website/src/server/runtime/composition/deps.ts` (revision 2)

Base re-verified at Tovu `origin/integ/wave-b-r2` (65302ee5; `integ/wave-b-fixed` is its ancestor): 3,168 lines (1,949 code). `composeSiteRouteDeps` is lines 1081-3066. Lines 1081-2265 and 2849-3066 were read statement by statement for this revision (comments stripped); the 584-line literal was read as a key list.
Revision 1 was judged "needs rework" (1 blocker, 7 majors, 1 minor). All nine findings were checked against the code and **all nine are accepted** — see `## Judge response`.

## 1. What the code really is (verified)

One async closure. Statement order is behaviour (boot promise chains serialize SQLite writes; `onStoreClose` registrations are pushed in order). The closure is **not** a top-to-bottom pipeline: the reads in the table below are deferred to bindings that are created later (measured with `work/deferred-reads.cjs`, output in `work/deferred-reads.md`; the `let` cells were found by reading). Any design that turns those reads into ordinary arguments evaluates them too early (TDZ `ReferenceError` at boot).

### 1.1 Deferred reads (consumer line → binding, init line)

| consumer | reads later | init | today's contract |
|---|---|---|---|
| 1090, 1107, 1224 | `lifecycleTracker` | `let` 1090, swapped 2018, flushed 2019 | buffering stub until the provider tracker exists; events are replayed in order |
| 1109, 1115, 1563, 1798, 2262 | `routeDeps` | `const` 2265 | closure read; TDZ throw if called before 2265 |
| 1138 | `observability` | 2014 | closure read inside `mediaStorePorts()` (called lazily by the blob store) |
| 1140, 1141, 1144 | `workspaceId`, `settingsRepo` | 1163, 1263 | same, lazily |
| 1144 | `mediaCredentials` | promise created 1136, resolved 2963 | **awaits**; never throws for "too early" |
| 1225 | `routeDepsBuiltForPluginHost` | `let` 1222, set 2951 | **optional**: returns `undefined` during provider boot, on purpose (1219-1221 comment) |
| 1243 | `contentTypeRepo`, `outbox` | 1774, 1424 | inside `deferDeclaredContentTypePorts({ build })` |
| 1525-1553 | `mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo` | 2108, 2095, 2109, 1766 | closure reads inside trash follow-up hooks |
| 1609, 1658 | `mediaRepo`, `entryRefsRepo`, `postRepo`, `assetBlobRepo` | as above | closure reads inside trash adapters / transaction |
| 1787-1793, 1805 | `mediaRepo`, `mediaContentTypeStore`, `postRepo` | 2108, 2112, 2095 | closure reads inside resolvers / comments lookup |
| 1797 | `formCollectionProviders` | `let` 1768 (**working empty-registry fallback**), reassigned 2015 | never throws; changes implementation |
| 2005 | `bindSharedApiOAuth` | `let` 1989 (undefined), set 2244 | **domain error** with user text "Shared connections are not available yet. Reopen this saved connection and try again." |
| 2048 | `mailDurableOutboxReady` | 2053 | closure read |
| 2141 | `trashAdapters` (Map from 1595) | mutated here | theme adapter is **added late**, after `siteThemes` (2132) exists; `removeTheme` (2143) needs `trash` (1651) |
| 2260 | `routeDepsBuilt` | promise 2254, resolved 2849 | **awaits** |

Five different contracts (buffer-then-swap, optional, fallback-then-swap, domain error, awaited promise) plus plain closure reads. They stay five contracts (lesson 7). **Revision 1's `LateRef` is dropped**: one throwing getter cannot express them, and a new generic utility in Tovu with one user breaks practices 7 and 11.

### 1.2 Exports and importers (symbol-aware)

| export (line) | destination | importers to repoint |
|---|---|---|
| re-export of 9 names from `./site-paths.js` (394) | **deleted**; importers import `site-paths.ts` directly | every importer of those 9 names; mixed imports are split (e.g. `apps/website/src/index.ts:12` imports `createSiteRouteDeps` + `defaultContentDbPath` + `siteDir` in one statement) |
| `siteThemesDir`, `builtInContentSeedDbPath`, `builtInSeedUploadsDir`, `pluginsInstallDir`, `defaultDatabaseJournalDbPath`, `defaultChatDbPath` (423-548) | appended to the existing `composition/site-paths.ts` (already the owner of site paths; reuse before write) | by symbol |
| `CreateSiteRouteDepsOverrides` (562) | `site-deps/overrides.ts` | by symbol |
| `siteIdentityFor` (1041) | `site-deps/provider-identity.ts` (with `composeProviderConfig`, `providerPluginBoot`) | `composition/__tests__/deps-provider-plugin-boot.integration.test.ts:15` |
| `createSiteRouteDeps` (968), `createSiteRouteDepsForWorkspace` (3136) | **stay in `deps.ts`** | none |

`deps.ts` keeps its name and path (revision 1 renamed it to `site-route-deps.ts`; that rename bought nothing and touched every importer). Importers: **3 production files** (`cli/commands/export.ts:4`, `cli/commands/serve.ts:9`, `index.ts:12`) and 341 test/support files (`grep` of static + dynamic specifiers, 344 files total). Only importers of a symbol that leaves `deps.ts` change. The executor first writes `size-designs/work/deps-symbol-importers.tsv` (symbol, file, line) with ts-morph; the 87 files that mention `deps.ts` as text (source-reading tests, tools) are listed in the same sheet.

## 2. Target shape

The root owns every mutable cell and the order. Slices are **contiguous statement ranges** in today's order, grouped in six stages. A slice gets its already-initialized inputs as values and its later-initialized inputs as **named getters the root closes over** — the same closure read as today, written at the call site:

```ts
// deps.ts (root). `publishing` is declared further down; the arrow reads it when called, exactly like the closure today.
const data = composeDataStage({ foundation }, { deferred: { mediaRepo: () => publishing.mediaRepo, postRepo: () => publishing.postRepo,
  assetBlobRepo: () => publishing.assetBlobRepo, routeDeps: () => routeDeps } });
```

No slice reads a module-level cell or another slice's internals; a slice may take another slice's **result type**, never call it.

```
server/runtime/composition/
  deps.ts                      createSiteRouteDeps, createSiteRouteDepsForWorkspace, composeSiteRouteDeps
                               (6 stage calls + the 5 late cells + literal assembly call; ≤50 code lines)      ~170
  site-paths.ts                (existing) + the 6 default-path helpers with their comments
  site-deps/
    overrides.ts               CreateSiteRouteDepsOverrides + the override resolvers (562-731, 783, 905-909)   ~210
    open-store.ts              prepareCompositionStorage, openCompositionStore, resolveChatDbPath, owner sweeps ~140
    provider-identity.ts       composeProviderConfig, providerPluginBoot, siteIdentityFor (984-1074)            ~110
    stages/                    one file per stage: calls its slices in order, returns their merged results
      foundation.ts            A  1085-1315
      data.ts                  B  1323-1824
      secrets-providers.ts     C  1832-2021
      mail-http.ts             D  2032-2088
      publishing.ts            E  2095-2264
      after-assembly.ts        F  2849-3064
    slices/                    one file per responsibility; ranges are contiguous; two ranges = two functions
      bootstrap.ts             1089-1120  lifecycle owner, agent inventory, layouts, theme seeding             ~70
      media-storage.ts         composeMediaBlobStore 1132-1150 · loadMediaProviders 1195-1196                  ~80
      store-bound.ts           1153-1166, 1207-1218 (workspace id, trust revocations, search backfill, clock,
                               idGen, audit reporter, activation repo)                                          ~70
      chat-orphans.ts          1171-1190                                                                        ~40
      plugin-runtime.ts        1222-1246 (the `let` stays in the root; the slice receives `getPluginHost`)     ~50
      identity.ts              1250-1261                                                                        ~50
      settings.ts              1262-1315 (registration, the 12-link ensure chain, site title)                   ~110
      boot-data.ts             1323-1415 (serialized chain; comments travel)                                    ~130
      events-origin.ts         1424-1486                                                                        ~100
      trash-follow-ups.ts      1516-1589 split in 4 functions (§2.2)                                            ~120
      trash-adapters.ts        1590-1646 split in 3 functions (§2.2)                                            ~110
      trash.ts                 1496-1510, 1650-1677 (registry, repo, service, removePlugin/removeUser/isInTrash) ~80
      redirects.ts             redirectRepos 1487-1488 · composeRedirects 1679-1715                             ~80
      database-recovery.ts     1720-1745                                                                        ~50
      content-repos.ts         1752-1800                                                                        ~90
      comments.ts              1801-1824                                                                        ~50
      site-keys-members.ts     1832-1886                                                                        ~90
      assistant-secrets.ts     1917-1937                                                                        ~50
      provider-credentials.ts  1950-2013 (hoisted `compositionCustomCredentials`, `compositionProjectKeys`
                               become module functions with real inputs)                                        ~130
      observability-binding.ts 2014-2021 (returns `tracker`; the ROOT assigns `lifecycleTracker` and flushes)   ~30
      mail.ts                  2032-2053                                                                        ~50
      content-http-clients.ts  2061-2088                                                                        ~60
      content-stores.ts        2095-2129                                                                        ~70
      themes.ts                2132-2143 (roster, theme trash adapter registration, removeTheme)                ~40
      publish-apply.ts         2144-2207 split in 2 functions (§2.2)                                            ~90
      outbound-origin.ts       2210-2229 (guarded client: host wiring over Jini's client, stays in Tovu)        ~50
      agent-plugins.ts         2232-2264                                                                        ~70
    route-deps/                the literal, as ORDERED CONTIGUOUS runs (§2.3)                    ~14 files, ≤60 each
      assemble.ts              spreads the runs in file order                                                   ~40
    after-assembly/
      forms.ts 2856-2899 · site-search.ts 2906-2918 · commerce.ts 2922-2947 · plugin-host.ts 2949-2963
      site-sharing.ts 2966-3044 (5 functions, §2.2) · site-imports.ts 3047-3061 · consent-analytics.ts 3062-3064
```

About 48 new files, largest ~210 lines. `deps.ts` ends near 170 lines.

### 2.1 Mutable state: one owner each

| cell | owner after the split | writers | readers |
|---|---|---|---|
| `lifecycleTracker` + `pendingLifecycleEvents` | root | root (2018-2019, at the same position) | getters passed to `bootstrap`, `plugin-runtime` |
| `routeDepsBuiltForPluginHost` | root | root after `plugin-host` (2951) | `getPluginHost` getter (returns `undefined` early — unchanged) |
| `formCollectionProviders` | root | root after `observability-binding` (2015) | `() => formCollectionProviders()` passed to `content-repos` and the literal |
| `bindSharedApiOAuth` | root | root after `agent-plugins` (2244) | `getBindSharedApiOAuth: () => typeof | undefined` passed to `provider-credentials`; the moved code keeps the `if (!bind) throw new Error("Shared connections are not available yet. …")` text verbatim |
| `mediaCredentials` promise + `provideMediaCredentials` | `media-storage` slice result | `plugin-host` after-assembly (2963) | `mediaStorePorts`, awaited |
| `routeDepsBuilt` promise + `resolveRouteDeps` | root (2253-2254), resolved at 2849 | root | `agent-plugins` (2260), awaited |
| `trashAdapters` Map | `trash-adapters` slice result | `themes` slice `.set(THEME_ENTITY_TYPE, …)` at 2141 (verbatim) | `trash` service |
| `siteAppBootWorkByDeps` (module `WeakMap` in `app.ts`) | unchanged here; design 02 moves it to `composition/site-app-boot-work.ts` and repoints `plugin-host.ts` in the same commit | 2949 | `app.ts` |

### 2.2 Function limits inside the slices (≤50 code lines, complexity ≤10)

| today | code lines | becomes |
|---|---|---|
| follow-up hook Map 1522-1589 | 62 | `snapshotMediaRepo({ mediaRepo, assets })` (12) · `snapshotPostRepo({ postRepo, posts })` (6) · `formAttachmentPurger(required)` (the `prepareRemoval` body, 22) · `composeTrashFollowUpHooks(required)` (the Map, 30) |
| adapters Map 1595-1646 + plugin adapter | 55 | `mediaTrashAdapter(required)` (12) · `userTrashAdapter(required)` (18) · `composeTrashAdapters(required)` (28) |
| apply port 2144-2207 | 58 | `publishContentPorts(required)` (the `ports` object, 44) · `composePublishContentApplyPort(required)` (16) |
| `configureSiteSharing` 2969-3044 | 68 | `shareHostKit(required)` (2981-2991) · `shareStaticSite(required)` (2996-3006) · `shareDelivery(required)` (3007-3037, itself: `sharePeer`, `shareObjectStore`) · `configureSiteSharing(required)` (try/catch + backend, 22) |
| `composeSiteRouteDeps` | 1,201 | root ≤50; each stage ≤50 (a stage is 4-7 slice calls plus the result object) |

Every moved function takes `(required, optional = {})`; the six `Record<string, never>` placeholders (`warnCompositionChatOrphans`, `registerBootOrigin`, `composeContentHttpClients`, `resolveCompositionPublicOrigin`, `configureSiteSharing`, `configureSiteImports`, `createShareHostKit`) get their real inputs. A slice that has no `await` today stays synchronous (no extra microtask turn); the eight awaiting ranges (1163, 1166, 1173, 1195, 1926, 1953, 1975, 2110) are awaited by the stage at the same position.

The settings chain (1284-1302) has **12** links; **3** (`ensureAdminInterfaceSettingDefinitions`, `ensureSiteTitleSettingDefinition`, `ensureSiteTimeZoneSettingDefinition`) take `(deps, { systemPrincipalId })`, 9 take `({ deps, systemPrincipalId })`. It moves verbatim as a chain; revision 1's "data list + reducer" is dropped (an abstraction with one user, and it flagged a generic reducer for Jini that nothing else needs).

### 2.3 The literal (2265-2848)

Owners interleave if "owner" means trash: `trash`…`registry` 2272-2312, `removeUser`/`isInTrash` 2511-2512, `removeMember` 2520, `removeMenu` 2552, `removeFormSubmission` 2620, `removeTerm`/`removeTaxonomy` 2640-2644, `removePlugin`/`removeTheme` 2714-2715. Revision 1's "one fragment per owner, spread once" cannot keep those positions. Revision 2: a `removeX` key belongs to **feature X's run** and takes `trash` as an input. Fragments are the literal's existing contiguous runs, cut at the blank-line/comment group boundaries, spread in the same order. Because the runs are contiguous and ordered, key order, initializer evaluation order and overwrite precedence are identical **by construction** — including `...identity` followed by `principalRepo`/`removeUser`/`isInTrash` (2507-2512), which stay in one run.

Runs (file → keys): `site-trash.ts` 2266-2312 · `posts-chat.ts` 2313-2339 · `settings-assistant.ts` 2340-2366 · `external-mcp.ts` 2376-2413 · `settings-ready-consent.ts` 2415-2428 · `themes-site.ts` 2432-2472 · `observability-providers.ts` 2474-2502 · `identity-redirects-members.ts` 2507-2524 · `mail-menus-webhooks.ts` 2532-2566 · `media-newsletter.ts` 2572-2611 · `forms-taxonomy-db.ts` 2616-2674 · `comments-plugins.ts` 2686-2727 · `publish-content.ts` 2732-2782 · `deploy-credentials.ts` 2786-2842. Exact cut lines come from step 0's key sheet; a run over 50 code lines is cut again at the next group boundary. Each run is `export function xRouteDeps(required): … ` returning one object literal that `satisfies Partial<RouteDeps>`; `assemble.ts` returns `NewsletterRouteDeps & ByokToolSurfaceDeps`, so a dropped key is a compile error there.

## 3. Migration graph (each commit compiles with `npx tsc -p tsconfig.json --noEmit` and `-p tsconfig.tests.json --noEmit`, and passes the pins; caller and test updates are in the same commit)

| # | commit | needs | also edits |
|---|---|---|---|
| 0a | characterization tests (§4), no source change | — | — |
| 0b | work sheets: symbol-importer TSV, literal key sheet (key, line, run, reads) | — | — |
| 1 | delete the re-export at 394; split mixed imports | 0 | every importer of the 9 names |
| 2 | default-path helpers → `site-paths.ts` | 1 | importers by symbol; source-reading tests that anchor on these names |
| 3 | overrides → `overrides.ts`; store opening → `open-store.ts`; provider identity → `provider-identity.ts` (3 commits) | 2 | importers by symbol |
| 4 | function-level splits **in place** (§2.2), one per commit, still inside the closure | 0 | — |
| 5 | hoisted `Record<string, never>` functions take real inputs, in place, one per commit | 4 | — |
| 6 | extract slices, **in an order where every eager input already exists as a root binding**: any order works because the root keeps today's statement order and passes later bindings as getters; do it bottom-up (stage F, then E … A) so each commit's diff is one block → one call | 5 | the source-reading test(s) anchored in that block; `wiring-identity.test.ts` baseline in the `bootstrap` commit only (see below) |
| 7 | group the calls into the six stage files, one stage per commit | 6 | — |
| 8 | literal runs, one per commit, top to bottom; then `assemble.ts` | 6 | — |
| 9 | `size-debt.json`: remove the stale `deps.ts` entries `check:size` reports | 8 | — |

`wiring-identity.test.ts:205-233` allows `createTovuAgentPluginLifecycle(` only in a fixed file list that names `deps.ts`. The `bootstrap` commit replaces the entry `server/runtime/composition/deps.ts` with `server/runtime/composition/site-deps/slices/bootstrap.ts` in `BASELINE_OWNER_FILES` — same count (11), same single owner construction, one line, explained in the commit. This is the only edit to that test.

## 4. Tests

Characterization (step 0a) — each can fail on the risk it names:
- **Shape:** `Object.keys(routeDeps)` in order, `typeof` per key, identity groups. Catches a dropped/reordered key; does **not** prove behaviour.
- **Overridden capabilities:** call `routeDeps.removeUser`/`isInTrash`/`principalRepo` on a temp site and assert the trash-backed behaviour (a user removed through `removeUser` is found by `isInTrash`; `...identity`'s own versions would not do that). Same for `removePlugin`, `removeTheme`, `removeMember`.
- **Teardown lifetime, through real seams:** supply `overrides.store` (a recording wrapper implementing `SiteStore`), `overrides.bootProviderPlugins` (a fake returning a recording `dispose`) and `overrides.openProjectStore` (fake with recording `close`), take the wrapped store from `overrides.onStoreOpened`, call `close()`. Assert the real guarantees of `openCompositionStore` (839-850): (1) the boot drain finished before any registration ran, (2) every registration — including a promised one — resolved and ran before the supplied store's `close`, (3) owner sweeps stopped before `close`. Registrations run through `Promise.all`; **no order among them is asserted** because none exists.
- **Late contracts:** before `agentPluginConnections` exists the project-key `bindOAuth` rejects with the exact "Shared connections are not available yet…" text; `getPluginHost()` is `undefined` during provider boot (fake `bootProviderPlugins` records it); lifecycle events captured before provider boot reach the fake tracker in order after it; form resolvers work before provider boot (empty registry).
- **Boot chains:** fake clock; record the order in which the `ensure*` writes hit `settingsRepo` (12 definitions, in order) and that `installCommentsDataModule` starts after the newsletter install settles.

Existing pins stay green. The 87 files that read `deps.ts` as text (11 are order/anchor tests) are repointed in the commit that moves their anchor: the anchor's presence is asserted in its slice file and the order of two anchors in different files is asserted as the order of the two calls in the stage file. No assertion is deleted; test count before/after is reported per commit (`honest-testing`).
New unit tests use fakes of interfaces only: `registerBootOrigin` (3 origin kinds), `formAttachmentPurger` (no asset → no-op; non-private asset → the "no proven form upload owner" error text; remove updates the snapshot), `shareDelivery` (HEAD goes through the guarded client), `configureSiteSharing` failure → backend undefined + logged.

## 5. Owner practices check

| # | practice | status |
|---|---|---|
| 1 | DI / ports | slices take values + named getters; no module cell, no locator. Constructing `new Sqlite…Repo` here is the composition root's job |
| 2 | `(required, optional = {})` | all moved functions; 7 `Record<string, never>` signatures removed |
| 3 | size / complexity | §2.2; root and stages ≤50; literal runs ≤50 code lines each |
| 4 | feature slicing | one responsibility per slice file; stages only order them |
| 5 | no barrels / re-exports | line 394 re-export deleted; `deps.ts` keeps only its own two entry functions |
| 6 | comments move | verbatim with their statements |
| 7 | boundaries | nothing generic is created in Tovu (LateRef and the reducer are dropped); the guarded HTTP client stays host wiring |
| 8 | tests | fakes via `overrides` seams; no `vi.mock` of package internals; characterization first |
| 9 | errors | no error text changes. **Conflict flagged:** 1187/1208/1333/1351/1367/1390/1413 log `err.message` only (no redacted details block). Left as is — changing them is a behaviour change outside a move; listed for a follow-up |
| 10 | no new disables, no silent change | one visible diagnostic change: a too-early deferred read now names the stage (`Cannot access 'publishing' before initialization`) instead of the single binding. Same error class, programming-error path only |
| 11 | smallest change | file keeps its name; no new abstraction |
| 12 | memory / IO | boot-time only; no read or write is added or repeated. `formAttachmentPurger` still lists all media + posts once per trash operation (1525) — existing cost, unchanged, noted |

## 6. Risks

| risk | de-risk |
|---|---|
| a deferred read becomes eager | §1.1 is the checklist; getters only; "late contracts" tests |
| an awaited slice adds a microtask turn and a boot chain interleaves differently | chains are ordered by explicit `.then`, not by turn count; boot-chain test with a fake clock; synchronous ranges stay synchronous |
| literal precedence | contiguous ordered runs; overridden-capability tests |
| tsc misses an undefined identifier after a move (seen on `refactor/size-tovu`) | eslint `no-undef` on each new file + the route tests |
| untangle lanes edit `deps.ts` concurrently | run before wave C or after wave E with the file frozen (LANES.md:101); R lanes then add their one-line use in a stage file |

## 7. Interaction with planned work

- LANES.md:10/66/101: `deps.ts`/`app.ts` are coordinator-serialized; R lanes add `composition/jini-<lane>.ts`. This split must not run during a wave.
- Untangle DESIGN.md:231 (Q8): domain Node adapters move to the **host preset**, not to Tovu and not to `@jini-ai/integrations`. Revision 1's "move `createNodeMediaHttpClient` to Jini" is withdrawn: that function does not exist; `deps.ts:2210-2218` already calls Jini's `createGuardedMediaHttpClient` + `createNodeGuardedHttpPorts` with Tovu's policy and `userAgent: "Tovu/0.1.0"`.
- `size-debt.json` entries are path-keyed: step 9 removes the `deps.ts` ones; nothing is re-keyed onto new files (new files must pass on their own).

## 8. Estimate

≈62 commits (0: 2 · 1-3: 6 · 4-5: 12 · 6: 27 · 7: 6 · 8: 15 · 9: 1). Sonnet executor **≈1.35M tokens** (was 1.05M: +characterization depth, +in-place function splits, +symbol-aware repointing). Risk: **high**. One Opus review after steps 5, 6 and 8.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | blocker | accepted | Confirmed: `deps.ts:1137-1144` reads `observability` (2014), `workspaceId` (1163), `settingsRepo` (1263); 1525-1553 and 1609 read repos from 2095-2109; 2141 mutates the adapters Map after `siteThemes` (2132). "Extract top to bottom with explicit inputs" is replaced by §1.1 (inventory), §2 (root keeps order and cells; later bindings passed as getters), §2.1 (owner per cell). Theme registration stays at 2140-2143 in its own `themes.ts` slice |
| 2 | major | accepted | `LateRef` dropped. §1.1/§2.1 keep the five contracts apart (`deps.ts:1090`, 1222-1225, 1768/2015, 1989/2005, 1136/2254). `routeDepsBuilt` now has an owner. No generic utility is created, so no Jini-first question remains |
| 3 | major | accepted | `CreateSiteRouteDepsOverrides` has no `onStoreClose` (fields listed at 562-641); registrations run under `Promise.all` (842). §4 uses `overrides.store`, `bootProviderPlugins`, `openProjectStore`, `onStoreOpened` and pins only the three real guarantees; readiness tracing is specified as the boot-chain test |
| 4 | major | accepted | Trash-related keys sit at 2272-2312, 2511-2512, 2520, 2552, 2620, 2640-2644, 2714-2715. §2.3: ordered contiguous runs; `removeX` belongs to feature X; behavioural assertions for overridden capabilities added |
| 5 | major | accepted | `deps.ts:394` re-export and `index.ts:12` mixed import confirmed; `siteIdentityFor` (1041) had no destination. §1.2 is the symbol table; the file is no longer renamed |
| 6 | major | accepted | Counts confirmed (62 and 58 code lines). §2.2 gives the function-level decomposition, plus `configureSiteSharing` and the adapters Map |
| 7 | major | accepted | `wiring-identity.test.ts:205-233` baseline confirmed; no `apps/website/tsconfig.json` (root `tsconfig.json` + `tsconfig.tests.json`). §3: baseline entry swapped in the `bootstrap` commit; real compiler commands; atomic commits |
| 8 | major | accepted | No `createNodeMediaHttpClient` anywhere in Tovu (`grep`); 2210-2218 is host wiring. Claim withdrawn (§7) |
| 9 | minor | accepted | 12 links / 3 direct-deps forms (1287, 1299, 1301); 3 production importers. Corrected in §1.2 and §2.2 |

Accepted 9 · rebutted 0 · blockers left 0.
