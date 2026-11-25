SHEETS Contracts/runtime/packages extraction COMPLETE: 36 sheets (18 Jini / 18 Tovu), 34 OPUS-REVIEW, 29 files move, 0 STAYS-HOST, 1 BLOCKED

“Files move” counts unique input files that contribute code to Jini, including splits that leave a real host binding. It does not count new supporting files, tests, or the same source in both halves of a pair.

The anchors are from Tovu `c0f1068a59e78a39dfdbbd3760b2c8aac996f794` and Jini `fd06f45b12ae0516b0fc196f58d785eba4d3831e`. In each clone, detached HEAD matches the local `origin/integ/merge-23-2026-11-25` ref. These are newer than the first-pass anchors. `AI-Dev-Shop` was absent as specified by the dispatch. I used the two governing architecture sections from the Tovu checkout under `/Users/la/Programming/Tovu` and treated them as target architecture, not evidence of what is built. No files were changed and no tests, builds, installs, or type-checks ran.

| Input | Status |
|---|---|
| `A/routes/external-mcp/oauth.ts` | SHEETED · 26 |
| `A/routes/external-mcp/probe.ts` | SHEETED · 26 |
| `A/routes/plugins/install.ts` | SHEETED · 27 |
| `A/routes/posts/template-preview-render.ts` | SHEETED · 20 |
| `A/routes/publish-content/peer-transport.ts` | SHEETED · 28 |
| `A/routes/settings/events.ts` | SHEETED · 29 |
| `A/routes/system/publish-credentials.ts` | BLOCKED · `:19–26,73–78` and `S/__tests__/routes/publish-credentials-route.test.ts` pin a direct no-principal rejection that the shared mount changes to a redacted 500. Owner must choose which behavior to retain. |
| `A/routes/system/publish-site.ts` | SHEETED · 30 |
| `P/http/site/render/content-html.ts` | SHEETED · 14 |
| `P/http/site/render/page-body.ts` | SHEETED · 14 |
| `P/routes/members/oidc-callback.ts` | SHEETED · 22 |
| `P/routes/members/oidc-verify-email.ts` | SHEETED · 22 |
| `P/routes/members/unlink-identity.ts` | SHEETED · 22 |
| `P/routes/plugin-contributions.ts` | SHEETED · 23 |
| `P/routes/site/media-rendition.ts` | SHEETED · 24 |
| `P/routes/site/member-pages.ts` | SHEETED · 21 |
| `P/routes/site/products.ts` | SHEETED · 21 |
| `P/routes/site/pages/response.ts` | SHEETED · 17 |
| `P/routes/site/pages/static-tier.ts` | SHEETED · 18 |
| `P/routes/site/pages/template-render.ts` | SHEETED · 18 |
| `P/routes/site/pages/handlers/home.ts` | SHEETED · 19 |
| `P/routes/site/pages/handlers/marketing.ts` | SHEETED · 19 |
| `P/routes/site/pages/handlers/post-not-found.ts` | SHEETED · 19 |
| `P/routes/site/pages/handlers/post.ts` | SHEETED · 19 |
| `P/routes/site/pages/handlers/slug-routes.ts` | SHEETED · 19 |
| `P/routes/site/pages/handlers/virtual-page.ts` | SHEETED · 19 |
| `P/routes/site/pages/render-context/media-metadata.ts` | SHEETED · 15 |
| `P/routes/site/pages/render-context/post-previews.ts` | SHEETED · 16 |
| `P/middleware/site-cookie-consent.ts` | SHEETED · 13 |
| `P/routes/commerce/purchase.ts` | SHEETED · 25 |

### Build conventions

`W` is Tovu `apps/website/src`, `S` is `W/server`, `A` is `S/inbound/admin-http`, `P` is `S/inbound/public-http`, `R` is `S/runtime/composition`, and `M` is `R/modules`. `J/<pkg>` is Jini `packages/<pkg>/src`. In the page sheets, `Pages` is `P/routes/site/pages`, `H` is `Pages/handlers`, `RC` is `Pages/render-context`, and `V` is `P/http/site`. All line numbers below are pre-edit anchors at the two SHAs above.

Build after **CRP-12.T**, in the order below. Each pair is Jini first, then Tovu. A later sheet may use an earlier pair. No other pending extraction, new migration, new theme implementation, or admin-kit change is required.

- **Package/API convention.** Each named new subpath gets `types: "./dist/<path>.d.ts"`, `import: "./dist/<path>.js"`, and `default: "./dist/<path>.js"` in the named Jini package. Add the named runtime classification to `jini.entries` and match the owning isolation mapping where applicable. Existing subpaths are extended in place. Every Jini sheet names its patch changeset and affected `api-baseline/jini-ai__<pkg>.json`. Every Tovu sheet consumes those exports through its existing dependency and release workflow. No Tovu export, changeset, or API baseline is added.
- **Implementation convention.** Signatures below show required args first and options second. Use `_optional: Record<string, never> = {}` where no options are shown, including new factories and helper exports. Keep existing meaningful option bags. Use guarded indexing, typed discriminants, and conditional spreads for absent optional fields. If an old API deliberately observes a present `undefined`, type that field explicitly. Keep existing status codes, body keys, copy, effect order, reporter boundaries, and why-comments with the moved logic. Use small private phase functions to meet the 80-line and complexity-10 caps.
- **Mount convention.** JSON specs use core `defineJsonRoute`, `ok`, `routeReply` for explicit statuses or headers, and the existing refusal contract. Keep the host mount and inject only the named ports. Where an existing raw entry depends on Express `next()`, early `writeHead`, or a byte writer, the sheet specifies a structural raw spec and how the host translates its result. Do not force those paths through a mount that cannot express their current behavior. Bind request facts lazily, on that request.
- **Proof convention.** Add the named witness first. SOL writes it and does not run it. Opus runs the witness, applies and restores the named mutation, runs the affected parity and package gates, and updates/checks the affected API baselines with Jini’s `api:update` and `api:check`. `OPUS-REVIEW` adds focused review of the security, auth, credential, or redaction boundary. Existing Tovu wire tests stay in Tovu. Importer lists below come from `git grep` on the pinned tree. Recheck moved symbols and paths, including aliases and dynamic imports, immediately before deleting anything. A listed import that still needs a bound host function stays pointed at that binding. No re-export shells.

## CRP-13.J — Collector admission and consent receipt eligibility

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

From `P/middleware/site-cookie-consent.ts:39–40,137–216`, move the HTTP decisions to `J/cookie-consent/site/http.ts`. Keep `readConsent`, `parseStored`, `DEFAULT_MAX_AGE_MS` and the existing receipt types in their current owners. Do not add a second consent engine.

- `matchConsentPluginHttp({ full, plugins }: { full: string; plugins: readonly ConsentPluginContribution[] }, _optional = {}): (ConsentPluginContribution & { http: ConsentPluginHttp }) | undefined`. Check the existing unsafe-path rule before using the live contributions. To preserve the host’s lazy adapter read, make `plugins` a callback `({}) => readonly ConsentPluginContribution[]`, not an eagerly obtained array. Require the existing `path + "/"` prefix.
- `collectorDecision({ origin, siteOrigin, adapter, readState, rateAllowed }, _optional = {}): Promise<{ status: 403 | 429 | null; analyticsLevel: ConsentState["analyticsLevel"] }>`. `origin` is `string | undefined`, `siteOrigin({})` returns `string`, `adapter` supplies only `category` and `supportsAnonymous`, `readState({})` returns `Promise<ConsentState>`, and `rateAllowed({})` returns `Promise<boolean>`. Keep exact origin comparison, category fallback to marketing, the anonymous-analytics capability check, and the rate read only after consent. The host keeps the address and rate-key derivation. GET does not call this helper.
- `readVisitorConsent({ readSnapshot, snapshotUnavailable, readPolicy, facts }, _optional = {}): Promise<ConsentState>`. The snapshot and policy ports return `ConsentConfig | null` and `ConsentConfig` respectively, `snapshotUnavailable({ config })` retains the present host readiness predicate, and `facts({})` returns the existing cookie, GPC, DNT and time inputs. Call it only on the same branches as today. An unavailable snapshot or failed read allows nothing. Published banner-off uses the existing anonymous mode and an empty cookie. Do not consult a fallback policy when the published snapshot already applies.
- `receiptAllowsAnalytics({ proof, readSnapshot, snapshotUnavailable, readPolicyVersion, readReceipt, nowMs }, _optional = {}): Promise<boolean>` and `analyticsProof({ state, cookieHeader }: { state: ConsentState; cookieHeader: string | undefined }, _optional = {}): ConsentAnalyticsProof | undefined`. `readReceipt({ id })` returns `Promise<Partial<ConsentRecord> | null>` and is called only after matching the current published policy. Keep the active-record read, matching policy, `gpc === false`, literal analytics grant, and existing age comparison. No receipt means no proof. Keep the checked cookie-capture read and failed-decode fallback. Proof is not delivery permission.

**Tests first.** `cookie-consent/site/__tests__/http.test.ts` — `refuses a collector before rate or handler work and refuses a retired receipt at delivery` (`skip-active-receipt-read`). Also pin banner-off anonymous support, unknown category, invalid cookie encoding, stale policy before receipt I/O, and rejected plugin paths without adapter enumeration.

**Package/API.** `cookie-consent ./site/http`, `universal`, no client entry. `.changeset/crp-13-consent-http.md`, cookie-consent baseline.

## CRP-13.T — Bind the live snapshot, collector and receipt store

**BUILDER: SOL · OPUS-REVIEW**

Keep `P/middleware/site-cookie-consent.ts:42–135,218–462` as host wiring. Replace the decisions at `:144–216` with the Jini functions. Bind the live snapshot, `unavailableDocumentPolicy`, fallback policy, exact origin and clock. Bind `readReceipt` to the same `siteReceiptStore` active read, using `?? null` if its optional method is absent. `readSiteAnalyticsProof` still awaits `readSiteVisitorConsent` before reading the cookie. Keep `pluginRequest`, 256 KiB raw parsing, the existing GET cache exception, `502` catch, receipt file path, receipt rate limit and ID generation, region cookies, asset publication, diagnostics, and document-assets binding. Do not make detached delivery depend on an Express request.

**Importers.** Retain the real host bindings for `R/{analytics-providers:12,browser-analytics-http:4,http-app/public-middleware:23,site-cookie-consent:8}.ts`, `R/__tests__/app.consent-capture.test.ts:8`, `P/middleware/__tests__/{declared-consent.unit.test:6,site-consent.test:22,site-cookie-consent.errors.unit.test:17,site-cookie-consent.regressions.unit.test:11,site-cookie-consent.test:19}.ts`, `P/routes/site/__tests__/commerce-site-app.ts:4`, and `A/routes/posts/__tests__/preview-consent.integration.test.ts:14`. No exported host symbol becomes a passthrough.

**Tests first.** In `site-cookie-consent.regressions.unit.test.ts`, add `revocation denies the next collector request and a previously minted proof at delivery` (`bind-delivery-to-cookie-only`). Assert the adapter is not called and the old receipt no longer delivers.

## CRP-14.J — Widget dispatch and authored HTML marker rendering

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

