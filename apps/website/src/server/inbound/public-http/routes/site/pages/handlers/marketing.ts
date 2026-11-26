import { resolveMarketingPageOrOverride as resolveMarketing, resolvePostAfterMarketingCheck as resolvePost } from "@jini-ai/cms/public-http/routes/site/pages/handlers/marketing";
import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import { type PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { getPublishedPostBySlug } from "@jini-ai/cms/posts/post-read";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
import { isStandaloneThemePage } from "#src/features/theme/theme-page-eligibility";
import { type DiscoveredTheme } from "#src/features/theme/theme";
import { postPublicPath } from "#src/platform/routing/index";
import { injectSiteAssistantIntoStaticPage } from "../../../../http/site/render/site-assistant-mount.js";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveSiteTitleForRender } from "../render-context/site-title.js";
import type { StaticMenuMap } from "../render-context/static-menus.js";
import { buildExtraHead } from "../extra-head.js";
import { finishStaticTierDocument } from "../static-tier.js";

// Fixed routes for a static theme's own marketing pages (pricing/docs/blog/…), checked before
// the post lookup in `resolvePostAfterMarketingCheck` below — a static theme page is never
// expected to also be a Post row, so this must resolve before `getPublishedPostBySlug` gets a
// chance to throw `PostNotFoundError` for a slug that was never meant to be a post in the first
// place (it used to run inside the same `Promise.all` as the post lookup, so that throw
// short-circuited straight past this check).
//
// The "is this page id actually its own public URL" half is `isStandaloneThemePage` (see its own
// doc in `features/theme/theme.ts`) — shared with `@jini-ai/devops/static-export/site/route-manifest` rather than respelled
// here, which is what let this route serve `/blog-post` and `/404` as 200s while the exporter
// correctly omitted both.
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
  return resolveMarketing({ theme, slug,
    isStandaloneThemePage: ({ pageId }) => isStandaloneThemePage({ theme: theme!, pageId }),
    readPost: () => getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }),
    finishStaticTierDocument: input => finishStaticTierDocument({ deps, input: { theme: theme!, ...input, staticMenus, postPreviewsAccess } }, {}),
    postPublicPath,
    resolveSiteTitleForRender: optional => resolveSiteTitleForRender(deps, optional),
    buildExtraHead: ({ siteTitle }, optional) => buildExtraHead({ deps, route: "page", siteTitle, post: undefined }, optional),
    injectSiteAssistantIntoStaticPage: ({ html }) => injectSiteAssistantIntoStaticPage({ html, enabled: siteAssistantEnabled }),
  });
}

/** Resolves the `post` a `GET /:slug` request renders: the slug-collision winner from
 *  {@link resolveMarketingPageOrOverride} when there is one, otherwise the ordinary published-post
 *  lookup at this slug (which throws `PostNotFoundError`, caught by the route's own outer catch,
 *  when nothing exists there either). Never called with a `"responded"` resolution — that case
 *  already sent its own response and returns from the route handler before this would run. */
export async function resolvePostAfterMarketingCheck({ deps, slug, marketingResolution }: { deps: RouteDeps; slug: string; marketingResolution: Exclude<MarketingPageResolution, { kind: "responded" }> }, _optional = {}): Promise<PostRecord> {
  return resolvePost({ marketingResolution,
    readPost: () => getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }),
  });
}
