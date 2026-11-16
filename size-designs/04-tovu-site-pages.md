> **Revision 2:** read `## Revision 2` at the end first; it overrides the sections above where they differ.

# 04 — Tovu `apps/website/src/server/inbound/public-http/routes/site/pages.ts`

Measured at `origin/integ/wave-b-fixed`: 2,994 lines (1,376 code), 58 imports. Path in the brief lacked `inbound/`.
Over-limit functions: `registerSiteRoutes` (2859-2994, **88** code lines, error), `finishStaticTierDocument` (807-876, 58, warning). Everything else is ≤50; like design 03 this is mostly a file-level split.

## 1. Current shape

The file is the public page router **and** every "resolve X for render" helper the router, the theme preview, the admin template preview and the member pages need (9 production importers, 29 tests).

| lines | concern | real owner |
|---|---|---|
| 135-199 | `buildExtraHead`, `tryRedirectPhase` | page routes |
| 212-233, 1158-1172 | site title / time zone for render | render-context resolution |
| 244-369 | static-export request header, four `CACHE_CONTROL_*` constants (each with a long rationale) | request policy |
| 280-293, 405-446 | site-assistant widget, widgets, HTML embeds for render | render-context resolution |
| 387 | `export { resolveActiveThemeId, resolveActiveTheme }` re-export | delete |
| 454-467, 629-705, 734-755 | nav target → route target, static menu resolution | `features/navigation` |
| 515-623, 707-732 | docs sidebar / section / prev-next pager menus | `features/navigation` |
| 807-881, 2802-2824 | static-tier document finishing, static theme index | static tier |
| 891-1072 | collection markers → entry lists (`resolveCollectionListsForRender`) | `features/entries` |
| 1098-1126, 1509-1594 | `renderViaTemplate`, missing-template page | template render |
| 1142-1226, 2666-2668 | dependency types (`TemplateRenderDeps`, `ContentMarkerResolutionDeps`, …) | render-context resolution |
| 1232-1388 | HTML-format content markers (bounded fetch, depth 1142-1145) | render-context resolution |
| 1409-1436 | assigned terms, `placeAfterCurrentContent` | render-context resolution |
| 1618-1782 | media transform versions, media-ref walk, asset metadata, featured image | `features/media` |
| 1794-1966 | theme-less response, fault report, slug parsing, marketing page / override | handlers |
| 1982-2178 | post page: bare page, template branch, generic post, not-found paths | handlers |
| 2195-2372 | member access decisions, post previews (plain + keyed batches) | render-context resolution |
| 2376-2417, 2542-2663 | listing JSON + `/_more/` batch + `/page/N` rewrite. **Three module-level maps** (`listingBatchRequests` 2591, `listingJsonPages` 2594, `listingPageRequests` 2598) are shared by the rewrite middleware and the serve handlers | handlers |
| 2424-2537, 2672-2678 | per-visitor response (form flash cookie, cache class), final HTML, `sendPublicPage` | response |
| 2578-2588, 2682-2852 | home page, content home, slug error, `serveVirtualPage` | handlers |
| 2859-2994 | `registerSiteRoutes`: 5 routes in order — `/_more/…` rewrite, `/page/N` rewrite, `/`, nested path, `/:slug` | root |

## 2. Target shape

