# 02 — Tovu `apps/website/src/server/runtime/composition/app.ts` (revision 2)

Base re-verified at Tovu `origin/integ/wave-b-r2` (65302ee5): 2,690 lines (1,709 code). `createRouteDeps` 469-1732, `createApp` 2040-2618.
Revision 1: "needs rework" (1 blocker, 7 majors). All eight findings checked against the code; **8 accepted** (one with a narrower fix than the judge proposed) — see `## Judge response`.

## 1. What the code really is (verified)

Three things in one file:

- **A. In-memory composition root** `createRouteDeps(options)` (469-1732): twin of design 01 by purpose, **not** by construction order.
- **B. Express app assembler** `createApp` (2040-2618) + helpers `trackByokBootWork` 1944, `applyPublicMiddleware` 1957, `registerAdminSpa` 2009, `registerSiteChatBundle` 2020, `registerSiteIdlePark` 2030, `mountRoutes` 1788, `startModule` 1794. Registration order is behaviour.
- **C. Boot helpers and module state:** `subscribeSiteEventHandlersOnce` 1820-1909 (**55 code lines on this base** — over the limit) with its `WeakSet` `busesWithSiteEventHandlers` (1799); the exported `WeakMap` `siteAppBootWorkByDeps` (1802; written by `deps.ts:2949`, read at 1950 through 2356); `runExportSite` (1777); `startSettingsRegistration` (2625-2690, also imported by `deps.ts:408`).

Facts revision 1 missed:

1. `createApp(routeDeps = createRouteDeps(), options = {})` (2040): **68 files call it with no argument**. 426 files import `composition/app`; outside tests only `src/index.ts` and `deps.ts:408`.
2. The memory root's `createSiteApp` (1634) calls `createApp(routeDeps, …)`. With the default argument that is an A↔B cycle. `npm run check:boundaries` has a **`no-circular`** rule (`.dependency-cruiser.mjs:96`), so A and B cannot go to two files while the default exists.
3. `createApp` values that cross mount groups: `isAuthenticatedPreviewRevision` (made 2066, used 2496); `internalRouter` (made 2053, used 2054, 2358, 2361); `siteAssistantModule` is started (2166) before it is mounted (2167).
4. `CreateAppOptions` consumers (every `options.` read, by line): `stopForIdle` 2031/2035 · `themeIdOverride` 1974/1984 · `consentAudit` 1992 · `onAdminSignIn` 2065 · `assistantToolSurface` 2355 · `activateAssistantFederation` 2361 · `recoverAssistantChatRuns` 2386 · `onBootWork` 1953/2387.
5. Deferred reads in the memory root (measured, `work/deferred-reads.md`): `agentPluginLayout`(1171)←483 · `routeDeps`(1198)←485, 899-902, 1175, 1181, 1195 · `contentTypeRepo`(972), `outbox`(584)←499 · `formDefinitionRepo`(966)←750, 751, 764 · `entryRefsRepo`(963)←811, 899 · `menuRepo`(964)←823, 824, 844 · `navLocationBindingRepo`(965)←843 · `transformDefinitionRepo`(1167), `mediaContentTypeStore`(1064)←984. Plus `taxonomyDb` (610): a lazy proxy that opens `:memory:` only on first use.
6. The three "visitor deps literals" are not pure: comments builds a rate limiter and **starts** salt resolution from env + runtime mode + keyring (2532-2537); forms builds file storage with deferred `statfs` and principal lookups (2583-2603).

## 2. Target shape

