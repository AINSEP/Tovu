import { registerAdminMediaDeleteRoute } from "../routes/admin/media/delete";
import { registerAdminMediaListRoute } from "../routes/admin/media/list";
import { registerAdminMediaOriginalRoute } from "../routes/admin/media/original";
import { registerAdminMediaTrashRoute } from "../routes/admin/media/trash";
import { registerAdminMediaUpdateRoute } from "../routes/admin/media/update";
import { registerAdminMediaUploadRoute } from "../routes/admin/media/upload";
import type { MediaRouteDeps } from "../routes/admin/media/deps";
import { registerMediaRenditionRoute } from "../routes/site/media-rendition";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `media` server module.
 *
 * Owns the 6 admin media routes (list/upload/update/trash/delete/original, ADR-027 §7) plus the
 * public, unauthenticated rendition-serving route (`GET /m/:assetId/...`, ADR-027 §4 frozen URL
 * contract) that exercises the `sharp`-backed transform lifecycle (`imageTransformer.transform()`
 * via `resolveMediaRendition`) — moved here verbatim from `app.ts`'s `createApp()`, same registrar
 * function bodies, no behavior change.
 *
 * `registerAdminMediaOriginalRoute` (`routes/admin/media/original.ts`) is new: an authenticated,
 * workspace-scoped `GET .../media/:mediaId/original` that serves an asset's ORIGINAL bytes with a
 * server-sniffed `Content-Type` — distinct from, and not a replacement for, the public rendition
 * route above (which only serves named/registered TRANSFORMS, and 404s for every asset today since
 * `transform_registry` is empty in a real deployment). See that route's own file header for the
 * full security rationale (content-type sniffing, SVG/HTML defusal, Range support).
 *
 * Ordering note (disclosed): in `app.ts` the public rendition route previously registered much
 * later, alongside the store/comments/analytics/forms "must precede the site `/:slug` catch-all"
 * group (~line 724). This module registers all 7 routes together at the point the admin media
 * block used to occupy (~line 535) — earlier than before, but the ONLY real constraint on that
 * route ("must precede `/:slug`") still holds trivially, since it's now registered even earlier
 * relative to the catch-all, and its fixed `/m/` prefix never overlaps any other route class in
 * this app. See SPEC-034 for the full disclosure.
 *
 * `ServerModuleHandle` factories receive already-built ports, per the ADR-046 Phase 3 convention
 * established by `modules/forms.ts`/`modules/integrations.ts` — this module does not construct
 * `SharpImageTransformer`/`InMemoryImageTransformer` itself; the composition root
 * (`server/app.ts`/`server/deps.ts`) still selects which concrete adapter `imageTransformer` is.
 */
export function createMediaModule(deps: MediaRouteDeps): ServerModuleHandle {
  return {
    name: "media",
    registerRoutes: (app) => {
      registerAdminMediaListRoute(app, deps);
      registerAdminMediaUploadRoute(app, deps);
      registerAdminMediaUpdateRoute(app, deps);
      registerAdminMediaTrashRoute(app, deps);
      registerAdminMediaDeleteRoute(app, deps);
      registerAdminMediaOriginalRoute(app, deps);
      registerMediaRenditionRoute(app, deps);
    },
  };
}