- `V/render/content-html.ts:20–110` → `J/cms/public-http/http/site/render/content-html.ts`. Export `createContentHtmlRenderer({ docHost, widgetHost, taxonomyAttributes, newMarkerToken }, _optional = {}): ContentHtmlRenderer`. Use `DocNodeHost` and `WidgetRenderHost` from the existing render contracts. `taxonomyAttributes` is the `attributes` input of `renderHtmlTaxonomy`, and `newMarkerToken({})` returns the complete collision-resistant marker token. Return `renderDocNode({ node }, options?: DocRenderOptions)`, `renderDocBodyAsPageHtml({ bodyJson }, _optional = {})`, `renderWidgetIr({ ir }, _optional = {})`, and `renderWidgetRegion({ ctx, regionKey }, _optional = {})`. Move the dispatch entries, their markup, and the deliberate placeholder miss. Use a `Map` or an own-key-checked partial record so inherited keys cannot select a renderer. Tie the doc/widget callbacks once per factory. Reuse `renderDocNodeWith`, `renderNodes`, `renderDocWithManagedMarkers` and the existing widget renderers. Preserve recursion options, escaping, region order, and empty-region output. No crypto, product classes or taxonomy attribute names in Jini.
- `V/render/page-body.ts:12–210` → `J/cms/public-http/http/site/render/page-body.ts`. Export `renderHtmlPageBody({ html, resolved, renderWidgetIr, postAuthorForHeader }, options = {}): string`. `renderWidgetIr({ ir })` returns `string`, and `postAuthorForHeader({ html, post })` receives `Pick<PublicPostRecord, "id" | "slug" | "author" | "showAuthor">`. Options retain `postAuthor?` and `postPresentation?: PublicPostRecord`. Keep the owned/unowned distinction, no-key current-content fallback, placement-key-before-ID-before-slug lookup, dropped missing widget, and plugin-export stamp/fallback. Reuse `substituteHtmlEmbeds` and the existing post-content and cover primitives. Preserve occurrence-local media props, HTML form mode, current-entry-only byline/body projection, and `header` only for `"content"`. Copy IR props before modifying them. Do not change plugin trust, sanitize authored HTML anew, or take ownership of theme-only markers.

**Tests first.** `cms/public-http/http/site/render/__tests__/content-html.test.ts` — `shares one injected widget renderer with doc nodes and returns an empty region unchanged` (`dispatch-inherited-component-id`). `page-body.test.ts` — `retains unowned and keyless content and keeps duplicate occurrences independent` (`reuse-resolved-header-across-occurrences`). Include separately stamped plugin markup and unknown-plugin fallback.

**Package/API.** CMS adds both same-relative subpaths, `universal`, alongside `doc/doc-nodes` and `widgets/widget-render-contract`. `.changeset/crp-14-content-html.md`, CMS baseline.

## CRP-14.T — Bind the doc/widget hosts and authored byline

**BUILDER: SOL · OPUS-REVIEW**

At `V/render/content-html.ts:4–5,26–110`, instantiate once with `TOVU_DOC_NODE_HOST`, `TOVU_WIDGET_RENDER_HOST`, the four existing `data-tovu-*` taxonomy attributes, and `DOCMARKER${randomUUID().replace(/-/g, "")}N`. Preserve the existing worker and caller-facing function shapes through the actual bound instance. The remaining positional `renderWidgetIr(ir)` host call is adapted by calling the instance with `{ ir }`. At `V/render/page-body.ts:4–9,63–69`, bind `postAuthorForContentHeader` and that same widget renderer, retain the host options shape, and delete the duplicate marker helpers. These paths are the actual composition for CRP-11’s body ports.

**Importers.** No external import of either module needs repointing because both still bind host-specific behavior. Keep, in particular, `V/{bare-page:7–8,render/blocks:3,render/post-body:6–7}.ts`, `A/routes/widgets/preview-render.ts:7`, `RC/content-marker-ports.ts:5`, `Pages/{static-tier:19,template-render:20}.ts`, and `R/{memory-deps/route-deps/trash-and-content:12,peer-site-reads:14,site-deps/route-deps-content-chat:33}.ts` on the bound functions. Existing direct and dynamic test imports still exercise those bindings. The only importer replaced inside the split is `V/render/page-body.ts:7`, now an injected call to the bound renderer instead of an import by Jini.

**Tests first.** Extend `V/__tests__/render-html-embed-attributes.test.ts` with `a media marker changes only its own occurrence through the bound renderer` (`mutate-shared-widget-ir`). Preserve `features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts` and plugin-embed/caption goldens.

## CRP-15.J — Render-time media metadata and cover lookup

**BUILDER: SOL · 1 source file**

Move `RC/media-metadata.ts:11–200` to `J/cms/public-http/routes/site/pages/render-context/media-metadata.ts`. Use existing CMS media/post types and core `MediaAssetRenderMeta`. Define the ports next to the resolver with these input and result shapes:

- `resolveMediaTransformVersionsForRender({ workspaceId, publicTransformName, readLatest }, _optional = {}): Promise<ReadonlyMap<string, number>>`. `readLatest({ workspaceId, name })` returns `Promise<{ version: number } | null>`. Missing definition gives an empty map.
- `resolveMediaAssetMetadataForRender({ workspaceId, post, readMedia, readCaptions, readContentTypes }, { listed } = {}): Promise<ReadonlyMap<string, MediaAssetRenderMeta>>`. `post` is `PublicPostRecord | undefined`, `listed` is `readonly PublicPostRecord[]`, `readMedia({ workspaceId, idOrSlug })` returns `Promise<MediaRecord | null>`, `readCaptions({ workspaceId, captions })` uses the existing caption result, and `readContentTypes({ workspaceId, sha256s })` returns `Promise<ReadonlyMap<string, string>>`. Keep the authored keys, current body walk, cover discovery for current and listed entries, and per-asset caption lookup. Keep absent/trashed filtering before the single content-type batch. Omit absent captions, preserve `null` content type and zero dimensions. No listing-body traversal.
- `resolveFeaturedImageForRender({ post, readMetadata, readVersions }, _optional = {}): Promise<ReturnType<typeof featuredImageView>>`. Use the CRP-11.J projection. No cover means no reads. Otherwise resolve only that post’s listed cover metadata and versions concurrently, then project. Reuse pure `collectCoverMediaRefs` and move the current iterative walk. Keep the original order for children and checked optional reads.

**Tests first.** `cms/public-http/routes/site/pages/render-context/__tests__/media-metadata.test.ts` — `batches cover MIME reads by SHA and retains aliases and captions` (`key-metadata-by-resolved-id`). Also assert no reads without refs and no cover result without the public transform.

**Package/API.** CMS `./public-http/routes/site/pages/render-context/media-metadata`, `universal`, with I/O behind ports so this subpath does not import the node caption helper or bootstrap entry. `.changeset/crp-15-render-media.md`, CMS baseline.

## CRP-15.T — Bind existing media reads without changing their scope

**BUILDER: SOL**

Keep `RC/media-metadata.ts` as a narrow binder over `findMediaByIdOrSlug`, `resolveMediaCaptionsTrack`, `getLatestTransformDefinition`, the current content-type store and `CORE_PUBLIC_TRANSFORM_NAME`. Delete the collector, batch and projection algorithms from Tovu. The bound `resolveMediaTransformVersionsForRender` takes `{ deps }`, not a positional deps bag. Bind `resolveFeaturedImageForRender` to the same two bound reads. Remove the `featuredImageView` import at `:8` added by CRP-11.T when the projection call moves.

**Importers.** Update transform calls at `A/routes/posts/template-preview-render.ts:11,65`, `P/middleware/theme-page-preview.ts:18`, `H/{home:24,113,post:17,40,133}.ts`, `RC/post-previews.ts:24,113`, and any such calls in `P/routes/site/__tests__/{integration/pages-branch-coverage.integration.test:13,render-context-resolution-helpers.test:8,unit/h4-pages.unit.test:9}.ts` and `W/features/media/__tests__/media-captions-render.test.ts:19`. Keep all of these imports on the bound path, including metadata/cover calls and `Pages/template-render.ts:29,214`. No other importer of the moved private walk.

**Tests first.** `P/routes/site/__tests__/render-context-resolution-helpers.test.ts` — `caption and transform ports see the same workspace and authored reference` (`bind-metadata-to-default-workspace`).

## CRP-16.J — Bounded and visibility-filtered post-preview batches

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move `RC/post-previews.ts:26–193` to `J/cms/public-http/routes/site/pages/render-context/post-previews.ts`. Keep theme marker interpretation injected and do not move theme markup. Use `ListingBatchRequest`, `ListingSource<PublicPostRecord>`, `EmbedMarker`, `AssignedTermView`, the existing listing helpers and the CRP-11.J cover projection. Export:

`resolvePostPreviewsForRender({ pageHtml, pagePath, listingBatch, listingPage, ports }, _optional = {}): Promise<PostPreviewsResult | undefined>`

`listingBatch` and `listingPage` are explicit `| undefined`. `ports` contains `source`, `isVisible({ post })`, `batchSize({ marker })`, `isPaged({ marker })`, `readMediaContext({ listed })`, `readTimeZone({})`, `hrefFor({ post })`, `readTerms({ post })`, and `storeListingJsonPage({ listingBatch, keyed, toItem })`. The last port takes the existing listing-state arguments with `toItem({ post }): Promise<ListingJsonItem>`. Define `KeyedPostPreviewBatch` with `posts`, `next: number | null`, and optional `nextHref`. `PostPreviewsResult` has `previews`, `batches: ReadonlyMap<number, { items: readonly PostPreview[]; nextHref?: string }>`, and optional `page: { items: readonly PostPreview[]; nav: string }`. `PostPreview` has `title`, `href`, `dateIso`, `dateLabel`, and the CRP-11.J cover result as `featuredImage`. This is a resolver-local structural result, with no theme type dependency.

Move plain, keyed, paged and JSON projection helpers separately. No markers means no reads. Sequentially keep the widest clamped plain batch, first occurrence per key, and first paged marker. Pass visibility into the readers, before pagination/cursor calculation and before cover, term or excerpt projection. Use the matching request key’s offset only, keep JSON continuation for the marker’s custom card, and preserve the missing-page exception and omitting absent `nextHref` or `page`. Keep display-date selection and all existing `ListingJsonItem` fields, including conditionally present author/excerpt. Preserve the `formatPostPreviewDate({ iso, timeZone }, _optional = {})` signature.

**Tests first.** `cms/public-http/routes/site/pages/render-context/__tests__/post-previews.test.ts` — `excludes private rows before paging, cover reads and JSON projection` (`page-before-visibility`). Include distinct keys, second-batch offset, duplicate keys, a JSON next link and a nonexistent numbered page.

**Package/API.** CMS `./public-http/routes/site/pages/render-context/post-previews`, `universal`. Do not import the HTTP listing-state singleton into the moved batching module. `.changeset/crp-16-post-previews.md`, CMS baseline.

## CRP-16.T — Bind member decisions and listing request state

**BUILDER: SOL · OPUS-REVIEW**

`RC/post-previews.ts:94–128` becomes the host adapter. Bind the bounded published-post source with the workspace, visibility from `decidePostMemberAccess` on the existing request resolver/context, the theme’s `postPreviewsBatchSize` and `isPagedPostPreviewsMarker`, CRP-15 media binders, `siteTimeZoneDep`, `postPublicPath`, existing taxonomy reads and `listingState.storeListingJsonPage`. Keep the shared resolver/context created by the route. Do not derive visibility from a cookie inside Jini, and do not run an ungated source when the static renderer has no access input. Remove the old exports of `KeyedPostPreviewBatch` and `formatPostPreviewDate`. The pinned `git grep` found no imports of either. `Pages/static-tier.ts:25,162–164` remains the sole direct import of the bound resolver.

**Tests first.** Extend `P/routes/site/__tests__/widget-body-embeds.test.ts` with `a keyed batch uses the same member decision as the initial static page` (`bind-anonymous-listing-as-visible`). Keep the existing listing and response-matrix cases.

## CRP-17.J — Public response policy and ordered HTML finalization

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move `Pages/response.ts:38–94,123–161` into `J/cms/public-http/routes/site/pages/response.ts` at the decision seams below. Keep Express writes out of Jini. Literal host cache directives and form/member wire names remain injected.

