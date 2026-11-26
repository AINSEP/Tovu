import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { postListRoute } from "@jini-ai/cms/admin-http/routes/posts/list";
import { postGetRoute } from "@jini-ai/cms/admin-http/routes/posts/get-by-id";
import { getAdminPostByIdOrSlug, listAdminPosts } from "#src/features/post/index";
import { hasPostBeenPublished } from "@jini-ai/cms/posts/post-slugs";
import { PostNotFoundError } from "@jini-ai/cms/posts/post";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toAdminPostResponse } from "@jini-ai/cms/admin-http/http/posts";
import { registerAdminPostTemplatePreviewRoute, renderAuthorizedTemplatePreview } from "#src/server/inbound/admin-http/routes/posts/template-preview";
import { TemplatePreviewRenderError } from "#src/server/inbound/admin-http/routes/posts/template-preview-render";
import { projectPreviewYoutubeIds } from "@jini-ai/cms/admin-http/routes/posts/template-preview-embeds";
import { createTemplatePreviewEmbedsRoute, type PreviewEmbedsInput } from "@jini-ai/cms/admin-http/routes/posts/template-preview-embeds";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { registerAdminPostAutosaveRoute, registerAdminPostCreateRoute, registerAdminPostDeleteRoute, registerAdminPostUpdateRoute } from "./posts.js";
import {
  registerAdminPageListRoute, registerAdminPageGetRoute, registerAdminPageUpdateHtmlRoute, registerAdminPageCreateRoute, registerAdminPageUpdateRoute, registerAdminPageDeleteRoute,
} from "./pages.js";
import { registerAdminEmailTemplateRoutes } from "./email-templates.js";
import { registerAdminChangeSetListRoute, registerAdminChangeSetGetRoute, registerAdminChangeSetRevertRoute } from "./change-sets.js";
import { registerAdminPresentationGetRoute, registerAdminPresentationPatchRoute, registerAdminThemeRescanRoute } from "./presentation.js";
import { registerAdminThemesListRoute, registerAdminThemeDuplicateRoute } from "./themes.js";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileDeleteRoute,
  registerAdminThemeFileGetRoute,
  registerAdminThemeFilePutRoute,
  registerAdminThemeFileRenameRoute,
  registerAdminThemeFileResetRoute,
  registerAdminThemePagePublishRoute,
  registerAdminThemeSaveOriginalRoute,
} from "./theme-explore.js";
import type { Express } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import type { RouteRegistration, ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-038) — the `content` server module (posts/pages/change-sets/
 * presentation admin CRUD, SPEC-001/SPEC-004/SPEC-007).
 *
 * "content" here means posts/pages/change-sets/presentation specifically — NOT the ADR-043
 * Collections domain (`content-types`/`entries`), which is a separate, not-yet-pulled module (see
 * SPEC-038's Non-Goals for the explicit disclaimer). Owns the 11 registrations (4 posts, 2 pages,
 * 3 change-sets, 2 presentation) — moved here verbatim from `app.ts`'s `createApp()`, same
 * registrar function bodies, no behavior change, same relative order.
 *
 * Deliberately NOT moved: the public `registerContentPostGetRoute` (`GET /api/content/v1/.../
 * posts/:slug`, `routes/content/posts/get-by-slug.ts`) — that route is unauthenticated site-facing
 * content serving, a distinct concern from this module's admin CRUD surface (it was never one of
 * the 11 registrations this module owns), and stays inline in `app.ts` at its existing call site.
 *
 * SPEC-002 `PAGE_GET`/`PAGE_UPDATE` (api.spec.md, drift-audit gap): added `registerAdminPageGetRoute`/
 * `registerAdminPageUpdateRoute` alongside the pre-existing 2 pages registrations (list/create) —
 * now 4 pages registrations, 13 total.
 *
 * SPEC-004 `THEMES_LIST` (api.spec.md, drift-audit gap): added `registerAdminThemesListRoute` — reads
 * the same `deps.themes`/`deps.presentationRepo` the 2 presentation registrations already use, so it
 * lives in this module rather than a new one — now 14 registrations total.
 *
 * Local marketplace fixture (2026-08-10, no spec id — build-only workstream): added
 * `registerAdminMarketplaceThemesListRoute`/`registerAdminMarketplaceThemeDownloadRoute`. Same
 * `deps.themes`/`deps.themesDir` the theme-rescan/list registrations already read, and the download
 * route ends by calling the same `rescanThemes` `rescan-themes.ts` already exposes as its own route —
 * now 16 registrations total. Both removed 2026-10-04 with the dead theme marketplace (its fixture
 * was deleted in `8fb1f2fea`) — back to 14.
 *
 * Template-preview fix (2026-08-11, `ADS-memory/reports/implementation/
 * 2026-08-11-template-preview-render-bug.md`): added `registerAdminPostTemplatePreviewRoute` — reuses
 * `routes/site/pages.ts`'s exported `renderViaTemplate` (why `ContentRouteDeps` grew the four render-
 * pipeline repos, see that type's own doc), no new dependency shape of its own.
 *
 * Standing-draft autosave (2026-09-06 dispatch): added `registerAdminPostAutosaveRoute` — see that
 * route file's own header for why it is kind-blind (one mount point serves both Posts and Pages,
 * mirroring `updatePost`/`deletePost`'s existing kind-blind precedent) rather than a second
 * registration under `/pages/`. No new dependency shape: reuses `deps.postRepo`/`deps.authorize`/
 * `deps.clock`, all already read by the posts registrations above. Now 18 registrations total.
 */
