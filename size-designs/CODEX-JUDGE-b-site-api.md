Software Architect(Review Mode): **All three designs need rework.**

Evidence below uses the requested refs: Tovu `1ae82a76601039a064349765006ab4b2ac8bb7eb`; Jini `1fd7c076323acc3884f32562aed779ce1da817e3`. Source line numbers refer to those revisions. No files were edited or application tests run. The requested Code Review persona was missing; I loaded the available Code Inspection persona instead.

## 03 — Site renderer: needs rework

Target: `apps/website/src/server/inbound/public-http/http/site/render.ts`.

1. **Major — The proposed dispatcher split creates another recursion cycle.**  
   **Evidence:** Design lines 40–45 separate `render-node.ts`, `nodes-text.ts`, and `handlers.ts`. In the source, dispatch looks up `DOC_NODE_HANDLERS` (`render.ts:1508–1509`), the registry references text handlers (`1524–1547`), and those handlers call `renderChildNodes` (`1045–1046`, among others). That helper recursively invokes the dispatcher through `renderNodes` (`1007–1030`). The resulting imports are `render-node → handlers → nodes-text → render-node`. Hoisting does not remove this cycle.  
   **Fix:** Keep the dispatcher and its recursive text handlers together within the file limit, or explicitly design a recursive-render callback seam. Establish that mechanism before moving dependent handlers; the bottom-up order at design line 107 is insufficient.

2. **Major — The two proposed ports do not cover all widget-to-doc calls.**  
   **Evidence:** Design lines 83–93 inject doc rendering into post-content rendering only. But `renderGalleryImage` also calls `renderDocNode` for legacy `src` images (`render.ts:2600–2607`), and `extractTitleNode` calls `renderNodes` (`2655–2668`). Both functions move into widget files. They cannot move verbatim without retaining an additional reverse dependency.  
   **Fix:** Specify ownership and callback contracts for legacy gallery images and title-child rendering. Preserve their existing defaults and depth semantics. Include those paths in the characterization fixtures.

3. **Major — Static-page helpers are divided into a mutual import.**  
   **Evidence:** Design lines 71–72 place `removeThemeOwnTitleElement` in `document-shell.ts`, but comment-aware insertion helpers in `static-page-injection.ts`. `injectExtraHeadIntoStaticPage` calls title removal (`render.ts:3218–3220`); title removal calls `isInsideHtmlComment` (`3310–3313`). Following the table creates imports in both directions.  
   **Fix:** Keep title removal with the comment-aware static-page manipulation functions. The document shell should consume that lower-level implementation.

4. **Major — The reuse survey misses an existing canonical href owner.**  
   **Evidence:** Design lines 30–31 propose relocating the independent `safeHref` implementation; line 131 flags it as future Jini work. Jini already exports `isAllowedHref` from `@jini-ai/cms/navigation` (`packages/cms/src/navigation/menu-service.ts:159–175`, implementation at `199–210`). Its documentation explicitly identifies it as the canonical predicate and identifies the remaining Tovu copies as coercing wrappers.  
   **Fix:** Record that existing owner and distinguish validation from the renderer’s trimming/fallback behavior. Reuse the owner where architectural and worker-loading constraints permit; route any required ownership relocation through Coordinator instead of treating this as undiscovered generic code.

5. **Major — The claimed Jini-ready shape still contains host and cross-feature dependencies.**  
   **Evidence:** Design line 131 says the proposed files import only core, CMS types, and `platform/html`, enabling later 1:1 moves. Actual widget rendering calls Tovu’s entry-list renderer and layout policy (`render.ts:2327–2345`), navigation rendering (`2357–2361`), and media rendering (`2617–2624`). The proposed assistant-mount file reads `TOVU_SITE_CHAT_*`, resolves Tovu’s application directory, and binds filesystem checks (`3172–3184`). That entire file is not generic chat code.  
   **Fix:** List the actual dependencies and prerequisites for each Jini-bound slice. Keep Tovu environment/filesystem bindings in the host; move only generic mechanisms behind suitable contracts. Resolve shared media-rendering ownership before introducing widgets-to-post feature imports.

