import { registerAdminTaxonomyAssignTermsRoute } from "../routes/admin/taxonomy/assign-terms.js";
import { registerAdminTaxonomyCreateRoute } from "../routes/admin/taxonomy/create-taxonomy.js";
import { registerAdminTaxonomyCreateTermRoute } from "../routes/admin/taxonomy/create-term.js";
import { registerAdminTaxonomyDeleteRoute } from "../routes/admin/taxonomy/delete-taxonomy.js";
import { registerAdminTaxonomyDeleteTermRoute } from "../routes/admin/taxonomy/delete-term.js";
import type { TaxonomyRouteDeps } from "../routes/admin/taxonomy/deps.js";
import { registerAdminTaxonomyListRoute } from "../routes/admin/taxonomy/list.js";
import { registerAdminTaxonomyRenameTermRoute } from "../routes/admin/taxonomy/rename-term.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `taxonomy` server module (ADR-044 Categories & Tags).
 *
 * Owns the 7 plain taxonomy routes (list/create-taxonomy/create-term/rename-term/assign-terms/
 * delete-taxonomy/delete-term). The first 5 moved here verbatim from `app.ts`'s `createApp()`,
 * same registrar function bodies, no behavior change; `delete-taxonomy`/`delete-term` are new
 * (guarded-delete backend-gap closure, this dispatch — see those two route files' headers).
 *
 * Deliberately NOT moved: `registerAdminTaxonomyMergeTermRoutes` (ADR-044's one gated-mutation
 * ceremony, `/terms/:id/merge/{plan,confirm,execute}`). It stays inline in `app.ts`, registered
 * alongside the unrelated database `migrate-forward` and recovery `restore` ceremonies — all three
 * share the same `core/gated-mutations` gateway construction pattern (SPEC-016), and splitting
 * just the taxonomy third out on its own would entangle this module with that shared gateway
 * composition for no real ownership benefit. See SPEC-034 for the full disclosure.
 */
export function createTaxonomyModule(deps: TaxonomyRouteDeps): ServerModuleHandle {
  return {
    name: "taxonomy",
    registerRoutes: (app) => {
      registerAdminTaxonomyListRoute(app, deps);
      registerAdminTaxonomyCreateRoute(app, deps);
      registerAdminTaxonomyCreateTermRoute(app, deps);
      registerAdminTaxonomyRenameTermRoute(app, deps);
      registerAdminTaxonomyAssignTermsRoute(app, deps);
      registerAdminTaxonomyDeleteRoute(app, deps);
      registerAdminTaxonomyDeleteTermRoute(app, deps);
    },
  };
}
