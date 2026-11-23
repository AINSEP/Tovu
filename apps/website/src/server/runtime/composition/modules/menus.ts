import type { Express } from "express";

import { menuAssignLocationRoute } from "@jini-ai/cms/admin-http/routes/menus/assign-location";
import { menuCreateRoute } from "@jini-ai/cms/admin-http/routes/menus/create";
import { menuDeleteRoute } from "@jini-ai/cms/admin-http/routes/menus/delete";
import { menuGetRoute } from "@jini-ai/cms/admin-http/routes/menus/get-by-id";
import { menuListRoute } from "@jini-ai/cms/admin-http/routes/menus/list";
import { menuUpdateTreeRoute } from "@jini-ai/cms/admin-http/routes/menus/update-tree";
import type { MenuRepoPort, NavLocationBindingRepoPort } from "@jini-ai/cms/navigation";
import { normalizeMenuHtml } from "@jini-ai/cms/navigation/node";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `menus` server module (ADR-029 navigation menus admin
 * CRUD + location assignment).
 *
 * Owns all 6 registrations (list, get-by-id, create, update-tree, assign-location, delete) —
 * moved here verbatim from `app.ts`'s `createApp()`, same relative order. All six are Jini route
 * specs (`@jini-ai/cms/admin-http/routes/menus/*`) mounted behind the admin ports; each mount
 * builds the spec's own small deps from `MenuRouteDeps`, never passing it whole.
 */

/**
 * Deps these routes need beyond the shared `RouteDeps`: `menuRepo` (the
 * local, navigation-owned `MenuRepoPort` — see `navigation/repo.memory.ts`'s
 * file header for why it is not a frozen ADR port) and
 * `navLocationBindingRepo` (the one real ADR-029 port,
 * `NavLocationBindingRepoPort`).
 *
 * Declared here (it used to live beside the menus DTOs) rather than in `routes/types.ts` because
 * that file was a shared collision point parallel agents were editing for their own sections. It
 * is a genuine superset of `RouteDeps`, not a `Pick`-based narrowing like `TaxonomyRouteDeps`/
 * `ContentRouteDeps`.
 */
export interface MenuRouteDeps extends RouteDeps {
  menuRepo: MenuRepoPort;
  navLocationBindingRepo: NavLocationBindingRepoPort;
}

/** Registrar signature for the menus route modules (mirrors `RouteRegistrar`). */
export type MenuRouteRegistrar = (required: { app: Express; deps: MenuRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every menus mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function menuPortDeps({ deps }: { deps: MenuRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** `"guarded"` for the routes that called `authorizeOrRespond` (create, delete); `"direct"` for the
 *  ones that called `authorizeDirectOrRespond`. Update-tree's raw-HTML check used the guarded helper
 *  while its main check was direct; menus are not on the publishing-credential route allowlist
 *  (`PUBLISH_TRUST_ROUTES`), so the two answer identically here. */
const mountOptions = (operation: string, authorization: AdminRouteAuthorization) => ({ authorization, failure: { operation, code: "INTERNAL_ERROR" } });

/** The menu service's write collaborators, shared by create and update-tree. */
function menuWriteDeps({ deps }: { deps: MenuRouteDeps }, _options: Record<string, never> = {}) {
  return { menuRepo: deps.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, normalizeMenuHtml };
}

export const registerAdminMenuListRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuListRoute, deps: { ...menuPortDeps({ deps }), menuRepo: deps.menuRepo } }, mountOptions("routes/menus/list", "direct"));
};

export const registerAdminMenuGetRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuGetRoute, deps: { ...menuPortDeps({ deps }), menuRepo: deps.menuRepo } }, mountOptions("routes/menus/get-by-id", "direct"));
};

export const registerAdminMenuCreateRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuCreateRoute, deps: { ...menuPortDeps({ deps }), ...menuWriteDeps({ deps }) } }, mountOptions("routes/menus/create", "guarded"));
};

export const registerAdminMenuUpdateTreeRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuUpdateTreeRoute, deps: { ...menuPortDeps({ deps }), ...menuWriteDeps({ deps }) } }, mountOptions("routes/menus/update-tree", "direct"));
};

export const registerAdminMenuAssignLocationRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuAssignLocationRoute, deps: {
    ...menuPortDeps({ deps }), menuRepo: deps.menuRepo, navLocationBindingRepo: deps.navLocationBindingRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox,
  } }, mountOptions("routes/menus/assign-location", "direct"));
};

export const registerAdminMenuDeleteRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: menuDeleteRoute, deps: {
    ...menuPortDeps({ deps }), menuRepo: deps.menuRepo, removeMenu: deps.removeMenu, clock: deps.clock,
  } }, mountOptions("routes/menus/delete", "guarded"));
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