```
server/inbound/public-http/routes/site/
  pages.ts                          registerSiteRoutes = 4 registrar calls in today's order               ~60
  pages/
    request-policy.ts               244-369 (constants WITH their rationale blocks), isStaticExportRequest,
                                    resolveRequestedSlug, redirectLookupPath                               ~180
    response.ts                     2424-2537, 2672-2678  flash cookie, resolvePerVisitorResponse,
                                    finalizePublicPageHtml, sendPublicPage                                 ~160
    extra-head.ts                   135-167                                                                ~50
    redirect-phase.ts               177-199                                                                ~40
    static-tier.ts                  807-881, 2802-2824  (finishStaticTierDocument split in two)            ~160
    template-render.ts              1098-1126, 1509-1594                                                   ~170
    render-context/
      deps.ts                       the dependency types (1142-1226, 2666-2668), no logic                  ~110
      site-title.ts                 212-233, 1158-1172                                                     ~50
      widgets.ts                    280-293, 405-446                                                       ~90
      content-markers.ts            1232-1388                                                              ~170
      taxonomy.ts                   1409-1436                                                              ~40
      member-access.ts              2195-2236                                                              ~60
      post-previews.ts              2245-2372                                                              ~150
    handlers/
      listing.ts                    2376-2417, 2542-2663  the three maps + every function that reads or
                                    writes them + registerListingRewrites                                  ~210
      home.ts                       2578-2588, 2682-2781 + registerHomeRoute                               ~170
      marketing.ts                  1866-1966                                                              ~110
      post.ts                       1982-2108  bare page, template branch, generic post                    ~150
      post-not-found.ts             2120-2178, 2785-2799                                                   ~100
      virtual-page.ts               1794-1834, 2833-2852                                                   ~80
      slug-routes.ts                registerNestedPathRoute, registerSlugRoute (bodies of 2897-2994)       ~120
features/navigation/
  static-menus.ts                   454-467, 629-705, 734-755                                              ~160
  docs-menus.ts                     515-623, 707-732                                                       ~170
features/entries/
  collection-lists-render.ts        891-1072                                                               ~190
features/media/
  render-metadata.ts                1618-1782                                                              ~190
```

24 files, largest ~210. Direction: `pages.ts → handlers → {template-render, static-tier, response, render-context/*} → features/* and http/site/render/*`. `render-context/*` never imports `handlers/*`.

### Signatures that change shape (everything else moves verbatim)

```ts
// pages.ts
export const registerSiteRoutes: RouteRegistrar = ({ app, deps }, _options = {}) => {
  const siteDeps = …;                                  // the 2-3 lines of dep narrowing that open the function today
  registerListingRewrites({ app }, {});                // /_more/… then /page/N — order kept
  registerHomeRoute({ app, deps: siteDeps }, {});
  registerNestedPathRoute({ app, deps: siteDeps }, {});
  registerSlugRoute({ app, deps: siteDeps }, {});
};

// handlers/listing.ts owns the request-keyed state; nothing else may declare a second map
const listingBatchRequests = …; const listingJsonPages = …; const listingPageRequests = …;
export function registerListingRewrites({ app }: { app: Express }, _options = {}): void
export function withListingBatch(…)        // moved as-is
export function assertListingPageServed(…) // moved as-is

// static-tier.ts — the 58-line function becomes two; the seam is between "collect head/asset additions"
// and "apply body injections". No statement is reordered.
function collectStaticTierHead(required: StaticTierDocumentInput, _options = {}): StaticTierHead
export function finishStaticTierDocument(required: StaticTierDocumentInput, options = {}): string   // signature unchanged
```

`features/*` files take their repositories as arguments exactly as today (`deps.menuRepo`, `deps.entryRepo`, `deps.mediaRepo` are already passed in); the only edit is the import path of their dependency *types*, which come from the feature's own contracts, not from `render-context/deps.ts`. If a moved function's parameter type is declared in this file and is used only by it, the type moves with the function. Placement rule = design 03 §2 (run `check-architecture`; never add a baseline entry; fall back to `pages/<same name>.ts` and report).

## 3. Step order

0. **Characterization (no source change)**: `routes/site/__tests__/pages.response-matrix.characterization.test.ts` on an in-memory site (`createRouteDeps` + `createApp`), one request per row, snapshot `status, cache-control, vary, location, set-cookie names, sha1(body)`:
   `/` (content home, static-theme index, no themes) · `/:slug` (post, page, marketing override, missing, redirect hit) · nested path (ok, traversal-rejected) · `/page/2`, `/page/999` · `/_more/<marker>/<n>` (ok, unknown) · static-export header on/off · form-flash cookie present · member-gated post as anonymous and as member · plugin-export hosts present. ~22 rows.
