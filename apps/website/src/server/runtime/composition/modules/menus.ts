import type { Express } from "express";

import { menuAssignLocationRoute } from "@jini-ai/cms/admin-http/routes/menus/assign-location";
import { menuCreateRoute } from "@jini-ai/cms/admin-http/routes/menus/create";
import { menuDeleteRoute } from "@jini-ai/cms/admin-http/routes/menus/delete";
import { menuGetRoute } from "@jini-ai/cms/admin-http/routes/menus/get-by-id";
import { menuListRoute } from "@jini-ai/cms/admin-http/routes/menus/list";
import { menuUpdateTreeRoute } from "@jini-ai/cms/admin-http/routes/menus/update-tree";
import { normalizeMenuHtml } from "@jini-ai/cms/navigation/node";
import { MENU_RAW_HTML_PERMISSION } from "@jini-ai/cms/navigation/site/menu-html-permission";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `menus` server module (ADR-029 navigation menus admin
 * CRUD + location assignment).
 *
 * K1 (RT-K1-adm-menus): all six routes are Jini route specs (`@jini-ai/cms/admin-http/routes/menus/*`)
 * mounted behind the admin ports. `RouteDeps` is read only here, at registration: each mount builds
 * that route's own small deps object, so a spec never sees the whole bag. The Tovu-owned policy the
 * specs need is injected here too: the raw-HTML permission, the Node HTML normalizer, the outward
 * error copy and the trash move's collaborators (`removeMenu`, `clock`).
 *
 * Owns all 6 registrations (list, get-by-id, create, update-tree, assign-location, delete), same
 * relative order as before.
 */

/** The deps the menus registrars read. `menuRepo`/`navLocationBindingRepo`/`removeMenu` already live
 *  on `RouteDeps`; the name is kept so existing fixtures and the composition root read unchanged. */
export interface MenuRouteDeps extends RouteDeps {}

/** Registrar signature for the menus routes (mirrors `RouteRegistrar`). */
export type MenuRouteRegistrar = (required: { app: Express; deps: MenuRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every menus mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function menuPortDeps({ deps }: { deps: MenuRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) and authorization of each mount,
 *  exactly as each hand-written route had them: read/update/assign never consulted the
 *  publishing-credential override (`"direct"`); create and delete did (`"guarded"`). Switching any
 *  of them is an authorization change, not a move.
 *  - `authorizationByPermission`: update-tree's raw-HTML check went through `authorizeOrRespond`
 *    (guarded) while its `admin.menus.update` check was direct — two decisions, two sources.
 *  - `deferMissingPrincipal`: only create, update-tree and assign-location refused a bad body
 *    before reading the session; the other three keep the old principal-first order. */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  optional: Pick<AdminJsonRouteMountOptions, "authorizationByPermission" | "deferMissingPrincipal"> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" }, ...optional };
}

/** The admin surface's outward copy for a classified domain error is that error's own message. The
 *  specs never put stored `error.message` text into a body themselves; this host port is where that
 *  policy lives. */
const outwardErrorMessage = ({ error }: { error: Error }): string => error.message;

/** The write services' shared collaborators plus the host's HTML policy and outward error copy. */
function menuWriteDeps({ deps }: { deps: MenuRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...menuPortDeps({ deps }), menuRepo: deps.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox,
    rawHtmlPermission: MENU_RAW_HTML_PERMISSION, normalizeMenuHtml, outwardErrorMessage,
  };
}

export const registerAdminMenuListRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuListRoute, deps: { ...menuPortDeps({ deps }), menuRepo: deps.menuRepo } }, mountOptions({ operation: "routes/menus/list", authorization: "direct" }));
};

export const registerAdminMenuGetRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuGetRoute, deps: { ...menuPortDeps({ deps }), menuRepo: deps.menuRepo } }, mountOptions({ operation: "routes/menus/get-by-id", authorization: "direct" }));
};

export const registerAdminMenuCreateRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  const options = mountOptions({ operation: "routes/menus/create", authorization: "guarded" }, { deferMissingPrincipal: true });
  mountAdminJsonRoute({ app, spec: menuCreateRoute, deps: menuWriteDeps({ deps }) }, options);
};

export const registerAdminMenuUpdateTreeRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  const options = mountOptions(
    { operation: "routes/menus/update-tree", authorization: "direct" },
    { authorizationByPermission: { [MENU_RAW_HTML_PERMISSION]: "guarded" }, deferMissingPrincipal: true },
  );
  mountAdminJsonRoute({ app, spec: menuUpdateTreeRoute, deps: menuWriteDeps({ deps }) }, options);
};

export const registerAdminMenuAssignLocationRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  const assignDeps = {
    ...menuPortDeps({ deps }), menuRepo: deps.menuRepo, navLocationBindingRepo: deps.navLocationBindingRepo,
    clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, outwardErrorMessage,
  };
  mountAdminJsonRoute({ app, spec: menuAssignLocationRoute, deps: assignDeps }, mountOptions(
    { operation: "routes/menus/assign-location", authorization: "direct" }, { deferMissingPrincipal: true },
  ));
};

/** The spec runs the trash move itself over this request's repo, `removeMenu` (the generic trash
 *  pipeline) and clock. */
export const registerAdminMenuDeleteRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  const deleteDeps = {
    ...menuPortDeps({ deps }), menuRepo: deps.menuRepo, removeMenu: deps.removeMenu, clock: deps.clock, outwardErrorMessage,
  };
  mountAdminJsonRoute({ app, spec: menuDeleteRoute, deps: deleteDeps }, mountOptions({ operation: "routes/menus/delete", authorization: "guarded" }));
};

export function createMenusModule(deps: MenuRouteDeps): ServerModuleHandle {
  return {
    name: "menus",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminMenuListRoute({ app, deps });
      registerAdminMenuGetRoute({ app, deps });
      registerAdminMenuCreateRoute({ app, deps });
      registerAdminMenuUpdateTreeRoute({ app, deps });
      registerAdminMenuAssignLocationRoute({ app, deps });
      registerAdminMenuDeleteRoute({ app, deps });
    },
  };
}
