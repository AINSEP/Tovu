import type { SiteChatSelection } from "../../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import type { Request, Response } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { createPublicPostReader } from "#src/features/post/post-read";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { renderStaticPage, type StaticFeaturedImage } from "#src/features/theme/static-render";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { expandPartials } from "../../../../../../contracts/core/expand-partials.js";
import { markersOfType, MENU_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";
import { assignListingKeys } from "@jini-ai/cms/listing";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { renderHtmlPageBody } from "../../../http/site/render/page-body.js";
import { injectExtraHeadIntoStaticPage, injectSiteAssistantIntoStaticPage } from "../../../http/site/render/static-page-injection.js";
import type { TemplateRenderDeps, SiteRequestDeps, PostPreviewsAccess } from "./render-context/deps.js";
import { resolveSiteTitleForRender, htmlEmbedHostDeps } from "./render-context/site-title.js";
import { resolveStaticMenusForRender, type StaticMenuMap } from "./render-context/static-menus.js";
import { resolvePostPreviewsForRender } from "./render-context/post-previews.js";
import { resolveCollectionListsForRender } from "./render-context/collection-lists.js";
import { resolvePerVisitorResponse, sendPublicPage } from "./response.js";

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
  { deps, input }: { deps: TemplateRenderDeps; input: StaticTierDocumentInput },
  _optional: Record<string, never> = {}
): Promise<string> {
  const { theme, pageId, html, currentPath, staticMenus, postPreviewsAccess, featuredImage, postAuthor } = input;

  const assembled = await prepareStaticTierHtml({ deps, theme, html, postAuthor });
  const { menus, postPreviews, collectionLists } = await resolveStaticTierData({ deps, theme, assembled, currentPath, staticMenus, postPreviewsAccess });

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

/** What {@link finishStaticTierDocument} finishes: one static-tier page of `theme`, and who is asking. */
interface StaticTierDocumentInput {
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

/** Steps 1–2 of {@link finishStaticTierDocument}: partials expanded, embeds resolved, listing keys assigned. */
async function prepareStaticTierHtml({ deps, theme, html, postAuthor }: { deps: TemplateRenderDeps } & Pick<StaticTierDocumentInput, "theme" | "html" | "postAuthor">, _optional: Record<string, never> = {}): Promise<string> {
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
  return assignListingKeys({ html: renderHtmlPageBody({ html: expanded, resolved }, { postAuthor }) });
}

/** Steps 3–5 of {@link finishStaticTierDocument}: the menus the assembled html still names, post previews, collection lists. */
async function resolveStaticTierData({ deps, theme, assembled, currentPath, staticMenus, postPreviewsAccess }: { deps: TemplateRenderDeps; assembled: string } & Pick<StaticTierDocumentInput, "theme" | "currentPath" | "staticMenus" | "postPreviewsAccess">, _optional: Record<string, never> = {}) {
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
  return { menus, postPreviews, collectionLists };
}

/** Static pages and diagnostic templates share the theme's declared-script defaults. */
export function staticThemeScripts({ theme }: { theme: DiscoveredTheme }): readonly import('@jini-ai/cookie-consent').DeclaredScript[] {
  return theme.manifest.scripts ?? [];
}

/** A static-tier theme that ships its own `index.html`. */
export function isStaticThemeWithIndex(theme: DiscoveredTheme | null): theme is DiscoveredTheme & { pages: { index: string } } {
  return theme !== null && theme.manifest.tier === "static" && theme.pages.index !== undefined;
}

/** `GET /` through a static theme's own `index.html` (see the E4 note at the call site). */
export async function serveStaticThemeIndex({ req, res, deps, theme, staticMenus, extraHead, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme & { pages: { index: string } };
  staticMenus: StaticMenuMap; extraHead: string; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> {
  // Preserve authored titles only when neither a workspace title nor a pending pin supplies one.
  const preserveThemeTitle = await resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true })
    .then((title) => title === undefined, () => false);
  const rendered = await finishStaticTierDocument({ deps, input: {
    theme,
    pageId: "index",
    html: theme.pages.index,
    currentPath: "/",
    staticMenus,
    postPreviewsAccess: access,
  } }, {});
  const homeHtml = injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: rendered, extraHead }, { preserveThemeTitle }), enabled: siteAssistantEnabled });
  await sendPublicPage({ req, res, deps, html: homeHtml, perVisitor: resolvePerVisitorResponse(req, res) });
}
