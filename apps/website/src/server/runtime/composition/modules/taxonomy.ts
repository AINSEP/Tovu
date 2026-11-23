import type { Express } from "express";

import {
  taxonomyAssignedTermsRoute,
  taxonomyAssignTermsRoute,
  taxonomyUnassignTermsRoute,
  type TaxonomyAssignTermsRouteDeps,
} from "@jini-ai/cms/admin-http/routes/taxonomy/assign-terms";
import { taxonomyCreateRoute, type TaxonomyCreateRouteDeps } from "@jini-ai/cms/admin-http/routes/taxonomy/create-taxonomy";
import { taxonomyCreateTermRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/create-term";
import { taxonomyDeleteRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/delete-taxonomy";
import { taxonomyDeleteTermRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/delete-term";
import { taxonomyListRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/list";
import { taxonomyRenameTermRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/rename-term";
import type { TaxonomyRouteDeps } from "#src/server/inbound/admin-http/routes/taxonomy/deps";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `taxonomy` server module (ADR-044 Categories & Tags).
 *
 * Owns the 9 plain taxonomy routes (list/create-taxonomy/create-term/rename-term/assign-terms/
 * unassign-terms/assigned-terms/delete-taxonomy/delete-term). All 9 are `@jini-ai/cms` route specs
 * mounted behind the admin ports; each registrar below builds its route's small deps from
 * `TaxonomyRouteDeps`, so the wire bodies and the per-route failure copy are unchanged.
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

/** The write/assignment routes authorize inside the taxonomy write service through `deps.authorize`
 *  (never the publishing-credential override), so they mount with `"direct"` authentication. */
function taxonomyWriteDeps({ deps }: { deps: TaxonomyRouteDeps }, _options: Record<string, never> = {}): TaxonomyCreateRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...taxonomyPortDeps({ deps }), clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, taxonomyRepo: deps.taxonomyRepo,
    termRepo: deps.termRepo, entryTermRepo: deps.entryTermRepo, taxonomyRevisionRepo: deps.taxonomyRevisionRepo,
    stampWatermark: deps.stampWatermark, postRepo: deps.postRepo,
  };
}

export const registerAdminTaxonomyCreateRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: taxonomyCreateRoute, deps: taxonomyWriteDeps({ deps }) },
    { authorization: "direct", failure: { operation: "routes/taxonomy/create-taxonomy", code: "INTERNAL_ERROR" } },
  );
};

export const registerAdminTaxonomyCreateTermRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: taxonomyCreateTermRoute, deps: taxonomyWriteDeps({ deps }) }, { authorization: "direct" });
};

export const registerAdminTaxonomyRenameTermRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: taxonomyRenameTermRoute, deps: { ...taxonomyWriteDeps({ deps }), taxonomyRepo: deps.taxonomyRepo } },
    { authorization: "direct", failure: { operation: "routes/taxonomy/rename-term", code: "INTERNAL_ERROR" } },
  );
};

/** Assign/unassign/assigned-terms also resolve collection entries, and read and remove assignments. */
function taxonomyAssignmentDeps({ deps }: { deps: TaxonomyRouteDeps }, _options: Record<string, never> = {}): TaxonomyAssignTermsRouteDeps & AdminJsonRoutePortDeps {
  return { ...taxonomyWriteDeps({ deps }), entryTermRepo: deps.entryTermRepo, entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo };
}

export const registerAdminTaxonomyAssignTermsRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: taxonomyAssignTermsRoute, deps: taxonomyAssignmentDeps({ deps }) }, { authorization: "direct" });
};

export const registerAdminTaxonomyUnassignTermsRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: taxonomyUnassignTermsRoute, deps: taxonomyAssignmentDeps({ deps }) }, { authorization: "direct" });
};

export const registerAdminTaxonomyAssignedTermsRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: taxonomyAssignedTermsRoute, deps: taxonomyAssignmentDeps({ deps }) }, { authorization: "direct" });
};

/** Term delete went through the guarded `authorizeOrRespond`, like taxonomy delete. */
export const registerAdminTaxonomyDeleteTermRoute: TaxonomyRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: taxonomyDeleteTermRoute, deps: { ...taxonomyPortDeps({ deps }), termRepo: deps.termRepo, removeTerm: deps.removeTerm, clock: deps.clock } },
    { failure: { operation: "routes/taxonomy/delete-term", code: "INTERNAL_ERROR" } },
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