```
server/runtime/composition/
  app.ts                          createApp (≤45 code lines) + CreateAppOptions; phase 1 also keeps the thin
                                  createRouteDeps root here (see §2.4)                                        ~200
  site-app-boot-work.ts           siteAppBootWorkByDeps (the one WeakMap) + trackByokBootWork                   ~40
  site-event-subscriptions.ts     busesWithSiteEventHandlers (the one WeakSet) + subscribeSiteEventHandlersOnce,
                                  split into subscribeWorkspaceEvents / subscribeContentEvents / … (≤30 each)  ~120
  settings-registration.ts        startSettingsRegistration                                                     ~80
  guarded-outbound-http.ts        the guarded outbound client both roots build identically (§2.5)               ~30
  http-app/
    module-handles.ts             mountRoutes, startModule                                                      ~20
    public-middleware.ts          applyPublicMiddleware, registerSiteIdlePark, registerAdminSpa,
                                  registerSiteChatBundle                                                        ~130
    mount-core-content.ts         2052-2078                                                                     ~70
    mount-members-newsletter.ts   2085-2156 (memberPublicDeps / newsletterPublicDeps builders + mount)          ~120
    mount-admin-system.ts         2160-2248, as 5 sub-mounts in file order (analytics+assistant module,
                                  observability, mail, site admin, credentials+files)                           ~160
    mount-admin-features.ts       2253-2343                                                                     ~130
    mount-assistant.ts            2355-2416                                                                     ~100
    mount-admin-data.ts           2426-2451                                                                     ~60
    mount-public-site.ts          2459-2617 minus the three visitor registrations                               ~110
    visitor-submit.ts             registerCommentsSubmit 2522-2538 · registerAnalyticsIngest 2544-2558 ·
                                  registerFormsSubmit 2566-2605 (formFileStorage(required) split out)           ~120
  memory-deps/
    slices/                       contiguous ranges of 470-1197, one responsibility per file (names follow
                                  design 01 where the responsibility matches; no shared result types):
      plugin-runtime.ts 470-502 · identity-settings.ts 503-550 · origin-newsletter.ts 551-581 ·
      repos.ts 582-632 (incl. the private lazy taxonomy db) · trash-adapters-content.ts (post 639, redirect 667,
      comment 692, media 721) · trash-adapters-forms-widgets.ts (form 745, form_submission 768, widget 790,
      menu 816, attachment purge hooks 879-906) · trash-adapters-taxonomy.ts (term 848, taxonomy 863) ·
      trash-adapters.ts (the Map, ≤25) · trash-redirects.ts 907-955 · content-resolvers.ts 956-1016 ·
      members-secrets.ts 1017-1087 · publish-apply.ts 1088-1151 · site-agent-plugins.ts 1152-1196
    route-deps/                   the 530-line literal as ordered contiguous runs (same rule as design 01 §2.3)
      assemble.ts
```

### 2.1 Mount contracts (complete)

```ts
type MountInput = { app: Express; routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps };
mountCoreContent(required: MountInput, optional: Pick<CreateAppOptions, 'onAdminSignIn'> = {}): { isAuthenticatedPreviewRevision: PreviewRevisionCheck }
mountMembersNewsletter(required: MountInput, optional = {}): void
mountAdminSystem(required: MountInput, optional = {}): void          // starts the site-assistant module, then mounts it (2166 before 2167)
mountAdminFeatures(required: MountInput, optional = {}): void
mountAssistant(required: MountInput & { internalRouter: Router; bootWorkByDeps: typeof siteAppBootWorkByDeps },
  optional: Pick<CreateAppOptions, 'assistantToolSurface' | 'activateAssistantFederation' | 'recoverAssistantChatRuns' | 'onBootWork'> = {}): void
mountAdminData(required: MountInput, optional = {}): void
mountPublicSite(required: MountInput & { isAuthenticatedPreviewRevision: PreviewRevisionCheck }, optional = {}): void
applyPublicMiddleware(required: MountInput & { internalRouter: Router }, optional: Pick<CreateAppOptions, 'themeIdOverride' | 'consentAudit'> = {}): void
registerSiteIdlePark(required: MountInput & { hasBackgroundWork: () => Promise<boolean> }, optional: Pick<CreateAppOptions, 'stopForIdle'> = {}): void
```