6. **Major — The golden corpus is nondeterministic as specified.**  
   **Evidence:** Design line 104 hashes every widget renderer’s output. A valid contact form generates `widget-contact-${randomUUID()}` (`render.ts:2456–2461`), which enters rendered markup. The rich footer also defaults to the current year (`2166`). A fake `SiteRenderContext` controls neither source.  
   **Fix:** Define deterministic fixtures or narrowly normalize generated identifiers while separately asserting their HTML associations and uniqueness. Pin the clock wherever default date output is exercised. Otherwise unchanged code can fail the characterization commit.

7. **Minor — Verification commands and non-import consumers are incomplete.**  
   **Evidence:** Design line 100 names `development/scripts/check-architecture.mjs`; that file does not exist at the pinned ref. The actual command is `npm run check:architecture`, invoking the `.ts` script (`package.json:60`). Moving `safeHref` also breaks the source reader hardcoded to the old renderer path (`development/scripts/check-menu-href-allowlist-sync.ts:65–68`); repointing importing tests alone does not fix it. The worker graph has separate module budgets (`http/site/__tests__/worker-import-graph.test.ts:101–104`, `150–153`) that HTML hashes do not verify.  
   **Fix:** Inventory executable source readers, use the real gate commands, and explicitly run the worker graph tests during the split.

8. **Minor — The allocation table is not an exclusive partition.**  
   **Evidence:** It lists **32 target files**, including the existing stylesheet file, rather than 28. `ctaBand` (`render.ts:2135–2139`) falls into both layout’s range and marketing’s explicit range. `3673–3683` is assigned both to the root’s broad range and document-shell. The registry has 23 node-handler entries (`1524–1547`), rather than the claimed 25.  
   **Fix:** Produce an exclusive symbol-to-file allocation and derive counts and commit estimates from it.

## 04 — Site pages: needs rework

Target: `apps/website/src/server/inbound/public-http/routes/site/pages.ts`.

1. **Major — Static menus and docs menus are mutually dependent.**  
   **Evidence:** Design lines 65–67 divide these into separate files. `resolveOneStaticMenu` calls the docs-specific resolvers (`pages.ts:674–701`), while those resolvers call `findStaticMenu` or `resolveMenuContent`, assigned to the other file (`577–584`, `707–731`). The proposed feature-move order also calls static menus “self-contained” and moves them first.  
   **Fix:** Keep this menu-resolution responsibility together—it fits comfortably below 500 lines—or extract a genuinely lower-level menu-loading mechanism before separating orchestration from docs variants.

2. **Major — Listing ownership contradicts the proposed dependency direction.**  
   **Evidence:** Design line 74 prohibits `render-context/* → handlers/*`, but post-preview resolution calls `storeListingJsonPage` (`pages.ts:2301`), which is assigned to `handlers/listing.ts`. Also, request-policy owns `redirectLookupPath`, which reads `listingPageRequests` (`2603–2604`), while listing’s `withListingBatch` calls request-policy’s `isStaticExportRequest` (`2625–2644`). That creates another mutual dependency.  
   **Fix:** Put the shared listing protocol/state below both render-context and route handlers, with one owner for each WeakMap. Separate request enrichment from listing mechanics. `withListingBatch` also owns request-specific SEO, plugin-export sessions, consent assets, comments, and a late-bound script buffer; the whole proposed listing file is not a generic CMS protocol slice.

3. **Major — The supposedly unchanged static-finisher contract is incorrect.**  
   **Evidence:** Design line 97 specifies `finishStaticTierDocument(required, options = {}): string`. The real function takes **two required objects**, `deps` and `input`, and returns `Promise<string>` (`pages.ts:807–821`). Its body expands partials, resolves embeds, assigns listing keys, discovers menus, resolves previews and collections, renders the static page, then obtains document assets (`824–875`). This does not match the described “collect head/asset additions, then body injections” seam.  
   **Fix:** Specify the actual async contract and an extraction boundary grounded in this sequence. If adopting `{ deps, input }, options`, migrate all callers atomically. Preserve asset acquisition order and add an ordering assertion around the effectful stages.