- `resolveVisitorPagePolicy({ queryResult, flash, clearFlash, memberCookiePresent, staticExport, cache }, _optional = {}): PerVisitorResponse`. `queryResult` and `flash` are the existing CMS forms decoder results. `clearFlash({})`, `memberCookiePresent({})`, and `staticExport({})` are lazy. `cache` has `form`, `member`, `staticExport`, `public`. Merge via the existing form helper. Valid flash clears before selection. Result **or** flash wins, then member-cookie presence, static export, and public. Keep `{ result: FormSubmissionRedirectResult | undefined; cacheControl: string }`.
- `publicPageCache({ html, cacheControl, preConsentCacheControl, hasConsentGatedScripts }, _optional = {}): { cacheControl: string; varyCookie: boolean }`. Comments marker makes the route private. Call the bound consent policy on the original HTML before finalization. Only a response still shared-cacheable may get `Vary: Cookie` for gated scripts. Keep the first-pass CRP-08 cache policy, not a second consent check or a presence-only cookie shortcut.
- `finalizePublicPageHtml({ html, formResult, ports }, _optional = {}): Promise<{ html: string; contentType?: "json" }>`. `ports` contains `listingBatchBody({ html })`, `assertListingPageServed({ html })`, `pluginHead({})`, `addPluginHosts({})`, `widgetPartials({ html })`, `finishFormResult({ html, formResult })`, `staticExport({})`, `formAttemptTokens({ html })` and `memberAuthScript({ html })`. Use the existing listing-script and head-injection utilities. The batch path short-circuits all document hooks. Full order is assert listing → plugin head → CSP host side effect → listing script → partials → offsite links/form result via the bound hook → static stop or form tokens and member script. The host’s issue-token registration happens before returning the token.

**Tests first.** `cms/public-http/routes/site/pages/__tests__/response.test.ts` — `does not run document hooks for a listing batch and keeps the finalization order for a full document` (`run-document-hooks-on-json-batch`). Also test invalid consent with gated content and member-cookie presence with no visible gating.

**Package/API.** CMS `./public-http/routes/site/pages/response`, `universal`. CMS does not depend on cookie-consent for this seam. `.changeset/crp-17-page-response.md`, CMS baseline.

## CRP-17.T — Bind request cookies, CSP, HTML hooks and wire ordering

**BUILDER: SOL · OPUS-REVIEW**

At `Pages/response.ts:29–30,67–94`, decode query and flash in the same order, bind `clearFormFlashCookie` with current HTTPS logic, and defer member-cookie/header checks to the injected callbacks. At `:117–161`, bind listing state, plugin export head and declared hosts, partials with the existing activation repo, form wire policy, attempt token generation and registration, and member script names. Keep reading and mutating only the report-only CSP header through `req.res`, and only when that header is a string. Invoke CRP-08’s bound cache helper and its shared detector with the host config ID. Apply `res.vary("Cookie")` when indicated, then set Cache-Control and HTML type **before** awaiting finalization. For a JSON listing batch, preserve the specific `req.res?.type("json")` override before the send. Do not apply these success-path hooks to redirect or 404 paths that did not use them.

**Importers.** Keep `H/{home:28,slug-routes:18,virtual-page:13}.ts`, `Pages/static-tier.ts:29`, `P/routes/site/products.ts:12`, and `Pages/__tests__/pre-consent-vary.route.test.ts:12` on the bound module. Remove only the host’s duplicated decisions.

**Tests first.** Extend `pre-consent-vary.route.test.ts` with `a later JSON listing type does not erase the cache decision or an existing Vary value` (`overwrite-vary-on-consent`). Extend the response matrix to pin the static export skipping form-token registration and member script.

## CRP-18.J — Static document finishing and template pipeline

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

Add `J/cms/public-http/routes/site/pages/{static-tier,template-render}.ts`. Move the ordering logic and leave theme implementation in Tovu.

- `Pages/static-tier.ts:89–171,174–181` → `finishStaticTierDocument<TTheme, TMenus, TPreviews, TCollections, TCover, TAuthor>({ input, ports }, _optional = {}): Promise<string>`. `input` carries `theme`, `pageId`, `html`, `currentPath`, `staticMenus: TMenus | undefined`, and optionals `featuredImage?: TCover` and `postAuthor?: TAuthor`. The ports are `expand({ html, theme })`, `resolveEmbeds({ html })`, `renderBody({ html, resolved }, { postAuthor }?)`, `resolveMenus({ html, currentPath, known })`, `resolvePostPreviews({ html, currentPath })`, `resolveCollectionLists({ html, currentPath })`, `renderStatic({ input, html, menus, postPreviews, collectionLists })`, and `documentHead({ theme }): Promise<string | undefined>`. `resolveEmbeds` and `renderBody` share the existing `ResolveHtmlPageEmbedsResult`. `resolvePostPreviews` and `resolveMenus` can return `undefined`. Use existing `assignListingKeys` after substitution, and run menus → previews → collections sequentially on those exact assembled bytes. Render once then attach head, even if the renderer returned `undefined` and the old `?? ""` applies. Move missing-menu ID dedupe into `missingStaticMenuIds({ html, knownIds }, _optional = {}): readonly string[]`. Export `hasStaticThemeIndex({ tier, index }: { tier: string | undefined; index: string | undefined }, _optional = {}): boolean` with the existing `!== undefined` rule.
- `Pages/template-render.ts:157–220,227–242` → `renderTemplateDocument({ post, staticMenus, ports }, options = {}): Promise<string>` with options `pendingBodyJson?: JsonObject`, `pendingBodyHtml?: string`, and `extraHead?: string`. Theme and theme-dependent rendering ports are bound at entry. `select({ templateChoice })` returns `{ kind: "diagnostic" } | { kind: "template"; pageId: string; html: string }` with `templateChoice` allowing the existing absent/null distinction. `diagnostic({ staticMenus })` returns the host diagnostic bytes with its normal document assets. Other ports are `injectTitleAndCurrentId({ html, post })`, `placeTerms({ html, post })`, `resolveNestedContent({ html }, { pendingHtmlOverride }?)`, `resolveEmbeds({ html }, { pendingContentOverride }?)`, `renderBody({ html, resolved, post })`, `readCover({ post })`, `finishStatic({ pageId, html, post, staticMenus, featuredImage })`, `injectAssistant({ html })`, and `renderComments({ html, post })`. Use existing core JSON and CMS post/embed types, and CRP-15’s cover result. Move the two override DTO constructions verbatim, conditionally passing the options and preserving `publishAt ?? null`. Copy a pending doc onto the post only for cover projection. The diagnostic arm exits early. Success order is selected template → title/current ID → terms → bounded nested HTML → resolved embeds and post presentation → finished static document/consent assets → extra head → assistant → comments. No parallelization of that chain.

**Tests first.** `cms/public-http/routes/site/pages/__tests__/static-tier.test.ts` — `assigns listing keys after marker substitution and requests assets after rendering` (`assign-listing-keys-before-substitution`). `template-render.test.ts` — `uses the current-entry override for nested rendering and a pending cover without publishing the draft` (`resolve-saved-html-instead-of-pending`). Include a diagnostic that calls no content/cover ports and a comments-order check.

**Package/API.** CMS adds the two same-relative exports, `universal`. `.changeset/crp-18-template-finishing.md`, CMS baseline.

## CRP-18.T — Keep theme lookup, engine calls and document assets bound

**BUILDER: SOL · OPUS-REVIEW**

At `Pages/static-tier.ts:89–171`, bind `expandPartials` with the existing slots, public post-reader and read-only widget host, CRP-14.T’s body renderer, shared missing-menu-ID helper plus existing menu resolution, CRP-16.T’s preview resolver only when access is supplied, and collection lists with current collaborators, markup attribute and warning sink. Supply the existing static render and `documentAssets({ scripts: staticThemeScripts({ theme }), static: true })`, returning its head. Keep `staticThemeScripts`, the narrowed `isStaticThemeWithIndex` host guard, and `serveStaticThemeIndex` wired to the host response and preserve-title read. The guard must still narrow `theme.pages.index` safely. A regular theme with an `index` property is not a static theme.

At `Pages/template-render.ts:157–242`, bind selection and diagnostics to `resolveTemplate` and the original diagnostic HTML and stylesheet sentinel. Keep theme partial expansion, comment provider/policy, post path, static menus and site assistant selection as ports. Bind existing `resolveHtmlFormatContentMarkers` with the same bounded counter and read-only widget host to the same post repo as now. Pass `postPreviewsAccess`, `postAuthor`, and pending overrides only when present. Use `renderAssignedTermsBlock({ terms })` from CRP-11.J. Do not fetch post previews from diagnostics or add consent assets to a path that intentionally returns the complete authored document unchanged.

**Importers.** Bound `renderViaTemplate` stays at `A/routes/posts/{template-preview-render:10,__tests__/template-preview-render.test:9,__tests__/unit/post-list-preview.unit.test:7}.ts`, `H/{post:19,virtual-page:14}.ts`, `S/__tests__/routes/{missing-template-diagnostic-v2-stylesheet.test:6,post-template-author.test:11,post-template-comments.test:11}.ts`, `V/__tests__/{landing-page-render.test:12,no-silent-drops.test:17}.ts` and `P/routes/site/__tests__/widget-body-embeds.test.ts:11`. Bound static-tier imports stay at `H/{home:29,marketing:15,post-not-found:12}.ts`, `Pages/template-render.ts:30`, `W/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:11`, and `P/routes/site/__tests__/{pages.edge-paths.route.test:29,pages.response-matrix.characterization.test:33,widget-body-embeds.test:12}.ts`.

**Tests first.** Extend `pages.response-matrix.characterization.test.ts` with `static index, content template and diagnostic each retain their own asset/finishing path` (`drop-static-consent-document-head`). Keep the stylesheet and author tests.

## CRP-19.J — Home, slug, post, missing and virtual page decisions

**BUILDER: SOL · OPUS-REVIEW · 6 source files**

Add the six modules under `J/cms/public-http/routes/site/pages/handlers/`. Use neutral branch and outcome functions. `TTheme`, `TMenus`, and `TView` denote caller-owned structural types. `TView` carries the already-resolved public posts, assistant selection, and request access context via bound collaborators. The return type for the home/slug specs is an explicit union, not “undefined means handled.”

```ts
type SitePageReply =
  | { kind: "handled" }
  | { kind: "next" }
  | { kind: "page"; html: string }
  | { kind: "not-found"; html: string }
  | { kind: "no-themes" };
```

For slug, `page` additionally carries the `PerVisitorResponse` prepared at the old `:88` point. A setting of no active theme is a valid `theme: null` result and is not the no-installed-themes branch.

