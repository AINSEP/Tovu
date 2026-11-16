import { addDeclaredHostsToPolicy, REPORT_ONLY_HEADER } from "#src/contracts/core/public-page-security-headers";
import { createSeoPageHeadHook } from "#src/features/seo/page-head-contributor";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import { renderCommentsMarkers } from '#src/features/comments/public-markers';
import { renderPluginWidgetPartials } from "#src/features/plugin-runtime/widget-partials";
import type { SiteChatSelection } from "../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { JsonObject } from "@jini-ai/core/primitives";

import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { createPublicPostReader, getPublishedPostBySlug, listPublishedPosts, listPublishedPostPreviews, PostNotFoundError, ROOT_SLUG } from "#src/features/post/post";
import { createMemberAccessResolver } from "#src/features/members/access-resolver";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
import { resolveActiveThemeId } from "#src/features/presentation/active-theme-id";
import { resolveRenderThemeId } from "../../middleware/render-theme-override.js";
import { renderStaticPage, injectCurrentEntityContentId, injectPageTitle, resolveTemplate, resolveTemplateBranchChoice, postPreviewsBatchSize, isPagedPostPreviewsMarker, isBarePageChoice, collectionMarkerKey, splitCollectionMarkerInner, type StaticPostPreview, type StaticListingBatch, type StaticPostPreviewsPage, type StaticFeaturedImage } from "#src/features/theme/static-render";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import { tokenStylesheetSentinel } from "#src/features/theme/static-asset-contract";
import { isStandaloneThemePage, type DiscoveredTheme } from "#src/features/theme/theme";
import { renderEntryList, type EntryListItem, type EntryListFieldValue } from "#src/features/theme/entry-list-render";
import { expandPartials } from "../../../../../contracts/core/expand-partials.js";
import { markersOfType, MENU_MARKER_TYPE, COLLECTION_MARKER_TYPE, POST_PREVIEWS_MARKER_TYPE, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { assignListingKeys, extractListingCardTemplate, injectListingScript, listingBatchPath, listingKeyOfAttributes, parseListingBatchPath, parseListingPagePath, readListingBatch, readListingPage, renderListingPageNav, renderListingMore, type ListingSource } from "@jini-ai/cms/listing";
import { comparePostsByDisplayDate, postDisplayDateIso } from "#src/contracts/core/scheduled-publish";
import type { ContentTypeFieldDef } from "#src/features/content-types/index";
import type { EntryRecord } from "#src/features/entries/index";
import { parseCollectionListConfig, humanizeFieldName, entryPublicHref, type ParseCollectionListConfigResult } from "#src/features/entries/public-read";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { formatDateLabel, resolveSiteTimeZoneSafely } from "@jini-ai/cms/widgets/date-label";
import { postPublicPath, runPostContentPhase, runPreContentPhase, urlFor } from "#src/platform/routing/index";
import { checkSiteRelativeTarget } from "#src/platform/routing/index";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "@jini-ai/cms/seo";
import { foldPageHead, serializeHeadElements, type PageHeadContext } from "../../http/site/page-head.js";
import { renderSite } from "../../http/site/render-site.js";
import { decodeFormSubmissionResultFromQuery, injectFormSubmissionResultIntoHtml, decodeFormFlashCookieValue, mergeFormFlashIntoResult, FORM_FLASH_COOKIE_NAME, type FormSubmissionRedirectResult } from "../../http/site/form-render.js";
import { featuredImageView } from "../../http/site/render/template-render-data.js";
import { renderAssignedTermsBlock } from "../../http/site/render/post-body.js";
import { renderHtmlPageBody } from "../../http/site/render/page-body.js";
import {
  injectExtraHeadIntoStaticPage,
  injectSiteAssistantIntoStaticPage,
} from "../../http/site/render/static-page-injection.js";
import { renderBareEntryDocument } from "../../http/site/bare-page.js";
import { markOffSiteLinksOpenInNewTab } from "../../http/site/external-links.js";
import { injectFormAttemptTokens } from "../../http/site/form-render.js";
import { injectMemberAuthScript } from "../../http/site/member-auth-script.js";
import { isHttpsRequest } from "../oauth/public-origin.js";
import { MEMBER_SESSION_COOKIE } from "../../http/members.js";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";
import { asyncRoute } from "../../../shared/async-route.js";
import type { TemplateRenderDeps, SiteRequestDeps, PostPreviewsAccess } from "./pages/render-context/deps.js";
import { resolveAssignedTermsForRender, placeAfterCurrentContent } from "./pages/render-context/taxonomy.js";
import { resolveSiteTitleForRender, siteTimeZoneDep, htmlEmbedHostDeps, resolveSiteTimeZoneForRender } from "./pages/render-context/site-title.js";
import { type KeyedPostPreviewBatch, storeListingJsonPage, listingBatchBody, recordListingBatchRequest, recordListingPageRequest, listingPageRequestOf, ListingBatchNotFoundError, assertListingPageServed } from "./pages/listing/listing-state.js";
import { isStaticExportRequest, CACHE_CONTROL_PRIVATE_STATIC_EXPORT, CACHE_CONTROL_PUBLIC_PAGE, CACHE_CONTROL_PRIVATE_FORM_RESULT, CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE, resolveRequestedSlug, redirectLookupPath } from "./pages/request-policy.js";
import { withListingBatch } from "./pages/listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "./pages/render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest, resolveWidgetsForRender, resolveHtmlEmbedsForRender } from "./pages/render-context/widgets.js";
import { MAX_CONTENT_EMBED_FETCHES, resolveHtmlFormatContentMarkers } from "./pages/render-context/content-markers.js";
import { resolveStaticMenusForRender, type StaticMenuMap } from "./pages/render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender, resolveFeaturedImageForRender } from "./pages/render-context/media-metadata.js";

/**
 * SPEC-008 T049 — builds the `PageHeadContext` for one render (home/page have
 * no `entry`; the post route's `entry` is a serializable snapshot per
 * `page-head.ts`'s own "by value, not a live PostRecord" contract) and folds
 * every registered `page.head` contributor's output into one escaped string
 * ready for `renderSite`'s `extraHead`. Never throws — `foldPageHead` itself
 * is fail-closed-per-contributor (a broken SEO lookup degrades to no extra
 * head tags, never a 500).
 *
 * `"page"` (2026-08-19, SPEC-008 T045 gap fix part 2) — a static theme's own
 * marketing page (`theme.pages[slug]`) has no backing `PostRecord` at all, so
 * it folds the same entry-less shape `"home"` always has (site-level title +
 * canonical only, per `createSeoPageHeadHook`'s `!ctx.entry` branch — there is
 * no per-page SEO metadata to resolve without an entry, a disclosed limit of
 * today's SEO data model, not something this fix invents). The one thing that
 * DOES differ from `"home"` is the canonical path: `"/"` is only correct for
 * the home route itself, so `canonicalFallbackPath` lets a `"page"` caller
 * supply its own (`/${slug}`) instead of silently reusing home's `"/"`.
 * Ignored whenever `post` is provided (its own resolved/derived slug path
 * always wins), so every pre-existing `"home"`/`"post"` call site is
 * unaffected by this parameter's addition.
 *
 * `canonicalUrl` (2026-09-03, absolute-URL fix) — was a bare path (`/`, `/docs`) on every route,
 * reproduced on both production and local via `curl`. Joined onto the workspace's verified origin
 * via `toAbsoluteUrl`/`resolveWorkspaceOrigin` (`features/seo`'s own seam — see `absolute-url.ts`'s
 * file header for why this lives there and not in `platform/routing`), same fix and same
 * degradation contract (no verified origin yet -> stays relative) as `seo.ts`'s `resolveCanonical`.
 */
async function buildExtraHead({ deps, route, siteTitle, post }: { deps: RouteDeps; route: "home" | "post" | "page"; siteTitle: string; post: PostRecord | undefined }, { canonicalFallbackPath = "/" }: { canonicalFallbackPath?: string } = {}): Promise<string> {
  const canonical = post
    ? (await urlFor({ deps: { postRepo: deps.postRepo }, target: { kind: "entryRef", entryId: post.id, contentType: post.kind }, ctx: { workspaceId: deps.workspaceId } }))?.canonicalUrl
    : undefined;
  const origin = deps.seoDeps.renderBaseUrl ? undefined : await resolveWorkspaceOrigin({ originRegistry: deps.originRegistry, workspaceId: deps.workspaceId, runtimeMode: deps.seoDeps.runtimeMode }, {});

  const ctx: PageHeadContext = {
    workspaceId: deps.workspaceId,
    route,
    siteTitle,
    canonicalUrl: toAbsoluteUrl({ origin, baseUrl: deps.seoDeps.renderBaseUrl, path: canonical ?? (post ? postPublicPath({ slug: post.slug }) : canonicalFallbackPath) }, {}),
    entry: post
      ? {
          id: post.id,
          type: post.kind,
          slug: post.slug,
          title: post.title,
          status: post.status,
          updatedAt: post.updatedAt,
          ext: {},
        }
      : undefined,
  };

  // Contributors close over this render only; another app/export cannot replace their dependencies.
  const seoHook = createSeoPageHeadHook({
    deps: deps.seoDeps,
    rootSlug: deps.seoDeps.rootSlug,
    siteTitle: () => resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true }),
  });
  const elements = await foldPageHead(ctx, { contributors: [seoHook, ...(deps.pageHeadContributors ?? [])] });
  return serializeHeadElements({ elements });
}

/**
 * SPEC-009 (Redirects) REQ-18/19: run the registered `pre_content` phase
 * (redirect rules with `overrideContent: true`) before any content lookup,
 * and `post_content` (the default case) only after a content lookup has
 * failed — the exact `pre_content -> content-resolve -> post_content` order
 * ADR-039 §1 documents. Issues the redirect and returns `true` if a phase
 * matched; the caller falls through to its own content/404 handling on `false`.
 */
async function tryRedirectPhase({ phase, path, workspaceId, res }: { phase: "pre_content" | "post_content"; path: string; workspaceId: string; res: Response }, _optional = {}): Promise<boolean> {
  const outcome =
    phase === "pre_content"
      ? await runPreContentPhase({ path: path, ctx: { workspaceId } })
      : await runPostContentPhase({ path: path, ctx: { workspaceId } });
  // `outcome.kind !== "redirect"` has two type-level arms — `"resolved"` and `"not_found"`
  // (`RouteResolvePhaseOutcome`, @jini-ai/cms/routing) — but only one is reachable through this
  // codebase's real registrants today: `registerResolvePhase` (routing.ts) has exactly one
  // non-test caller repo-wide, `registerRedirectsPhaseHandlers` (redirects/phase-handler.ts),
  // whose own `toOutcome` is the ONLY constructor of this type anywhere in the tree and returns
  // only `null` or `{ kind: "redirect", ... }` — never `"resolved"`/`"not_found"`. Testing that
  // sub-arm would require pushing a resolver onto `registerResolvePhase`'s module-level
  // `phaseRegistry` from a test. That is no longer permanently polluting — as of 2026-09-16 that
  // registry is no longer append-only (`registerResolvePhase` returns a disposer and takes an
  // `owner`, so a test can revoke what it added) — but it still leaves the cost of standing up a
  // second registrant just to reach a sub-arm no shipped code constructs, which is a worse trade
  // than leaving this documented rather than covered. A future SECOND registrant that legitimately returns
  // `"resolved"`/`"not_found"` would make this reachable again; this comment is the disclosure,
  // not a claim that it can never happen.
  if (!outcome || outcome.kind !== "redirect") return false;
  res.redirect(outcome.statusCode, outcome.location);
  return true;
}

/**
 * `resolveActiveThemeId`/`resolveActiveTheme` moved out of this file 2026-08-16 — both were pure
 * `(deps) => value` queries with zero `req`/`res` coupling, and living here forced `export/
 * route-manifest.ts` to import a routing-layer file just to reuse them (a `check:architecture`-
 * flagged runtime edge into the composition-root module; see `ADS-memory/reports/
 * 2026-08-16-export-edge-decoupling.md`). Different homes, not the same one — `resolveActiveThemeId`
 * has zero theme-data dependency (it only reads presentation settings) so it moved to
 * `#src/features/presentation/index` (`active-theme-id.ts`); `resolveActiveTheme` genuinely needs
 * theme data (`findTheme`/`DiscoveredTheme`) so it moved to `#src/features/theme/index`
 * (`active-theme.ts`). Splitting them, rather than bundling both into one file because every real
 * call site uses them together, avoided a measured `check:architecture` regression a combined home
 * would have caused — see `active-theme.ts`'s own file header for the SCC trace. Both re-exported
 * below, unchanged in behavior, so `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s existing
 * `from "../../site/pages"` import of `resolveActiveTheme` keeps working — only `route-manifest.ts`
 * was updated to import both new homes directly.
 */
export { resolveActiveThemeId, resolveActiveTheme };