`createApp` keeps `internalRouter` and passes it to the three users; it takes `isAuthenticatedPreviewRevision` from `mountCoreContent` and passes it to `mountPublicSite`. `PreviewRevisionCheck` is `ReturnType<typeof registerThemePreviewRefresh>`. `createApp`'s own positional signature `(routeDeps, options = {})` is existing API used by 426 files and is **not** changed to the two-object form here (practice 2 conflict, flagged: changing it is 426 call sites for no behaviour gain; owner decision 02-b).

### 2.2 Mutable module state: one owner each

| cell | owner | writers | readers (repointed in the same commit) |
|---|---|---|---|
| `siteAppBootWorkByDeps` | `site-app-boot-work.ts` | `deps.ts:2949` (design 01 `after-assembly/plugin-host.ts`) | `trackByokBootWork` (same file); `app.ts` passes it to `mountAssistant`; `sqlite-create-site-app-module-identity.integration.test.ts` |
| `busesWithSiteEventHandlers` | `site-event-subscriptions.ts` | `subscribeSiteEventHandlersOnce` only | same |
| `runExportSite` (1777) | stays with the memory literal run that uses it (1613), as a file-private const | — | — |

Both cells must stay **single module instances**: the commit that moves each one deletes the old declaration (no re-export), and the module-identity test above is the pin.

### 2.3 Function limits

| today | code lines | becomes |
|---|---|---|
| `createApp` | 248 | ≤45: app + `hasBackgroundWork` + 10 calls |
| memory trash adapters Map 637-878 | 216 | 10 builders `memoryPostTrashAdapter(required)` … `memoryTaxonomyTrashAdapter(required)` (each entry is 15-32 lines today) + `composeMemoryTrashAdapters` (≤25) |
| attachment purge loop 879-906 | 27 | `formSubmissionReader(required)` (883-894) · `formAttachmentRemover(required)` (895-904) · the loop (8) |
| memory apply port 1088-1151 | 58 | shares `publishContentPorts(required)` with design 01 §2.2 **if** the script in step 4 shows the two `ports` objects take the same port set; otherwise its own two functions |
| `subscribeSiteEventHandlersOnce` | 55 | guard + one `subscribe…` function per event family; **no** dependence on `refactor/size50-tovu-website` |
| `mountAdminSystem` | ~70 | 5 named sub-mounts, called in file order |
| forms submit registration 2566-2605 | 38 | `formFileStorage(required)` (2589-2603) + registration |

### 2.4 The default argument and the A/B file split (two phases)

- **Phase 1 (no behaviour change, no approval needed):** every slice, mount and helper leaves `app.ts`. `app.ts` keeps the two thin entry functions `createRouteDeps` and `createApp`, including `routeDeps = createRouteDeps()` and the `createSiteApp: () => createApp(routeDeps, …)` closure, which is built in the root and **passed into** its literal run as a value (a run file must not import `app.ts`: that would be a cycle). Result: `app.ts` ≈200 lines, two functions ≤50 lines. It still holds two responsibilities — a known, flagged conflict with practice 4.
- **Phase 2 (owner decision 02-a):** remove the default argument; `createRouteDeps` moves to `memory-route-deps.ts`; a ts-morph codemod rewrites the 68 zero-argument calls to `createApp(createRouteDeps())` and splits the mixed imports. Graph after: `memory-route-deps.ts → app.ts`, no back edge; the production app assembler no longer imports the in-memory seed root. This is a visible signature change, so it is not done without approval.

### 2.5 Reuse decisions (per invariant, not blanket)