1. Delete the line-387 re-export; repoint its importers to `features/presentation/active-theme-id` / `features/theme/active-theme`.
2. Leaves first: `request-policy.ts`, `render-context/deps.ts`, `site-title.ts`, `extra-head.ts`, `redirect-phase.ts`.
3. Feature moves (each is self-contained): `features/media/render-metadata.ts`, `features/navigation/static-menus.ts`, `docs-menus.ts`, `features/entries/collection-lists-render.ts`. Repoint the external importers of the moved exports (`resolveStaticMenusForRender`, `resolveMediaTransformVersionsForRender`, `resolveMediaAssetMetadataForRender` are used by `theme-page-preview.ts`, `template-preview-render.ts`, `member-pages.ts`, `products.ts`, `commerce-http.ts`).
4. `render-context/{widgets,content-markers,taxonomy,member-access,post-previews}.ts`.
5. `response.ts`, `static-tier.ts` (with the one function split), `template-render.ts`.
6. Handlers: `listing.ts` (all three maps in one commit — never split across commits), `marketing.ts`, `post.ts`, `post-not-found.ts`, `virtual-page.ts`, `home.ts`.
7. `slug-routes.ts`; shrink `registerSiteRoutes` to the four calls; remove `pages.ts` + `registerSiteRoutes#1` (+ nested arrow entries) from `size-debt.json`.

One commit per file. Gate per commit: `tsc`, response matrix, the 29 importing test files, design 02's route-table snapshot if it has landed.

## 4. Tests

- Existing 29 test files + the response matrix pin behaviour end to end. **4 tests read `pages.ts` as text** — repoint the path to the file that now holds the anchor; keep every assertion.
- New fake-based unit tests where logic was previously only reachable through HTTP: `handlers/listing.test.ts` (rewrite → serve handshake through the maps; unknown batch → 404 path), `features/navigation/docs-menus.test.ts` (pager prev/next at both ends), `features/entries/collection-lists-render.test.ts` (the `MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE` cap), `render-context/content-markers.test.ts` (`MAX_CONTENT_EMBED_DEPTH`, `MAX_CONTENT_EMBED_FETCHES`). Fakes implement the repo interfaces; no SQLite.

## 5. Risks

| risk | de-risk |
|---|---|
| the three request-keyed maps end up duplicated (rewrite writes map A, handler reads a fresh map B → every `/page/N` 404s) | single owner module; step 6 moves them atomically; the response matrix has `/page/2` and `/_more/` rows |
| route order (`/` before nested before `/:slug`; rewrites first) | four registrar calls in source order; response matrix; route-table snapshot |
| cache-class regressions (a private response served `public`) — the constants' comments are the spec | constants move with their full comment blocks into `request-policy.ts`; matrix rows assert `cache-control` for flash, member, static-export |
| `asyncRoute`/`next(err)` wrapping lost when route bodies become named functions | bodies move as whole callback expressions; `slug-routes.ts` keeps `asyncRoute({ handler })` exactly |
| features → server edge | placement rule |

## 6. Interaction with planned work

- `CLASSIFY-files.tsv` row: MIXED → collections go to `@jini-ai/cms` `widgets/resolvers` (shared core of `resolveCollectionInstance`; host supplies `renderEntryList`, `contentTypeRepo`, `entryRepo`). `features/entries/collection-lists-render.ts` is cut to be that slice. Also generic (flag only): `handlers/listing.ts` batch/page protocol next to `@jini-ai/cms/listing`; `features/media/render-metadata.ts` media-ref walk → `@jini-ai/cms/media`.
- `media-rendition.ts` (753 lines, same folder) has its own MIXED row → `@jini-ai/http-kit`; not in scope.
- No untangle lane touches this file.
- **Run after design 03** (imports ~20 names whose paths change there; doing 04 first means repointing them twice).

## 7. Estimate

≈27 commits. Sonnet executor **≈480k tokens** (matrix test 80k; 24 files × 13k; importer repoints 50k; registrar + debt 40k). Risk: **medium-high** (HTTP behaviour, shared module state, cache policy).


## Revision 2 (2026-11-16, after the Codex judgment)

Re-verified at Tovu `integ/wave-b-r2` (65302ee5): `pages.ts` 2,994 lines, 138 functions; **two functions are over 50 code lines**: `finishStaticTierDocument` (807, 58) and `registerSiteRoutes` (2859, 88) (`work/function-sizes.cjs`). 38 files import it; 58 files name its path as text. Judge: "needs rework" (5 majors, 1 minor). **6 accepted, 0 rebutted.** Run after design 03.

### R1. Target tree changes (these override the §2 tree)