/**
 * D2's single static-tier document pipeline (E3, 2026-09-23) — the one sequence every static-tier
 * surface (a template-rendered post/page via {@link renderViaTemplate}, a theme marketing page via
 * {@link resolveMarketingPageOrOverride}, and — E4 — the theme's own `index.html` and themed `404`)
 * now runs, so a marker embedded in ANY of the three places a static theme assembles content from —
 * a Page/Post's own authored body, the theme's raw page/marketing-page file, or a partial included
 * into either — resolves the same way regardless of which surface it landed on.
 *
 * Order is fixed and matters:
 * 1. {@link expandPartials} runs FIRST, so a widget/media/post/content/menu/post-previews marker
 *    authored inside a partial (`nav.html`, `footer.html`, …) is physically present in the html
 *    before anything below ever scans it. Before this, a partial's own markers were invisible to
 *    every resolver here, because `renderStaticPage`'s own partial expansion ran strictly AFTER the
 *    embed-resolution stage on every pre-existing call path.
 * 2. `resolveHtmlPageEmbeds` + `renderHtmlPageBody` resolve every widget/media/post/content marker
 *    now present in the expanded html. `menu`/`post-previews` are theme-owned marker types this
 *    stage never touches (`THEME_OWNED_MARKER_TYPES`), so they survive into the steps below by
 *    design, not by omission.
 * 3. Any `menu` marker left in the assembled html whose id is not already a key of `input.staticMenus`
 *    (the caller's own theme-FILE-only scan — {@link resolveStaticMenusForRender}'s first,
 *    no-`extraMenuIds` call at the top of the request) is fetched now. This is what lets a menu
 *    marker authored directly in a Page/Post's own body — never in a theme file, so
 *    `scanMenuEmbedIds` could never see it — resolve at all.
 * 4. {@link resolvePostPreviewsForRender} scans the SAME assembled html — not `theme.pages[pageId]`/
 *    a raw, unassembled template alone — for a `post-previews` marker, so one authored inside a
 *    Page's own body or a partial is found too.
 * 5. {@link resolveCollectionListsForRender} (C5, 2026-09-23) scans the same assembled html for every
 *    distinct `{"type":"collection"}` marker config and resolves each to a rendered entry list, same
 *    "scan the assembled document, not the raw template" reasoning as step 4.
 * 6. `renderStaticPage` applies every remaining static-tier treatment (token injection, asset-path
 *    rewrite, its own idempotent `expandPartials` re-pass, `menu`/`post-previews`/`collection`
 *    injection, link rewrite) on top, exactly as it always has.
 *
 * `input.html` is always supplied to `renderStaticPage` as `htmlOverride`, so its `source ===
 * undefined` null case — reachable only when BOTH `htmlOverride` and `theme.pages[pageId]` are
 * undefined — can never fire here. The `?? ""` below is the same proven-unreachable fallback
 * `renderViaTemplate`'s own pre-existing calls already carry (see that function's own comment for
 * the full proof); not narrowed here for the same out-of-scope reason (the real fix narrows
 * `renderStaticPage`'s return type in static-render.ts).
 *
 * No pending-content override is taken here (removed 2026-10-20, no caller ever passed one): the
 * one preview path, `renderViaTemplate`, applies its unsaved body in its own body stage before it
 * calls this, so the markers that body carries are already consumed by the time they get here.
 *
 * @complexity One `resolveHtmlPageEmbeds` pass (bounded by `MAX_HTML_EMBEDS_PER_PAGE`) plus, only
 * when the assembled html names a menu `input.staticMenus` does not already carry, one additional
 * `resolveStaticMenusForRender` call bounded to exactly those missing ids — never a full theme-wide
 * re-scan — plus one `resolveCollectionListsForRender` pass bounded to at most
 * `MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE` distinct marker configs.
 */
export async function finishStaticTierDocument(
  deps: TemplateRenderDeps,
  input: {
    readonly theme: DiscoveredTheme;
    readonly pageId: string;
    readonly html: string;
    readonly currentPath: string;
    readonly staticMenus: StaticMenuMap | undefined;
    readonly postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext };
    /** The rendered post's featured image for a `{"type":"featured-image"}` marker (2026-10-05);
     *  omitted on every surface that is not a post, which removes the marker. */
    readonly featuredImage?: StaticFeaturedImage | null;
    readonly postAuthor?: Pick<PostRecord, "id" | "slug" | "author" | "showAuthor">;
  }
): Promise<string> {
  const { theme, pageId, html, currentPath, staticMenus, postPreviewsAccess, featuredImage, postAuthor } = input;

  const expanded = expandPartials({ html: html, theme: theme });
  const resolved = await resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo }, {}),
      entryRepo: deps.entryRepo,
      postRepo: createPublicPostReader({ repo: deps.postRepo }),
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      mediaContentTypeStore: deps.mediaContentTypeStore,
      taxonomyRepo: deps.taxonomyRepo,
      termRepo: deps.termRepo,
      ...htmlEmbedHostDeps(deps),
    },
    input: { workspaceId: deps.workspaceId, html: expanded },
  });
  // See-more listings get their keys here, on the one assembled document every resolver below and
  // the batch extractor (`finalizePublicPageHtml`) number the same way.
  const assembled = assignListingKeys({ html: renderHtmlPageBody({ html: expanded, resolved }, { postAuthor }) });

  const knownMenuIds = new Set(Object.keys(staticMenus ?? {}));
  const missingMenuIds = Array.from(
    new Set(
      markersOfType({ html: assembled, type: MENU_MARKER_TYPE })
        .map((marker) => marker.id)
        .filter((id): id is string => id !== undefined && !knownMenuIds.has(id))
    )
  );
  const menus =
    missingMenuIds.length === 0
      ? staticMenus
      : { ...staticMenus, ...(await resolveStaticMenusForRender({ deps, theme, currentPath }, { extraMenuIds: missingMenuIds })) };

  const postPreviews = postPreviewsAccess
    ? await resolvePostPreviewsForRender({ deps, memberAccessResolver: postPreviewsAccess.resolver, memberContext: postPreviewsAccess.context, pageHtml: assembled, pagePath: currentPath })
    : undefined;

  // C5 (collections plan, 2026-09-23) — the SAME assembled html post-previews just scanned, so a
  // `{"type":"collection"}` marker authored in a Page/Post body or a partial resolves here too, not
  // only one hand-authored directly into a theme file.
  const collectionLists = await resolveCollectionListsForRender({ deps, html: assembled, pagePath: currentPath });

  return injectExtraHeadIntoStaticPage({ html: renderStaticPage({
      theme,
      pageId,
      htmlOverride: assembled,
      menus,
      postPreviews: postPreviews?.previews,
      postPreviewBatches: postPreviews?.batches,
      postPreviewsPage: postPreviews?.page,
      collectionLists,
      featuredImage,
      postAuthor,
    }) ?? "", extraHead: (await deps.documentAssets?.({ scripts: staticThemeScripts({ theme }), static: true }))?.head });
}

/** Static pages and diagnostic templates share the theme's declared-script defaults. */
function staticThemeScripts({ theme }: { theme: DiscoveredTheme }): readonly import('@jini-ai/cookie-consent').DeclaredScript[] {
  return theme.manifest.scripts ?? [];
}

/**
 * The most distinct `{"type":"collection"}` marker configs one page's `resolveCollectionListsForRender`
 * call will resolve. A theme/page author authors a small, fixed number of collection markers per page
 * (this is layout, not user-collection-sized data); a page that somehow carries more than this is
 * almost certainly an authoring mistake (e.g. a template loop that duplicated a marker with a
 * per-iteration filter), not a legitimate design, so the excess configs are left on their authored
 * fallback rather than firing an unbounded number of content-type/entry queries per request.
 */
const MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE = 10;

/**
 * Reads one custom field's value out of an entry's namespaced `fields.ext.site.<name>` bag, the
 * route-layer twin of `repo.sqlite.ts`'s `json_extract($.ext.site.<name>)` and
 * `trash-aware-memory-repo.ts`'s own private `siteFieldValue` — duplicated rather than imported
 * because both of those live inside `features/entries/`'s repo-adapter internals with no barrel
 * re-export, and this route-level display mapping must not deep-import across that feature boundary
 * just to read a value out of a record it already has in hand.
 *
 * @complexity O(1).
 */
function collectionEntryFieldValue({ row, field }: { row: EntryRecord; field: string }, _optional = {}): unknown {
  const fields = row.fieldsJson as { ext?: { site?: Record<string, unknown> } } | null | undefined;
  return fields?.ext?.site?.[field];
}

/**
 * Reduces one fetched {@link EntryRecord} plus the content type's resolved display fields
 * (`parseCollectionListConfig`'s `display.fields`, already validated and ordered) into the
 * {@link EntryListItem} `entry-list-render.ts`'s pure renderer needs. `href` is always `null` (D1:
 * entry pages are off) via {@link entryPublicHref}'s seam; `dateIso`/`dateLabel` prefer
 * `publishedAt`, falling back to `updatedAt` for the rare row with no `publishedAt` yet (draft rows
 * never reach here — `listPublishedForDisplay` only returns published entries — but a defensive
 * fallback costs nothing and matches `formatPostPreviewDate`'s own "degrade, don't throw" posture).
 *
 * @complexity O(f) over `fields`' length — one `collectionEntryFieldValue` lookup per displayed
 * field, f being the content type's own declared/authored field count, never user-collection-sized.
 */
function toCollectionEntryListItem({ row, fields, timeZone }: { row: EntryRecord; fields: readonly ContentTypeFieldDef[]; timeZone: string }, _optional = {}): EntryListItem {
  const dateIso = row.publishedAt ?? row.updatedAt;
  return {
    title: row.title,
    href: entryPublicHref({ _typeKey: row.type, _slug: row.slug }),
    dateIso,
    dateLabel: formatPostPreviewDate({ iso: dateIso, timeZone }),
    fields: fields.map(
      (field): EntryListFieldValue => ({
        name: field.name,
        label: humanizeFieldName({ name: field.name }),
        kind: field.kind,
        value: collectionEntryFieldValue({ row, field: field.name }),
      })
    ),
  };
}

/**
 * The content-type key a `{"type":"collection"}` marker names. `id` is the documented form (the
 * collections plan, the admin "Copy embed code" snippet and the docs page all write
 * `{"type":"collection","id":"<typeKey>"}`, the same `id` every other marker type uses for its
 * target); `typeKey` is accepted as an alias because early markers and tests were written with it.
 * `undefined` when neither is a non-empty string. @complexity O(1).
 */
