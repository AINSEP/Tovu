import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { getPublishedPostBySlug } from "#src/features/post/post-read";
import { PostNotFoundError } from "#src/features/post/post";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
import { isStandaloneThemePage } from "#src/features/theme/theme-page-eligibility";
import { type DiscoveredTheme } from "#src/features/theme/theme";
import { postPublicPath } from "#src/platform/routing/index";
import { injectExtraHeadIntoStaticPage } from "@jini-ai/cms/presentation/html";
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
  const staticHtml = await finishStaticTierDocument({ deps, input: {
    theme,
    pageId: slug,
    html: pageHtml,
    currentPath: postPublicPath({ slug: slug }),
    staticMenus,
    postPreviewsAccess,
  } }, {});

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
