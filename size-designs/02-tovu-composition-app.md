# 02 — Tovu `apps/website/src/server/runtime/composition/app.ts`

Measured at `origin/integ/wave-b-fixed`: 2,690 lines (1,709 code), 293 import declarations (1-403). Not exempt.
`createRouteDeps` 469-1732 (880 code), `createApp` 2040-2618 (248 code, 579 raw — more than half is "why" comments).
`subscribeSiteEventHandlersOnce` (1820-1909) is already ≤50 on `refactor/size50-tovu-website` (4917d9f8): **move it, do not redesign it.**

## 1. Current shape

The file holds three unrelated things.

**A. The in-memory composition root** — `createRouteDeps(options)` (469-1732), the twin of design 01. 465 test files and the `useMemory` boot path call it.

| lines | responsibility (same slice names as design 01) |
|---|---|
| 426-466 | `CreateRouteDepsOptions`, `createLazyProxy`, `inMemoryPluginRuntimeOptions` |
| 470-502 | audit sink, workspace/post/presentation/settings repos, clock/id, plugin runtime |
| 503-550 | identity, settings principals, settings-ready chain, site title |
| 551-581 | newsletter list repo, origin registry |
| 582-632 | redirect/outbox/bus/restore-point/comment/media/form/entry repos, trash registry + repo, taxonomy repos |
| 633-906 | **trash adapters: 216-line inline map + a 27-line `for…of` registration loop** (SQLite twin is 43 lines — these are *not* the same code) |
| 907-955 | trash service, `removePlugin`, redirects write deps + handlers |
| 956-1016 | widget/menu/form/content-type repos, `wireCoreResolvers`, comments module |
| 1017-1087 | members, newsletter keyring/hooks, assistant secrets, external MCP, public origin, change sets, media + publish-content repos |
| 1088-1196 | publish-content apply port (58), chat history, outbound client, SEO, site binding, agent-plugin lifecycle, consent |
| 1198-1727 | **the `routeDeps` literal (530 lines)** + 4 post-assembly lines |

**B. The Express app assembler** — `createApp` (2040-2618) with helpers `trackByokBootWork` (1944), `applyPublicMiddleware` (1957), `registerAdminSpa` (2009), `registerSiteIdlePark` (2030). 100+ `mountRoutes`/`register*` calls whose **order is behaviour** (Express matches in registration order; the catch-all `registerSiteRoutes` is last before the error handlers).

**C. Two boot helpers** — `subscribeSiteEventHandlersOnce` (1820-1909) and `startSettingsRegistration` (2625-2690).

## 2. Target shape

```
server/runtime/composition/
  http-app.ts                        createApp (≈35 code lines: 8 mount calls in order) + CreateAppOptions   ~110
  http-app/
    public-middleware.ts             applyPublicMiddleware, registerSiteIdlePark, hasBackgroundWork,
                                     registerAdminSpa                                                        ~140
    mount-core-content.ts            2052-2078  plugin contribution routes, event subscriptions, core,
                                     content, publish-content                                                ~80
    mount-members-newsletter.ts      2085-2156  the three limiters, members deps, newsletter deps           ~130
    mount-admin-system.ts            2160-2248  analytics, site-assistant module, status/observability/
                                     mail/daemon/deployment/sites/export/share/import/backup/consent/
                                     publish/credentials/site-key/fs-files                                   ~170
    mount-admin-features.ts          2253-2343  comments moderation … database recovery (17 modules)        ~150
    mount-assistant.ts               2355-2416  BYOK module + trackByokBootWork, federation activation,
                                     admin-assistant gating, settings/execution modules                      ~130
    mount-admin-data.ts              2426-2451  content types, taxonomy, merge/migrate/restore, SEO,
                                     site search, admin SPA                                                  ~70
    mount-public-site.ts             2459-2617  static assets, sandbox proxy, site chat, theme preview/
                                     static/page preview, commerce, member pages, site routes, error tail   ~170
    visitor-submit-deps.ts           the three inline deps literals (comments 2522-2538, analytics
                                     2544-2558, forms 2566-2605) as three builders                          ~120
  site-event-subscriptions.ts        subscribeSiteEventHandlersOnce, moved unchanged                        ~110
  settings-registration.ts           startSettingsRegistration (2625-2690)                                  ~80
  memory-route-deps.ts               createRouteDeps (≈40 code lines) + CreateRouteDepsOptions              ~120
  memory-deps/
    lazy-proxy.ts                    createLazyProxy                                                         ~30
    base.ts                          MemoryCompositionBase + composeMemoryBase                               ~110
    slices/                          one file per slice, SAME FILE NAMES as site-deps/slices/ (design 01):
      plugin-runtime.ts identity.ts settings.ts events-origin.ts trash.ts trash-adapters.ts (split in
      three: content adapters / taxonomy+form adapters / registration loop, ≤230 each) redirects.ts
      content-repos.ts comments.ts site-keys-members.ts assistant-secrets.ts content-publish.ts
      outbound-http.ts agent-plugins.ts                                              16 files, 40-230 each
    route-deps/                      fragments, SAME NAMES as site-deps/route-deps/; assemble.ts
```

`app.ts` is deleted. No file re-exports `createRouteDeps`/`createApp` from the old path.

### Signatures