function collectionMarkerTypeKey(config: Readonly<Record<string, unknown>>): string | undefined {
  for (const candidate of [config.id, config.typeKey]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

/** A collection marker config that parsed: its bounded query plus its display options. */
type ParsedCollectionListConfig = Extract<ParseCollectionListConfigResult, { ok: true }>;

/** A collection marker's validated content-type key and parsed list config, or `undefined` (with
 *  its `[collection]` warning) for every config-level miss. @complexity One `findByKey` read. */
async function resolveCollectionMarkerConfig(
  deps: Pick<TemplateRenderDeps, "workspaceId" | "contentTypeRepo">,
  marker: EmbedMarker
): Promise<{ typeKey: string; parsed: ParsedCollectionListConfig } | undefined> {
  const typeKey = collectionMarkerTypeKey(marker.config);
  if (typeKey === undefined) {
    console.warn('[collection] marker names no content type (a string "id"); leaving its authored fallback content');
    return undefined;
  }

  const contentType = await deps.contentTypeRepo.findByKey({ workspaceId: deps.workspaceId, key: typeKey });
  if (contentType === null) {
    console.warn(`[collection] no content type registered for typeKey "${typeKey}"; leaving its authored fallback content`);
    return undefined;
  }

  const parsed = parseCollectionListConfig({ config: marker.config, contentType });
  if (!parsed.ok) {
    console.warn(`[collection] rejected marker config for typeKey "${typeKey}": ${parsed.reason}; leaving its authored fallback content`);
    return undefined;
  }
  return { typeKey, parsed };
}

/** The published entries one collection marker lists: its whole bounded query for a plain marker,
 *  or — for a see-more marker — its batch (from `after` when this request asks for its key) plus
 *  whether a next batch exists. @complexity One bounded `listPublishedForDisplay` read. */
async function readCollectionBatch({ deps, query, listingKey }: { deps: Pick<TemplateRenderDeps, "workspaceId" | "entryRepo" | "listingBatch">; query: ParsedCollectionListConfig["query"]; listingKey: number | undefined }, _optional = {}) {
  // A see-more marker reads its batch (from `after` when this request asks for its key) plus one row
  // to learn whether a next batch exists; entries carry no member access, so every row is visible.
  if (listingKey === undefined) {
    return { items: await deps.entryRepo.listPublishedForDisplay({ workspaceId: deps.workspaceId, query }), hasMore: false, next: 0 };
  }
  return readListingBatch({
    source: ({ offset, limit }) => deps.entryRepo.listPublishedForDisplay({ workspaceId: deps.workspaceId, query: { ...query, offset, limit } }),
    after: deps.listingBatch?.key === listingKey ? deps.listingBatch.after : 0,
    size: query.limit,
  });
}

/**
 * Resolves one already-deduplicated `{"type":"collection"}` marker to its rendered entry-list markup,
 * or `undefined` for every kind of miss: no content-type key, an unknown/system/tombstoned content
 * type (`parseCollectionListConfig`'s own rejections, which include D8's `SYSTEM_CONTENT_TYPES`), an
 * invalid config (unknown `where`/`sort`/`fields` name, non-scalar `where` value), or zero matching
 * published entries (`renderEntryList`'s own "no data ⇒ nothing to substitute" contract). Every
 * rejection is a `console.warn`, not a thrown error — one bad marker must never fail the whole page
 * render, matching this file's existing `[theme]` warning convention.
 *
 * @complexity One `contentTypeRepo.findByKey` plus, only when that succeeds and the config parses,
 * one bounded `entryRepo.listPublishedForDisplay` query (capped at the marker's own clamped `limit`,
 * `parseCollectionListConfig`'s own resource bound) — never an unbounded scan.
 */
async function resolveOneCollectionMarker({ deps, marker, pagePath }: { deps: Pick<TemplateRenderDeps, "workspaceId" | "contentTypeRepo" | "entryRepo" | "listingBatch" | "siteTimeZone">; marker: EmbedMarker; pagePath: string }, _optional = {}): Promise<string | undefined> {
  const config = await resolveCollectionMarkerConfig(deps, marker);
  if (config === undefined) return undefined;
  const { typeKey, parsed } = config;

  const listingKey = listingKeyOfAttributes({ attrs: marker.attrs });
  const batch = await readCollectionBatch({ deps, query: parsed.query, listingKey });
  const timeZone = await resolveSiteTimeZoneSafely({ workspaceId: deps.workspaceId }, siteTimeZoneDep(deps));
  const items = batch.items.map((row) => toCollectionEntryListItem({ row, fields: parsed.display.fields, timeZone }));
  const { template } = splitCollectionMarkerInner({ inner: marker.inner });
  const { columns, layout, structuredData } = parsed.display;
  const list = renderEntryList(items, { template, columns, layout, typeKey, ...(structuredData === undefined ? {} : { structuredData }), ...(listingKey === undefined ? {} : { listingKey }) });
  if (list === undefined || listingKey === undefined || !batch.hasMore) return list;
  return list + renderListingMore({ key: listingKey, href: listingBatchPath({ pagePath, key: listingKey, after: batch.next }) });
}

/**
 * Collection-marker resolution (C5, 2026-09-23) — resolves every distinct `{"type":"collection"}`
 * marker config found in `html` into the `ReadonlyMap<string, string | undefined>`
 * {@link renderStaticPage}'s own `collectionLists` param expects, keyed by {@link collectionMarkerKey}
 * so `static-render.ts`'s `injectCollectionEmbeds` (the other half of this contract) can look each
 * one back up by the identical key.
 *
 * Two or more markers sharing the exact same config (the common case: one marker repeated, or two
 * authored identically) resolve as ONE query, not one per occurrence — `collectionMarkerKey` is the
 * de-dup key precisely so a page cannot multiply its query cost by how many times a marker happens to
 * be pasted. Every distinct config beyond {@link MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE} is left
 * out of the returned map entirely (not queried at all) with one `console.warn`, which
 * `injectCollectionEmbeds` reads exactly like any other miss — its own authored fallback survives.
 *
 * A distinct config's own {@link resolveOneCollectionMarker} result — including `undefined` for a
 * miss — is always recorded under its key, per {@link StaticCollectionList}'s own doc: this lets the
 * caller (and any future re-scan) tell "already resolved, nothing to show" apart from "never looked
 * at", even though this route layer, only ever building the map once per request, has no re-scan of
 * its own that would need the distinction today.
 *
 * @complexity O(m) `collectionMarkerKey` computations over `m` markers found by `markersOfType`, plus
 * up to `MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE` independent `resolveOneCollectionMarker` calls run
 * concurrently via `Promise.all` — never one query per marker OCCURRENCE, only per distinct config.
 */
async function resolveCollectionListsForRender({ deps, html, pagePath }: { deps: Pick<TemplateRenderDeps, "workspaceId" | "contentTypeRepo" | "entryRepo" | "listingBatch">; html: string; pagePath: string }, _optional = {}): Promise<ReadonlyMap<string, string | undefined>> {
  const markers = markersOfType({ html: html, type: COLLECTION_MARKER_TYPE });
  if (markers.length === 0) return new Map();

  const distinctByKey = new Map<string, EmbedMarker>();
  for (const marker of markers) {
    const key = collectionMarkerKey(marker);
    if (!distinctByKey.has(key)) distinctByKey.set(key, marker);
  }

  const withinCap = Array.from(distinctByKey.entries()).slice(0, MAX_DISTINCT_COLLECTION_MARKERS_PER_PAGE);
  if (distinctByKey.size > withinCap.length) {
    console.warn(
      `[collection] page carries ${distinctByKey.size} distinct collection marker configs; only the first ${withinCap.length} are resolved, the rest keep their authored fallback content`
    );
  }

  const resolvedEntries = await Promise.all(
    withinCap.map(async ([key, marker]): Promise<readonly [string, string | undefined]> => [key, await resolveOneCollectionMarker({ deps, marker, pagePath })])
  );

  return new Map(resolvedEntries);
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — an explicit "not configured" page, in
 * the owner's own words from the design conversation, rather than a silent fallback to generic
 * rendering. Reuses the theme's own `.hero`/`.wrap` centering (proven correct this session — an
 * earlier attempt at a DIFFERENT centered page on this same theme used the wrong CSS class and
 * silently rendered left-aligned; `.hero` is the one already confirmed to center via real
 * `margin: auto`, not just `text-align: center` on a narrow box) and the same nav/footer/
 * token-injection shell every static page gets, via `renderStaticPage`'s `htmlOverride` — so this
 * looks like a real page on the site, not a bare error string.
 *
 * One builder for both kinds now (was `buildMissingPostTemplateHtml`/`buildMissingPageTemplateHtml`,
 * separate only because Posts and Pages used to resolve against separate template arrays) — the copy
 * below is worded kind-neutrally ("this content") rather than naming either editor, since the SAME
 * diagnostic page is now reachable from either.
 *
 * `apiVersion` (2026-08-19 architecture audit finding 4): this used to hardcode `../css/styles.css` —
 * v1's stylesheet filename — regardless of the active theme's schema version. `renderStaticPage`
 * itself already picks the matching sentinel per `apiVersion` via {@link tokenStylesheetSentinel}
 * (`static-asset-contract.ts`) before splicing in the token `<style>` block; this diagnostic page
 * renders through that SAME `renderStaticPage` call (see `renderViaTemplate` below), so its own
 * `<link>` must spell the identical sentinel `renderStaticPage` will string-match against, or design
 * tokens silently fail to inject and `rewriteAssetPaths` rewrites the folder prefix onto a filename
 * that does not exist for a v2 theme (an extra 404 on top of the unstyled page).
 */
function buildMissingTemplateHtml({ apiVersion }: { apiVersion: 2 | undefined }, _optional = {}): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Template not configured</title>",
    tokenStylesheetSentinel({}, { apiVersion }),
    "</head>",
    "<body>",
    // Authored in the same marker vocabulary a theme file uses, because `renderStaticPage` resolves
    // this override through the exact same `resolveSlots` pass — the retired `data-tovu-slot`
    // spelling this carried until 2026-08-10 would have left two raw `<div>`s in the diagnostic
    // page, i.e. the error page telling an author something is misconfigured would itself have been
    // the most visibly broken page on the site.
    `<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>`,
    "<main>",
    '<section class="hero wrap">',
    '<div class="eyebrow-row"><span class="status-pill"><span class="dot"></span>Not configured</span></div>',
    "<h1>This content has no usable template</h1>",
    '<p class="lede">This content has no template chosen, or its chosen template has no content slot to render into. Pick a template in its editor to fix this.</p>',
    "</section>",
    "</main>",
    `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — renders `post` (a Post OR a Page, either
 * `"doc"`- or `"html"`-format) through its chosen static-theme template (`theme.json`'s `templates`
 * array), or the explicit diagnostic page above when unresolvable. Only called when the active theme
 * is `static` tier AND declares a non-empty `templates` array AND `isEligibleForTemplateBranch` (`features/theme/static-render.ts`)
 * returned `true` for this row (checked by the caller) — a theme that doesn't declare `templates`
 * simply doesn't support the feature yet, which is a theme-capability gap, not a per-row
 * misconfiguration, so those themes fall through to the pre-existing generic rendering unchanged.
 *
 * Replaces the separate `renderPostViaTemplate`/`renderPageViaTemplate` — collapsible now that both
 * resolve against the SAME `templates` array and the SAME `"content"` marker, and both need the exact
 * same sequence: resolve which template, fill in the current entity's id, resolve any nested
 * `"html"`-format content, then resolve everything else. Which template (or the diagnostic page) a
 * row resolves to is decided by the pure {@link resolveTemplate} — including the `templateChoice`
 * tri-state, whose `null` vs `""` distinction that function's own doc explains in full. This function
 * owns only the embed-resolution I/O that follows.
 *
 * `injectPageTitle` now runs for BOTH kinds (previously Page-only): a template carrying the
 * `{{title}}` placeholder (`pages-default.html`, `page-shell.html` before the 2026-09-03
 * posts-* / pages-* rename) gets the row's real title regardless of whether a Post or a Page rendered
 * through it; a template with no such placeholder (`posts-default.html`, formerly `blog-post.html`, a
 * disclosed, unchanged limitation — see that function's own doc) is simply unaffected, the same
 * no-op-when-absent contract it already had.
 *
 * Exported (2026-08-11 template-preview fix) for `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`, the
 * admin-only "preview this row through a PENDING, not-yet-saved template choice" endpoint —
 * `resolveTemplate` reads `post.templateChoice` alone, so that caller passes a shallow clone of the
 * real record with only `templateChoice` overridden, never persisting the override. Reusing this
 * function directly (rather than a second implementation) is the same "one render pipeline, zero
 * drift" reasoning the file header above gives for the live-site iframe branch in both editors.
 *
 * `pendingBodyJson` (2026-08-12, same fix's `bodyJson` half) — an optional, explicitly-passed
 * override for `post`'s OWN body, threaded into `resolveHtmlPageEmbeds` as a
 * {@link ResolveHtmlPageEmbedsDeps.pendingContentOverride} keyed to `post.id`. Without this, the
 * current entity's own `{"type":"content"}` slot (`injectCurrentEntityContentId`, immediately below)
 * re-fetches `post.id` from `postRepo` regardless of what `post.bodyJson` the caller passed in here —
 * `post`'s OTHER fields (title via `injectPageTitle` two lines below, `templateChoice` via
 * `resolveTemplate` above) already flow through because this function reads them directly, but the
 * BODY only ever reaches the page through that separate marker-resolution round trip. `undefined`
 * (every pre-existing call site) is byte-identical to before this parameter existed — see the
 * override field's own doc for why this is scoped to one id and never ambient state.
 *
 * `pendingBodyHtml` (2026-09-09, `bodyHtml` half of the same pending-body fix) — the equivalent
 * override for an `"html"`-format `post` (a Page written through the Pages admin editor, `bodyHtml`
 * not `bodyJson`). `pendingBodyJson`/`pendingContentOverride` cannot cover this case: an `"html"`-
 * format entity's own `{"type":"content"}` slot is resolved by {@link resolveHtmlFormatContentMarkers}
 * below, which runs strictly BEFORE `resolveHtmlPageEmbeds` and splices raw HTML directly rather than
 * through the `"post-content"` IR component `pendingContentOverride` feeds. So this is threaded into
 * THAT function's own `pendingHtmlOverride` parameter instead, keyed to `post.id` the same way — see
 * that function's own doc for the full reasoning, including why it can never leak past that one id.
 * `undefined` (every pre-existing call site) is byte-identical to before this parameter existed.
 *
 * `extraHead` (2026-08-19, SPEC-008 T045 gap fix part 3) — this function's own `renderStaticPage`
 * call bypasses `renderSite`/`pageShell` exactly like the marketing-page branch and static-tier home
 * do, so it had the identical SEO-fold drop; spliced in via
 * {@link injectExtraHeadIntoStaticPage} on the resolved-template return only. Deliberately NOT
 * applied to the `"diagnostic"` ("template not configured") return above: that page is an
 * operator-facing error state, not real indexable content — carrying the real entry's canonical/OG
 * tags on it would tell a crawler the broken diagnostic page IS the entry, worse than the drop this
 * fixes. Same reasoning `registerSiteRoutes`'s themed-404 branch is left out for (see that call
 * site's own comment). Optional and omitted by both existing callers that don't render the live
 * public page (`apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s pending-preview endpoint), matching every
 * other optional parameter's "omit = unchanged prior behavior" contract in this file.
 *
 * `siteAssistantEnabled` (ADR-054 gap fix) — this function's own `renderStaticPage` call has the
 * identical `pageShell`-bypassing shape the visitor-chat widget missed the same way `extraHead` did;
 * spliced in via {@link injectSiteAssistantIntoStaticPage} on the resolved-template return only, same
 * "not the diagnostic branch" scoping `extraHead` already follows immediately above. Defaults to
 * `false` so both existing callers (the admin preview endpoint, which must never show the public
 * widget in a preview iframe, and the two direct tests) keep their prior behavior unchanged.
 */
export async function renderViaTemplate({ deps, theme, post, staticMenus }: { deps: TemplateRenderDeps; theme: DiscoveredTheme; post: PostRecord; staticMenus: StaticMenuMap | undefined }, { pendingBodyJson, pendingBodyHtml, extraHead, siteAssistantEnabled = false, postPreviewsAccess }: { pendingBodyJson?: JsonObject; pendingBodyHtml?: string; extraHead?: string; siteAssistantEnabled?: SiteChatSelection; /* Post-previews marker (2026-09-03) — the member-access resolver/context for THIS request, ALREADY built by the caller (`registerSiteRoutes` reuses the same instances it built for the home/related-posts listing gate; the admin preview supplies anonymous visitor access). A direct caller that omits it leaves any `{"type":"post-previews"}` marker's authored fallback untouched, byte-identical to before this marker existed, rather than querying with no way to gate the result correctly. Preview used to omit it too, which hid real lists and their See more button. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string> {
  const resolution = resolveTemplate({ theme, templateChoice: post.templateChoice });
  if (resolution.kind === "diagnostic") {
    return renderMissingTemplatePage({ deps, theme, staticMenus });
  }
  const { pageId, html: rawTemplate } = resolution;

  // Expand before content resolution so a partial's own byline suppresses the core header too.
  const withTitle = injectPageTitle({ html: expandPartials({ html: rawTemplate, theme: theme }), title: post.title });
  const withCurrentId = injectCurrentEntityContentId({ html: withTitle, entityId: post.id });
  // Taxonomy render-surface gap fix (2026-09-02): assigned terms are metadata ABOUT the entry, not
  // part of its authored body, so they go in the conventional "filed under" position: right after
  // the entry's own content element, inside the template's `<article>`. Placed BEFORE the content
  // resolves, while the marker can still be found. They used to be appended to the fully resolved
  // template, which put them after `</html>`, under the footer (owner report, plannie, 2026-10-11).
  const withTerms = placeAfterCurrentContent({
    html: withCurrentId,
    post,
    block: renderAssignedTermsBlock(await resolveAssignedTermsForRender(deps, post)),
  });
  const withNestedContent = await resolveHtmlFormatContentMarkers({ deps, html: withTerms, depth: 0, budget: { remaining: MAX_CONTENT_EMBED_FETCHES } }, { pendingHtmlOverride: pendingBodyHtml !== undefined ? { id: post.id, slug: post.slug, bodyHtml: pendingBodyHtml } : undefined });
  const resolved = await resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo }, {}),
      entryRepo: deps.entryRepo,
      postRepo: createPublicPostReader({ repo: deps.postRepo }),
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      mediaContentTypeStore: deps.mediaContentTypeStore,
      taxonomyRepo: deps.taxonomyRepo,
      termRepo: deps.termRepo,
      ...htmlEmbedHostDeps(deps),
      ...(pendingBodyJson !== undefined
        ? { pendingContentOverride: { id: post.id, title: post.title, slug: post.slug, updatedAt: post.updatedAt, publishAt: post.publishAt ?? null, bodyJson: pendingBodyJson } }
        : {}),
    },
    input: { workspaceId: deps.workspaceId, html: withNestedContent },
  });
  const bodyWithTerms = renderHtmlPageBody({ html: withNestedContent, resolved }, { postAuthor: post, postPresentation: post });
  // D2's single static-tier pipeline (E3, 2026-09-23) — `finishStaticTierDocument` runs the SAME
  // expand-partials / resolve-embeds / resolve-post-previews / render sequence every other
  // static-tier surface now runs. Called on `bodyWithTerms`, not the raw, unassembled template: the
  // body stage above already ran, so widget/media/post/content markers are already consumed (this
  // second pass is a no-op for them) and it now ALSO picks up any marker that came from a partial
  // (invisible before `expandPartials` ran) or was authored directly in `post`'s own `body_html`
  // (the fixed live bug — `post-previews`/`menu` used to be scanned off `rawTemplate` alone, which
  // could never see either).
  const rendered = await finishStaticTierDocument(deps, {
    theme,
    pageId,
    html: bodyWithTerms,
    currentPath: postPublicPath({ slug: post.slug }),
    staticMenus,
    postPreviewsAccess,
    // Featured image (2026-10-05): the static tier's counterpart of the templated tiers'
    // `post.featuredImage` — resolved through the SAME metadata/transform lookups and the SAME
    // `featuredImageView`, so both tiers show the identical URL and alt. Before this, the static
    // path never looked the featured asset up at all and it only ever reached `og:image`.
    featuredImage: await resolveFeaturedImageForRender(deps, pendingBodyJson !== undefined ? { ...post, bodyJson: pendingBodyJson } : post),
    postAuthor: post,
  });
  return renderCommentsMarkers({ html: injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: rendered, extraHead }), enabled: siteAssistantEnabled }),
    providers: deps.commentsProviders, siteId: deps.workspaceId,
    entry: { id: post.id, slug: post.slug, title: post.title, status: post.status, canonicalUrl: postPublicPath({ slug: post.slug }) },
  }, { cursor: deps.commentsCursor });
}

/**
 * The operator-facing "template not configured" page for a diagnostic template resolution, with the
 * theme's document assets folded into its head.
 */
async function renderMissingTemplatePage({ deps, theme, staticMenus }: { deps: TemplateRenderDeps; theme: DiscoveredTheme; staticMenus: StaticMenuMap | undefined }, _optional = {}): Promise<string> {
  // `renderStaticPage`'s `| null` return (static-render.ts) is exactly its own `source ===
  // undefined` case, where `source = htmlOverride ?? theme.pages[pageId]` — reachable only when
  // BOTH are undefined. `htmlOverride` here is `buildMissingTemplateHtml(...)`'s return value,
  // typed `string` (never `undefined`), so `source` can never be undefined at this call site and
  // `renderStaticPage` can never return `null` here. The `?? ""` below is accordingly unreachable
  // dead code by construction, not merely untested — proper fix is narrowing `renderStaticPage`'s
  // own return type via an overload keyed on a required `htmlOverride`, which lives outside this
  // file (static-render.ts) and is out of this pass's scope.
  return injectExtraHeadIntoStaticPage({ html: renderStaticPage({
      theme,
      pageId: "template-missing",
      htmlOverride: buildMissingTemplateHtml({ apiVersion: theme.manifest.apiVersion }),
      menus: staticMenus,
    }) ?? "", extraHead: (await deps.documentAssets?.({ scripts: staticThemeScripts({ theme }), static: true }))?.head });
}

/** Sends the shared "no themes installed" 500 both site routes fall back to when
 * `resolveActiveTheme` finds nothing — a workspace with zero discovered themes at all (a fresh
 * boot before the default theme seed, or every theme dir failing to parse). Not a per-request
 * condition either route can recover from, so both `GET /` and `GET /:slug` short-circuit here
 * identically. */
function sendNoThemesInstalled(res: Response): void {
  res.status(500).type("html").send("<h1>No themes installed</h1>");
}

/**
 * The one place either site route's outer catch records an unexpected fault before sending the
 * branded `<h1>Site error</h1>` 500. `GET /`'s catch used to be a literal bare `catch {}` and
 * `GET /:slug`'s discarded everything that was not a `PostNotFoundError`, so a site could 500 on
 * `/` and `/pricing` at once with no record anywhere of what had actually failed. `products.ts`'s
 * own file header records what that cost in practice: a missing `presentation_settings` row 500ed
 * one public route for as long as it did precisely because the catch that absorbed it said nothing,
 * while the sibling route silently degraded past the same missing row.
 *
 * REPORTING, not rethrowing, is the fix here, and the difference is not cosmetic:
 *  - Express 4 (this app's version) does not forward a rejected `async` handler to its error
 *    middleware — that is Express 5 behaviour. A `throw` from these catches escapes as an unhandled
 *    rejection, which Node terminates the process for by default, so rethrowing would trade one
 *    broken URL for every URL on the site, including the ones rendering perfectly.
 *  - The 500 really is per-request-recoverable: nothing in this render path is cached between
 *    requests (theme, settings, menus, widgets and content are all re-resolved per request), so a
 *    fault on one render implies nothing about the next one. Failing the process closed would be
 *    strictly worse than failing this response closed.
 * Only the diagnosis was ever missing, so the diagnosis is all this adds — the visitor-facing body
 * stays the same opaque `<h1>Site error</h1>`, deliberately: an internal message or stack must not
 * reach an anonymous visitor.
 *
 * `console.error` matches what this same route tree's other handlers already use
 * (`comments-submit.ts`, `payments-webhook.ts`). `RouteDeps` carries no logger port to inject, and
 * `platform/observability` deliberately exposes one method (`trackRequest`) with no error channel —
 * see its `ports.ts` header.
 *
 * @param detail the route PATTERN plus, at most, values already validated to a bounded shape —
 *   never a raw request URL. The only request-derived value any caller passes is `GET /:slug`'s
 *   `slug`, which `resolveRequestedSlug` has already matched against `/^[a-z0-9-]+$/`, so it can
 *   carry neither unbounded log volume nor a newline.
 * @param err whatever the catch received, passed through unchanged so the stack survives.
 * @complexity O(1).
 */
function reportSiteRenderFault({ detail, err }: { detail: string; err: unknown }, _optional = {}): void {
  console.error(`[site/pages] ${detail}`, err);
}

// Fixed routes for a static theme's own marketing pages (pricing/docs/blog/…), checked before
// the post lookup in `resolvePostAfterMarketingCheck` below — a static theme page is never
// expected to also be a Post row, so this must resolve before `getPublishedPostBySlug` gets a
// chance to throw `PostNotFoundError` for a slug that was never meant to be a post in the first
// place (it used to run inside the same `Promise.all` as the post lookup, so that throw
// short-circuited straight past this check).
//
// The "is this page id actually its own public URL" half is `isStandaloneThemePage` (see its own
// doc in `features/theme/theme.ts`) — shared with `apps/website/src/features/site-export/route-manifest.ts` rather than respelled
// here, which is what let this route serve `/blog-post` and `/404` as 200s while the exporter
// correctly omitted both.
function isMarketingPageSlug({ theme, slug }: { theme: DiscoveredTheme; slug: string }, _optional = {}): boolean {
  return theme.manifest.tier === "static" && isStandaloneThemePage({ theme, pageId: slug });
}

/** {@link resolveMarketingPageOrOverride}'s outcome — `"responded"` means the caller must send
 *  nothing further (the themed marketing page already went out), `"overridingPost"` means a real
 *  Post row at this slug won the slug collision and should render as a normal post, and
 *  `"fallthrough"` means neither applies and the caller should resolve `post` the ordinary way. */
type MarketingPageResolution =
  | { kind: "responded"; html: string }
  | { kind: "overridingPost"; post: PostRecord }
  | { kind: "fallthrough" };

/**
 * Resolves a `GET /:slug` request against a static theme's own fixed marketing pages, handling
 * the slug-collision policy between a theme page and a real Post row at the same slug.
 *
 * Slug-collision override (2026-08-10, default flipped to post-wins 2026-08-15) — one of the
 * two resources at this slug must win. `overridesThemePage` is tri-state (see
 * `PostRecord.overridesThemePage`'s own doc, `features/post/post.ts`): `null`/absent means the
 * author never had an opinion, in which case THIS is the one place the current default policy
 * is allowed to live — post wins. `false` is a permanent explicit choice (made via the admin
 * UI's collision warning) that keeps the theme page winning regardless of the default; `true`
 * is the same explicit choice in the post's favor, which was already the pre-2026-08-15
 * behavior and needs no special case here. Flipping the default again later is this one
 * comparison changing, never a migration — that is the entire reason the column is nullable
 * instead of `NOT NULL DEFAULT`. Checked with its own lookup here, swallowing
 * `PostNotFoundError` locally rather than letting it reach the outer catch — "no post at this
 * slug" is the overwhelmingly common case for a marketing-page route and must NOT 404 the theme
 * page that's about to render fine.
 */
export async function resolveMarketingPageOrOverride({ deps, theme, slug, staticMenus, siteAssistantEnabled }: { /* `null` when the operator turned the theme off — see the early return at the top of the body. */ deps: RouteDeps; theme: DiscoveredTheme | null; slug: string; staticMenus: StaticMenuMap | undefined; siteAssistantEnabled: SiteChatSelection }, { postPreviewsAccess }: { /* Post-previews marker (2026-09-03) — see `renderViaTemplate`'s identically-shaped, identically optional parameter for the full rationale. This function's own only caller (`registerSiteRoutes` below) always supplies it; the parameter stays optional so a future direct caller that has no per-request member context isn't forced to fabricate one. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<MarketingPageResolution> {
  // A marketing page IS a theme file (`theme.pages[slug]`). With no theme there is no file, so this
  // can only fall through — to the ordinary post/page lookup, or to the bare 404. This is the one
  // place the product constraint bites: on a `static`-tier site, turning the theme off takes the
  // theme's own `/pricing`, `/docs` and themed 404 offline until a theme is turned back on. Nothing
  // is destroyed and reactivating restores every URL.
  //
  // A theme page NOT in `theme.pages` at all is unreachable in practice — `isMarketingPageSlug`
  // already confirms `slug` is a standalone theme page — but `theme.pages` is typed as a partial
  // record, so the lookup stays an explicit fallthrough rather than a non-null assertion, same
  // defensive shape the pre-existing `renderStaticPage` return-value check had. It is read in this
  // same guard (before the post lookup, not after it) so it is not a separate branch no request can
  // reach: `theme.pages` is never mutated in place, so reading it earlier changes nothing.
  const pageHtml = theme?.pages[slug];
  if (theme === null || pageHtml === undefined || !isMarketingPageSlug({ theme, slug })) return { kind: "fallthrough" };

  const candidate = await getPublishedPostBySlug({
    deps: { repo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, slug },
  }).catch((err) => {
    if (err instanceof PostNotFoundError) return null;
    throw err;
  });
  if (candidate && candidate.post.overridesThemePage !== false) {
    return { kind: "overridingPost", post: candidate.post };
  }

  // D2's single static-tier pipeline (E3, 2026-09-23) — `finishStaticTierDocument` runs the SAME
  // expand-partials / resolve-embeds / resolve-post-previews / render sequence every other
  // static-tier surface now runs, so a widget/media/post/content marker on this marketing page or
  // inside a partial it references — never resolved here before this fix — resolves too.
  const staticHtml = await finishStaticTierDocument(deps, {
    theme,
    pageId: slug,
    html: pageHtml,
    currentPath: postPublicPath({ slug: slug }),
    staticMenus,
    postPreviewsAccess,
  });

  if (!staticHtml) return { kind: "fallthrough" };

  // SPEC-008 T045 gap fix, part 2 (2026-08-19) — this branch renders a theme's own marketing
  // page directly via `renderStaticPage`, the same `pageShell`-bypassing shape the static-tier
  // home route already had `injectExtraHeadIntoStaticPage` wired for in `9e7786b9`; this call
  // site was the one flagged there and left unfixed. No backing `post`, so `buildExtraHead`'s
  // `"page"` mode (entry-less, same shape as `"home"`) with this page's own `/${slug}` as the
  // canonical fallback — never home's `"/"`.
  const extraHead = await buildExtraHead({ deps, route: "page", siteTitle: await resolveSiteTitleForRender(deps), post: undefined }, { canonicalFallbackPath: postPublicPath({ slug: slug }) });
  // The display-name fallback must not displace an authored theme title. If the explicit-title
  // read fails, retain the existing fold-wins behavior rather than failing the page render.
  const preserveThemeTitle = await resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true })
    .then((title) => title === undefined, () => false);
  // ADR-054 gap fix — same `pageShell`-bypassing shape missed the visitor-chat widget the same way
  // it missed `extraHead` above; a static theme's marketing pages (pricing/docs/blog/…) never showed
  // the widget even with the setting on, because `pageShell`'s own injection never ran here.
  const html = injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: staticHtml, extraHead }, { preserveThemeTitle }), enabled: siteAssistantEnabled });
  return { kind: "responded", html };
}

/** Resolves the `post` a `GET /:slug` request renders: the slug-collision winner from
 *  {@link resolveMarketingPageOrOverride} when there is one, otherwise the ordinary published-post
 *  lookup at this slug (which throws `PostNotFoundError`, caught by the route's own outer catch,
 *  when nothing exists there either). Never called with a `"responded"` resolution — that case
 *  already sent its own response and returns from the route handler before this would run. */
export async function resolvePostAfterMarketingCheck({ deps, slug, marketingResolution }: { deps: RouteDeps; slug: string; marketingResolution: Exclude<MarketingPageResolution, { kind: "responded" }> }, _optional = {}): Promise<PostRecord> {
  if (marketingResolution.kind === "overridingPost") return marketingResolution.post;
  const { post } = await getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } });
  return post;
}

/**
 * Bare-page render (owner ruling 2026-09-23, `no-template-bare-plan-2026-09-23.md` S4) — resolves
 * every input `renderBareEntryDocument` (`http/site/bare-page.ts`) needs and calls it. Mirrors
 * {@link renderGenericPostPage}'s own "route resolves I/O, render.ts/bare-page.ts stays pure" split,
 * with two deliberate differences: `resolveWidgetsForRender` is called with `theme: null` (a bare
 * Page gets no theme-declared REGION widgets — only inline `widgetEmbed` nodes in its own body,
 * which resolve from `pageBodyJson` regardless of the theme argument), and `assignedTerms`/`posts`
 * are never resolved at all, since {@link renderBareEntryDocument} never appends a terms block or
 * reads the sibling-posts list (plan §3, point 2).
 *
 * `extraHead` is built via `buildExtraHead(deps, "post", ...)` — the SAME SEO/og fold every other
 * post/page route gets. This is the ONE thing this function adds beyond the Page's own HTML; see
 * `bare-page.ts`'s own file header for why that's not a contradiction of "no theme chrome".
 */
async function renderBarePage(deps: RouteDeps, post: PostRecord): Promise<string> {
  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead] = await Promise.all([
    resolveWidgetsForRender({ deps, theme: null }, { post }),
    resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender({ deps, post }),
    buildExtraHead({ deps, route: "post", siteTitle, post }),
  ]);
  return renderBareEntryDocument({
    documentAssets: await deps.documentAssets?.({ scripts: [] }),
    post,
    siteTitle,
    extraHead,
    pageHtmlEmbeds,
    widgetInlineResolved: widgets.inlineResolved,
    mediaTransformVersions,
    mediaAssetMetadata,
  });
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — a `bodyFormat: "doc"` post
 * ("formulaic" content, the owner's own term) or an `"html"`-format Page with an explicit
 * choice renders through its chosen theme template instead of the generic rendering path,
 * whenever the active theme actually supports templates. Returns the rendered HTML, or
 * `undefined` when `post` isn't eligible — the caller falls through to the generic dynamic
 * post render in that case.
 *
 * `kind: "page"` rows DO also flow through this branch, but only on an explicit
 * `templateChoice` (see `isEligibleForTemplateBranch`'s doc) — NOT on the "never chosen, fall
 * back to the theme's first template" arm that Posts rely on. That arm is safe for Posts (an
 * author genuinely had no opinion) but was firing for legacy Pages that never had any admin
 * surface to set `template_choice` at all, which is how `terms-of-service` et al. were
 * rendering under the theme's first template (`<title>Blog post — Basic</title>`) on the live
 * site — fixed by gating on `kind`, not just `bodyFormat`.
 *
 * `pageShellFallback` (2026-09-02) — when `post` is ineligible for the branch above (the common
 * case: no admin surface sets `templateChoice` on create), an `html`-format `kind: "page"` row on a
 * `static`-tier theme gets ONE more chance before falling through to the caller's generic path: the
 * theme's own canonical page-shell document shell (`pages-default.html`, or legacy `page-shell.html`
 * — see `resolveStaticTierPageShellFallback`'s own doc), via that same function.
 * This is NOT a second "which content template" guess — `isEligibleForTemplateBranch`'s own
 * `kind: "page"` gate is completely untouched, so a `doc`-format Page or a Post with no opinion never
 * reaches this arm, and the `terms-of-service`-shaped regression that gate exists to prevent cannot
 * reopen through it. It exists because the generic (non-template) path this row would otherwise fall
 * to renders through Tovu's own `pageShell()` — correct for the other three tiers, which have no
 * standalone documents of their own, but not for `static` tier, whose real pages are complete
 * documents `pageShell()` cannot reproduce (see that function's own doc for the full live-bug trace).
 * `renderViaTemplate` is called with a shallow clone carrying the resolved filename ONLY for this
 * render — nothing is written back to `post.templateChoice`, so the row stays `null`/`undefined` and
 * a later explicit choice (or a theme switch) is free to override this every time.
 *
 * **Bare page** (owner ruling 2026-09-23, plan §2 P1-P6) — checked FIRST, before the `theme === null`
 * early return below: a `kind: "page"` row with `templateChoice === ""` ({@link isBarePageChoice})
 * renders NONE of a theme's chrome, so it doesn't matter whether a theme is even active. Routing it
 * through {@link renderBarePage} here — rather than adding a THIRD "is this bare" check at every one
 * of this function's five call sites (`GET /`, `GET /:slug`, the marketing-override branch, the
 * member-gated path, and the admin preview route, S5) — means the member-access gate at each call
 * site (checked strictly BEFORE this function runs) still applies unchanged: a bare Page is gated
 * exactly like every other Page, never bypassed.
 */
export async function renderTemplateBranchIfEligible({ deps, theme, post, staticMenus, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — see the early return at the top of the body. */ theme: DiscoveredTheme | null; post: PostRecord; staticMenus: StaticMenuMap | undefined; siteAssistantEnabled: SiteChatSelection }, { postPreviewsAccess }: { /* Post-previews marker (2026-09-03) — threaded straight through to `renderViaTemplate`'s own identically-shaped parameter; see that function's doc for the full rationale. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string | undefined> {
  // Checked before the theme-off early return below: a bare Page renders identically with or
  // without an active theme, so this must not be gated on one being present. See this function's
  // own doc, "Bare page" paragraph.
  if (isBarePageChoice(post)) return renderBarePage(deps, post);

  // The template branch renders a THEME's template file, so with no theme it cannot run and the
  // caller falls through to the generic render. `post.templateChoice` is IGNORED here, never
  // cleared — which is what makes "turn the theme off, then back on" fully reversible rather than
  // approximately so: the stored choice takes effect again the moment a theme is reactivated.
  if (theme === null) return undefined;

  // One shared decision, never the two underlying functions in sequence — see
  // `resolveTemplateBranchChoice`'s own doc (`features/theme/static-render.ts`) for the 2026-09-16
  // preview divergence that extraction closed. Behavior here is unchanged by it.
  const branch = resolveTemplateBranchChoice({ theme, post });
  if (branch.kind === "ineligible") return undefined;

  // SPEC-008 T045 gap fix, part 3 (2026-08-19) — `renderViaTemplate` has the same
  // pageShell-bypassing `renderStaticPage` shape as the marketing-page branch above; unlike
  // that branch this one DOES have a real backing `post`, so it folds through the same
  // entry-bearing `"post"` shape the generic (non-template) render below already uses. Same ADR-054
  // gap `resolveMarketingPageOrOverride` above threads through, for the same reason.
  const extraHead = await buildExtraHead({ deps, route: "post", siteTitle: await resolveSiteTitleForRender(deps), post });
  const renderedPost = branch.kind === "page-shell" ? { ...post, templateChoice: branch.templateChoice } : post;
  return renderViaTemplate({ deps, theme, post: renderedPost, staticMenus }, { pendingBodyJson: undefined, pendingBodyHtml: undefined, extraHead, siteAssistantEnabled, postPreviewsAccess });
}

/** The generic (non-template) dynamic post render: resolves every widget/embed/media input
 *  `renderSite`'s `"post"` route needs and renders through it. This is the fallback path for any
 *  post that isn't eligible for {@link renderTemplateBranchIfEligible}'s template branch. */
export async function renderGenericPostPage({ deps, theme, post, posts, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — `renderSite` renders the page unstyled. */ theme: DiscoveredTheme | null; post: PostRecord; posts: PostRecord[]; siteAssistantEnabled: SiteChatSelection }, _optional = {}): Promise<string> {
  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead, assignedTerms] = await Promise.all([
    resolveWidgetsForRender({ deps, theme }, { post }),
    resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender({ deps, post }, { listed: posts }),
    buildExtraHead({ deps, route: "post", siteTitle, post }),
    // Taxonomy render-surface gap fix (2026-09-03) — this is the generic (non-template) render path;
    // `renderTemplateBranchIfEligible`/`renderViaTemplate` above already resolves this same input for
    // the static-tier template branch. See `SiteRenderContext.assignedTerms`'s own doc for where this
    // lands (`render.ts`'s `renderPostBody`, shared by the declarative/templated/handlebars tiers).
    resolveAssignedTermsForRender(deps, post),
  ]);
  return renderSite({
    renderAssets: deps.documentAssets,
    transformBody: ({ html }) => renderCommentsMarkers({ html, providers: deps.commentsProviders, siteId: deps.workspaceId,
      entry: { id: post.id, slug: post.slug, title: post.title, status: post.status, canonicalUrl: postPublicPath({ slug: post.slug }) },
    }, { cursor: deps.commentsCursor, scripts: ({ scripts }) => deps.declaredScripts?.push(...scripts) }),
    theme,
    route: "post",
    siteTitle,
    timeZone: await resolveSiteTimeZoneForRender(deps),
    posts,
    post,
    widgets,
    pageHtmlEmbeds,
    mediaTransformVersions,
    mediaAssetMetadata,
    assignedTerms,
    extraHead,
    siteAssistantEnabled,
  });
}

/**
 * `GET /:slug`'s `PostNotFoundError` handling — always fully handles the response (a redirect, a
 * themed 404, or the bare fallback 404), never falls through. Split out of the route's own catch
 * block so that block's `err instanceof PostNotFoundError` discriminant is the only branch left
 * inline at the call site.
 *
 * It can still reject (a default-policy `post_content` handler that throws, a themed-404 render
 * fault): call it inside a `try`, or through {@link handlePostNotFoundInSlugCatch} where there is
 * none.
 */
export async function handlePostNotFoundOnSlugRoute(
  req: Request,
  res: Response,
  deps: RouteDeps,
  theme: DiscoveredTheme | null,
  staticMenus: StaticMenuMap | undefined
): Promise<void> {
  if (await tryRedirectPhase({ phase: "post_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

  // A static theme that ships its own pages/404.html gets a themed not-found page instead of
  // the bare fallback below — E4 (D2, 2026-09-23) runs it through the SAME
  // `finishStaticTierDocument` pipeline every other static-tier surface uses, so a widget or
  // collection marker on the 404 page (or a partial it references) resolves too, not only its menu
  // markers (the one thing the old direct `renderStaticPage` call already substituted).
  if (theme && theme.manifest.tier === "static" && theme.pages["404"] !== undefined) {
    const staticHtml = await finishStaticTierDocument(deps, {
      theme,
      pageId: "404",
      html: theme.pages["404"],
      currentPath: req.path,
      staticMenus,
    });
    if (staticHtml) {
      void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
      res.status(404).type("html").send(staticHtml);
      return;
    }
  }

  void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
  res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
}

/**
 * {@link handlePostNotFoundOnSlugRoute} for `GET /:slug`'s own catch block — the one call site with
 * no enclosing `catch`. Express 4 ignores the promise an async handler returns, so a rejection there
 * (a default-policy `post_content` handler that throws, or a themed-404 render fault) used to leave
 * the request with no response at all and surface only as a process-wide unhandled rejection
 * (t91 F4.3-A). Answers it exactly as the route's catch answers every other fault.
 *
 * @param input.slug the slug `resolveRequestedSlug` already validated — used only in the fault line.
 * @complexity O(1) beyond {@link handlePostNotFoundOnSlugRoute}.
 */
async function handlePostNotFoundInSlugCatch(input: {
  req: Request;
  res: Response;
  deps: RouteDeps;
  theme: DiscoveredTheme | null;
  staticMenus: StaticMenuMap | undefined;
  slug: string;
}): Promise<void> {
  const { req, res, deps, theme, staticMenus, slug } = input;
  try {
    await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
  } catch (err) {
    reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
    res.status(500).type("html").send("<h1>Site error</h1>");
  }
}

/** Pure display formatting for a post-previews card's date — the one place this file turns
 *  the post's display date ({@link postDisplayDateIso}: `publishAt` when set, else `updatedAt`) into
 *  the short label a card shows (e.g. "Sep 3, 2026"). `PostRecord` has no `publishedAt` (see
 *  `static-render.ts`'s `StaticPostPreview.dateIso` doc for why). A malformed timestamp —
 *  should not occur for a real stored row — degrades to the raw ISO string rather than
 *  "Invalid Date", a legible if ugly output over a broken one. Bug D: the day is the site's
 *  (`timeZone`, from `core.site.timezone`), not the server's UTC. */
function formatPostPreviewDate({ iso, timeZone }: { iso: string; timeZone: string }, _optional = {}): string {
  return formatDateLabel({ iso }, { timeZone });
}

/**
 * Post-previews marker resolution (2026-09-03) — resolves the bounded, ADR-030 §4
 * visibility-filtered {@link StaticPostPreview}s a `{"type":"post-previews"}` marker in `pageHtml`
 * needs, or `undefined` when `pageHtml` carries no such marker at all (the "pay for the query only
 * when present" gate — REQ 2 of the post-previews marker's own spec). A `data-jini-see-more` marker
 * also gets its next batch URL (`<pagePath>/_more/<key>/<after>`) while more posts remain.
 *
 * Applies the SAME member-access rule (`decidePostMemberAccess`, as `isVisible` of
 * `readListingBatch`, so hidden rows are skipped before a batch is filled) the
 * `filterVisiblePosts` gate on the home/related-posts listing already applies to
 * `posts` — see that function's own doc for why gating only SOME listings is protection that looks
 * real and isn't (ADR-030 §4); this listing gets no exception. `kind: "post"` and
 * `status: "published"` are already enforced by the bounded repo query itself
 * (`listPublishedPostPreviews` -> `PostRepoPort.listPublishedPreviews`), so a Page — including
 * whichever one claims the reserved `/` root slug — can never appear in this listing by
 * construction; not re-checked here.
 *
 * @complexity At most 4 bounded `listPublishedPreviews` reads per batch (one batch for the plain
 * markers at their widest limit, one per see-more marker), each `size + 1` rows. Cover
 * selection scans those visible bodies and resolves distinct media refs with one MIME batch;
 * it never adds an unbounded post query or resolves hidden posts' cover metadata.
 */
async function resolvePostPreviewsForRender({ deps, memberAccessResolver, memberContext, pageHtml, pagePath }: { deps: Pick<RouteDeps, "workspaceId" | "postRepo" | "mediaRepo" | "mediaContentTypeStore" | "transformDefinitionRepo" | "entryTermReadRepo"> & Pick<TemplateRenderDeps, "listingBatch" | "listingPage">; memberAccessResolver: MemberAccessResolver; memberContext: MemberContext; pageHtml: string; pagePath: string }, _optional = {}): Promise<{ previews: readonly StaticPostPreview[]; batches: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>>; page?: StaticPostPreviewsPage } | undefined> {
  const markers = markersOfType({ html: pageHtml, type: POST_PREVIEWS_MARKER_TYPE });
  if (markers.length === 0) return undefined;

  const source: ListingSource<PostRecord> = async ({ offset, limit }) =>
    (await listPublishedPostPreviews({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, limit, offset } })).posts;
  const isVisible = (post: PostRecord): boolean => decidePostMemberAccess({ resolver: memberAccessResolver, post, context: memberContext }).allowed;

  // Plain markers share one batch at the widest limit (each slices its own); a see-more marker
  // (`data-jini-listing`) reads its own batch, from `after` when this request asks for that key. A
  // listing with a `<template data-jini-card>` loads its next batches as JSON (`.json` batch URLs).
  const plainLimit = widestPlainPostPreviewsLimit(markers);
  const plain = plainLimit > 0 ? (await readListingBatch({ source, after: 0, size: plainLimit }, { isVisible })).items : [];
  const keyed = await readKeyedPostPreviewBatches({ deps, markers, source, isVisible, pagePath });
  const paged = await readPagedPostPreviews({ deps, markers, source, isVisible, pagePath });

  const listed = [...plain, ...[...keyed.values()].flatMap((batch) => batch.posts), ...(paged?.posts ?? [])];
  const [mediaAssetMetadata, mediaTransformVersions] = await Promise.all([
    resolveMediaAssetMetadataForRender({ deps, post: undefined }, { listed }),
    resolveMediaTransformVersionsForRender(deps),
  ]);
  // Bug D: card dates are the site's calendar day. `deps` is the full route deps at runtime; its
  // narrowed type simply does not name the optional `siteTimeZone`.
  const timeZone = await resolveSiteTimeZoneSafely({ workspaceId: deps.workspaceId }, siteTimeZoneDep(deps));
  const toPreview = (post: PostRecord): StaticPostPreview => {
    const dateIso = postDisplayDateIso(post);
    return { title: post.title, href: postPublicPath({ slug: post.slug }), dateIso, dateLabel: formatPostPreviewDate({ iso: dateIso, timeZone }), featuredImage: featuredImageView({ mediaAssetMetadata, mediaTransformVersions }, post) };
  };
  const batches = new Map<number, StaticListingBatch<StaticPostPreview>>();
  for (const [key, batch] of keyed) batches.set(key, { items: batch.posts.map(toPreview), ...(batch.nextHref !== undefined ? { nextHref: batch.nextHref } : {}) });
  await storeListingJsonPage({ deps, keyed, toPreview });
  const page = paged && { items: paged.posts.map(toPreview), nav: paged.nav };
  return { previews: plain.map(toPreview), batches, ...(page ? { page } : {}) };
}

/**
 * Bug C (2026-10-22) — the requested page (`deps.listingPage`, else 1) of a page's `paged`
 * post-previews listing, sized by the first paged marker, with its rendered prev/next nav; every
 * paged marker on the page shows this one page. `undefined` when the page carries no paged marker.
 * A page past the last throws {@link ListingBatchNotFoundError}, answered as the ordinary 404.
 * @complexity One visible-count scan of the published posts (`readListingPage`).
 */
async function readPagedPostPreviews({ deps, markers, source, isVisible, pagePath }: {
  deps: Pick<TemplateRenderDeps, "listingPage">;
  markers: readonly EmbedMarker[];
  source: ListingSource<PostRecord>;
  isVisible: (post: PostRecord) => boolean;
  pagePath: string;
}): Promise<{ posts: readonly PostRecord[]; nav: string } | undefined> {
  const marker = markers.find(isPagedPostPreviewsMarker);
  if (marker === undefined) return undefined;
  const page = await readListingPage({ source, page: deps.listingPage ?? 1, pageSize: postPreviewsBatchSize(marker) }, { isVisible, pagePath });
  if (page === undefined) throw new ListingBatchNotFoundError();
  return { posts: page.items, nav: renderListingPageNav({ page }) };
}

/** The widest batch size among plain (non-see-more, non-paged) post-previews markers; `0` when every
 *  marker is a see-more or paged listing. @complexity O(m) over markers. */
function widestPlainPostPreviewsLimit(markers: readonly EmbedMarker[]): number {
  return markers.reduce((widest, marker) => (isPlainPostPreviewsMarker(marker) ? Math.max(widest, postPreviewsBatchSize(marker)) : widest), 0);
}

/** Neither a see-more listing nor a paged one: renders a slice of the shared plain batch. @complexity O(attrs). */
function isPlainPostPreviewsMarker(marker: EmbedMarker): boolean {
  return listingKeyOfAttributes({ attrs: marker.attrs }) === undefined && !isPagedPostPreviewsMarker(marker);
}

/** Reads each distinct see-more listing's batch (first marker per key wins), in marker order.
 *  @complexity One bounded batch read per distinct listing key. */
async function readKeyedPostPreviewBatches({ deps, markers, source, isVisible, pagePath }: {
  deps: Pick<TemplateRenderDeps, "listingBatch">;
  markers: readonly EmbedMarker[];
  source: ListingSource<PostRecord>;
  isVisible: (post: PostRecord) => boolean;
  pagePath: string;
}): Promise<Map<number, KeyedPostPreviewBatch>> {
  const keyed = new Map<number, KeyedPostPreviewBatch>();
  for (const marker of markers) {
    const key = listingKeyOfAttributes({ attrs: marker.attrs });
    if (key === undefined || keyed.has(key)) continue;
    const after = deps.listingBatch?.key === key ? deps.listingBatch.after : 0;
    const batch = await readListingBatch({ source, after, size: postPreviewsBatchSize(marker) }, { isVisible });
    keyed.set(key, toKeyedPostPreviewBatch({ batch, marker, key, pagePath }));
  }
  return keyed;
}

/** A read batch plus its next-batch URL (`.json` when the listing carries a card template). */
function toKeyedPostPreviewBatch({ batch, marker, key, pagePath }: {
  batch: { items: readonly PostRecord[]; hasMore: boolean; next: number };
  marker: EmbedMarker;
  key: number;
  pagePath: string;
}): KeyedPostPreviewBatch {
  if (!batch.hasMore) return { posts: batch.items, next: null };
  const format = extractListingCardTemplate({ html: marker.inner }) === undefined ? {} : { format: "json" as const };
  return { posts: batch.items, next: batch.next, nextHref: listingBatchPath({ pagePath, key, after: batch.next, ...format }) };
}

/** Clears the validation flash cookie (2026-08-31 field-wipe fix) — read-once contract: once THIS
 *  GET has read it, a later plain reload of the same page must NOT resurrect the same stale values.
 *  Attributes mirror what `forms-submit.ts`'s `setFormFlashCookie` set it with; matching them isn't
 *  required for the browser to recognize this as the same cookie (only name+Path are), but keeps the
 *  set/clear pair symmetric, same as `dev-auth.ts`'s own `setSessionCookie`/`clearSessionCookie`. */
function clearFormFlashCookie(req: Request, res: Response): void {
  res.clearCookie(FORM_FLASH_COOKIE_NAME, { httpOnly: true, path: "/", sameSite: "lax", secure: isHttpsRequest(req) });
}

/** {@link resolvePerVisitorResponse}'s two outputs: the form result to splice into the HTML (if
 *  any), and the `Cache-Control` this response must therefore send. Returned together, from the one
 *  place that knows whether ANY per-visitor state was in play, so no render branch can splice
 *  per-visitor content in and then pick the header independently — the defect this shape replaces
 *  ({@link CACHE_CONTROL_PRIVATE_FORM_RESULT} documents it). */
interface PerVisitorResponse {
  readonly result: FormSubmissionRedirectResult | undefined;
  readonly cacheControl: string;
}

/**
 * Resolves everything about this request that makes its response PER-VISITOR rather than shared:
 * the {@link FormSubmissionRedirectResult} to splice into the HTML, if any, AND the one
 * `Cache-Control` directive the response must therefore send.
 *
 * The form half: the query-string result (`decodeFormSubmissionResultFromQuery`) plus, for a
 * `"validation"` result, the same-slug flash cookie's field values (`mergeFormFlashIntoResult`) so
 * the OTHER fields the visitor already typed survive the Post/Redirect/Get round trip instead of
 * coming back wiped (2026-08-31 fix). The flash cookie is READ-ONCE: whether or not one was present,
 * it is cleared on `res` right here, in the same response that reads it.
 *
 * Resolved ONCE per request and threaded to every render branch — the same "compute once, thread to
 * every branch" shape `siteAssistantEnabled` already uses on the `/:slug` handler (ADR-054). That is
 * load-bearing for the header, not just tidy: this is the single place that knows whether ANY
 * per-visitor state was in play, so no render branch can splice per-visitor content in and then pick
 * its own directive independently. See {@link CACHE_CONTROL_PRIVATE_FORM_RESULT} for the defect that
 * split ownership produced the first time.
 *
 * Named for what it resolves, not for forms alone (was `resolveFormSubmissionResult`): the
 * member-session arm below is a second, entirely independent per-visitor trigger, and a request may
 * carry both cookies at once.
 *
 * @complexity O(1) plus the bounded cost already documented on the functions it calls.
 */
function resolvePerVisitorResponse(req: Request, res: Response): PerVisitorResponse {
  const queryResult = decodeFormSubmissionResultFromQuery(req.query);
  const flash = decodeFormFlashCookieValue({ raw: readRequestCookie({ request: req, name: FORM_FLASH_COOKIE_NAME }) });
  if (flash) clearFormFlashCookie(req, res);
  const result = mergeFormFlashIntoResult({ result: queryResult, flash });
  // Both arms matter, and neither implies the other. `result` covers a PRG landing whose body gets
  // rewritten. `flash` covers the case where the merge dropped it (no `form_*` params, or a
  // different form's slug) yet a read-once cookie was still consumed and cleared ON THIS RESPONSE —
  // storing that response would let a shared cache replay the clearing `Set-Cookie` to other
  // visitors and outlive the cookie it retired.
  if (result !== undefined || flash !== undefined) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_FORM_RESULT };
  }
  // The member arm, checked on cookie PRESENCE alone — see
  // {@link CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE}'s own doc for why not on "the filter dropped
  // something." Ordering between the two private arms is cosmetic (both resolve to the same
  // never-store literal); what matters is that `public` is reachable ONLY when NEITHER trigger
  // fired, so a request carrying both cookies can never fall back to it through either path.
  if (readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }) !== undefined) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE };
  }
  // The static-export marker changes the body (no visitor-chat widget), so it is a per-visitor
  // trigger too — see {@link isStaticExportRequest}.
  if (isStaticExportRequest(req)) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_STATIC_EXPORT };
  }
  return { result, cacheControl: CACHE_CONTROL_PUBLIC_PAGE };
}