/**
 * ADR-046 Phase 3 (SPEC-038) — narrow `RouteDeps` slice for the `content` server module
 * (posts/pages/change-sets/presentation — NOT the ADR-043 Collections `content-types`/`entries`
 * domain; see `modules/content.ts`'s file header for the disambiguation).
 *
 * Purpose:
 * The 11 posts/pages/change-sets/presentation registrars only ever read a fixed subset of
 * `RouteDeps` — this is a genuine narrowing (mirrors `apps/website/src/server/inbound/admin-http/routes/media/deps.ts`'s/
 * `apps/website/src/server/inbound/admin-http/routes/taxonomy/deps.ts`'s identical rationale from SPEC-034), not a widening extension.
 *
 * Each field's real reader, confirmed by reading all 11 registrar files directly rather than
 * guessing:
 * - `workspaceId`/`authorize`/`clock`/`idGen`: every one of the 11 registrars.
 * - `postRepo`: posts list/create/get/update, pages list/create, and `change-sets/revert.ts`'s
 *   `reverterDeps.postRepo` (the post-entity reverter needs the same repo).
 * - `pagesHtmlStore`: `pages/update-html.ts` only (SPEC-047/ADR-056). Deliberately NOT read by
 *   `pages/update.ts` — the bespoke-HTML body and the title/slug/status metadata are written
 *   through two different chokepoints, and that separation is the CIC-3 invariant.
 * - `changeSets`: posts create/update, pages create (the SPEC-001 command gateway's audit trail),
 *   plus `change-sets/list.ts`/`get.ts`/`revert.ts` themselves.
 * - `outbox`: posts create/update, pages create (command-gateway side-effect queue), plus
 *   `change-sets/revert.ts`'s own `revertChangeSet({ deps: { outbox, ... } })` argument (the
 *   `change-set.reverted` event, not the post reverters — those close over their own outbox at
 *   composition-root time now, see `revertRegistry` below).
 * - `bus`: `posts/update.ts`'s `processOutbox({ outbox, bus, clock })` drain call — SEO's
 *   sitemap-cache-invalidation subscriber needs the entry-lifecycle event delivered synchronously
 *   within the same request, mirroring the `/workspaces` route's identical inline drain.
 * - `revertRegistry`: `change-sets/revert.ts` reads this directly instead of building one itself.
 *   `settingsRepo` is deliberately NOT in this list any more (2026-08-13
 *   features-post-deep-import-trace.md Job 2) — it was here only for `revert.ts`'s own
 *   `reverterDeps.settingsRepo`, and that field was dead (declared, never read by either post
 *   reverter); removing it cost nothing.
 * - `presentationRepo`/`themes`: `modules/presentation.ts` (GET + PATCH)
 *   (`themes` via `validThemeIds(deps.themes)`).
 * - `themesDir`: `presentation/rescan-themes.ts` — the root to re-run discovery against. Taken from
 *   deps rather than re-derived so a composition root that overrides `TOVU_THEMES_DIR` rescans the
 *   same folder it originally discovered from, instead of silently repopulating the theme list from
 *   the default path.
 * - `packageThemesDir`: `routes/themes/explore.ts`'s detail/copy/rename/reset routes, via
 *   `resolveThemeOriginalSource` (Design C, 2026-09-16) — the package's read-only catalog fallback
 *   for a theme an already-seeded site has no catalog original of its own for. Optional; `undefined`
 *   for any composition root that predates this field, treated as "no fallback," not an error.
 * - `entryRepo`/`mediaRepo`/`transformDefinitionRepo`/`menuRepo`/`mediaContentTypeStore`
 *   (2026-08-11 template-preview fix; `mediaContentTypeStore` added 2026-08-24 for the video/embed
 *   capability): `posts/template-preview.ts` only — it renders a row through `routes/site/pages.ts`'s
 *   exported `renderViaTemplate`, the SAME real render pipeline the public site uses, so it needs
 *   that pipeline's full dependency set: `entryRepo`/`mediaRepo`/`transformDefinitionRepo` feed the
 *   recursive content-marker and widget/media embed resolution, `menuRepo` feeds
 *   `resolveStaticMenusForRender`'s theme-nav lookup, and `mediaContentTypeStore` is what lets that
 *   same resolution tell a video asset from an image one (`resolver-service.ts`'s
 *   `resolveMediaTypeEmbeds`) — without it, a template preview would render a video embed as a
 *   broken `<img>`, byte-identical to before this field existed only for previews, not the live site.
 *   A second, narrower render implementation here would be exactly the drift risk `renderViaTemplate`'s
 *   own doc says reuse avoids.
 * - `widgetBindingRepo`/`settingsRepo`/`siteTitlePreservationStore`/`workspaceRepo`/`siteDisplayName`
 *   (owner ruling 2026-09-23, bare-page S5): `posts/template-preview.ts` only, again — a bare-page
 *   (`templateChoice === ""`) preview reuses `routes/site/pages.ts`'s exported
 *   `resolveHtmlEmbedsForRender`/`resolveMediaTransformVersionsForRender`/
 *   `resolveMediaAssetMetadataForRender` (their shared `RenderContextResolutionDeps` parameter type
 *   itself requires `widgetBindingRepo`, even though none of those three functions actually reads
 *   it — TypeScript checks the declared type, not per-call field usage) and inlines the same 4-field
 *   site-title resolution `resolveSiteTitleForRender` uses, so the preview's `<title>` matches the
 *   live bare page's exactly rather than showing a placeholder. Same "this route needs the render
 *   pipeline's dependency set" reasoning as the group directly above, for the same one file.
 *
 *   NOT widened for the 2026-08-12 `.liquid` Preview-tab fix: that route
 *   (`middleware/theme-page-preview.ts`) needs `requireAdminSession`'s own identity-repo dependency
 *   set (`principalRepo`/`sessionRepo`/`roleRepo`/`passwordHasher`/`identityReady`, none of which any
 *   other route in this module touches) on top of the render-pipeline repos, which is a materially
 *   bigger and differently-shaped widening than anything else this type carries. It stays registered
 *   directly in `app.ts` against full `RouteDeps` instead — see that route's own file header.
 */