| Source → same-relative Jini module | Signature and behavior to move |
|---|---|
| `H/home.ts:34–165` → `home.ts` | `homePageRoute.handle({ deps }, _optional = {}): Promise<SitePageReply>`, `method: "get"`, `path: "/"`. Ports `preRedirect({})`, `loadView({})`, `resolveTheme({ view })`, `readRoot({})`, `isVisible({ post, view })`, `renderContentHome({ post, view, theme })`, `prepareHome({ view, theme })`, `renderStaticIndex({ prepared, view, theme })`, and `renderGenericHome({ prepared, view, theme })`. Preserve the expected `PostNotFoundError` → absent root conversion, member decision on the root, visible-post sorting at the existing point, and content branch before preparing fallback data. `prepareHome` preserves the eager reads even on the static arm. Static index finishes as handled via the host sender. |
| `H/marketing.ts:28–128` → `marketing.ts` | `resolveMarketingPageOrOverride({ slug, candidate, readPost, finish, augment }, _optional = {}): Promise<MarketingPageResolution>`. `candidate({ slug })` returns a host-selected static standalone page or `undefined`, `readPost({ slug })` returns `Promise<PublicPostRecord>`, and `finish({ slug, candidate })` and `augment({ slug, html })` return `Promise<string>`. Reuse the same `overridingPost`/`responded`/`fallthrough` union. Catch only `PostNotFoundError`, keep omitted/true `overridesThemePage` winning versus explicit false, and fall through on empty finished HTML before augmenting. `resolvePostAfterMarketingCheck({ slug, resolution, readPost }, _optional = {}): Promise<PublicPostRecord>` reuses the override, otherwise does the present second lookup. |
| `H/post-not-found.ts:16–53,84–98` → `post-not-found.ts` | `postNotFoundPage({ postRedirect, renderStatic404, recordNotFound, fallbackHtml }, _optional = {}): Promise<Extract<SitePageReply, { kind: "handled" \| "not-found" }>>`. Do post-content redirect before static 404, then record once and select a nonempty static result or the supplied fallback. `classifySlugFailure({ error }, _optional = {}): "listing" \| "missing" \| "fault"` uses the existing two error classes, in their current order. Keep the host catch for a fault during missing-page recovery. |
| `H/post.ts:20–54,97–123,128–161` → `post.ts` | `renderTemplateBranchIfEligible<TTheme>({ post, theme, isBare, renderBare, select, readHead, renderTemplate }, _optional = {}): Promise<string \| undefined>`. `select({ theme, post })` gives the existing ineligible/direct/page-shell decision. Bare wins even with theme off, then theme absence/ineligible, then head and one render using a shallow override for page-shell. Export `withPageShellChoice({ post, branch }, _optional = {}): PublicPostRecord` for the shared shallow-copy decision used by virtual and preview. Also move orchestration as `renderGenericPostPage({ post, posts, ports }, _optional = {}): Promise<string>` and `renderBarePostPage({ post, ports }, _optional = {}): Promise<string>`. `ports` expose `readTitle`, `readWidgets`, `readEmbeds`, `readVersions`, `readMetadata`, `readHead`, plus `readTerms`/`readTimeZone` and final `render` for generic, or `readAssets` and `render` for bare. Read title before the existing parallel batches, preserve the generic listed-media input and bare asset read after the batch. Keep the generic render’s host-supplied comments transform, including its declared-script sink. |
| `H/slug-routes.ts:25–37,42–125` → `slug-routes.ts` | `nestedPageRoute.handle({ path, deps }, _optional = {}): Promise<"handled" \| "next">` retains the exact nested path matcher, reserved-path check and pre/post ordering. `slugPageRoute.handle({ slug, deps }, _optional = {}): Promise<SlugPageReply>` has `path: "/:slug"`, `method: "get"`. Ports `preRedirect`, `loadView`, `resolveTheme`, `loadMenus`, `prepareVisitor`, `resolveMarketing`, `resolvePost`, `isAllowed`, `notFound` and the two post render arms. Read no view for a pre-redirect, prepare menus then visitor policy before marketing, handle a marketing response without a post read, and gate an override or ordinary post before either renderer. Pass the same visible posts and access to both paths. Template empty string is a legitimate result and does not trigger generic fallback. |
| `H/virtual-page.ts:71–89` → `virtual-page.ts` | `renderVirtualPage({ post, loadView, resolveTheme, select, prepareVisitor, loadMenus, renderTemplate, renderGeneric }, _optional = {}): Promise<{ kind: "no-themes" } \| { kind: "page"; html: string; perVisitor: PerVisitorResponse }>` preserves request preparation order and `withPageShellChoice`. Keep the deliberate difference from authored posts: no bare-template branch, a selected template receives `pendingBodyHtml: post.bodyHtml ?? ""`, no post-preview access and no extra head; generic receives `posts: []`. |

`loadView`, read ports and render ports use one required object, with explicit `| undefined` on present-but-absent slots. Keep `tryRedirectPhase` bound to the existing redirect writer and the original routing context. Do not create a catch-all that turns `next` into a 404 or treat an unhandled exception as a post miss.

**Tests first.** In `cms/public-http/routes/site/pages/handlers/__tests__/`, add witnesses in six corresponding `.test.ts` files: `visible authored root wins over a static index` (`serve-static-index-before-root`), `explicit false keeps a static marketing page despite a same-slug row` (`ignore-marketing-override-flag`), `post redirect bypasses 404 rendering and metric` (`record-not-found-before-redirect`), `bare rendering precedes the no-active-theme fallback` (`theme-gate-before-bare`), `nested falls through after both phases and denied slug never renders` (`render-denied-slug`), and `virtual template receives the in-memory HTML even when empty` (`read-virtual-body-from-public-repo`).

**Package/API.** CMS adds all six same-relative exports, `universal`. `SitePageReply` can live in an internal `page-replies.ts`. `.changeset/crp-19-page-handlers.md`, CMS baseline.

## CRP-19.T — Keep host fallthrough, status and engine bindings

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/site/pages.ts:3–4,15–18`, keep registration order: listing rewrites, `/`, nested regex, `/:slug`. Use the neutral raw decisions in `H/home.ts:66–181` and `H/slug-routes.ts:25–128` from those real registrars. The host adapts `"next"` to `next()` and `"handled"` to no second response. Keep `resolveRequestedSlug` and listing request state in the host. Bind nested redirects to `req.path`, and home/slug to the existing `redirectLookupPath`, including the original numbered-page path. Keep the original Promise-all reads, theme sentinel conversion and mutable slug error context. Update that context when theme and menus resolve, not after Jini returns, so a late miss still renders the right themed 404.

Preserve this wire matrix in the host adapter:

| Branch | Host behavior |
|---|---|
| Home pre-redirect; nested pre-/post-redirect | Existing redirect writer, with no page hooks. Reserved/invalid nested target or no redirect calls `next()`. Nested throw calls `next(error)`. |
| No installed theme | Existing 500 body. Theme explicitly off still renders. |
| Home visible root | Resolve root menus, use template or generic post, then CRP-17.T sender. Keep fallback home ordering and listing key 1 offset. |
| Slug marketing | Already-prepared visitor cache and same sender. No member gate on the standalone page. An overriding post still passes member admission. |
| Missing or denied slug | Existing post redirect, then themed 404 when nonempty or fixed host 404 markup. Direct 404 writer and one consent-gated not-found event. No success-path finalizer or cache directive added. A failure in missing handling still reaches the existing render reporter/500. |
| Listing batch/page miss | Existing `listingBatchNotFound` with `next`, not the post 404 branch. |
| Generic/template/virtual success | Existing host `sendPublicPage`. For virtual, `withListingBatch` remains before theme/assistant reads and virtual content is never written or looked up again. |

At `H/{home,marketing,post,post-not-found,virtual-page}.ts` bind only real repo, engine, member, head, copy, and response work. Use CRP-12.T and CRP-17/18.T; use the CRP-08.T analytics import in `post-not-found.ts:1`. Keep `sendNoThemesInstalled` and `reportSiteRenderFault` on the host. Do not put a new catch around the low-level template renderers that changes where a fault is reported.

**Importers.** Keep `pages.ts:3–4`, `H/slug-routes.ts:19–22`, `H/home.ts:31–32`, `H/post-not-found.ts:14`, `H/virtual-page.ts:15`, and `P/routes/site/member-pages.ts:9` on bound functions. The direct tests `W/features/theme/__tests__/template-render.canary.test.ts:9` and `P/routes/site/__tests__/{pages.edge-paths.route.test:28,pages.route.test:21}.ts` also stay on the bindings. No direct importer needs an unbound spec.

**Tests first.** Extend `P/routes/site/__tests__/pages.response-matrix.characterization.test.ts` with `nested redirects use the original path and denied overrides share the ordinary missing response` (`post-content-redirect-before-pre-content`). Pin colon-free concrete URL pairs in the test fixtures and assert fallthrough, headers, status and virtual-page effects independently.

## CRP-20.J — Authorized template-preview renderer

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

From `A/routes/posts/template-preview-render.ts:20–38,78–213`, add `J/cms/admin-http/routes/posts/template-preview-render.ts`. Move `TemplatePreviewRenderError`, `PostPreviewRenderInput`, `PostPreviewRenderResult`, the shallow clone and render selection. Export `renderPostPreview<TTheme>({ input, ports }, _optional = {}): Promise<PostPreviewRenderResult>`.

`ports` supplies `isBare({ post })`, `renderBare({ post })`, `resolveTheme({})` returning `{ kind: "missing" } | { kind: "off" } | { kind: "active"; theme: TTheme }`, `selectBranch({ theme, post })`, `renderTemplate({ theme, post }, { pendingBodyJson?, pendingBodyHtml? })`, and `missingThemeText`/`inactiveThemeText`. Use CRP-19.J `withPageShellChoice`. If `templateChoice` is omitted, use the saved choice or `null`; explicit `null` and `""` remain distinct. Empty/bare choice renders before presentation reads. Apply pending HTML only to HTML posts. In the themed arm, the already-authorized unpublished row supplies its matching body fallback, but a genuinely pending empty value wins. Published rows without an override still go through ordinary body resolution. Preserve ineligible preview continuing as-is, 500 for no installed theme, 409 for explicitly disabled styling, and the rendered choice in the result. Keep separate helpers for the clone, overrides and theme branch. No principal, theme discovery, or read access to unpublished posts enters this package.

**Tests first.** `cms/admin-http/routes/posts/__tests__/template-preview-render.test.ts` — `renders bare before theme lookup and distinguishes saved draft HTML from an empty pending edit` (`fallback-to-saved-on-empty-pending-html`). Also pin doc versus HTML mismatches, published/no override, page-shell, and both theme conflicts.

**Package/API.** CMS `./admin-http/routes/posts/template-preview-render`, `universal`. Existing `template-preview` and `template-preview-embeds` exports unchanged. `.changeset/crp-20-template-preview-render.md`, CMS baseline.

## CRP-20.T — Bind one preview pipeline across HTML, inspection and tools

**BUILDER: SOL · OPUS-REVIEW**

At `A/routes/posts/template-preview-render.ts:51–76,134–213`, keep a real binding over presentation repo and `resolveActiveTheme`, bare reads from the existing public marker/body functions, and `renderViaTemplate` via CRP-18.T. Preserve the bare preview’s missing SEO fold. Bind themed menus by the original post’s path, force assistant off, and use anonymous listing context with the existing resolver. Omit absent options when calling the Jini renderer. Do not change the preflight at `A/routes/posts/template-preview.ts:27–58` or the shared `renderAuthorizedTemplatePreview` used by embed inspection at `M/content.ts:244+`. Both HTTP surfaces use the same authorized fetched row and renderer.

**Importers.** Repoint `TemplatePreviewRenderError` directly to CMS at `A/routes/posts/template-preview.ts:9`, `M/content.ts:9`, and `R/tool-catalog-manifest.ts:61`, and in any mixed test import of the class at `A/routes/posts/__tests__/{template-preview-render.test:5,unit/post-list-preview.unit.test:8}.ts`. Keep `renderPostPreview` on the bound path there and at `W/features/{post/__tests__/preview-tool.test:9,theme/__tests__/existing-site-template-fallback.integration.test:12}.ts`. The tool still maps the same class at `R/tool-catalog-manifest.ts:597+`. Repoint any imported preview input/result types to CMS, without re-exporting them from the binder.

**Tests first.** Extend `A/routes/posts/__tests__/template-preview-render.test.ts` with `authorized embed inspection sees the same pending draft bytes as the HTML preview` (`bind-inspection-to-saved-row`). Pin no public write and anonymous post previews.

## CRP-21.J — Member virtual-page admission and storefront selection

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

- `P/routes/site/member-pages.ts:154–193` → `J/cms/public-http/routes/site/member-pages.ts`. Move virtual record construction and account admission only. Keep the four page IDs, templates, localized/product copy, exact paths, and redirect destination supplied by Tovu. `makeMemberPagePost({ path, workspaceId, pages }, _optional = {}): PublicPostRecord | undefined` uses an own-key-checked `Readonly<Partial<Record<string, { id: string; title: string; body: string }>>>`, and preserves the epoch, kind, status, empty doc, HTML body and null choice. `memberPageRoute.handle({ path, deps }, _optional = {}): Promise<MemberPageReply>`, `method: "get"`. `deps` has `workspaceId`, `pages`, `accountPath`, `signInLocation`, `markPrivate({})`, `hasLiveSession({})`. Normalize one trailing slash as before, return `{ kind: "missing" }` for no page, `{ kind: "redirect"; status: 303; location: string }` for the signed-out private page, or `{ kind: "page"; post: PublicPostRecord }`. Mark private before the session read, including if it throws. Do not infer account protection from title or a supplied redirect URL.
- `P/routes/site/products.ts:49–67,95–125` → `J/cms/public-http/routes/site/products.ts`. `resolveStorefrontProducts({ list }, { readiness } = {}): Promise<SiteProduct[]>` and `resolveStorefrontProduct({ id, find }, { readiness } = {}): Promise<SiteProduct | null>`. `list` and `find` are explicit callable-or-undefined ports with the current readiness options, `find` taking `{ idOrSlug }`. Preserve `list({}, optional)`, no catalog default beyond `[]`/`null`, and point lookup beyond the bounded grid. Export distinct neutral raw specs for GET `/products` and `/products/:id`. Their `handle({ raw, deps }, _optional = {})` returns `{ kind: "page"; html: string } | { kind: "missing" } | { kind: "handled" }`. Grid deps only read catalog, then resolve/render the host page. Detail deps look up the point first, avoid theme/readiness work on miss, then render with exactly `[product]` and pass that HTML/product to the required checkout decoration port. A host no-theme response produces `"handled"`. Use existing `SiteProduct`/`ProductCheckoutReadiness` types and no money/provider/catalog-storage dependency.

**Tests first.** `cms/public-http/routes/site/__tests__/member-pages.test.ts` — `marks the account private before checking its live session` (`defer-private-header-until-after-session`). `products.test.ts` — `missing detail performs no theme or checkout work and uses a point lookup` (`search-bounded-grid-for-detail`).

**Package/API.** CMS adds `./public-http/routes/site/member-pages` and `./public-http/routes/site/products`, `universal`. `.changeset/crp-21-member-storefront.md`, CMS baseline.

## CRP-21.T — Keep member markup and themed checkout rendering in the host

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/site/member-pages.ts:11–160`, keep markup and the four pinned IDs in `MEMBER_PAGES`. At `:163–200`, retain a genuinely bound `memberPagePost` supplying those records and bind the raw admission spec. Use `Object.keys(MEMBER_PAGES)` in the same Express registration, then existing `resolveMemberSession`, cookie name, workspace and clock, exact `303 /signin#redirect=%2Faccount`, bare 404, and CRP-19.T virtual sender. Keep the 500 and its host reporter on read/render failure. Update the positional registrar to `{ app, deps }` in `R/http-app/mount-public-site.ts:16` and `P/routes/site/__tests__/member-pages.route.test.ts:19` and their call sites. `V/__tests__/member-auth-script.unit.test.ts:7` keeps the real bound post/markup import.