| code | SQLite root | memory root | decision |
|---|---|---|---|
| guarded outbound client (egress **security policy** literal) | `deps.ts:2210-2218` | `app.ts:1156-1164` | identical → **one** function in `composition/guarded-outbound-http.ts`, used by both (one source of truth for a security default); its policy object is pinned by `toEqual` |
| publish apply `ports` object | `deps.ts:2157-2202` | `app.ts:1088-1151` | same mechanism over different repos → share `publishContentPorts` only if the input port sets are equal (script check in step 4); record the result either way |
| trash adapters | 43 lines over SQL tables | 216 lines of in-memory behaviour | different contracts → separate |
| slice result types | — | — | **not shared**; each root owns its own (revision 1 put shared types under the SQLite folder, making memory depend on its sibling) |
| `createLazyProxy` (443) | — | one user (610) | stays file-private beside that user. Not moved to Jini: one consumer is not a generic need (practice 11). Backlog note only |

## 3. Migration graph (every commit: `npm run typecheck`, `npm run typecheck:tests`, `npm run check:boundaries`, the pins; callers and tests updated in the same commit)

| # | commit | needs |
|---|---|---|
| 0 | characterization (§4), no source change | — |
| 1 | part C: `settings-registration.ts` (repoint `deps.ts:408`), `site-app-boot-work.ts` (repoint `deps.ts:408/2949` and the identity test), `site-event-subscriptions.ts` (move, then split in a second commit) | 0 |
| 2 | part B helpers → `http-app/module-handles.ts`, `public-middleware.ts` | 1 |
| 3 | part B mounts, bottom-up (`mount-public-site` first, `mount-core-content` last), one per commit; `visitor-submit.ts` before `mount-public-site` | 2 |
| 4 | part A in-place function splits (§2.3), then the share-check script for the apply ports | 0 |
| 5 | part A slices, one per commit, later bindings passed as getters from the root (design 01 §2 rule); then literal runs; then `assemble.ts` | 4; design 01 step 8 only if `publishContentPorts` is shared |
| 6 | `guarded-outbound-http.ts`, used by both roots | 5 and design 01 step 6 |
| 7 | `size-debt.json` cleanup for `app.ts` entries | 6 |
| P2 | phase 2 (§2.4), only after owner approval | 7 |

Steps 1-3 do not depend on design 01 and are the lower-risk half; run them first.

## 4. Tests (website tests run on `node --test` with tsx, not vitest)

Characterization (step 0):
- **Route table:** walk the Express router stack; snapshot `index, method, path, handler name` for: default; `activateAssistantFederation`; admin assistant on/off; `themeIdOverride` set; `consentAudit` set; `stopForIdle` set. It pins registration order only.
- **Precedence over HTTP (supertest):** an admin API path is not swallowed by the site catch-all; the oversized-body responder and error capture still answer last; with `themeIdOverride` the preview switcher is absent.
- **Lifecycle transcript with fakes:** a recording `bus` (two `createApp` calls on the same deps subscribe once; a second deps object subscribes again); a fake `assistantToolSurface` whose `ready` promise is held open — it appears in `siteAppBootWorkByDeps.get(deps)`, `onBootWork` receives it, and it is removed after it settles (resolve and reject cases); `stopForIdle` installs exactly one stop hook; `recoverAssistantChatRuns` reaches the chats module.
- **Visitor capabilities:** fake keyring → the salt resolver is called **once per `createApp`**, not per request, with the keyring passed; a rejecting keyring surfaces the existing behaviour (record it); fake `siteBackupSources.isMediaRemote` → `readUploadFreeBytes` returns `undefined` without `statfs`; missing System principal → the exact "form uploads require the site's System principal" error.
- **Memory root:** design 01's shape test against `createRouteDeps()`; trash round-trip per entity type (post, redirect, comment, media, form, form_submission, widget, menu, term, taxonomy) through `routeDeps.trash`; `taxonomyDb` is not opened when no taxonomy call is made.

Source-reading tests (12 read `app.ts`): repointed in the commit that moves their anchor; no assertion deleted; count before = after. New unit tests use interface fakes only.

## 5. Owner practices check