export type ContentRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "userRepo"
  | "postRepo"
  /** `posts/delete.ts` + `pages/delete.ts` — the injected, pre-bound removal these routes hand
   *  `deletePost` in place of the `postRepo.softDelete` call it used to make itself. */
  | "removePost"
  /** The other half of an undone delete: every `rollback` in this module that restores a post
   *  through `restorePostForward` must also drop the Trash index row `removePost` wrote. */
  | "forgetRemovedPost"
  | "pluginBeforeSaveHook"
  /** `posts/update.ts` + `pages/update.ts` hand it to `updatePost` (SPEC-009 slug-change redirects). */
  | "slugChangeCapture"
  | "pagesHtmlStore"
  | "changeSets"
  | "outbox"
  | "bus"
  | "revertRegistry"
  | "presentationRepo"
  | "themes"
  | "themesDir"
  | "packageThemesDir"
  | "entryRepo"
  | "mediaRepo"
  | "transformDefinitionRepo"
  | "navLocationBindingRepo"
  | "menuRepo"
  | "mediaContentTypeStore"
  // Preview uses the public route's member-access resolver for post-list embeds. Its anonymous
  // context never reads these ports, and admin authorization never grants visitor entitlements.
  | "memberSessionRepo"
  | "memberSubscriptionRepo"
  | "memberTierRepo"
  // C5 (collections plan, 2026-09-23): `renderViaTemplate` now runs `finishStaticTierDocument`,
  // whose `TemplateRenderDeps` widened with `contentTypeRepo` for `resolveCollectionListsForRender`'s
  // content-type lookup. Same "this route needs the render pipeline's full dependency set" reasoning
  // as the `entryRepo`/`mediaRepo`/… group directly above — a template preview with a `collection`
  // marker needs this too, or it would silently diverge from the live site's own resolution.
  | "contentTypeRepo"
  // Bare-page S5 (2026-09-23) — see the `widgetBindingRepo`/… group's own doc above.
  | "widgetBindingRepo"
  | "settingsRepo"
  | "siteTitlePreservationStore"
  | "workspaceRepo"
  | "siteDisplayName"
  | "tracker"