At `P/routes/site/products.ts:44–130`, bind the Jini grid/detail specs to the existing conditional catalog functions and `res.locals.commerceStatus`. `resolveStorefrontProducts({ deps }, optional = {})` remains the bound export used by static export. Change callers to object args at `R/{memory-deps/route-deps/publish-export:15,145,site-deps/route-deps-comments-plugins:40}.ts` and `P/routes/site/__tests__/{commerce-strip-parity.test:28,integration/site-title.integration.test:11,products.route.test:3}.ts`. Keep `registerProductRoutes` and `CommerceSiteAdapterDeps` imports at `R/commerce-http.ts:7`, `S/__tests__/{composed-reporter-bound-sites.unit.test:14,routes/request-cost-cacheability.measurement.test:12,routes/request-cost-render-work.measurement.test:10}.ts` and `P/routes/site/__tests__/commerce-site-app.ts:3`. Keep storefront composition, theme sentinel handling, consent asset hook, protocol/host, exact checkout decoration inputs, 404 markup, and separate `products:catalog`/`products:detail` reporter operations. Do not recheck or reactivate checkout before the product lookup.

**Tests first.** Extend `member-pages.route.test.ts` with `account denial and signed-in account response cannot enter a shared cache` (`drop-account-no-store-on-redirect`). Extend `products.route.test.ts` with `detail preserves consent assets and decorates only an existing product` (`decorate-before-product-exists`).

## CRP-22.J — Member OIDC protocol legs and unlink transaction

**BUILDER: SOL · OPUS-REVIEW · 3 source files**

Do not replace or duplicate the three existing CMS raw specs or their cookie/limiter lifecycle. Add two domain modules under `J/user-management/member-login/`, alongside `oidc-login` and `link-service`.

- `P/routes/members/oidc-callback.ts:29–93` and `oidc-verify-email.ts:23–57` → `oidc-request.ts`. `readOidcCallbackParams({ query, cancelled }: { query: Readonly<Record<string, unknown>>; cancelled: (required: Record<string, never>) => Error }, _optional = {}): { code: string; state: string }` preserves the exact cancellation discriminator, bounded strings, and rejection of arrays/objects. `readOidcEmailProof({ body }, _optional = {}): { continuation: string; challengeId: string; code: string }` keeps exactly three keys, the 8192/255 bounds and the six-digit string. Keep `proofString` private.
- Export `completeMemberOidcCallback({ context, protocol, links, browserBinding, query, cancelled, userAgent, ip, deliveryAllowed, continuationLocation }, _optional = {}): Promise<OidcCallbackResult>`. `protocol` and `links` are the existing `OidcLoginDeps` and `MemberLoginLinkDeps`; `context` is `LoginContext`. `browserBinding({})` and `query({})` are lazy so the host can retain context → unique cookie → parser ordering. `OidcCallbackResult` is `{ kind: "signed_in"; result: MemberSignInResult } | { kind: "email_verification_required"; continueByEmail: () => Promise<{ browserBinding: string; location: string }> }`. The continuation checks `deliveryAllowed({ email })`, seals with the original validated context/binding, requests the existing challenge, then calls host `continuationLocation({ providerId, challengeId, continuation })`. Keep delivery lazy until the raw spec asks. No upstream tokens or arbitrary returns enter the fragment.
- `verifyMemberOidcEmailProof({ context, protocol, links, browserBinding, proof, userAgent, ip }, _optional = {}): Promise<MemberLoginLinkResult>` opens the sealed continuation against the proof binding before calling the existing link owner with inbox challenge ID/code. Omit absent `connectMemberId`/user agent where the receiving type requires it. Do not replace inbox proof with a caller flag. Return the existing signed-in or still-required result; cookie and public member projection are outside this module.
- `P/routes/members/unlink-identity.ts:20–70` → `unlink-identity.ts`. `unlinkMemberIdentity({ workspaceId, providerId, readCurrent, readProviderId, links, readPasswordHash, revokeSessions, saveMember, nowIso, userAgent, ip }, _optional = {}): Promise<Awaited<ReturnType<typeof issueMemberSession>>>`. `providerId` is `string | undefined`, `readProviderId({ providerId })` validates it after the first session read, and `readCurrent({})` returns current member and session or `null`. `links` supplies the existing `MemberLoginLinkDeps`; the remaining ports use the existing projected member/session repo method argument types. Keep a transaction over both locks, first `members:external-identities:<workspaceId>`, then `trash:member:<workspaceId>:<memberId>`, then fresh session read. Keep age 0 through 900000 ms inclusive, identity existence/not-unlinked, and active password **or** verified email plus successful `prepareMemberChallenge` readiness. Preparation must not deliver. Only then mark the identity, revoke all sessions, save the incremented member with fresh revocation timestamp, and issue replacement session using the same transaction. Do not coerce a missing provider via an unchecked `as string`.

**Tests first.** `user-management/member-login/__tests__/oidc-request.test.ts` — `checks limits before issuing a bound continuation and rejects extra proof keys` (`send-challenge-before-limits`). Include cancellation and a binding mismatch with no link call. `unlink-identity.test.ts` — `re-reads the session after both locks and rolls back identity/session changes if issuance fails` (`use-pre-lock-session`). Also test stale/future clock, pending password, and readiness without delivery.

**Package/API.** `user-management ./member-login/oidc-request` and `./member-login/unlink-identity`, `node`, matching the `server`/`members` isolation of their respective owners. No CMS → user-management dependency added. `.changeset/crp-22-member-oidc.md`, user-management baseline.

## CRP-22.T — Keep OIDC HTTP facts, counters, cookies and announcements

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/members/oidc-callback.ts:46–122`, retain the existing limiter adapter and bind live `memberOidcContext`, unique callback cookie, legacy `MemberOidcCancelled`, the site’s signup callback, address/user-agent and fixed `/signin#…` fragment construction. Keep the strict continuation-limit refusal and discard only the browser-inapplicable rate response as today. Return the same lazy session-cookie and analytics callbacks to `memberOidcCallbackRoute`. `callbackAddress` remains host-owned and independent of stale member auth. Apply CRP-08.T’s visitor analytics repoint.

At `oidc-verify-email.ts:43–105`, keep the request gates, pre-read failure observer, proof-cookie read, callback address binding, signed-in announcement and CRP-07.T DTO projection. Use `readOidcEmailProof` directly in `parseProof`, and the Jini domain leg in `verify`. Do not clear the proof cookie on a wrong code if the existing raw spec retains it for retry. At `unlink-identity.ts:42–70,93–108`, bind `readCurrent` to the same cookie-backed `currentOidcMember` on both sides of the locks, and provider validation through the same host rule without a cast. Pass the same transaction/repo instances and keep the raw spec session-cookie append plus workspaces, origin, size cap and two request-time counters. Do not introduce operator auth or reinterpret pending-member access.

**Importers.** Repoint `P/routes/members/__tests__/oidc-callback-params.unit.test.ts:5` to the new parser and inject the real cancellation error. Repoint `P/routes/members/__tests__/member-proof-bodies.unit.test.ts:6` to `readOidcEmailProof`. There are no external importers of `proofString` or `unlinkMemberIdentity`. Leave `oidc-verify-email.ts:12` on host `callbackAddress`, and keep the real registrar imports at `M/members.ts:49–51`, `S/__tests__/routes/{member-oidc-auth.test:19–21,member-oidc-callback.unit.test:35}.ts` and `P/routes/members/__tests__/unit/h4-oidc.unit.test.ts:21`.

**Tests first.** Add to `S/__tests__/routes/member-oidc-auth.test.ts` `a lost session during unlink produces no replacement cookie and a wrong proof keeps the retry cookie` (`emit-session-cookie-before-transaction-result`). Preserve callback flow cookie ordering, cancel location, proof and main cookie scope, and duplicate-cookie rejection.

## CRP-23.J — Live plugin route invocation and result projection

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move `P/routes/plugin-contributions.ts:43–59,61–72,83–98` into `J/cms/public-http/routes/plugin-contributions.ts`. Reuse `PluginContributionsSnapshot`, `PluginAuthContext` and `PluginRouteResult` from core. No new SDK or router.

- `isPluginActivated({ workspaceId, pluginId, getActivation }, _optional = {}): Promise<boolean>` reads only enabled state. `getActivation({ workspaceId, pluginId })` returns an enabled row or `null | undefined`.
- `invokeLivePluginRoute({ workspaceId, snapshot, route, input, ports }, _optional = {}): Promise<PluginHttpReply>`. `route` is `PluginContributionsSnapshot["routes"][number]`. `input` carries the handler’s `body`, `params`, and `query`; take their types from `Parameters<typeof route.handler>[0]`. `ports` contains `isActivated({ pluginId })`, `isLive({ snapshot })`, `principalIdFor({ access }): string | undefined` and `reportError({ pluginId, error })`. Before invocation check durable activation then generation. After the awaited handler check generation then durable activation. Keep snapshot identity, not just ID/version equality. Public always omits `principalId`; authenticated access includes it only if defined. Keep the existing error reporter on handler/recheck fault and a redacted 500 body.
- `PluginHttpReply` is a tagged `not-found` (404 `{ code: "NOT_FOUND" }`), `failed` (500 `{ code: "PLUGIN_ROUTE_FAILED" }`), or `result` with `cacheControl: "no-store"` and an empty 204 or JSON status/body. Preserve `result.status ?? 200` and `result.body ?? null`; do not give the 404/500 the success header. Use literal branches for empty and JSON, not a test on body truthiness.

**Tests first.** `cms/public-http/routes/__tests__/plugin-contributions.test.ts` — `a plugin generation retired while its handler awaits cannot send its result` (`skip-post-handler-generation-check`). Include durable disable, no public principal, false JSON body, and redacted failure.