1. **Nothing moves to `features/`.** `features/navigation/static-menus.ts`, `docs-menus.ts`, `features/entries/collection-lists-render.ts` and `features/media/render-metadata.ts` are **not** created. Verified reasons: collection rendering calls `formatPostPreviewDate` (926 → 2245) and `siteTimeZoneDep` (1017 → 1158), both server render-context code; `resolveFeaturedImageForRender` (1772) calls the server renderer's `featuredImageView` (1781); the dependency types are `RouteDeps`-derived (1152-1155, 1187-1226). Final placement, stated now: `pages/render-context/collection-lists.ts` (891-1072) and `pages/render-context/media-metadata.ts` (1618-1782). A later move into a feature or Jini needs narrow ports for date formatting, time zone and featured-image view first; that is a separate design.
2. **Menus are one responsibility, one file:** `pages/render-context/static-menus.ts` = 454-467 + 515-755 (≈300 lines). `resolveOneStaticMenu` (674) calls the docs resolvers (702, 704); they call `findStaticMenu` (714 → 661) and `resolveMenuContent` (581 → 629). Splitting them made a mutual import.
3. **Listing state gets a lower owner.** New `pages/listing/` folder:

   | file | owns | imports |
   |---|---|---|
   | `listing-state.ts` | the three WeakMaps (`listingBatchRequests` 2591, `listingJsonPages` 2594, `listingPageRequests` 2598), their record types, and the only functions that read or write them, including `storeListingJsonPage` (2376) | types only |
   | `request-policy.ts` (existing target) | `isStaticExportRequest` (253), `redirectLookupPath` (2603) | `listing-state` |
   | `listing-batch.ts` | `withListingBatch` (2631): **request enrichment** — SEO, plugin-export session, consent assets, comments, the late-bound script buffer. Tovu host code, not a generic listing protocol | `listing-state`, `request-policy` |
   | `handlers/listing.ts` | the listing route handlers + `registerListingRewrites` | all three above |

   `render-context/post-previews.ts` calls `storeListingJsonPage` (2301) from `listing-state`, so `render-context/* → handlers/*` never happens. Each WeakMap has one declaring module and is never exported as a value: the accessors are.
4. **`finishStaticTierDocument` — the real contract.** It is `(deps: TemplateRenderDeps, input: { theme, pageId, html, currentPath, staticMenus, postPreviewsAccess?, featuredImage?, postAuthor? }): Promise<string>` (807-821), async, with this effect order (824-875): expand partials → resolve embeds → assign listing keys → discover menus → resolve previews and collections → render the static page → obtain document assets. Split along that sequence, in `pages/static-tier.ts`:
   - `prepareStaticTierHtml(required)` — partials, embeds, listing keys;
   - `resolveStaticTierData(required)` — menus, previews, collections;
   - `finishStaticTierDocument` — prepare → resolve → render → assets (≤30 lines).
   The split keeps the positional `(deps, input)` shape. Practice 2 wants `({ deps, input }, optional = {})`: that is done as **one separate commit after the split**, with every caller in the same commit (step 8). §2's `(required, options = {}): string` sketch was wrong and is deleted.
5. **`registerSiteRoutes` (88 code lines).** There is no "dep narrowing" at its top: it starts by installing the two rewrite routes (2863 `/_more/…`, 2874 `/page/N`), then `/` (2883), nested paths (2897), `/:slug` (2909). Target: `registerListingRewrites`, `registerHomeRoute`, `registerNestedPathRoute`, `registerSlugRoute` — one `app.get` each — called in that order from a ≤15-line root. Request enrichment (`withListingBatch`) stays **inside each request callback**, so it still runs after the rewrite recorded its state.
6. **Count:** after R1 the tree is `pages.ts` + 6 top-level slices + 9 `render-context/` (deps, site-title, widgets, content-markers, taxonomy, member-access, post-previews, static-menus, collection-lists, media-metadata → 10) + 3 `listing/` + 7 `handlers/` = **27 files** (26 new). Step 0b's symbol sheet is the source of truth; the script fails on a symbol assigned twice or not at all.

### R2. Migration graph (overrides §3)

Every commit: `npm run typecheck`, `npm run typecheck:tests`, `npm run check:boundaries`, `npm run check:architecture`, the response matrix.

