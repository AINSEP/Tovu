import { changeSetGetRoute } from "@jini-ai/cms/admin-http/routes/change-sets/get";
import { changeSetListRoute } from "@jini-ai/cms/admin-http/routes/change-sets/list";
import { changeSetRevertRoute } from "@jini-ai/cms/admin-http/routes/change-sets/revert";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toChangeSetHeaderResponse, toChangeSetItemResponse } from "#src/server/inbound/admin-http/http/change-sets";
import type { ContentRouteDeps, ContentRouteRegistrar } from "./content.js";

/**
 * @file K1 (RT-K1-adm-change-sets): the `change-sets` admin routes (SPEC-001 REQ-06/07/08/10) are Jini
 * route specs (`@jini-ai/cms/admin-http/routes/change-sets/*`) mounted behind the admin ports.
 * `ContentRouteDeps` is read only here, at registration: each mount builds that route's own small
 * deps object, so a spec never sees the whole bag.
 *
 * The change-set response serializers stay in Tovu (`http/change-sets.ts`): the header one delegates to
 * `features/change-sets`' model-facing view, shared with the agent tool, so the specs receive them as
 * injected functions. All three routes asked `authorizeDirectOrRespond` (never the publishing-credential
 * override), so all three mount `"direct"`; switching one is an authorization change, not a move.
 *
 * Owns all 3 registrations (list, get, revert), same relative order as before.
 */

/** The two port fields every change-sets mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function changeSetPortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) each route used; it picks the user-facing 500 text. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

const toChangeSetHeader = ({ changeSet }: { changeSet: Parameters<typeof toChangeSetHeaderResponse>[0] }) => toChangeSetHeaderResponse(changeSet);

export const registerAdminChangeSetListRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: changeSetListRoute, deps: { ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, toChangeSetHeader } },
    mountOptions("routes/change-sets/list"),
  );
};

export const registerAdminChangeSetGetRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const getDeps = {
    ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, toChangeSetHeader,
    toChangeSetItem: ({ item }: { item: Parameters<typeof toChangeSetItemResponse>[0] }) => toChangeSetItemResponse(item),
  };
  mountAdminJsonRoute({ app, spec: changeSetGetRoute, deps: getDeps }, mountOptions("routes/change-sets/get"));
};

/** The revert registry as the route sees it: resolved from `deps` per call, as the hand-written route read
 *  `deps.revertRegistry` per request, so a test (or boot step) that swaps the registry after mounting is honoured. */
function currentRevertRegistry({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): ContentRouteDeps["revertRegistry"] {
  return {
    register: (entityType, operation, reverter) => deps.revertRegistry.register(entityType, operation, reverter),
    resolve: (entityType, operation) => deps.revertRegistry.resolve(entityType, operation),
  };
}

export const registerAdminChangeSetRevertRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const revertDeps = {
    ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, revertRegistry: currentRevertRegistry({ deps }),
    clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, toChangeSetHeader,
  };
  mountAdminJsonRoute({ app, spec: changeSetRevertRoute, deps: revertDeps }, mountOptions("routes/change-sets/revert"));
};