/**
 * The one place every page/post response in this file finalizes its assembled HTML before it reaches
 * a browser — every `res...send(...)` call site below routes through this instead of composing
 * {@link markOffSiteLinksOpenInNewTab} and {@link injectFormSubmissionResultIntoHtml} by hand, so
 * both treatments are applied identically regardless of which theme tier (static/declarative/
 * templated/handlebars), or which of home/page/post/marketing/bare-page branch, produced `html`.
 *
 * Owner rule (2026-09-24): "links should open a new tab" — implemented generically here, at the
 * server's one HTML-finalization step, rather than requiring every theme or authored page to add
 * `target="_blank"` to each individual off-site link. `req.hostname` is Express's own already-parsed,
 * port-free Host value (synchronous — no additional I/O beyond what every call site already has in
 * scope), used to tell an off-site link apart from an absolute link back to this same site.
 *
 * Each form also gets this response's own `_attempt` token ({@link injectFormAttemptTokens}) so a
 * double-clicked Send stores one submission. Not under the static-export marker: an exported file is
 * served unchanged to every visitor and re-published on every export, so a token baked into it would
 * be shared and would change every exported page on every publish; those forms post without one.
 *
 * @complexity O(html length) — one pass for each of the three transforms it composes.
 */
/** The page's report-only policy names what its plugin exports declared; nothing is added otherwise. O(hosts). */
function addPluginExportHostsToResponse({ req, hosts }: { req: Request; hosts: import("#src/contracts/core/public-page-security-headers").DeclaredPageHosts | undefined }, _optional: Record<string, never> = {}): void {
  const response = req.res;
  const policy = response?.getHeader?.(REPORT_ONLY_HEADER);
  if (hosts && response && typeof policy === "string") response.setHeader(REPORT_ONLY_HEADER, addDeclaredHostsToPolicy({ policy, hosts }));
}