**Package/API.** CMS `./public-http/routes/plugin-contributions`, `universal`. `.changeset/crp-23-live-plugin-routes.md`, CMS baseline.

## CRP-23.T — Retain the live Express router and auth middleware

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/plugin-contributions.ts:14–42,74–81,100–136`, keep the router rebuilt per request, the durable pre-body gate, operator session plus plugin-specific grant, distinct member cookie and active-member enforcement, all four parsers in current order, and error middleware. Bind the new invocation at `:83–98` to the exact snapshot and live `.list({}).includes(snapshot)`. `principalIdFor` reads only the selected host auth binding. Convert handler params to the string-valued route shape at the host boundary. Write the Jini decision through Express, including empty 204, without exposing `locals`, raw cookies or tokens. Keep pre-body activation errors on `next(error)`, not in the plugin handler reporter.

**Importers.** `R/app.ts:96`, `W/features/plugin-runtime/__tests__/integration/contribution-runtime.integration.test.ts:13` and `P/routes/__tests__/{integration/plugin-contributions.auth.integration.test:14,plugin-contributions.unit.test:20,unit/h4-plugin-auth.unit.test:16}.ts` continue to import the real registrar/auth ports. No moved private helper has an external importer.

**Tests first.** Extend `plugin-contributions.auth.integration.test.ts` with `disabled and retired routes refuse before parser work or after a pending handler respectively` (`parse-plugin-body-before-activation`). Keep invalid body versus oversized body versus redacted 500 assertions.

## CRP-24.J — Public media admission, validators and original-byte decisions

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Split `P/routes/site/media-rendition.ts` into two CMS leaves. Do not duplicate `resolveMediaRendition`, `guardMediaRenditionRepo`, `resolveRenditionTransformSpec`, `renditionCacheControl`, `ifNoneMatchSatisfied`, `lookupMediaOriginalBlob`, `sanitizeOriginalBytes`, or `decideMediaOriginalReply`.

- `:58–344,363–434` → `J/cms/media/site/rendition-access.ts`. `createRenditionAccess({ workspaceId, cache, nowMs, readEntries, readWidgetRows, findMedia, readRetiredSlugs, isGated }, _optional = {}): RenditionAccess`. `cache` is the result of existing `MediaAccessEvidence.getCache`, and `nowMs({})` returns number. `readEntries({ workspaceId })` gives readonly `PostRecord[]`, `readWidgetRows` is a required callable-or-undefined port returning rows with `id`, `slug`, `fieldsJson` and optional `deletedAt`, and lookup ports return `MediaRecord | null` and readonly slugs respectively. `isGated({ entry })` receives only access metadata. Return `decide({ idOrSlug, readEntitlement }, _optional = {}): Promise<{ gated: boolean; allowed: boolean; record: MediaRecord | null }>` with `readEntitlement({})` returning `Promise<({ entry }: { entry: AccessEvidencePost }) => boolean>`. Get this per visitor only on the gated branch. Move the scan, saved widget lookup and cache mechanics with existing CMS media-reference/soft-delete helpers. Keep the same source refs, cover refs, published-or-gated candidate rule, unreadable fallback, alias dedupe by access object, lazy widget reads, 60000 ms coalesced cached promise and identity-checked failed eviction. Build access metadata as `{}` for absent `memberAccessJson`, with a key only for a string or `null`. Private/document denies before evidence reads. A public actual referrer wins; otherwise real gated references take precedence over unrelated opaque entries, then opaque fallback, then allow unreferenced. No visitor decision or bytes cached.
- `:42–56,436–700` → `J/cms/public-http/routes/site/media-rendition.ts`. Export `mediaRenditionRoute` and `mediaOriginalVideoRoute` as raw status/header/body specs, the first with the same `/m/:assetId/:transformSpec/:filename` path, the second declaring both original aliases. Use a discriminated reply of JSON, empty, rendition bytes, or existing `MediaOriginalReply`. Separate deps. Rendition reads `admit({ assetId })`, `resolve({ assetId, transformName, version, record })`, `readDefinition`, `readStoredRendition`, `hashTag({ identity }, { bytes }?)` and typed `classifyTransformError`. Original reads `admit`, `lookupOriginal({ assetId })`, `readBytes({ storageKey })`, `sanitize({ sniffed, sourceBytes })` and injected `parseRangeHeader`. `handle({ params, headers, deps }, _optional = {})` gets only path params and needed `if-none-match` or `range`. Do not look at filename or extension for content type.
- Preserve malformed transform before access, access before validation/bytes, 304 only through the explicit public validator branch, two identical private 404 outcomes per route, gone/trashed 410, typed transform 503/corrupt 422 and the current redacted 500. Compute a public validator only with active media, valid definition and stored rendition or SVG source. Preserve the quoted hash of `[source.sha256, name, version, storedKey ?? "svg"]` and bytes fallback identity. Gated rendition replies do not get this public ETag. Preserve SVG `nosniff`/CSP and original admission for video, audio, SVG and WebVTT only. Sanitize before applying range, reuse the shared response policy including its 416 and empty-body behavior.

**Tests first.** `cms/media/site/__tests__/rendition-access.test.ts` — `gates current and retired aliases and does not turn unreadable gated entries into public evidence` (`ignore-retired-slug-evidence`). `cms/public-http/routes/site/__tests__/media-rendition.test.ts` — `denial and missing have identical replies and a denied request never reaches validators or bytes` (`evaluate-etag-before-access`). Include gated/public mixed references and permitted original range after sanitization.

**Package/API.** CMS `./media/site/rendition-access` and `./public-http/routes/site/media-rendition`, `universal`. Keep crypto, byte sanitization I/O and concrete image error classes behind ports. `.changeset/crp-24-public-media.md`, CMS baseline.

## CRP-24.T — Bind media evidence, member admission and existing byte writers

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/site/media-rendition.ts:239–290,353–361,424–429`, bind the already-shared `mediaAccessEvidence.getCache` with the same post and optional widget repo object identities. Omit absent `entryRepo` rather than passing explicit undefined. Do not make a second cache or bypass write-owner invalidation. Bind the same repo queries, fresh request member resolver, cookie, and existing wall-clock source for the member check. Move no session cookie or account rules into CMS. At `:452–699`, bind node SHA-256, transform/error predicates, the existing guarded rendition repo, sniff/sanitize and range helpers. Use `writeMediaOriginalReply` for original status/headers/bytes, and the same Express `.send(Buffer.from(bytes))` for renditions. Preserve Express’s own GET/HEAD freshness behavior, the existing header order and exact 404 bodies. Keep original alternatives one Express array registration, not two new competing routes.

**Importers.** Keep `M/media.ts:59`, `W/features/site-backup/__tests__/library-share.integration.test.ts:30`, `A/routes/media/__tests__/library.test.ts:11`, and `P/routes/site/__tests__/integration/media-validation.integration.test.ts:16` on the real registrars. No private resolver is imported elsewhere. Do not change share URL selection or public media paths.

**Tests first.** Extend `media-validation.integration.test.ts` with `a member-gated original and its optional extension use the same no-store and range policy` (`select-original-type-from-extension`). Retain the library-share test as a witness for unreferenced legitimate media.

## CRP-25.J — Commerce create, pay, read and result-page specs

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move the HTTP decisions at `P/routes/commerce/purchase.ts:30–32,51–193` to `J/commerce/http/purchase.ts`. Keep buyer/session lookup as an injected `buyer({}): Promise<string | null>` port. Use separate specs and per-route dependencies.

| Spec | Contract |
|---|---|
| `createOrderRoute` | JSON POST `/api/commerce/v1/workspaces/:workspaceId/orders`, `Input = { workspaceId: string \| undefined; body: unknown }`. Read only `priceId` and optional whole `quantity` 1–100, with existing identifier bound. Validate before admission. `createOrder({ memberId, priceId, quantity? })` is the only order effect, and returns the existing create payload at 201. No new create idempotency scheme. |
| `payOrderRoute` | JSON POST same base plus `/:orderId/pay`, adding `orderId: string \| undefined` to input. Validate identifier and literally empty JSON object before admission. Only then call `pay({ memberId, orderId })`. Use the existing buyer projection and add `payment.next` only from the owned pay view and only when present. Project intent to `ok` and the existing `error` field, neither full intent nor provider scope. |
| `readOrderRoute` | JSON GET same base plus `/:orderId`. Use path then legacy query nullish fallback, both bounded. `readOrder({ memberId, orderId })` and `toCommerceBuyerOrder` only. No merchant activation, configuration snapshot, or payment dispatch. |
| `commerceReturnRoute`, `commerceCancelRoute` | Raw GET `/commerce/return` and `/commerce/cancel`, same handler over query `orderId` only. Return rendered HTML via the injected `renderBuyerPage({ status, title, message, order? })`. Same read-only buyer projection, `commerceBuyerStatus`, 400 invalid ID, 404 missing owned order, and 503 other failure. No interpretation of provider query flags as payment evidence. |

`admitPurchase({ workspaceId, requestedWorkspaceId, mode, deps }, _optional = {})` carries typed success/refusal results. `deps` supplies `markNoStore({})`, `resolveCommerce({ mode })`, `checkLimit({})`, `setRetryAfter({ seconds })`, and `buyer({})`. A write binding additionally provides `sameOrigin({})`, `checkoutOrigin({})`, `requestOrigin({})`, and `activate({})`, plus just its own order action. A read binding exposes only `readOrder`. This preserves early no-store on admission but not on an invalid JSON DTO. Order is workspace → present commerce → shared limiter → live buyer → same-origin → configured checkout origin → request-origin match → activation for writes only. Use `routeReply` for explicit JSON refusals, preserving the flat body and optional checkout-origin detail. Move known failure mapping with its own 404/400/503, pass through only the existing trusted unavailable message, and keep unknown failure fixed. Keep source markup/copy ports where the host wraps the buyer page.

Use `CommerceOrderView` at the pay/read boundary, the existing buyer projector, and the existing provider/pay-order implementation. `catalog/plugin-server.ts` checks ownership before pay; `catalog/pay-order.ts:35` supplies `order:${order.id}` to the payment owner. Read and checkout return/cancel stay separate from settlement. The Tovu runtime derives return/cancel URLs from the configured public origin at `R/commerce.ts:60` and resolves one config snapshot for a write at `:415–425`. Neither is client input. No new dependency on CMS or user-management in commerce.

**Tests first.** `commerce/http/__tests__/purchase.test.ts` — `validates before admission, denies foreign origin before activation, and only reads on return/cancel` (`activate-before-origin`). Add `pay retries pass the same owned order id and only pay can return the resumable capability` (`forward-entire-payment-view-on-read`). Use the existing settlement integration to verify provider behavior.

**Package/API.** Commerce `./http/purchase`, `universal`, independent of the existing node `./http` webhook export. `.changeset/crp-25-purchase-http.md`, commerce baseline.

## CRP-25.T — Bind member-only sessions, same-origin and themed buyer pages

**BUILDER: SOL · OPUS-REVIEW**

At `P/routes/commerce/purchase.ts:16–49,76–112,147–193`, keep the real host registrar and `CommerceHttpDeps`. Bind `buyer` through the same unique member cookie, revocation check and active-member lookup. Duplicate, operator-only, stale and inactive sessions cannot cross. Bind the single-app limiter, existing CRP-10.T same-origin wrapper, request origin derivation, write snapshot via `forRequest` and existing `CommerceRuntime`. Keep the read port on the runtime’s owned-order read even if checkout is off. Use `mountJsonRoute` with the spec’s own ordered workspace handling, not an earlier shared workspace guard or static no-store for invalid JSON. Bind raw result pages with the existing themed or escaped fallback renderer, and preserve `Retry-After` before the page hook. If using buffered raw replies for the HTML, keep the existing content type, cache, status and `send` behavior.

Existing `CommerceHttpPort` test doubles return `unknown` for the legacy methods. Keep that fixture boundary if needed: adapt only pay/read to the `CommerceOrderView` precondition already assumed at `:163,174,184`, or use a structural projection that reads only the fields the buyer projection uses. Do not tighten fixture DTOs by spreading in real provider identifiers, add a new validator with new wire failures, or widen the stable Commerce domain API.

