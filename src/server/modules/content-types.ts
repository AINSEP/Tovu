import { registerAdminContentTypeListRoute } from "../routes/admin/content-types/list.js";
import { registerAdminContentTypeRegisterRoute } from "../routes/admin/content-types/register.js";
import { registerAdminContentTypeUpdateFieldsRoute } from "../routes/admin/content-types/update-fields.js";
import { registerAdminContentTypeLifecycleRoute } from "../routes/admin/content-types/lifecycle.js";
import type { ContentTypesRouteDeps } from "../routes/admin/content-types/deps.js";
import { registerAdminEntryListRoute } from "../routes/admin/entries/list.js";
import { registerAdminEntryCreateRoute } from "../routes/admin/entries/create.js";
import { registerAdminEntryUpdateRoute } from "../routes/admin/entries/update.js";
import { registerAdminEntryLifecycleRoute } from "../routes/admin/entries/lifecycle.js";
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