async function finalizePublicPageHtml({ req, html, formResult, deps }: { req: Request; html: string; formResult: FormSubmissionRedirectResult | undefined; deps: RouteDeps }, _optional = {}): Promise<string> {
  const batchBody = listingBatchBody({ req, html });
  if (batchBody !== undefined) return batchBody;
  assertListingPageServed({ req, html });
  html = injectExtraHeadIntoStaticPage({ html, extraHead: deps.pluginExportRender?.headHtml({}) });
  addPluginExportHostsToResponse({ req, hosts: deps.pluginExportRender?.declaredHosts({}) });
  html = injectListingScript({ html });
  if (deps.pluginContributions) html = await renderPluginWidgetPartials({ html, workspaceId: deps.workspaceId, contributions: deps.pluginContributions, activationRepo: deps.pluginActivationRepo });
  const finished = injectFormSubmissionResultIntoHtml({ html: markOffSiteLinksOpenInNewTab({ html, siteHost: req.hostname }), result: formResult });
  // Member sign-in needs this server's API, which an exported file never has: its header keeps the
  // theme's plain "Sign in" link.
  if (isStaticExportRequest(req)) return finished;
  return injectMemberAuthScript({ html: injectFormAttemptTokens({ html: finished, newToken: ({ slug }) => {
    const attemptToken = randomUUID();
    // The composition supplies this same process-lifetime owner to submission. Static exports
    // returned above never issue tokens; rendering observes time without claiming a submission.
    deps.formSubmissionAttempts?.issue({ workspaceId: deps.workspaceId, slug, attemptToken, issuedAtMs: deps.clock.nowMs() }, {});
    return attemptToken;
  } }, {}), workspaceId: deps.workspaceId });
}

