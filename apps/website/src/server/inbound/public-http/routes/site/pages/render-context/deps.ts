import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
import type { ListingBatchRequest } from "@jini-ai/cms/listing";
import type { RouteDeps } from "#src/server/routes/types";

/** The narrow dependency slice {@link contentMarkerPorts} actually needs — a `Pick` of
 * `RouteDeps` rather than the whole route-composition-root shape, so a direct unit test (guard 3's
 * termination property) can construct a minimal, real (`InMemoryPostRepo`-backed) deps object instead
 * of a full server boot's worth of repos it would never touch. `RouteDeps` remains a structural
 * supertype of this, so every real call site binds its own full `deps` through `contentMarkerPorts`. */
export type ContentMarkerResolutionDeps = Pick<
  RouteDeps,
  "workspaceId" | "postRepo" | "entryRepo" | "mediaRepo" | "transformDefinitionRepo" | "mediaContentTypeStore"
> & Partial<Pick<RouteDeps, "taxonomyRepo" | "termRepo" | "siteTimeZone" | "pluginExports" | "pluginExportRender">>;

/** The narrow dependency slice {@link renderViaTemplate} and {@link resolveStaticMenusForRender}
 * actually need — same "`Pick` of `RouteDeps`, not the whole composition-root shape" reasoning as
 * {@link ContentMarkerResolutionDeps} immediately above (a superset of it: adds `menuRepo`, for
 * {@link resolveStaticMenusForRender}'s theme-nav lookup, and `themes`, originally added for
 * `resolveActiveTheme`'s discovery-list scan before that function moved to
 * `#src/features/theme/index` 2026-08-16 — its own `ActiveThemeResolutionDeps` only needs `themes`,
 * which this type is still a structural superset of, so every call site below that passes a
 * `TemplateRenderDeps`-shaped `deps` to the now-imported `resolveActiveTheme` keeps type-checking
 * unchanged). Exported (2026-08-11 template-preview fix) so `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`
 * can call these real-pipeline functions with `ContentRouteDeps` — a `Pick` in its own right —
 * without needing the full `RouteDeps` shape neither one actually reads down to. `RouteDeps` remains
 * a structural supertype of this, so every pre-existing call site in this file keeps passing its own
 * full `deps` through unchanged. */
export type TemplateRenderDeps = Pick<
  RouteDeps,
  | "workspaceId"
  // Bug D: the site's zone for post dates (optional on `RouteDeps`, so optional here too).
  | "siteTimeZone"
  | "postRepo"
  | "entryRepo"
  | "mediaRepo"
  | "transformDefinitionRepo"
  | "menuRepo"
  | "navLocationBindingRepo"
  | "themes"
  | "mediaContentTypeStore"
  | "entryTermReadRepo"
  // C5 (collections plan, 2026-09-23) — `resolveCollectionListsForRender`'s content-type lookup for
  // a `{"type":"collection"}` marker's `typeKey`, threaded through `finishStaticTierDocument`.
  | "contentTypeRepo"
> & Partial<Pick<RouteDeps, "taxonomyRepo" | "termRepo" | "commentsProviders" | "commentsCursor" | "documentAssets" | "declaredScripts" | "pluginExports" | "pluginExportRender">> & {
  /** A see-more batch request (`<page>/_more/<key>/<after>`): that one listing renders from `after`. */
  readonly listingBatch?: ListingBatchRequest;
  /** A numbered listing page request (`<page>/page/<n>`, Bug C): `paged` post-previews render page `n`. */
  readonly listingPage?: number;
};

/**
 * The narrow dependency slice the four `resolve*ForRender` helpers below need — same "`Pick` of
 * `RouteDeps`, not the whole composition-root shape" reasoning as {@link TemplateRenderDeps}/
 * {@link ContentMarkerResolutionDeps} above (a superset of `ContentMarkerResolutionDeps`: adds
 * `widgetBindingRepo`, for {@link resolveWidgetsForRender}'s region lookup). Exported (2026-08-12,
 * `.liquid` Preview-tab fix) so `middleware/theme-page-preview.ts`'s templated-theme preview route can
 * assemble the same `SiteRenderContext` inputs the live site renders with, via `ContentRouteDeps` — a
 * `Pick` in its own right, widened by one field for this — without needing the full `RouteDeps` shape
 * none of these four functions actually read down to. `RouteDeps` remains a structural supertype of
 * this, so `registerSiteRoutes`/`registerProductRoutes`, the pre-existing callers, keep passing their
 * own full `deps` through unchanged.
 */
export type RenderContextResolutionDeps = Pick<
  RouteDeps,
  "workspaceId" | "postRepo" | "entryRepo" | "mediaRepo" | "transformDefinitionRepo" | "widgetBindingRepo" | "mediaContentTypeStore"
> & Partial<Pick<RouteDeps, "taxonomyRepo" | "termRepo" | "siteTimeZone" | "pluginExports" | "pluginExportRender">>;

/** `deps` for one public page request: the route's deps plus its see-more batch request, if any. */
export type SiteRequestDeps = RouteDeps & Pick<TemplateRenderDeps, "listingBatch" | "listingPage">;

/** Who is asking, for member-gated post-previews and template renders. */
export type PostPreviewsAccess = { resolver: MemberAccessResolver; context: MemberContext };