| # | commit | needs |
|---|---|---|
| 0a | response matrix + effect-order test (R3) | design 03 merged |
| 0b | symbol sheet, importer sheet (38 importers; 58 text mentions) | — |
| 1 | `listing-state.ts` (maps + accessors + `storeListingJsonPage`), callers in the same commit | 0 |
| 2 | `request-policy.ts`, then `listing-batch.ts` | 1 |
| 3 | leaf render-context files (deps types, site-title, taxonomy, member-access, widgets, content-markers), one per commit | 0 |
| 4 | `static-menus.ts` (one commit), `collection-lists.ts`, `media-metadata.ts`, `post-previews.ts` | 1, 3 |
| 5 | in-place split of `finishStaticTierDocument`, then move to `static-tier.ts`; `template-render.ts`, `response.ts`, `extra-head.ts`, `redirect-phase.ts` | 4 |
| 6 | handlers, one per commit, listing last | 2, 5 |
| 7 | in-place split of `registerSiteRoutes`; delete the re-export at 387 and repoint its importers | 6 |
| 8 | `finishStaticTierDocument` signature to `({ deps, input }, optional = {})` with all callers | 7 |

### R3. Tests (overrides §4 where they differ)

- **Security header is observed:** the matrix row "plugin-export hosts present" asserts the report-only policy header that `addPluginExportHostsToResponse` (2512, applied at 2523) writes, with three distinguishable hosts (one script, one frame, one connect). Deleting line 2523 must turn this row red — the executor proves it once by mutation and reverts.
- **Listing responses** assert `Content-Type` and the JSON page shape.
- **Body hashes:** `finalizePublicPageHtml` (2518) generates form attempt ids with `randomUUID()` (2529, 2531). The matrix replaces only those ids before hashing and asserts separately that each form carries one, and that two requests get different ones.
- **Effect order:** fake `TemplateRenderDeps` records calls; the test asserts partials → embeds → menus → previews → collections → render → assets, and that assets are requested exactly once.
- **Rewrites before enrichment:** a `/page/2` request reaches the home handler with the listing page recorded and `redirectLookupPath` returning the original path.

### R4. Owner practices check

| # | status |
|---|---|
| 1 DI | handlers receive `deps`; module state reachable only through `listing-state` accessors |
| 2 args | conflict today: `finishStaticTierDocument(deps, input)`, `siteTimeZoneDep(deps)`, `isStaticExportRequest(req)`, `withListingBatch(deps, req)` are positional. Step 8 fixes the exported one; the other three are private helpers moved verbatim and listed for the size-50 follow-up |
| 3 size | the two oversized functions are split (R1.4, R1.5); largest file `static-menus.ts` ≈300 |
| 4 slicing | by responsibility; menus and listing state no longer cut across files |
| 5 no re-exports | line 387 deleted |
| 6 comments | the request-policy rationale blocks (244-369) move with their constants |
| 7 boundaries | no feature→feature or feature→server import created; nothing claimed for Jini |
| 8 tests | matrix + effect order before any move; fakes of `TemplateRenderDeps` |
| 9 errors | no text changed |
| 10 | no silent change; step 8 is an explicit signature change with all callers |
| 11 | no new abstraction; `listing-state` is a move of existing state, not a new layer |
| 12 memory/IO | public page hot path: no added work. The three WeakMaps stay request-keyed (collected with the request); `storeListingJsonPage` cost unchanged |

### R5. Estimate

≈31 commits, Sonnet **≈540k tokens** (was 480k). Risk: **medium-high**.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | major | accepted | `resolveOneStaticMenu` 674 → docs resolvers 702/704; `resolveDocsSectionItem` 577 → `resolveMenuContent` (581); `resolveDocsSectionMenu` 717 → `findStaticMenu` (714). R1.2: one file |
| 2 | major | accepted | `storeListingJsonPage(` at 2301; `redirectLookupPath` (2603) reads `listingPageRequests` (2604); `withListingBatch` (2631) calls `isStaticExportRequest` (2634/2643). R1.3: `listing-state` below both; enrichment separated and kept as host code |
| 3 | major | accepted | Signature at 807-821 is `(deps, input): Promise<string>`. R1.4 states the real contract, the split along the real sequence, and an effect-order test |
| 4 | major | accepted | Calls at 926, 1017, 1781 confirmed. R1.1: feature moves withdrawn, final placement stated |
| 5 | major | accepted | `addPluginExportHostsToResponse(` applied at 2523; `randomUUID(` at 2529/2531. R3 |
| 6 | minor | accepted | Rewrites at 2863/2874 open the registrar; enrichment is per request. R1.5, count in R1.6 |

Accepted 6 · rebutted 0 · blockers left 0.