**Importers.** `R/commerce-http.ts:6,31`, `P/routes/commerce/__tests__/{purchase.integration.test:8,settlement.integration.test:28}.ts` keep the real binding. No other import of `CommerceHttpPort` moved. Keep storefront strip/readiness handling and webhooks unchanged.

**Tests first.** Extend `purchase.integration.test.ts` with `invalid pay stays a body refusal while a valid blocked buy never activates` (`check-buyer-before-order-dto`). Keep the existing repeated pay, provider return/cancel, forged body, revoked member, and cross-account settlement pins.

## CRP-26.J — External MCP OAuth and probe specs

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

Add `J/cms/admin-http/routes/external-mcp/{oauth,probe}.ts`. Use core `ExternalMcpOAuthService` from `contracts/site/api-connections-hosted-mcp`, existing CMS external-MCP shared route types, and structural callback dependencies. Do not import host error classes, browser-cookie helpers, connector service or remote-client implementation.

- `A/routes/external-mcp/oauth.ts:131–169,174–248`. Export five JSON specs: `externalMcpOAuthConnectRoute`, `externalMcpOAuthPollRoute`, `externalMcpSharedListRoute`, `externalMcpSharedLocalRoute`, `externalMcpSharedSelectRoute`; plus raw `externalMcpBrowserSignInRoute`. Paths/methods are the current `POST .../oauth/connect`, `POST .../oauth/device/poll`, and `GET`, `DELETE`, `POST .../oauth/shared`, plus the host-supplied browser sign-in path via a factory `createExternalMcpBrowserSignInRoute({ path }, _optional = {})`. Specs parse transport input only until admitted, then validate.
- Connect deps supply `beginConnect`, `callbackUrl({ serverId })`, `requireSharedSession({})`, and `invalidDestination({}): Error`. After the route’s direct integration grant, validate destination (`undefined` or `"shared"` only), then require a session for shared, then call once with actor, callback URL and `delivery: "hosted"`. Return `{ auth }`. Poll deps supply only `pollDeviceAuthorization` and the necessary error handling. Poll once per request, preserving the pending interval result. The list port is optional and returns the exact disabled fallback. Local/select use their own optional operation methods and distinct unavailable errors. Select validates only `credentialId`, nonempty, max 512, after session admission and before service availability. Preserve the existing server-ID coercion per family, including the shared routes’ `String(req.params.serverId)` distinction. Use the existing `authorizeExternalMcp` integration scope where the host mount supplies that grant.
- Browser raw deps `beginConnect`, `makeBinding({})`, `callbackUrl({ serverId })`, `bindingCookie({ browserBinding })`, `deviceSignInRefusal` and an authenticated `context` with `id`. Generate the binding only after admission. Return 302 plus one appended binding cookie only for `redirect_required`, otherwise fixed 400 `MCP_DEVICE_SIGN_IN_REQUIRED`. Use `bufferedReply: "redirect"` and the existing no-store/no-referrer headers before all route gates. No provider token or device code in the browser reply.
- `:54–103` supplies `externalMcpProviderRefusal({ error }: { error: { code: string; message: string; retryable: boolean; operatorAction: string; retryAfterSeconds?: number } }, _optional = {}): RouteReply` for the closed provider error, with 502 only for unreachable and the other cases 400. Use a separate optional key spread for `retryAfterSeconds`; no raw provider error extraction. Host owns identification and its other OAuth refusal classes.
- `A/routes/external-mcp/probe.ts:70–88` → `externalMcpProbeRoute`, JSON POST `.../mcp-servers/:serverId/probe`. Deps only `probe({ serverId }): Promise<{ ok: true; body: unknown } | { ok: false; status: number; body: unknown }>`. Keep direct authorization before the single probe call, forward only its established body/status, and let unexpected faults reach the host reporter. Do not access launch-spec headers, spawn stdio, retry, or register tools.

**Tests first.** `cms/admin-http/routes/external-mcp/__tests__/oauth.test.ts` — `shared connect and saved selection cannot reach an operation before the required session` (`begin-shared-connect-before-session`). Also pin list fallback, exact ID coercions, one poll, device refusal without cookie, and safe provider refusal details. `probe.test.ts` — `direct grant precedes the one probe and only its projected result is returned` (`probe-before-authorization`).

**Package/API.** CMS adds `./admin-http/routes/external-mcp/oauth` and `./admin-http/routes/external-mcp/probe`, `universal`. `.changeset/crp-26-external-mcp-http.md`, CMS baseline.

## CRP-26.T — Keep independent limiter, browser and error boundaries

**BUILDER: SOL · OPUS-REVIEW**

At `A/routes/external-mcp/oauth.ts:63–117,131–248`, keep host rate checks before the shared mount or wrapped handler so the limiter remains outside the old auth/error catch. Browser headers are set even for a rate or session refusal. Keep one app registration per spec with the current order: browser, shared list/local/select, connect, then poll at its existing composition point. Connect/poll/local/select/browser are limited; **shared GET is not**. Use direct `admin.integrations.manage` on `integration`, no grant override. Browser session check precedes workspace/integration checking; shared list/local/select session check follows it. For the latter use a request-bound throwing `refuseUnlessSessionCredential` port called after the grant, not mount-wide early auth. Connect calls that port only for `"shared"`. Preserve the exact host messages and each refusal’s catch/forward behavior.

Bind origin/callback URL, Node entropy, browser cookie name/scope/copy, and the OAuth service per request. Keep the host error classifier for API connection, validation, reauth and missing secret store. Bind only `OAuthError`’s safe fields to `externalMcpProviderRefusal` and preserve `sendAdminFailure` for unknowns. At `probe.ts:44–88`, keep the dedicated limiter/clock, limiter-outside-catch, exact 429 text/header, and the existing safe probe function and reporter. Do not broaden the OAuth service requirement to the probe’s credential-free cases.

**Importers.** `M/external-mcp.ts:27–28`, `A/routes/external-mcp/__tests__/{external-mcp-route-failures.unit.test:7–8,oauth-error-mapping.test:19}.ts`, `S/__tests__/admin-external-mcp-probe-routes.test.ts:16–17` and `W/features/credential-safety/__tests__/disk-server.fixture.ts:11` keep the registered bindings and limiter types. No importer should bypass the host pre-gates by using the spec directly.

**Tests first.** Extend `external-mcp-route-failures.unit.test.ts` with `browser limit and session gates precede workspace while shared list has no limiter and authorizes first` (`apply-one-gate-order-to-all-oauth-routes`). Preserve the probe secret-free fixture and OAuth error-mapping tests.

## CRP-27.J — Four plugin install operations with typed parser results

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move `A/routes/plugins/install.ts:11–63,74–103,110–124` to `J/cms/admin-http/routes/plugins/install.ts` at the decision seam. Use `PluginInstallInput`, `PluginInstallPreview` and `PluginInstallerPort` from core `contracts/site/host-node`.

- Export `folderPluginInstallPreviewRoute`, `folderPluginInstallRoute` as JSON specs and `zipPluginInstallPreviewRoute`, `zipPluginInstallRoute` as raw specs. Paths are `/api/admin/v1/workspaces/:workspaceId/plugins/install` with the existing `"/zip"` and `"/preview"` suffixes. Folder reads options from body, ZIP from query. Use `InstallRoute = { zip: boolean; preview: boolean }` as private factory data. Deps include `installer({})` resolving the existing per-request local-install availability, `readZipUpload({})` only on ZIP specs, and `onInstalled({ actorId, pluginId })` only on apply specs. `readZipUpload` returns a discriminated `{ ok: true; archive: Uint8Array } | { ok: false; refusal: InstallRefusal }`. It is not a mounted body parser.
- Authorize `admin.plugins.enable` with the existing no-entity scope, then check installer availability, then validate options/replacement and the reviewed digest before reading any archive. Preserve JSON boolean vs query `"true"`/`"false"`, preview not requiring a digest, and the apply regex `^sha256-[a-f0-9]{64}$`. Make parsing a discriminated result with apply carrying a proven string. Preserve folder path unchanged after the nonblank check. Do not use `as string` for the digest. Preview is 200, apply 201, each `{ plugin }`. No apply telemetry on preview. Keep invalid input and disabled outcomes as returned refusals, not exceptions that enter operation-failed telemetry.
- `pluginInstallErrorStatus({ code }, _optional = {}): number` moves the existing recovery-required 500, enumerated conflicts 409, other typed refusals 400. `zipParserRefusal({ error, uploadLimitText }, _optional = {}): InstallRefusal` distinguishes only checked `entity.too.large`, retaining 413 vs 400. Keep ZIP media type and parser policy in Tovu. Do not substitute the agent-plugin refusal table from CRP-05.

**Tests first.** `cms/admin-http/routes/plugins/__tests__/install.test.ts` — `all four operations use their own input source and apply requires a reviewed digest before any upload read` (`read-zip-before-digest-validation`). Also assert missing installer beats parser refusal, and preview never calls install or emits product telemetry.

**Package/API.** CMS `./admin-http/routes/plugins/install`, `universal`. `.changeset/crp-27-plugin-install.md`, CMS baseline.

## CRP-27.T — Bind local install and deferred ZIP parsing

**BUILDER: SOL · OPUS-REVIEW**

At `A/routes/plugins/install.ts:65–72,84–125`, keep the installer selection from `local-installer`, `req.is("application/zip")`, and `raw({ type: "application/zip", limit: MAX_PLUGIN_ARCHIVE_BYTES, inflate: false })`. Bind the parser as a lazy request-scoped port after auth and option checks, not `bodyParsers` on the mount. Keep the legacy missing JSON parser behavior. Check the parsed value is a `Buffer` at the host boundary before passing it as `Uint8Array`. Preserve the original workspace 404, grant, four registrations in the existing order, redacted generic 500 and typed `PluginInstallError`. Use the Jini status helper only after the host recognizes that class. Keep apply failure telemetry at the original catch boundary, including failure during authorization, but not when a normal gate or validation returned a refusal. Keep successful apply capture before send. Do not make the auth mount report a typed validation refusal as an unexpected fault.

**Importers.** `M/plugins.ts:19`, `A/routes/plugins/__tests__/unit/install-route.unit.test.ts:12`, and `S/__tests__/routes/owner-action-product-events-wave2.test.ts:24` keep the real registrar or its local deps. No private parser helper importer.

**Tests first.** Extend `install-route.unit.test.ts` with `unauthorized and digest-invalid ZIP requests never consume the archive stream` (`mount-zip-parser-before-auth`). Keep the four-way matrix and separate typed/unexpected apply telemetry assertions.

## CRP-28.J — Three publish-peer push specs

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Extend existing `J/cms/admin-http/routes/publish-content/peer-transport.ts`, which already owns `peerPullRoute`. Move push parsing and sequencing from `A/routes/publish-content/peer-transport.ts:138–241,275–351`. Use `PeerCallDeps`, the existing CMS `PublishScope`, and `readOverwriteEntityKeys` from CMS import routing. A peer ID is the only destination accepted from the caller.

- `peerPushPlanRoute` parses a transport `{ peerId, body }`, then after `publish_content.apply` with **no entity type or ID**, reads `selectedEntityKeys` first, `scope` second, overwrite keys third. Missing/null selection means no row narrowing, `[]` means none selected. A present scope needs at least one named field, with nonempty arrays of strings and a max of 1000 per field. Construct `PublishScope` after validation with checked arrays and conditional spreads, not `Object.fromEntries` over unvalidated values. Validate overwrite via the existing parser. `requireOverwriteSession({})` is required but called only for nonempty keys. Then `openPeer({ peerId })` and `plan({ peer, principalId, scope, selectedEntityKeys, overwriteEntityKeys })`. Keep legacy 400 text/code.
- `peerPushConfirmRoute` has only `openPeer` and `confirm({ peer, planId, planHash })`. Keep string checks as written, no overwrite/session port and no new local confirmation authority. `peerPushExecuteRoute` has `openPeer`, `requireOverwriteSession`, `execute({ peer, bundleId, confirmationToken, overwriteEntityKeys? })`. Validate required strings before overwrite validation. Omit null keys from execute, retain a real empty array. Every operation returns the peer result as-is, including a refusal represented as a forwarded value. Do not reinterpret it as a local grant, undo or success capture. Keep the three separate paths under `/api/admin/v1/workspaces/:workspaceId/publish-content/peers/:peerId/push`.
- The host still owns opening the stored or connected credential and formatting typed remote-refusal/uncertain-send errors. Existing pull authorization scope/result and CRP-06 typed mapping remain unchanged.