> & Partial<Pick<RouteDeps, "taxonomyRepo" | "termRepo" | "pluginExports" | "pluginExportRender"
  /** `presentation/get.ts` + `themes/preview.ts`: whether this served site captures Themes card
   *  previews (`theme-preview-host.ts`). Optional: an in-memory or test runtime has no site folder. */
  | "siteBinding">>;

export type ContentRouteRegistrar = (required: { errors: RouteErrorPorts; app: Express; deps: ContentRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every posts read mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a test's later reassignment of it is still honoured.
 *  It drops the spec's `entityType`: these two routes never named one, and forwarding it would let a
 *  resource-scoped `content.read` grant match — an authorization change for the owner, not part of a move. */
function postReadPortDeps({ deps }: { deps: ContentRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, ...params }) => deps.authorize(params) };
}

/** GET the workspace's posts (Jini spec `postListRoute`), behind `authorizeOrRespond` as before.
 *  `deps.postRepo` is read per request, so a test's later reassignment of it is still honoured. */
export const registerAdminPostListRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: postListRoute, deps: {
    ...postReadPortDeps({ deps }),
    listPostResponses: async (input) => (await listAdminPosts({ deps: { repo: deps.postRepo }, input })).posts.map(toAdminPostResponse),
  } }, { failure: { operation: "routes/posts/list", code: "INTERNAL_ERROR" } });
};

/** GET one post by id or slug (Jini spec `postGetRoute`), behind `authorizeOrRespond` as before. */
export const registerAdminPostGetRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: postGetRoute, deps: {
    ...postReadPortDeps({ deps }),
    readPost: (input) => readAdminPost({ deps, input }),
    isPostNotFound: ({ err }) => err instanceof PostNotFoundError,
    // The host passes the classified not-found message through (the spec's required outward-copy port).
    outwardErrorMessage: ({ error }) => error.message,
  } }, { failure: { operation: "routes/posts/get-by-id", code: "INTERNAL_ERROR" } });
};

/** The admin post envelope's `post` plus whether it was ever published, for the by-id read.
 *  @complexity O(1) — one id-or-slug lookup and one published-history check. */
async function readAdminPost(
  { deps, input }: { deps: ContentRouteDeps; input: { workspaceId: string; idOrSlug: string } },
  _options: Record<string, never> = {},
): Promise<{ post: object; everPublished: boolean }> {
  const { post } = await getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input });
  return { post: toAdminPostResponse(post).post, everPublished: await hasPostBeenPublished({ post }, { repo: deps.postRepo }) };
}

/** The embed inspection spec, built once: the host injects every collaborator at mount. */
const templatePreviewEmbedsRoute = createTemplatePreviewEmbedsRoute<{ youtubeIds: string[] }>({});

/** The shared draft render with the HTML preview's known outcomes as plain JSON refusals; anything
 *  else stays private and reaches the mount's failure reporter.
 *  @complexity One post lookup plus one template render. */
async function renderPreviewForEmbeds(
  { deps, input }: { deps: ContentRouteDeps; input: PreviewEmbedsInput },
  _options: Record<string, never> = {},
): Promise<{ html: string }> {
  try {
    return await renderAuthorizedTemplatePreview({ deps, ...input });
  } catch (err) {
    if (err instanceof TemplatePreviewRenderError) throw new RouteRefusalError({ status: err.status, body: { error: err.message } });
    if (err instanceof PostNotFoundError) throw new RouteRefusalError({ status: 404, body: { error: err.message } });
    throw err;
  }
}