/**
 * Content-owned homepage (SPEC-0XX) — looks up the published row currently claiming the reserved
 * `"/"` slug (`post.ts`'s `ROOT_SLUG`), the mechanism that lets `GET /` render a real, authored Page
 * instead of always falling back to the active theme's own `index.html`. Only a `kind: "page"` row
 * can ever be saved at this slug (`resolveExplicitSlug`/`validateUpdatePostInput`'s kind gate, both
 * `post.ts`), so no `kind` check is needed here — whatever this finds is one by construction.
 *
 * Mirrors {@link resolveMarketingPageOrOverride}'s own "look up by slug, swallow `PostNotFoundError`
 * locally" shape immediately above — "no page claims `/`" is the overwhelmingly common case and must
 * not reach the route's outer catch.
 *
 * A row the current visitor's member access denies is treated identically to "no page claims `/`"
 * (returns `undefined`), matching `/:slug`'s own "gated == not-found" contract
 * ({@link decidePostMemberAccess}'s call site in `registerSiteRoutes` below): the homepage falls back
 * to the themed default rather than confirming a gated page's existence to an unauthorized visitor.
 *
 * @complexity O(1) plus the one `findBySlug` lookup's own cost.
 */
async function resolveHomePageContent({ deps, memberAccessResolver, memberContext }: { deps: RouteDeps; memberAccessResolver: MemberAccessResolver; memberContext: MemberContext }, _optional = {}): Promise<PostRecord | undefined> {
  const found = await getPublishedPostBySlug({
    deps: { repo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, slug: ROOT_SLUG },
  }).catch((err) => {
    if (err instanceof PostNotFoundError) return null;
    throw err;
  });
  if (!found) return undefined;
  return decidePostMemberAccess({ resolver: memberAccessResolver, post: found.post, context: memberContext }).allowed ? found.post : undefined;
}

