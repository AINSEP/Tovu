import { registerAdminContentTypeListRoute } from "#src/server/inbound/admin-http/routes/content-types/list";
import { registerAdminContentTypeRegisterRoute } from "#src/server/inbound/admin-http/routes/content-types/register";
import { registerAdminContentTypeUpdateFieldsRoute } from "#src/server/inbound/admin-http/routes/content-types/update-fields";
import { registerAdminContentTypeLifecycleRoute } from "#src/server/inbound/admin-http/routes/content-types/lifecycle";
import type { ContentTypesRouteDeps } from "#src/server/inbound/admin-http/routes/content-types/deps";
import { registerAdminEntryListRoute } from "#src/server/inbound/admin-http/routes/entries/list";
import { registerAdminEntryCreateRoute } from "#src/server/inbound/admin-http/routes/entries/create";
import { registerAdminEntryUpdateRoute } from "#src/server/inbound/admin-http/routes/entries/update";
import { registerAdminEntryLifecycleRoute } from "#src/server/inbound/admin-http/routes/entries/lifecycle";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `content-types` server module (ADR-043
 * Collections backend: content-types + entries).
 *
 * NAME COLLISION WARNING (disclosed, per SPEC-042 REQ-04): `src/server/modules/content.ts`
 * already exists (SPEC-038's posts/pages/change-sets/presentation module) and is unrelated to
 * this domain. This file is deliberately named `content-types.ts`, not `content.ts`, to avoid
 * silently overwriting that file.
 *
 * Owns all 8 registrations (content-types' list/register/update-fields/lifecycle, entries' list/
 * create/update/lifecycle) — moved here verbatim from `app.ts`'s `createApp()`, same registrar
 * function bodies, no behavior change, same relative order and position.
 *
 * One combined `ContentTypesRouteDeps` type covers both sub-domains — see `routes/admin/
 * content-types/deps.ts`'s own header for why a two-type split was considered and rejected.
 */
export function createContentTypesModule(deps: ContentTypesRouteDeps): ServerModuleHandle {
  return {
    name: "content-types",
    registerRoutes: (app) => {
      registerAdminContentTypeListRoute(app, deps);
      registerAdminContentTypeRegisterRoute(app, deps);
      registerAdminContentTypeUpdateFieldsRoute(app, deps);
      registerAdminContentTypeLifecycleRoute(app, deps);
      registerAdminEntryListRoute(app, deps);
      registerAdminEntryCreateRoute(app, deps);
      registerAdminEntryUpdateRoute(app, deps);
      registerAdminEntryLifecycleRoute(app, deps);
    },
  };
}
