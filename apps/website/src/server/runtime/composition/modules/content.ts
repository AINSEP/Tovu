import { registerAdminPostListRoute } from "#src/server/inbound/admin-http/routes/posts/list";
import { registerAdminPostCreateRoute } from "#src/server/inbound/admin-http/routes/posts/create";
import { registerAdminPostGetRoute } from "#src/server/inbound/admin-http/routes/posts/get-by-id";
import { registerAdminPostTemplatePreviewRoute } from "#src/server/inbound/admin-http/routes/posts/template-preview";
import { registerAdminPostUpdateRoute } from "#src/server/inbound/admin-http/routes/posts/update";
import { registerAdminPostDeleteRoute } from "#src/server/inbound/admin-http/routes/posts/delete";
import { registerAdminPageListRoute } from "#src/server/inbound/admin-http/routes/pages/list";
import { registerAdminPageCreateRoute } from "#src/server/inbound/admin-http/routes/pages/create";
import { registerAdminPageGetRoute } from "#src/server/inbound/admin-http/routes/pages/get-by-id";
import { registerAdminPageUpdateRoute } from "#src/server/inbound/admin-http/routes/pages/update";
import { registerAdminPageUpdateHtmlRoute } from "#src/server/inbound/admin-http/routes/pages/update-html";
import { registerAdminPageDeleteRoute } from "#src/server/inbound/admin-http/routes/pages/delete";
import { registerAdminChangeSetListRoute } from "#src/server/inbound/admin-http/routes/change-sets/list";
import { registerAdminChangeSetGetRoute } from "#src/server/inbound/admin-http/routes/change-sets/get";
import { registerAdminChangeSetRevertRoute } from "#src/server/inbound/admin-http/routes/change-sets/revert";
import { registerAdminPresentationGetRoute } from "#src/server/inbound/admin-http/routes/presentation/get";
import { registerAdminPresentationPatchRoute } from "#src/server/inbound/admin-http/routes/presentation/patch-active-theme";
import { registerAdminThemeRescanRoute } from "#src/server/inbound/admin-http/routes/presentation/rescan-themes";
import { registerAdminThemesListRoute } from "#src/server/inbound/admin-http/routes/themes/list";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileGetRoute,
  registerAdminThemeFilePutRoute,
  registerAdminThemeFileRenameRoute,
  registerAdminThemeFileResetRoute,
} from "#src/server/inbound/admin-http/routes/themes/explore";
import { registerAdminMarketplaceThemesListRoute } from "#src/server/inbound/admin-http/routes/marketplace/list";
import { registerAdminMarketplaceThemeDownloadRoute } from "#src/server/inbound/admin-http/routes/marketplace/download";
import type { ContentRouteDeps } from "#src/server/inbound/admin-http/routes/content/deps";
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
 * now 16 registrations total.
 *
 * Template-preview fix (2026-08-11, `ADS-memory/reports/implementation/
 * 2026-08-11-template-preview-render-bug.md`): added `registerAdminPostTemplatePreviewRoute` — reuses
 * `routes/site/pages.ts`'s exported `renderViaTemplate` (why `ContentRouteDeps` grew the four render-
 * pipeline repos, see that type's own doc), no new dependency shape of its own.
 */
export function createContentModule(deps: ContentRouteDeps): ServerModuleHandle {
  return {
    name: "content",
    registerRoutes: (app) => {
      registerAdminPostListRoute(app, deps);
      registerAdminPostCreateRoute(app, deps);
      registerAdminPostGetRoute(app, deps);
      registerAdminPostTemplatePreviewRoute(app, deps);
      registerAdminPostUpdateRoute(app, deps);
      registerAdminPostDeleteRoute(app, deps);
      registerAdminPageListRoute(app, deps);
      registerAdminPageCreateRoute(app, deps);
      registerAdminPageGetRoute(app, deps);
      registerAdminPageUpdateRoute(app, deps);
      // Registered after the metadata PUT so the more specific `/pages/:pageId/html` path is not
      // shadowed — Express matches in registration order, and `/pages/:pageId` would otherwise never
      // reach this one. (It would not today, since that route has no trailing segment, but the
      // ordering is the guarantee, not the current path shapes.)
      registerAdminPageUpdateHtmlRoute(app, deps);
      registerAdminPageDeleteRoute(app, deps);
      registerAdminChangeSetListRoute(app, deps);
      registerAdminChangeSetGetRoute(app, deps);
      registerAdminChangeSetRevertRoute(app, deps);
      registerAdminPresentationGetRoute(app, deps);
      registerAdminPresentationPatchRoute(app, deps);
      registerAdminThemeRescanRoute(app, deps);
      registerAdminThemesListRoute(app, deps);
      registerAdminMarketplaceThemesListRoute(app, deps);
      registerAdminMarketplaceThemeDownloadRoute(app, deps);
      // Explore screen. `/themes/:themeId/file` is registered BEFORE `/themes/:themeId` would
      // shadow it — Express matches in registration order, and while `/themes/:themeId` has no
      // trailing segment today, the ordering is the guarantee rather than the current path shapes
      // (the same reasoning the pages `/html` route above is ordered by).
      registerAdminThemeFileGetRoute(app, deps);
      registerAdminThemeFilePutRoute(app, deps);
      registerAdminThemeFileResetRoute(app, deps);
      registerAdminThemeFileCopyRoute(app, deps);
      registerAdminThemeFileRenameRoute(app, deps);
      registerAdminThemeDetailRoute(app, deps);
    },
  };
}