4. **Major — The feature moves require more than dependency-type import changes.**  
   **Evidence:** Design line 100 says changing dependency-type imports is the only necessary edit. Collection rendering calls `formatPostPreviewDate` and `siteTimeZoneDep` (`pages.ts:926`, `1017`), allocated to server-side render-context files. Media’s `resolveFeaturedImageForRender` calls the server renderer’s `featuredImageView` (`1772–1781`). Their dependency vocabulary is also expressed through shared `RouteDeps`-derived types (`1152–1155`, `1187–1226`).  
   **Fix:** Resolve these runtime helpers and narrow contracts before choosing the destination. State the actual final placement now; a generic fallback to server folders does not substantiate the promised feature ownership or later Jini extraction.

5. **Major — The response matrix does not observe one of its named security behaviors.**  
   **Evidence:** Design lines 104–105 include “plugin-export hosts present,” but snapshot no security-policy header. Removing `addPluginExportHostsToResponse` at `pages.ts:2523` would leave every listed snapshot field unchanged. The adjacent plugin embed tests exercise the port’s host declarations, not their application to the HTTP response.  
   **Fix:** Assert the actual report-only policy header through the HTTP route, using distinguishing script/frame/connect hosts. Include `Content-Type` for listing responses. Also address raw body-hash instability: finalization generates form attempt UUIDs (`2530–2535`).

6. **Minor — The root sketch invents an existing setup step.**  
   **Evidence:** Design line 81 describes “2–3 lines of dep narrowing that open the function today.” The actual registrar immediately installs rewrite routes (`pages.ts:2859–2863`). Request enrichment occurs inside request callbacks, after rewrites (`2883–2884`, `2909–2910`). The target tree also contains 25 files, rather than 24.  
   **Fix:** Remove the fictional setup and explicitly preserve per-request enrichment after rewrite state has been recorded. Correct the allocation count.

## 06 — Admin API client: needs rework

Target: `apps/admin/src/lib/api.ts`.

1. **Major — A method cannot move byte-for-byte because it references the aggregate being deleted.**  
   **Evidence:** Design line 68 permits no method-body changes except placeholder cleanup. But `mediaContentType` calls `api.mediaOriginalUrl` (`api.ts:3421–3426`). Once moved, that binding is absent; importing the shrinking old aggregate would retain the forbidden dependency and eventually fail.  
   **Fix:** Include internal aggregate references in the migration inventory and explicitly authorize their binding-preserving rewrite. Preserve late lookup on the feature object so spies still intercept the URL builder.

2. **Major — Reusing module-mock factory bodies does not preserve their export contract.**  
   **Evidence:** Design line 79 requests a feature-module mock with the “same factory body.” Existing factories return `{ …actual, api: { …actual.api, …overrides } }`, for example `features/media/__tests__/media-providers-port.unit.test.ts:18–20` and `features/pages/hooks/__tests__/page-editor-dependencies.unit.test.ts:28–30`. New modules export `mediaApi` or `pagesApi`, so those bodies override the wrong export.  
   **Fix:** Transform factory export keys, `actual.api` spreads, original-import type paths, and remaining old-module mocks. Verify interception through the real wired adapter after each migration.

3. **Major — The transport allocation introduces a runtime import cycle.**  
   **Evidence:** Design lines 32–35 place `requestOnce` in `request.ts`, but `BASE` and `authenticatedAdminRequest` in `admin-urls.ts`. `requestOnce` reads `BASE` (`api.ts:2675`); `authenticatedAdminRequest` calls `request` (`2783–2790`). The proposed files therefore import each other. This is a new cycle, even if deferred function calls avoid an immediate initialization failure.  
   **Fix:** Put base configuration below the request implementation, or inject it. Keep authenticated request construction with the transport; URL-only builders can depend downward on configuration.

