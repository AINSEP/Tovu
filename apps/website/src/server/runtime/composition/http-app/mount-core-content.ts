/**
 * @file The first mounts of `createApp`: the `core` module (ops routes, login/logout/me, then the `/api/admin` session gate — in that
 * order so login is never caught by its own gate), the theme-preview refresh route (whose revision predicate `mountPublicSite` needs),
 * and the content and publish-content modules. Registration order is behaviour. Moved verbatim out of `app.ts`.
 */

import { registerThemePreviewRefresh } from "../../../inbound/public-http/middleware/theme-preview-refresh.js";
import { registerContentPostGetRoute } from "../../../inbound/public-http/routes/content/posts/get-by-slug.js";
import { createCoreModule } from "../modules/core.js";
import { createContentModule } from "../modules/content.js";
import { createPublishContentModule } from "../modules/publish-content.js";
import type { CreateAppOptions } from "../create-app-options.js";
import { mountRoutes } from "./module-handles.js";
import type { MountInput, PreviewRevisionCheck } from "./module-handles.js";

/** The core module (ops, auth, the `/api/admin` session gate), theme preview refresh, the content and publish-content modules, in registration order. */
export function mountCoreContent({ app, routeDeps }: MountInput, options: Pick<CreateAppOptions, "onAdminSignIn"> = {}): { isAuthenticatedPreviewRevision: PreviewRevisionCheck } {
  // ADR-046 Phase 3 (SPEC-039): the `core` server module — ops routes, then
  // login/logout/me (ungated), then the `/api/admin` session gate, all
  // registered together in that order so login is never caught by its own
  // gate. Real argon2id + principal/session model (ADR-021/SPEC-006) — see
  // inbound/admin-http/dev-auth.ts.
  mountRoutes(app, createCoreModule(routeDeps, { onAdminSignIn: options.onAdminSignIn }));
  const isAuthenticatedPreviewRevision = registerThemePreviewRefresh({ app, deps: routeDeps });

  // ADR-046 Phase 3 (SPEC-038): the `content` server module — 11 posts/pages/change-sets/
  // presentation admin routes. `registerContentPostGetRoute` (public site content serving) stays
  // inline immediately below — it was never one of this module's 11 registrations.
  mountRoutes(app, createContentModule(routeDeps));
  registerContentPostGetRoute({ app, deps: routeDeps });

  // Task 4 of the publish-content (Publish Content) feature (`ADS-memory/reports/
  // 2026-09-18-publish-feature-implementation-plan.md` §1.1/§4) — the export/pull route. This is
  // also where `installFirstPartyPublishContentTypes()` first gets a real caller (see
  // `publish-content-manifest.ts`'s own header and `modules/publish-content.ts`'s).
  mountRoutes(app, createPublishContentModule(routeDeps));
  return { isAuthenticatedPreviewRevision };
}
