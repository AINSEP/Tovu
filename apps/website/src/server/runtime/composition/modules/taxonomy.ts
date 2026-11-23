import type { Express } from "express";

import { taxonomyDeleteRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/delete-taxonomy";
import { taxonomyListRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/list";
import {
  registerAdminTaxonomyAssignedTermsRoute,
  registerAdminTaxonomyAssignTermsRoute,
  registerAdminTaxonomyUnassignTermsRoute,
} from "#src/server/inbound/admin-http/routes/taxonomy/assign-terms";
import { registerAdminTaxonomyCreateRoute } from "#src/server/inbound/admin-http/routes/taxonomy/create-taxonomy";
import { registerAdminTaxonomyCreateTermRoute } from "#src/server/inbound/admin-http/routes/taxonomy/create-term";
import { registerAdminTaxonomyDeleteTermRoute } from "#src/server/inbound/admin-http/routes/taxonomy/delete-term";
import type { TaxonomyRouteDeps } from "#src/server/inbound/admin-http/routes/taxonomy/deps";
import { registerAdminTaxonomyRenameTermRoute } from "#src/server/inbound/admin-http/routes/taxonomy/rename-term";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `taxonomy` server module (ADR-044 Categories & Tags).
 *
 * Owns the 9 plain taxonomy routes (list/create-taxonomy/create-term/rename-term/assign-terms/
 * unassign-terms/assigned-terms/delete-taxonomy/delete-term). The first 5 moved here verbatim from `app.ts`'s `createApp()`,
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
export type TaxonomyRouteRegistrar = (required: { app: Express; deps: TaxonomyRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every taxonomy mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function taxonomyPortDeps({ deps }: { deps: TaxonomyRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The list route never consulted the publishing-credential override (`authorizeDirectOrRespond`). */
export const registerAdminTaxonomyListRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: taxonomyListRoute, deps: { ...taxonomyPortDeps({ deps }), taxonomyRepo: deps.taxonomyRepo, termRepo: deps.termRepo } },
    { authorization: "direct", failure: { operation: "routes/taxonomy/list", code: "INTERNAL_ERROR" } },
  );
};

/** Delete went through the guarded `authorizeOrRespond`, so a publishing credential still answers from its grant. */
export const registerAdminTaxonomyDeleteRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: taxonomyDeleteRoute, deps: { ...taxonomyPortDeps({ deps }), taxonomyRepo: deps.taxonomyRepo, removeTaxonomy: deps.removeTaxonomy, clock: deps.clock } },
    { failure: { operation: "routes/taxonomy/delete-taxonomy", code: "INTERNAL_ERROR" } },
  );
};

export function createTaxonomyModule(deps: TaxonomyRouteDeps): ServerModuleHandle {
  return {
    name: "taxonomy",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminTaxonomyListRoute({ app, deps });
      registerAdminTaxonomyCreateRoute({ app, deps });
      registerAdminTaxonomyCreateTermRoute({ app, deps });
      registerAdminTaxonomyRenameTermRoute({ app, deps });
      registerAdminTaxonomyAssignTermsRoute({ app, deps });
      registerAdminTaxonomyUnassignTermsRoute({ app, deps });
      registerAdminTaxonomyAssignedTermsRoute({ app, deps });
      registerAdminTaxonomyDeleteRoute({ app, deps });
      registerAdminTaxonomyDeleteTermRoute({ app, deps });
    },
  };
}
