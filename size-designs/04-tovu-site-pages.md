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
