import { registerAdminPostListRoute } from "../routes/admin/posts/list";
import { registerAdminPostCreateRoute } from "../routes/admin/posts/create";
import { registerAdminPostGetRoute } from "../routes/admin/posts/get-by-id";
import { registerAdminPostUpdateRoute } from "../routes/admin/posts/update";
import { registerAdminPageListRoute } from "../routes/admin/pages/list";
import { registerAdminPageCreateRoute } from "../routes/admin/pages/create";
import { registerAdminChangeSetListRoute } from "../routes/admin/change-sets/list";
import { registerAdminChangeSetGetRoute } from "../routes/admin/change-sets/get";
import { registerAdminChangeSetRevertRoute } from "../routes/admin/change-sets/revert";
import { registerAdminPresentationGetRoute } from "../routes/admin/presentation/get";
import { registerAdminPresentationPatchRoute } from "../routes/admin/presentation/patch-active-theme";
import type { ContentRouteDeps } from "../routes/admin/content/deps";
import type { ServerModuleHandle } from "./types";

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
 */
export function createContentModule(deps: ContentRouteDeps): ServerModuleHandle {
  return {
    name: "content",
    registerRoutes: (app) => {
      registerAdminPostListRoute(app, deps);
      registerAdminPostCreateRoute(app, deps);
      registerAdminPostGetRoute(app, deps);
      registerAdminPostUpdateRoute(app, deps);
      registerAdminPageListRoute(app, deps);
      registerAdminPageCreateRoute(app, deps);
      registerAdminChangeSetListRoute(app, deps);
      registerAdminChangeSetGetRoute(app, deps);
      registerAdminChangeSetRevertRoute(app, deps);
      registerAdminPresentationGetRoute(app, deps);
      registerAdminPresentationPatchRoute(app, deps);
    },
  };
}
