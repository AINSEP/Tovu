import { registerAdminTaxonomyAssignTermsRoute } from "../routes/admin/taxonomy/assign-terms";
import { registerAdminTaxonomyCreateRoute } from "../routes/admin/taxonomy/create-taxonomy";
import { registerAdminTaxonomyCreateTermRoute } from "../routes/admin/taxonomy/create-term";
import type { TaxonomyRouteDeps } from "../routes/admin/taxonomy/deps";
import { registerAdminTaxonomyListRoute } from "../routes/admin/taxonomy/list";
import { registerAdminTaxonomyRenameTermRoute } from "../routes/admin/taxonomy/rename-term";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `taxonomy` server module (ADR-044 Categories & Tags).
 *
 * Owns the 5 plain taxonomy routes (list/create-taxonomy/create-term/rename-term/assign-terms) —
 * moved here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change.
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
    },
  };
}
