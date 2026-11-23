import { registerAdminPostListRoute } from "#src/server/inbound/admin-http/routes/posts/list";
import { registerAdminPostCreateRoute } from "#src/server/inbound/admin-http/routes/posts/create";
import { registerAdminPostGetRoute } from "#src/server/inbound/admin-http/routes/posts/get-by-id";
import { registerAdminPostTemplatePreviewRoute } from "#src/server/inbound/admin-http/routes/posts/template-preview";
import { registerAdminPostUpdateRoute } from "#src/server/inbound/admin-http/routes/posts/update";
import { registerAdminPostDeleteRoute } from "#src/server/inbound/admin-http/routes/posts/delete";
import { registerAdminPostAutosaveRoute } from "./posts.js";
import { registerAdminPageListRoute, registerAdminPageGetRoute, registerAdminPageUpdateHtmlRoute } from "./pages.js";
import { registerAdminPageCreateRoute } from "#src/server/inbound/admin-http/routes/pages/create";
import { registerAdminPageUpdateRoute } from "#src/server/inbound/admin-http/routes/pages/update";
import { registerAdminEmailTemplateRoutes } from "./email-templates.js";
import { registerAdminPageDeleteRoute } from "#src/server/inbound/admin-http/routes/pages/delete";
import { registerAdminChangeSetListRoute, registerAdminChangeSetGetRoute, registerAdminChangeSetRevertRoute } from "./change-sets.js";
import { registerAdminPresentationGetRoute, registerAdminThemeRescanRoute } from "./presentation.js";
import { registerAdminPresentationPatchRoute } from "#src/server/inbound/admin-http/routes/presentation/patch-active-theme";
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
import type { ServerModuleHandle } from "./types.js";

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
 * - `presentationRepo`/`themes`: `presentation/get.ts`/`presentation/patch-active-theme.ts`
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

export type ContentRouteRegistrar = (required: { app: Express; deps: ContentRouteDeps }, optional?: Record<string, never>) => void;

export function createContentModule(deps: ContentRouteDeps): ServerModuleHandle {
  return {
    name: "content",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminPostListRoute({ app, deps });
      registerAdminPostCreateRoute({ app, deps });
      registerAdminPostGetRoute({ app, deps });
      registerAdminPostTemplatePreviewRoute({ app, deps });
      registerAdminPostUpdateRoute({ app, deps });
      registerAdminPostDeleteRoute({ app, deps });
      // Standing-draft autosave (2026-09-06) — kind-blind, serves both Posts and Pages (see the
      // route file's own header for why this is not duplicated under /pages/).
      registerAdminPostAutosaveRoute({ app, deps });
      registerAdminPageListRoute({ app, deps });
      registerAdminPageCreateRoute({ app, deps });
      registerAdminPageGetRoute({ app, deps });
      registerAdminPageUpdateRoute({ app, deps });
      // Registered after the metadata PUT so the more specific `/pages/:pageId/html` path is not
      // shadowed — Express matches in registration order, and `/pages/:pageId` would otherwise never
      // reach this one. (It would not today, since that route has no trailing segment, but the
      // ordering is the guarantee, not the current path shapes.)
      registerAdminPageUpdateHtmlRoute({ app, deps });
      registerAdminPageDeleteRoute({ app, deps });
      // HTML email templates: Pages storage (kind "email-template"), same HTML store and gates.
      registerAdminEmailTemplateRoutes({ app, deps });
      registerAdminChangeSetListRoute({ app, deps });
      registerAdminChangeSetGetRoute({ app, deps });
      registerAdminChangeSetRevertRoute({ app, deps });
      registerAdminPresentationGetRoute({ app, deps });
      registerAdminPresentationPatchRoute({ app, deps });
      registerAdminThemeRescanRoute({ app, deps });
      registerAdminThemesListRoute({ app, deps });
      registerAdminThemeDuplicateRoute({ app, deps });
      // Explore screen. `/themes/:themeId/file` is registered BEFORE `/themes/:themeId` would
      // shadow it — Express matches in registration order, and while `/themes/:themeId` has no
      // trailing segment today, the ordering is the guarantee rather than the current path shapes
      // (the same reasoning the pages `/html` route above is ordered by).
      registerAdminThemeFileGetRoute({ app, deps });
      registerAdminThemeFilePutRoute({ app, deps });
      registerAdminThemeFileResetRoute({ app, deps });
      registerAdminThemeFileCopyRoute({ app, deps });
      registerAdminThemeFileRenameRoute({ app, deps });
      registerAdminThemeFileDeleteRoute({ app, deps });
      registerAdminThemePagePublishRoute({ app, deps });
      registerAdminThemeSaveOriginalRoute({ app, deps });
      registerAdminThemeDetailRoute({ app, deps });
    },
  };
}