**Tests first.** Extend `cms/admin-http/routes/publish-content/__tests__/peer-transport.test.ts` — `malformed scope and non-session overwrite are refused before opening a peer, while an empty selection is forwarded` (`open-peer-before-overwrite-admission`). Add distinct call records for confirm and execute, including exact payload and no accidental local execution.

**Package/API.** Existing CMS `./admin-http/routes/publish-content/peer-transport`, `universal`. `.changeset/crp-28-peer-push.md`, CMS baseline.

## CRP-28.T — Bind live-site refusal, actor, peer secrets and failure shape

**BUILDER: SOL · OPUS-REVIEW**

Replace registrars at `A/routes/publish-content/peer-transport.ts:244–365` with mounts of the three specs. Mount-level preflight at `:264–273` still checks live-site restriction before workspace 404 and grants. Use guarded `publish_content.apply` with the existing no-entity scope. Bind `refuseUnlessSessionCredential` with the exact overwrite message/permission only at the plan/execute port. Keep `openPeer` at `:124–136`, with same peer repo, sealer, keyring, guarded HTTP client and history context, called after validation. Bind `planPublishToPeer` with `toPublishContentDeps`, and bind the existing `confirmPeerImport` and `executePeerImport` wrappers. The Jini module must not import any of those host binders.

Keep `knownPeerActionRefusal` and `respondWithError` at `:81–119` as live host mapping used by push and backstop, using CRP-06 where already applied. Use the existing registered `res.req.route.path` and request method to preserve pre-send versus uncertain-send copy and disclosure decision. Keep the route-template rule, not a concrete path containing IDs. The mount refusal path writes deliberate 400/403 replies directly. Typed and unknown operation failures delegate to `respondWithError`.

**Importers.** `M/publish-content-transport.ts:22` stays on the real push registrar and mounts existing pull immediately after. `M/publish-content-backstop.ts:23` still uses the host error writer. No moved private parser importer. Preserve the generated route order.

**Tests first.** Extend `A/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts` with `live restriction wins over workspace mismatch and credential opening follows all push admission` (`workspace-before-live-refusal`). Retain `peer-transport-scope.test.ts` and `peer-transport-live-site.test.ts` unchanged in meaning.

## CRP-29.J — Settings SSE lifecycle without host namespace or preview policy

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

Move `A/routes/settings/events.ts:100–127,193–273,291–385,403–420` to `J/cms/admin-http/routes/settings/events.ts`. Keep HTTP/2 header choice and initial auth/readiness in Tovu. This is a structural raw streaming spec, not a JSON handler and not a new general event subsystem.

`settingsEventsRoute` declares `method: "get"` and `/api/admin/v1/workspaces/:workspaceId/settings/events`. `open<Timer>({ workspaceId, initialAccess, lastEventId, afterRevision, ports }, _optional = {}): Promise<void>` uses narrow `FeedAccess = { settings: boolean; preview: boolean }` and ports:

- `writeHead({})`, `write({ frame })`, `end({})`, `onClose({ close })`, `schedule({ work, ms }): Timer`, `clear({ timer })`.
- `readHead({}): Promise<number>`, `readRevisions({ workspaceId, sinceSeq, limit }): Promise<readonly SettingRevisionRecord[]>`, `collect({ revisions }): Promise<ChangeFeedBatch>`, `reauthorize({}): Promise<FeedAccess>`, `previewTick({})`, and `report({ phase, error })`. Head-failure copy is an injected string. `collect` closes over the one request’s viewer and namespace resolver.

Send the head before reading the ledger. Head failure reports and writes only the existing safe `FEED_UNAVAILABLE` frame, then ends without timers. Cursor uses Last-Event-ID first, otherwise only a string `afterRevision`, finite nonnegative number clamped at head, or head fallback. Keep per-connection reauthorization (30 s), poll (1 s), keepalive (25 s), and 200-row page. Hold a ticking flag through I/O, read head before a workspace-scoped page, advance the internal cursor with the same short/full-page rule, and emit the monotonic **visible batch** ID, never the global head. Recheck closed/settings access after async work. Preview frame is independent of settings grant and never emits a setting revision ID. On loss of both grants or auth-read failure clear timers and end. Poll failure reports without advancing the cursor. Close must be idempotent. Store timer handles in checked slots/list rather than closing over uninitialized handles. Do not change the existing three intervals or introduce a background scheduler.

**Tests first.** `cms/admin-http/routes/settings/__tests__/events.test.ts` — `clamps resume position and never emits the global head as the settings event id` (`emit-ledger-head`). Add head-read failure without timers, failed reauthorization suppressing an in-flight poll, and both response/request close adapters disposing once.

**Package/API.** CMS `./admin-http/routes/settings/events`, `universal`. Existing `preview-feed-access` and core `settings/change-feed` remain the same owners. `.changeset/crp-29-settings-stream.md`, CMS baseline.

## CRP-29.T — Preserve early SSE head, admission and host preview channel

**BUILDER: SOL · OPUS-REVIEW**

At `A/routes/settings/events.ts:85–98,129–191,274–289,388–420`, retain `SettingsEventsDeps`, foreign workspace → readiness/principal → optional preview and settings authorize, and exact 401/403. Resolve timer defaults per request. After admission, call the Jini stream open through a host writer that calls `writeHead(200, sseWriteHeadHeaders(req))` before the ledger read. Do not buffer the stream or use a raw bridge that waits on the first frame. Preserve the HTTP/2 omission of `Connection`, both close listeners, and the exact connected and keepalive frames. Use a lazy preview binding so it is created at the original post-head point and reads the same marker/path policy. Keep the per-connection namespace cache and existing `collectChangedNamespaces` owner. Bind reporting separately for head, polling and reauthorize. Do not expose raw failure information on the stream.

**Importers.** `M/settings.ts:8`, `S/__tests__/routes/{settings-events-id-disclosure.test:10,settings-events-resume.test:7}.ts`, and `A/routes/settings/__tests__/{events-head-rejection.unit.test:6,events.unit.test:12,preview-feed-access.test:39}.ts` stay on the registrar/deps binding.

**Tests first.** Extend `events-head-rejection.unit.test.ts` with `the HTTP head precedes a rejected ledger read and no timer is left behind` (`read-head-before-write-head`). Keep the separate preview/access and resume/header tests.

## CRP-30.J — Static publish trigger and destination query

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

From `A/routes/system/publish-site.ts:94–140,202–218,240–313,345–372`, add `J/cms/admin-http/routes/system/publish-site/{trigger,destinations}.ts`. Keep existing preview, status and targets specs. Use `PublishSitePrincipal` and `authorizePublish` from the existing shared module. Keep deploy providers, credential source and process-local run store injected.

- `publishTriggerRoute` is JSON POST `/api/admin/v1/workspaces/:workspaceId/system/publish`, success 202, `Input = { body: unknown }`. `PublishTriggerDeps<TConfig, TSnapshot extends { status: string }>` supplies `readConfig({ targetId, raw }): Promise<{ ok: true; config: TConfig } | { ok: false; error: string }>`, `plan({ config }): { ok: true } | { ok: false; message: string }`, `hasCustomDomain({ config }): boolean`, `domainConfirmationText`, `deploymentCheck({ principalId }): Promise<Record<string, unknown> | undefined>`, `snapshot({}): TSnapshot`, `start({ config, projectName, principalId, credentialId? }): TSnapshot`, and `onBlocked({ principalId, reasonClass })` for `"config" | "consent" | "busy"`. If planning requires the loaded registry, have `readConfig` return `{ config, registry }` through its generic result and pass both to `plan`, without a second load. Require `system.publish` on `site-publish` before validation. Keep validation order JSON object → project name → optional credential shape → target → registry/config → plan → custom-domain refusal → consent → busy → start. Preserve original untrimmed input strings, omit absent `credentialId`, and keep start synchronous with the final snapshot check. Read the busy snapshot once for judgment and use the existing callback response shape. Return the exact 400/409 body with existing reason capture before its wire reply. A custom domain is not authorized by this HTTP call.
- `publishDestinationsRoute` is JSON GET `/api/admin/v1/workspaces/:workspaceId/system/publish/destinations`. `PublishDestinationsDeps<TRegistry, TPeer, TOutput>` supplies `loadRegistry({})`, `mayReadPeers({ principalId })`, `listPeers({})`, `listDestinations({ registry, peers })` with `peers: readonly TPeer[]`. Gate `system.read` on `site-publish`, then registry, then the peer capability, then list peers only if allowed, then project results. Missing peer permission gives `[]`, including omission of identities. Do not turn destination visibility into permission to publish or read/open any credentials. The host binder owns supplying the request-trust authorizer.

Both specs can use typed factory functions for the generic collaborators and instantiate through the host; use named exported factories if necessary so `TConfig`, `TSnapshot`, `TRegistry` and output are inferred without casts. Do not define parallel core versions of the host run object for the sake of shipping the specs.

**Tests first.** `cms/admin-http/routes/system/publish-site/__tests__/trigger.test.ts` — `permission, config, domain and consent block before the one synchronous start and preserve the chosen credential` (`start-before-consent-check`). `destinations.test.ts` — `missing peer capability never reads peer rows or identities` (`list-peers-before-grant`).

**Package/API.** CMS `./admin-http/routes/system/publish-site/trigger` and `./admin-http/routes/system/publish-site/destinations`, `universal`. `.changeset/crp-30-publish-site.md`, CMS baseline.

## CRP-30.T — Bind the shared publish slot and request-scoped peer grant

**BUILDER: SOL · OPUS-REVIEW**

At `A/routes/system/publish-site.ts:147–155,202–314,345–424`, turn the two registrars into mounts. Keep `createPublishSiteContext` and the existing preview/targets binders at `:178–200,315–343,375–409`, including the DB-first, mode-limited environment fallback credential source. Bind trigger config with `blankAsAbsent: false`, shared target planner and current chat confirmation copy. Bind missing consent to the same `CONSENT_UNAVAILABLE` refusal, never `undefined`. Use the same `getPublishRunSnapshot` and `startPublishRun` as chat and status. The route never waits for provider settlement or opens a real credential during preconditions. Keep the existing once-only `site_publish_blocked` event. For auth denial the host refusal writer writes the 403 then records reason `"auth"`, as `authorizeOrRespond` did. Do not count workspace 404 as an auth denial, and do not emit a second event for config/consent/busy. Preserve unexpected `routes/system/publish-site` error reporting and do not send async provider-job failures from the route catch.

For destinations use request-bound `mayReadPeers` from `getPublishTrustContext(res)` and `publishTrustAuthorizeFor(trust)` or the normal authorizer, with the existing no-entity `publish_content.read` request. Keep the history/registry projection and workspace-scoped peer list. Use `requestDeps` for the lazy trust-port binding rather than passing `res` or putting the trust value in shared context.

**Importers.** The only direct importer is `M/system-deploy.ts:21–23`, with calls at `:264–270`. Keep trigger → status → preview → destinations → targets order and the real host mount functions. Do not touch `A/routes/system/publish-credentials.ts`, its tests, or the credential mounting order.

**Tests first.** Extend `S/__tests__/routes/publish-site-route.test.ts` with `auth denial writes once and records one blocked event, and a granted destination read still omits peers without peer capability` (`use-system-read-to-list-peers`). Extend `A/routes/system/__tests__/publish-site.tw4.pins.test.ts` to assert the chosen credential reaches the start unchanged and a busy or consent refusal starts nothing.
