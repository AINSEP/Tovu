import { changeSetGetRoute } from "@jini-ai/cms/admin-http/routes/change-sets/get";
import { changeSetListRoute } from "@jini-ai/cms/admin-http/routes/change-sets/list";
import { changeSetRevertRoute } from "@jini-ai/cms/admin-http/routes/change-sets/revert";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toChangeSetItemResponse } from "@jini-ai/cms/admin-http/http/change-sets";
import { toChangeSetView } from "@jini-ai/cms/change-sets/tool-registrations";
import type { ContentRouteDeps, ContentRouteRegistrar } from "./content.js";

/**
 * @file K1 (RT-K1-adm-change-sets): the `change-sets` admin routes (SPEC-001 REQ-06/07/08/10) are Jini
 * route specs (`@jini-ai/cms/admin-http/routes/change-sets/*`) mounted behind the admin ports.
 * `ContentRouteDeps` is read only here, at registration: each mount builds that route's own small
 * deps object, so a spec never sees the whole bag.
 *
 * The change-set header serializer is `features/change-sets`' model-facing view, shared with the agent
 * tool; the item serializer is Jini's (`@jini-ai/cms/admin-http/http/change-sets`). The specs receive both
 * as injected functions. All three routes asked `authorizeDirectOrRespond` (never the publishing-credential
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

const toChangeSetHeader = ({ changeSet }: { changeSet: Parameters<typeof toChangeSetView>[0]["changeSet"] }) => toChangeSetView({ changeSet });

export const registerAdminChangeSetListRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { errors, app, spec: changeSetListRoute, deps: { ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, toChangeSetHeader } },
    mountOptions("routes/change-sets/list"),
  );
};

export const registerAdminChangeSetGetRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const getDeps = {
    ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, toChangeSetHeader,
    toChangeSetItem: ({ item }: { item: Parameters<typeof toChangeSetItemResponse>[0]["item"] }) => toChangeSetItemResponse({ item }),
  };
  mountAdminJsonRoute({ errors, app, spec: changeSetGetRoute, deps: getDeps }, mountOptions("routes/change-sets/get"));
};

/** The revert registry as the route sees it: resolved from `deps` per call, as the hand-written route read
 *  `deps.revertRegistry` per request, so a test (or boot step) that swaps the registry after mounting is honoured. */
function currentRevertRegistry({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): ContentRouteDeps["revertRegistry"] {
  return {
    register: (entityType, operation, reverter) => deps.revertRegistry.register(entityType, operation, reverter),
    resolve: (entityType, operation) => deps.revertRegistry.resolve(entityType, operation),
  };
}

export const registerAdminChangeSetRevertRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const revertDeps = {
    ...changeSetPortDeps({ deps }), changeSets: deps.changeSets, revertRegistry: currentRevertRegistry({ deps }),
    clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, toChangeSetHeader,
  };
  mountAdminJsonRoute({ errors, app, spec: changeSetRevertRoute, deps: revertDeps }, mountOptions("routes/change-sets/revert"));
};