```ts
// http-app.ts
export function createApp(routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps, options: CreateAppOptions = {}): Express
//   (public signature unchanged — 465 tests call it positionally)

// every mount file: one exported function, statements moved verbatim with their comments
export function mountAdminSystem({ app, routeDeps }: MountInput, _options = {}): void
export function mountAssistant({ app, routeDeps, internalRouter }: MountInput & { internalRouter: Router }, options: Pick<CreateAppOptions, 'activateAssistantFederation'> = {}): void
// mount files over 50 code lines are split into named sub-mounts in the same file
//   (e.g. mountAdminSystem = mountObservabilityAdmin → mountMailAdmin → mountSiteAdmin → mountCredentialAdmin)

// memory slices mirror design 01
export function composeMemoryTrash(input: { base: MemoryCompositionBase; repos: MemoryContentRepos; … }, _options = {}): TrashSlice
```

Slice result types (`TrashSlice`, `ContentReposSlice`, …) are declared once, next to the SQLite slice in `site-deps/slices/<x>.ts`, in terms of **port interfaces** (`TrashRepo`, not `SqliteTrashRepo`); the memory slice returns the same type. That is what makes the fragments shareable.

### The twin question (decision recorded here)

Do **not** merge the SQLite and in-memory roots in this pass. Rule for the executor: a `route-deps/<x>-fragment.ts` is shared (the memory root imports the one under `site-deps/route-deps/`) **only if** a script shows the two literals' key sets and value expressions for that fragment are identical after identifier renaming; otherwise the memory root gets its own fragment file. Slices are never shared in this pass. Merging slices is a follow-up with its own evidence (the trash adapters alone differ by 170 lines).

## 3. Step order

0. **Characterization (no source change)**
   - `__tests__/http-app.route-table.characterization.test.ts`: build `createApp(createRouteDeps())`, walk the router stack (Express 4 `app._router.stack`; Express 5 `app.router.stack`; recurse into mounted routers) and snapshot `index, method, path-or-regexp, handler name`. Run once per option combination that changes mounting: default, `activateAssistantFederation`, admin assistant enabled/disabled. This single snapshot pins the whole of part B.
   - Reuse design 01's shape test against `createRouteDeps()` (key order, `typeof`, identity groups).
1. Move part C (two files). Repoint importers.
2. Part B: extract helpers into `public-middleware.ts`; then one mount file per commit, top to bottom; `createApp` shrinks each time. Route-table snapshot must be byte-identical after every commit.
3. `git mv app.ts memory-route-deps.ts` is **not** possible while `createApp` is in it — so create `http-app.ts` with `createApp` + options, repoint `createApp` importers by codemod, leave `app.ts` holding only part A.
4. Part A: `lazy-proxy.ts`, `base.ts`, then slices one per commit (same loop as design 01 step 4), then fragments with the share-or-fork rule, then `assemble.ts`.
5. `git mv app.ts memory-route-deps.ts`; repoint importers; update `size-debt.json` (file entry, `createRouteDeps#1`, `createApp#1`, nested entries).

**Import codemod (steps 3, 5):** 465 test files import from `composition/app`. Many import `createApp` *and* `createRouteDeps` in one statement; a specifier-only `sed` is wrong. Use a ts-morph script that splits named imports by the symbol's new home; run it once per step; `tsc -p tsconfig.tests.json` is the gate.

## 4. Tests

- Step-0 snapshots are the main pin. Existing pins: `create-app-event-subscriptions-once.integration` (red on base — record), `serving-app-boot-wiring.unit.test.ts`, `index-boot.characterization.test.ts`.
- **12 tests read `app.ts` as text.** Same treatment as design 01 §4: repoint `readCode(path)`, keep every assertion, cross-file order assertions become "order of mount calls in `http-app.ts`" + "anchor present in its mount file". Test count before = after.
- New fake-based tests: `visitor-submit-deps.test.ts` (three builders are pure functions of `routeDeps` — assert the exact keys forwarded), `lazy-proxy.test.ts` (method binding, `has` trap).

## 5. Risks

| risk | de-risk |
|---|---|
| route order shifts (a public catch-all swallows an admin route) | route-table snapshot after every commit; mount calls in `http-app.ts` keep source order; no mount file is allowed to reorder its statements |
| a "why" comment separated from its `register*` line (330 comment lines in `createApp`) | move statement + leading comment block as one unit; reviewer diffs with `git diff --color-moved=zebra` and expects zero non-moved comment lines |
| executor merges the twins "because they look the same" | explicit share-or-fork rule; slices never shared in this pass |
| codemod misses `vi.mock("…/composition/app")` / dynamic `import()` strings | grep for the bare path string after the codemod; fix by hand |
| option-dependent mounting not covered by default snapshot | three option combinations in step 0 |

## 6. Interaction with planned work

- Same coordinator rule as design 01 (`LANES.md` "Shared files"): R7 (wave E) replaces 83 `mountJsonRoute(app)` calls with `*Routes(): ServerRoute[]` mounted from a new `composition/jini-routes.ts`; after this split that one-line use lands in a named mount file instead of the 579-line function. Do this design before wave E.
- `CLASSIFY-files.tsv`: `modules/settings.ts` is DELETE-AFTER-PARITY (Jini `core/settings/express`) — it changes one line in `mount-admin-features.ts`; `modules/site-assistant.ts`, `modules/site-search.ts` MIXED — unaffected (callers only).
- Generic → Jini: `createLazyProxy` (`@jini-ai/core`), the router-stack walker used by the characterization test (`@jini-ai/http-kit` test helper).
- Must run **after design 01** (slice result types, `LateRef`, shape test are created there).

## 7. Estimate

≈40 commits. Sonnet executor **≈780k tokens** (step 0: 70k; part C: 30k; part B: 9 × 18k; codemods: 70k; part A slices 16 × 22k; fragments 130k; rename + debt 60k). Risk: **high** (blast radius 465 test importers), lower than 01 in logic risk.
