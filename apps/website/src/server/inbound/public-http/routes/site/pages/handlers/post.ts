import { renderCommentsMarkers } from "#src/features/comments/public-markers";
import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
import { resolveTemplateBranchChoice, isBarePageChoice } from "#src/features/theme/static-render";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { postPublicPath } from "#src/platform/routing/index";
import { renderSite } from "../../../../http/site/render-site.js";
import { renderBareEntryDocument } from "../../../../http/site/bare-page.js";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveAssignedTermsForRender } from "../render-context/taxonomy.js";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "../render-context/site-title.js";
import { resolveWidgetsForRender, resolveHtmlEmbedsForRender } from "../render-context/widgets.js";
import type { StaticMenuMap } from "../render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "../render-context/media-metadata.js";
import { buildExtraHead } from "../extra-head.js";
import { renderViaTemplate } from "../template-render.js";

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