| # | status |
|---|---|
| 1 DI | mounts receive `app` + `routeDeps`; module state has one owner and is passed in (`bootWorkByDeps`) |
| 2 args | new functions use `(required, optional = {})`; **conflict:** `createApp(routeDeps, options)` and `mountRoutes(app, mod)` keep their positional shape (existing call sites) — decision 02-b |
| 3 size | §2.3 |
| 4 slicing | conflict in phase 1: `app.ts` holds two thin roots until 02-a is approved |
| 5 no re-exports | old declarations deleted in the moving commit; importers repointed by symbol |
| 6 comments | 330 "why" comment lines in `createApp` move with their statement (review with `git diff --color-moved=zebra`) |
| 7 boundaries | nothing generic created in Tovu; R7 (wave E) later replaces `mountJsonRoute(app)` calls with `ServerRoute[]` lists — after this split that lands in the named mount files |
| 8 tests | fakes of interfaces; characterization first |
| 9 errors | no text changed. **Flagged:** `console.log("event handled:", …)` at 1828 logs a raw payload (not redacted) — follow-up, not part of a move |
| 10 | no new disables; no silent change (phase 2 is an explicit, approved change) |
| 11 | file keeps its name; no new abstraction |
| 12 memory/IO | per-request cost unchanged; the salt and limiters are still built once per app. `formSubmissionReader` (884-893) loads **all** submissions of a form, sorts and slices per page — existing cost, memory root only, noted |

## 6. Risks

| risk | de-risk |
|---|---|
| a cross-mount value is dropped | §2.1 contracts; TypeScript makes the missing argument an error |
| WeakMap/WeakSet duplicated → the store closes under export boot work | §2.2; module-identity test; lifecycle transcript |
| route order shifts | route table after every commit + precedence checks |
| deferred read made eager in the memory root | fact 5 list; getters only |
| codemod misses a string import | grep the bare path after each repoint |

## 7. Estimate

≈52 commits (0: 3 · 1: 4 · 2-3: 11 · 4: 6 · 5: 24 · 6-7: 2 · phase 2: 2). Sonnet executor **≈1.0M tokens** (was 780k). Risk: **high** for part A, medium for B/C.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | blocker | accepted | `app.ts:2066`→2496 and `options.` reads at 2355, 2361, 2386, 2387, 1953 confirmed. §2.1 lists every mount's inputs, outputs and option subset |
| 2 | major | accepted | Default at 2040; 68 zero-argument callers; `createSiteApp` at 1634 calls `createApp`; `no-circular` exists (`.dependency-cruiser.mjs:96`). §2.4: phase 1 keeps the default and both roots in `app.ts`; removing it is phase 2, behind owner decision 02-a |
| 3 | major | accepted | `siteAppBootWorkByDeps` 1802, `busesWithSiteEventHandlers` 1799, `mountRoutes` 1788, `startModule` 1794, `runExportSite` 1777, `registerSiteChatBundle` 2020 now have owners (§2, §2.2) |
| 4 | major | accepted | Measured (`work/deferred-reads.md`): 10 later bindings read from closures at 483-984. Memory slices follow their own contiguous ranges; file names no longer claim to mirror the SQLite order |
| 5 | major | accepted | 216-line map, 58-line apply port, 55-line subscribe function confirmed on this base. §2.3 gives the function-level split; no reliance on another branch |
| 6 | major | accepted | Route table demoted to "order only"; lifecycle transcript, subscription, boot-work, precedence and option tests added; all eight options covered |
| 7 | major | accepted | 2532-2537 and 2583-2603 confirmed. The three registrations move as capability constructions (`visitor-submit.ts`); tests use fake keyring/storage and assert construction frequency; the existing `resolveCommentsIpHashSalt` is reused untouched |
| 8 | major | accepted (narrower) | Guarded client is shared (identical security literal); apply ports shared only on a measured equal contract; result types not shared at all. `createLazyProxy`: the judge asks for Jini-first or a deferral; evidence `app.ts:443/610` shows one private user, so it stays private with a backlog note (practice 11) |

Accepted 8 · rebutted 0 · blockers left 0.