/**
 * `POST .../posts/:postId/template-preview/embeds` (Jini spec `createTemplatePreviewEmbedsRoute`) — the
 * sibling of the HTML preview above. It sees the same authorized draft render (the shared
 * `renderAuthorizedTemplatePreview`, never a fetch of the HTML route) but answers only validated video
 * ids, so the admin frame gets its links without ever reading the sandboxed preview document.
 * `"direct"`: the spec asks the HTML handler's own type-free, id-free `content.read`, never a
 * publishing grant (the neighbouring post CRUD routes' guarded semantics would widen who may read a
 * draft). `deps.authorize` is read per request, as the HTML handler reads it.
 */
export const registerAdminPostTemplatePreviewEmbedsRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: templatePreviewEmbedsRoute, deps: {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    renderPreview: (input) => renderPreviewForEmbeds({ deps, input }),
    projectEmbeds: projectPreviewYoutubeIds,
  } }, { authorization: "direct", failure: { operation: "routes/posts/template-preview-embeds", code: "INTERNAL_ERROR" } });
};

export function createContentModule(deps: ContentRouteDeps): ServerModuleHandle<RouteRegistration> {
  return {
    name: "content",
    registerRoutes: ({ errors, app }, _options = {}) => {
      registerAdminPostListRoute({ errors, app, deps });
      registerAdminPostCreateRoute({ errors, app, deps });
      registerAdminPostGetRoute({ errors, app, deps });
      registerAdminPostTemplatePreviewRoute({ errors, app, deps });
      registerAdminPostTemplatePreviewEmbedsRoute({ errors, app, deps });
      registerAdminPostUpdateRoute({ errors, app, deps });
      registerAdminPostDeleteRoute({ errors, app, deps });
      // Standing-draft autosave (2026-09-06) — kind-blind, serves both Posts and Pages (see the
      // route file's own header for why this is not duplicated under /pages/).
      registerAdminPostAutosaveRoute({ errors, app, deps });
      registerAdminPageListRoute({ errors, app, deps });
      registerAdminPageCreateRoute({ errors, app, deps });
      registerAdminPageGetRoute({ errors, app, deps });
      registerAdminPageUpdateRoute({ errors, app, deps });
      // Registered after the metadata PUT so the more specific `/pages/:pageId/html` path is not
      // shadowed — Express matches in registration order, and `/pages/:pageId` would otherwise never
      // reach this one. (It would not today, since that route has no trailing segment, but the
      // ordering is the guarantee, not the current path shapes.)
      registerAdminPageUpdateHtmlRoute({ errors, app, deps });
      registerAdminPageDeleteRoute({ errors, app, deps });
      // HTML email templates: Pages storage (kind "email-template"), same HTML store and gates.
      registerAdminEmailTemplateRoutes({ errors, app, deps });
      registerAdminChangeSetListRoute({ errors, app, deps });
      registerAdminChangeSetGetRoute({ errors, app, deps });
      registerAdminChangeSetRevertRoute({ errors, app, deps });
      registerAdminPresentationGetRoute({ errors, app, deps });
      registerAdminPresentationPatchRoute({ errors, app, deps });
      registerAdminThemeRescanRoute({ errors, app, deps });
      registerAdminThemesListRoute({ errors, app, deps });
      registerAdminThemeDuplicateRoute({ errors, app, deps });
      // Explore screen. `/themes/:themeId/file` is registered BEFORE `/themes/:themeId` would
      // shadow it — Express matches in registration order, and while `/themes/:themeId` has no
      // trailing segment today, the ordering is the guarantee rather than the current path shapes
      // (the same reasoning the pages `/html` route above is ordered by).
      registerAdminThemeFileGetRoute({ errors, app, deps });
      registerAdminThemeFilePutRoute({ errors, app, deps });
      registerAdminThemeFileResetRoute({ errors, app, deps });
      registerAdminThemeFileCopyRoute({ errors, app, deps });
      registerAdminThemeFileRenameRoute({ errors, app, deps });
      registerAdminThemeFileDeleteRoute({ errors, app, deps });
      registerAdminThemePagePublishRoute({ errors, app, deps });
      registerAdminThemeSaveOriginalRoute({ errors, app, deps });
      registerAdminThemeDetailRoute({ errors, app, deps });
    },
  };
}