/** Points a listing URL's request at its page (keeping any query) so the `/` and `/:slug` handlers
 *  render it through every one of their branches unchanged (Express 4 re-matches the rewritten `req.url`). */
function rewriteToListingPage({ req, pagePath }: { req: Request; pagePath: string }, _optional: Record<string, never> = {}): void {
  const queryStart = req.url.indexOf("?");
  req.url = pagePath + (queryStart === -1 ? "" : req.url.slice(queryStart));
}

/** A batch request whose page has no such listing: restore the batch URL and fall through to the 404.
 *  A numbered page first consults its own not-found redirect rules, which the nested-path redirect
 *  fallback never saw because the rewrite had already claimed the request (A-1, 2026-10-22); a
 *  failing lookup goes to Express's error handling, as that fallback's does. */
async function listingBatchNotFound({ req, res, next, workspaceId }: {
  req: Request; res: Response; next: NextFunction; workspaceId: string;
}, _optional: Record<string, never> = {}): Promise<void> {
  const numberedPage = listingPageRequestOf({ req }) !== undefined;
  req.url = req.originalUrl;
  try {
    if (numberedPage && (await tryRedirectPhase({ phase: "post_content", path: req.path, workspaceId, res }))) return undefined;
  } catch (err) {
    return next(err);
  }
  next();
  return undefined;
}

/** Sends a finished public page: this request's `Cache-Control`, the HTML type, and the finalized
 *  body (a see-more batch request gets just its batch). */
async function sendPublicPage({ req, res, deps, html, perVisitor }: {
  req: Request; res: Response; deps: RouteDeps; html: string; perVisitor: PerVisitorResponse;
}): Promise<void> {
  // Live comments never enter browser/CDN caches; approval, selection and disable take effect on the next request.
  const cacheControl = html.includes('data-comments-surface') ? 'private, no-store' : perVisitor.cacheControl;
  res.set("Cache-Control", cacheControl).type("html").send(await finalizePublicPageHtml({ req, html, formResult: perVisitor.result, deps }));
}

/** `GET /`'s whole response (redirects, content-owned home page, the static theme's `index.html`,
 *  or the theme's home route). Errors propagate to the route's catch. */
async function serveHomePage({ req, res, deps }: { req: Request; res: Response; deps: SiteRequestDeps }): Promise<void> {
  if (await tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

  const memberAccessResolver = createMemberAccessResolver({ deps });
  const [{ posts }, activeThemeId, siteAssistantEnabled, memberContext] = await Promise.all([
    listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
    resolveRenderThemeId(res, deps),
    // ADR-054 — the visitor-chat master switch. `render.ts` never reads settings itself; every
    // route that calls `renderSite` resolves this the same way, through the shared
    // `resolveSiteAssistantWidgetForRequest` (see `pages.ts`'s other handler and
    // `products.ts`'s two handlers), which also carves out static exports (see that
    // function's own doc).
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
    resolveMemberContextForRequest({ req, deps, resolver: memberAccessResolver }),
  ]);

  // ADR-030 §4 — the home listing is gated too, not just each post's own page. See
  // `filterVisiblePosts`'s own doc for why filtering only `/:slug` would be protection that
  // looks real and isn't.
  // Newest display date first, the order every post listing uses (it was insertion order).
  const visiblePosts = filterVisiblePosts({ resolver: memberAccessResolver, posts, context: memberContext }).sort(comparePostsByDisplayDate);

  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) {
    sendNoThemesInstalled(res);
    return;
  }
  // `NO_THEME_ID` -> `null`, which every render helper below reads as "render unstyled". The
  // guard above must stay `=== null`, not `!theme`: `null` means nothing is INSTALLED (a broken
  // site, hence the 500), while the sentinel means the operator turned styling off on purpose
  // and is owed a real page. Collapsing the two would send state 3 into the 500.
  const theme = resolved === NO_THEME_ID ? null : resolved;

  // Content-owned homepage (SPEC-0XX) — a Page claiming "/" wins over the theme's own
  // index.html; renders through the SAME template-resolution path GET /:slug already uses for
  // a Page below. Falls through to exactly the pre-existing code that follows, byte-identical,
  // when no page claims it (or the current visitor's member access denies the one that does) —
  // see `resolveHomePageContent`'s own doc.
  const homePage = await resolveHomePageContent({ deps, memberAccessResolver, memberContext });
  if (homePage) {
    await serveContentHomePage({ req, res, deps, theme, homePage, visiblePosts, siteAssistantEnabled, access: { resolver: memberAccessResolver, context: memberContext } });
    return;
  }

  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, mediaTransformVersions, extraHead, staticMenus] = await Promise.all([
    resolveWidgetsForRender({ deps, theme }),
    resolveMediaTransformVersionsForRender(deps),
    buildExtraHead({ deps, route: "home", siteTitle, post: undefined }),
    resolveStaticMenusForRender({ deps, theme, currentPath: "/" }),
  ]);

  // E4 (D2, 2026-09-23) — a static theme's own `index.html` goes through the SAME
  // `finishStaticTierDocument` pipeline every other static-tier surface uses (E3), instead of
  // `renderSite`'s `renderStaticTierHomePage`, which only ever substituted `menu`/`partial`
  // markers via `renderStaticPage` directly and never ran `resolveHtmlPageEmbeds` or
  // `resolvePostPreviewsForRender` at all — a widget, post-previews, or collection marker
  // authored straight into `index.html` (or a partial it references) silently never resolved.
  // `renderStaticTierHomePage` stays in place for its one other caller
  // (`middleware/theme-page-preview.ts`'s admin preview route, which never reaches this handler).
  if (isStaticThemeWithIndex(theme)) {
    await serveStaticThemeIndex({ req, res, deps, theme, staticMenus, extraHead, siteAssistantEnabled, access: { resolver: memberAccessResolver, context: memberContext } });
    return;
  }

  const html = await renderSite({
    renderAssets: deps.documentAssets,
    theme,
    route: "home",
    siteTitle,
    timeZone: await resolveSiteTimeZoneForRender(deps),
    posts: visiblePosts,
    listing: { pagePath: "/", after: deps.listingBatch?.key === 1 ? deps.listingBatch.after : 0 },
    widgets,
    mediaTransformVersions,
    // Featured image (2026-10-05): resolves only the listed posts' featured ids for post cards.
    mediaAssetMetadata: await resolveMediaAssetMetadataForRender({ deps, post: undefined }, { listed: visiblePosts }),
    extraHead,
    siteAssistantEnabled,
    staticMenus,
  });
  // Post/Redirect/Get result for a form widget on the home page (2026-08-31 fix, generalized
  // the same day) — `forms-submit.ts` redirects back here with `?form=...&form_status=...` after
  // a JS-disabled submission; a request with none of those params is the ordinary case and this
  // is a no-op. Also reads (and clears) the validation flash cookie, if any, and decides this
  // response's `Cache-Control` — including the member-session arm, which matters here because
  // `visiblePosts` above made this body cookie-dependent. See `resolvePerVisitorResponse`'s doc.
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse(req, res) });
}