4. **Major — The target explicitly preserves owner-rule violations.**  
   **Evidence:** Design lines 68 and 82 retain method signatures and make signature work optional. AST inspection found **62 zero-parameter methods and 42 one-parameter methods**, including `logout` (`api.ts:2854`) and `completeMfa` (`2851`). These do not meet the required two-object boundary convention. Separately, read-only ESLint analysis of the pinned source reports cyclomatic complexity **11** for `request` (`2719–2732`), which the design explicitly keeps unchanged.  
   **Fix:** Include mandatory signature migration and a concrete decomposition for `request`. Keep empty optional objects where required; placeholder removal is not the required cleanup.

5. **Major — Moving host-bound clients into Jini conflicts with the untangle plan.**  
   **Evidence:** Design line 106 says migrating features take their API folders into `@jini-ai/admin` or `@jini-ai/user-management`. These implementations hardcode Tovu’s API base and workspace (`api.ts:21–23`) and call Tovu routes. Untangle `DESIGN.md` §3 instead places implementation bindings in the host; packages receive ports. Depending on a proposed transport in `@jini-ai/ui` would additionally create forbidden non-base package edges.  
   **Fix:** Keep Tovu HTTP implementations in Tovu and bind them to package-owned interfaces. Extract only generic transport mechanisms behind injected contracts. The example `PostsApiPort` is also unsupported: the cited file defines `PostEditorPort`, spanning posts, presentation, media, and autosave with an adapted update signature. Its binding already exists in `post-editor-dependencies.hooks.ts:13–25`.

6. **Minor — There cannot be 219 fetch-request rows as described.**  
   **Evidence:** Design line 90 assumes every member produces a fetch request. `templatePreviewUrl` (`api.ts:2921–2926`), `mediaOriginalUrl` (`3409`), and `mediaPreviewRenditionUrl` (`3417`) return strings without fetching. Existing `api-media.unit.test.ts:128–129` correctly asserts the URL directly.  
   **Fix:** Classify synchronous URL builders separately and snapshot their return values. Retain existing response-transformation and option-branch tests; a request tuple alone does not characterize those contracts.

7. **Minor — Deleting the old path breaks an unlisted executable consumer.**  
   **Evidence:** Design step 3 deletes `lib/api.ts`; its inventory focuses on importers and three source-reading tests. `development/scripts/check-admin-api-routes.ts:93–94` directly reads the old file. It will fail after deletion unless migrated.  
   **Fix:** Inventory executable source consumers as well as imports. Update the route checker to inspect the feature clients and their path helpers without retaining a forwarding file.

8. **Major — The verification policy permits failing intermediate commits.**  
   **Evidence:** Design line 88 requires only an unchanged list of failing test names. That directly conflicts with the owner requirement that every intermediate commit compile and pass tests. The cited failures come from another branch; I did not verify them on the requested base.  
   **Fix:** Establish a green pinned baseline as a prerequisite, or obtain an explicit exception through Coordinator. Do not silently substitute “same failures” for the required gate.

## Recurring mistake classes

1. **Partition the real dependency graph, not contiguous source ranges.** Include recursive calls, helper calls, state reads, and initialization edges.
2. **Design the migration graph alongside the final graph.** Each commit needs its prerequisites and caller changes; “one file per commit” is not automatically viable.
3. **Separate generic mechanisms from host bindings.** Colocation with a reusable feature does not make Tovu routes, environment selection, or composition code portable.
4. **Search for existing owners before proposing another extraction.** Record canonical implementations and resolve ownership conflicts before execution.
5. **Characterize observable contracts with controlled inputs.** Pin randomness and clocks; assert headers, returned URLs, ordering, and effects where those are the behavior.
6. **Inventory every consumer, including tools and mock factories.** Compiler errors cannot detect all stale paths or ineffective interception.
7. **Verify every owner constraint against the proposed result.** Small files alone do not establish compliant signatures, complexity, dependencies, or green intermediate commits.
