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
import { taxonomyMergeConfirmRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/merge-confirm";
import { taxonomyMergeExecuteRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/merge-execute";
import { taxonomyMergePlanRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/merge-plan";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { taxonomyRenameTermRoute } from "@jini-ai/cms/admin-http/routes/taxonomy/rename-term";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { confirm, execute, plan } from "#src/contracts/core/gated-mutations/gateway";
import { buildMergeTermHooks } from "#src/features/taxonomy/gated-hooks";
import type { TaxonomyRouteDeps } from "#src/server/inbound/admin-http/routes/taxonomy/deps";
import type { RouteDeps } from "#src/server/routes/types";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";
import { actorForMutation } from "../mutation-actor.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `taxonomy` server module (ADR-044 Categories & Tags).
 *
 * Owns the 9 plain taxonomy routes (list/create-taxonomy/create-term/rename-term/assign-terms/
 * unassign-terms/assigned-terms/delete-taxonomy/delete-term). The first 5 moved here from `app.ts`'s
 * `createApp()`; `delete-taxonomy`/`delete-term` were added later (guarded-delete backend-gap
 * closure; `delete-term` has since become a move to the Trash — see its spec's header). All 9 are `@jini-ai/cms` route specs
 * mounted behind the admin ports; each registrar below builds its route's small deps from
 * `TaxonomyRouteDeps`, so the wire bodies and the per-route failure copy are unchanged.
 *
 * `registerAdminTaxonomyMergeTermRoutes` (ADR-044's one gated-mutation ceremony,
 * `/terms/:id/merge/{plan,confirm,execute}`) is mounted from here too, but it is still CALLED from
 * `mount-admin-data.ts` (inline, after this module's nine routes, alongside the unrelated database
 * `migrate-forward` and recovery `restore` ceremonies that share the `core/gated-mutations` gateway
 * pattern — SPEC-016), so it takes the full gateway-bearing `TaxonomyMergeRouteDeps`, not `TaxonomyRouteDeps`.
 */
export type TaxonomyRouteRegistrar = (required: { app: Express; deps: TaxonomyRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every taxonomy mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function taxonomyPortDeps({ deps }: { deps: Pick<TaxonomyRouteDeps, "workspaceId" | "authorize"> }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
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

/** The admin surface's outward copy for a classified domain error is that error's own message. */
const outwardErrorMessage = ({ error }: { error: Error }): string => error.message;

/** The write/assignment routes authorize inside the taxonomy write service through `deps.authorize`
 *  (never the publishing-credential override), so they mount with `"direct"` authentication. */
function taxonomyWriteDeps({ deps }: { deps: TaxonomyRouteDeps }, _options: Record<string, never> = {}): TaxonomyCreateRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...taxonomyPortDeps({ deps }), clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, taxonomyRepo: deps.taxonomyRepo,
    termRepo: deps.termRepo, entryTermRepo: deps.entryTermRepo, taxonomyRevisionRepo: deps.taxonomyRevisionRepo,
    stampWatermark: deps.stampWatermark, postRepo: deps.postRepo, outwardErrorMessage,
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
  return {
    ...taxonomyWriteDeps({ deps }), entryTermRepo: deps.entryTermRepo, entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo,
    // The admin route is an authenticated owner click; an assistant acting for that same owner
    // goes through the tool channel and is stamped `agent` there, never inferred from the id.
    mutationActor: ({ principalId }) => actorForMutation({ principalId, origin: "admin" }),
  };
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

/** The merge ceremony's host bag: the taxonomy repos its hooks write through, plus the shared gateway. */
export type TaxonomyMergeRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "termRepo" | "entryTermRepo" | "taxonomyRevisionRepo" | "gatedMutations">;

/** The merge hooks one request's plan/execute run against (the gateway re-derives the plan through them). */
function mergeTermHooks(
  { deps, principalId, fromTermId, intoTermId }: { deps: TaxonomyMergeRouteDeps; principalId: string; fromTermId: string; intoTermId: string },
  _options: Record<string, never> = {},
) {
  return buildMergeTermHooks({
    workspaceId: deps.workspaceId, fromTermId, intoTermId, actorId: principalId, clock: deps.clock,
    termRepo: deps.termRepo, entryTermRepo: deps.entryTermRepo, taxonomyRevisionRepo: deps.taxonomyRevisionRepo,
  });
}

/** The three merge specs gate inside the gateway (its `ForbiddenError` answers the 403), never through the
 *  authorize port, so they mount without an `authorization` mode; the principal is read before the body
 *  is checked, as the hand-written routes did, so no `deferMissingPrincipal`. The gateway is read per
 *  request from `deps` so a reassigned `gatedMutations` is still honoured. */
export function registerAdminTaxonomyMergeTermRoutes({ app, deps }: { app: Express; deps: TaxonomyMergeRouteDeps }, _optional: Record<string, never> = {}): void {
  const portDeps = taxonomyPortDeps({ deps });
  mountAdminJsonRoute({
    app, spec: taxonomyMergePlanRoute,
    deps: {
      ...portDeps, entryTermRepo: deps.entryTermRepo,
      gatewayPlan: async ({ principalId, principalKind, fromTermId, intoTermId }) => plan({
        deps: deps.gatedMutations.gatewayDeps, principalId, principalKind,
        hooks: mergeTermHooks({ deps, principalId, fromTermId, intoTermId }) as unknown as GatedMutationHooks<unknown, unknown>,
      }),
    },
  });
  mountAdminJsonRoute({
    app, spec: taxonomyMergeConfirmRoute,
    deps: {
      ...portDeps,
      gatewayConfirm: async ({ principalId, principalKind, planId, planHash }) => {
        const hooks = buildConfirmOnlyHooks({ domain: "taxonomy.merge", readPermission: "admin.taxonomy.manage", mutatePermission: "admin.taxonomy.manage", scopeId: deps.workspaceId });
        const record = await confirm({ deps: deps.gatedMutations.gatewayDeps, principalId, principalKind, hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>, planId, planHash });
        return { token: record.confirmationToken };
      },
    },
  });
  mountAdminJsonRoute({
    app, spec: taxonomyMergeExecuteRoute,
    deps: {
      ...portDeps,
      gatewayExecute: ({ principalId, principalKind, fromTermId, intoTermId, confirmationToken }) => execute({
        deps: deps.gatedMutations.gatewayDeps, principalId, principalKind, confirmationToken,
        hooks: mergeTermHooks({ deps, principalId, fromTermId, intoTermId }) as unknown as GatedMutationHooks<unknown, { mergedCount: number }>,
      }),
    },
  });
}

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