/** `GET /` when a Page claims `/`: the template branch when eligible, else the generic post page. */
async function serveContentHomePage({ req, res, deps, theme, homePage, visiblePosts, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme | null; homePage: PostRecord;
  visiblePosts: PostRecord[]; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> {
  const staticMenus = await resolveStaticMenusForRender({ deps, theme, currentPath: "/" });
  const templateHtml = await renderTemplateBranchIfEligible({ deps, theme, post: homePage, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: access });
  const html = templateHtml ?? (await renderGenericPostPage({ deps, theme, post: homePage, posts: visiblePosts, siteAssistantEnabled }));
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse(req, res) });
}

/** `GET /:slug`'s catch: a see-more miss falls through to the 404, a missing post renders the
 *  themed 404, and anything else is a reported 500. */
async function handleSlugRouteError({ err, req, res, next, deps, theme, staticMenus, slug }: {
  err: unknown; req: Request; res: Response; next: NextFunction; deps: SiteRequestDeps;
  theme: DiscoveredTheme | null; staticMenus: StaticMenuMap | undefined; slug: string;
}): Promise<void> {
  if (err instanceof ListingBatchNotFoundError) return listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId });
  // A `PostNotFoundError` is ordinary control flow on this route (no post at this slug), not a
  // fault — reporting it would bury every real fault under one line per 404 a crawler produces.
  if (err instanceof PostNotFoundError) {
    await handlePostNotFoundInSlugCatch({ req, res, deps, theme, staticMenus, slug });
    return undefined;
  }
  reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
  res.status(500).type("html").send("<h1>Site error</h1>");
  return undefined;
}

/** A static-tier theme that ships its own `index.html`. */
function isStaticThemeWithIndex(theme: DiscoveredTheme | null): theme is DiscoveredTheme & { pages: { index: string } } {
  return theme !== null && theme.manifest.tier === "static" && theme.pages.index !== undefined;
}

/** `GET /` through a static theme's own `index.html` (see the E4 note at the call site). */
async function serveStaticThemeIndex({ req, res, deps, theme, staticMenus, extraHead, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme & { pages: { index: string } };
  staticMenus: StaticMenuMap; extraHead: string; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> {
  // Preserve authored titles only when neither a workspace title nor a pending pin supplies one.
  const preserveThemeTitle = await resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true })
    .then((title) => title === undefined, () => false);
  const rendered = await finishStaticTierDocument(deps, {
    theme,
    pageId: "index",
    html: theme.pages.index,
    currentPath: "/",
    staticMenus,
    postPreviewsAccess: access,
  });
  const homeHtml = injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: rendered, extraHead }, { preserveThemeTitle }), enabled: siteAssistantEnabled });
  await sendPublicPage({ req, res, deps, html: homeHtml, perVisitor: resolvePerVisitorResponse(req, res) });
}

/**
 * Serve a page that has no row of its own (core's member sign-in pages, `member-pages.ts`) through
 * the same path an html-format Page takes, so it wears the active theme's page template, header and
 * footer on every tier. `post` lives only in memory: on the template branch its body reaches the
 * content slot through `renderViaTemplate`'s pending-body override (keyed to its id, the one the
 * admin preview uses), so no repo lookup runs for it. Errors propagate to the caller.
 */
export async function serveVirtualPage({ req, res, deps, post }: {
  req: Request; res: Response; deps: RouteDeps; post: PostRecord;
}): Promise<void> {
  deps = withListingBatch(deps, req);
  const [activeThemeId, siteAssistantEnabled] = await Promise.all([
    resolveRenderThemeId(res, deps),
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
  ]);
  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) return sendNoThemesInstalled(res);
  const theme = resolved === NO_THEME_ID ? null : resolved;
  const branch = theme ? resolveTemplateBranchChoice({ theme, post }) : { kind: "ineligible" as const };
  const perVisitor = resolvePerVisitorResponse(req, res);
  const previewPost = branch.kind === "page-shell" ? { ...post, templateChoice: branch.templateChoice } : post;
  const html = theme && branch.kind !== "ineligible"
    ? await renderViaTemplate({ deps, theme, post: previewPost, staticMenus: await resolveStaticMenusForRender({ deps, theme, currentPath: req.path }) }, { pendingBodyJson: undefined, pendingBodyHtml: post.bodyHtml ?? "", extraHead: undefined, siteAssistantEnabled })
    : await renderGenericPostPage({ deps, theme, post, posts: [], siteAssistantEnabled });
  await sendPublicPage({ req, res, deps, html, perVisitor });
  return undefined;
}

/**
 * Public site: server-rendered home and post pages through the active
 * declarative theme. Registered LAST — GET /:slug handles single-segment
 * pages; unmatched nested public paths consult redirects before the normal 404.
 */
export const registerSiteRoutes: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) => {
  // See-more batch URLs (`<page>/_more/<key>/<after>`): rewrite to the page itself so the `/` and
  // `/:slug` handlers below render it through every one of their branches unchanged (Express 4
  // re-matches the rewritten `req.url`); `finalizePublicPageHtml` then cuts out the one batch.
  app.get(/\/_more\/[^/]+\/[^/]+\/?$/, (req, _res, next) => {
    const listingBatch = parseListingBatchPath({ path: req.path });
    if (listingBatch === undefined) return next();
    recordListingBatchRequest({ req, listingBatch });
    rewriteToListingPage({ req, pagePath: listingBatch.pagePath });
    next();
    return undefined;
  });

  // Numbered listing pages (`<page>/page/<n>`, Bug C): the same rewrite to the page itself; a
  // `paged` post-previews listing then renders page `n`, and a page without one answers 404.
  app.get(/\/page\/[^/]+\/?$/, (req, _res, next) => {
    const listingPage = parseListingPagePath({ path: req.path });
    if (listingPage === undefined) return next();
    recordListingPageRequest({ req, listingPage });
    rewriteToListingPage({ req, pagePath: listingPage.pagePath });
    next();
    return undefined;
  });

  app.get("/", async (req, res, next) => {
    const deps = withListingBatch(appDeps, req);
    try {
      await serveHomePage({ req, res, deps });
    } catch (err) {
      if (err instanceof ListingBatchNotFoundError) return listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId });
      reportSiteRenderFault({ detail: "GET / failed", err });
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
    return undefined;
  });

  // Earlier content routes keep precedence, even over override rules. Restrict this fallback to
  // nested paths so single-segment slug eligibility stays unchanged; admin/API misses stay theirs.
  app.get(/^\/[^/]+\/.+/, async (req, res, next) => {
    if (checkSiteRelativeTarget({ raw: req.path }).kind !== "ok") return next();
    try {
      if (await tryRedirectPhase({ phase: "pre_content", path: req.path, workspaceId: appDeps.workspaceId, res })) return undefined;
      if (await tryRedirectPhase({ phase: "post_content", path: req.path, workspaceId: appDeps.workspaceId, res })) return undefined;
      next();
    } catch (err) {
      next(err);
    }
    return undefined;
  });

  app.get("/:slug", asyncRoute({ handler: async (req, res, next) => {
    const deps = withListingBatch(appDeps, req);
    const slug = resolveRequestedSlug(req, next);
    if (slug === undefined) return;

    let theme: DiscoveredTheme | null = null;
    let staticMenus: StaticMenuMap | undefined;
    try {
      if (await tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

      const memberAccessResolver = createMemberAccessResolver({ deps });
      const [activeThemeId, { posts }, siteAssistantEnabled, memberContext] = await Promise.all([
        resolveRenderThemeId(res, deps),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        resolveSiteAssistantWidgetForRequest({ request: req, deps }),
        resolveMemberContextForRequest({ req, deps, resolver: memberAccessResolver }),
      ]);

      // Same ADR-030 §4 listing filter the `GET /` handler applies — this list feeds the generic
      // post page's "more dispatches"/related regions, which print titles and links exactly like
      // the home grid does.
      const visiblePosts = filterVisiblePosts({ resolver: memberAccessResolver, posts, context: memberContext });

      const resolved = resolveActiveTheme({ deps, activeThemeId });
      if (resolved === null) {
        sendNoThemesInstalled(res);
        return;
      }
      // Same `=== null` vs. sentinel split as the `GET /` handler above — see its comment.
      theme = resolved === NO_THEME_ID ? null : resolved;

      // Resolved once per request (not just for the marketing-page branch below) — the requested
      // path is the correct `currentPath` for `isCurrent` regardless of whether this request ends up
      // rendering a marketing page, a post-template page, or the themed 404 below; all three share
      // this one resolve rather than re-querying the same two locations per branch.
      staticMenus = await resolveStaticMenusForRender({ deps, theme, currentPath: req.path });

      // Post/Redirect/Get result for a form widget on THIS route (2026-08-31 fix, generalized the
      // same day) — resolved once and applied uniformly across all three branches below, the same
      // "compute once, thread to every branch" shape `siteAssistantEnabled` already uses on this
      // handler (ADR-054). A request with none of the `form_*` params (the ordinary case) decodes to
      // `undefined`, and `injectFormSubmissionResultIntoHtml` is a no-op for that. Also reads (and
      // clears) the validation flash cookie, if any, and decides this response's `Cache-Control` —
      // including the member-session arm, which matters here because `visiblePosts` above made this
      // body cookie-dependent. See `resolvePerVisitorResponse`'s own doc.
      const perVisitor = resolvePerVisitorResponse(req, res);

      const marketingResolution = await resolveMarketingPageOrOverride({ deps, theme, slug, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: {
        resolver: memberAccessResolver,
        context: memberContext,
      } });
      if (marketingResolution.kind === "responded") {
        await sendPublicPage({ req, res, deps, html: marketingResolution.html, perVisitor });
        return;
      }

      const post = await resolvePostAfterMarketingCheck({ deps, slug, marketingResolution });

      // ADR-030 §4 — the single-post gate. Kept as the whole `MemberAccessDecision`, not a boolean:
      // `decision.reason` (`sign_in_required` vs `upgrade_required`) and `decision.teaser` are the
      // named seam a future teaser / sign-in-prompt render reads, and collapsing them here would
      // force that follow-up to re-derive the decision a second time. Today every `!allowed` outcome
      // renders one thing — the SAME plain 404 a slug with no post at all gets, produced by the same
      // `handlePostNotFoundOnSlugRoute` rather than a second hand-rolled 404, so a gated post is
      // indistinguishable from a nonexistent one and the response leaks no existence signal.
      //
      // Placed BEFORE `renderTemplateBranchIfEligible` deliberately: that branch is a complete second
      // render path (`renderViaTemplate` -> `renderStaticPage`) that would otherwise serve the gated
      // body straight past a gate that only guarded the generic path below.
      const decision = decidePostMemberAccess({ resolver: memberAccessResolver, post, context: memberContext });
      if (!decision.allowed) {
        await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
        return;
      }

      const templateHtml = await renderTemplateBranchIfEligible({ deps, theme, post, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: {
        resolver: memberAccessResolver,
        context: memberContext,
      } });
      const html = templateHtml ?? (await renderGenericPostPage({ deps, theme, post, posts: visiblePosts, siteAssistantEnabled }));
      await sendPublicPage({ req, res, deps, html, perVisitor });
    } catch (err) {
      await handleSlugRouteError({ err, req, res, next, deps, theme, staticMenus, slug });
    }
  } }));
};
