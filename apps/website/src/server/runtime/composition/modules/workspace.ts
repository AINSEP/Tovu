import { workspaceDeleteRoute } from "@jini-ai/cms/admin-http/routes/workspace/delete";
import { workspaceGetRoute } from "@jini-ai/cms/admin-http/routes/workspace/get";
import { workspaceListRoute } from "@jini-ai/cms/admin-http/routes/workspace/list";
import { workspaceUpdateRoute } from "@jini-ai/cms/admin-http/routes/workspace/update";
import { registerAdminWorkspaceCreateRoute } from "#src/server/inbound/admin-http/routes/workspace/create";
import type { WorkspaceRouteDeps, WorkspaceRouteRegistrar } from "#src/server/inbound/admin-http/routes/workspace/deps";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file SPEC-044 — the `workspace` server module (list/view/rename/delete a workspace, plus the
 * hardened `CREATE_WORKSPACE`, ADR-046 §-style server module convention mirrored from
 * `modules/users.ts`).
 *
 * Owns all 5 registrations: `POST /workspaces` (moved off the original unauthenticated
 * `app.post("/workspaces", ...)` in `app.ts`), `GET /workspaces`, `GET /workspaces/:workspaceId`,
 * `PATCH /workspaces/:workspaceId`, `DELETE /workspaces/:workspaceId`. Four of them are Jini route
 * specs (`@jini-ai/cms/admin-http/routes/workspace/*`) mounted behind the admin ports; `create` is
 * still a hand-written Express route (its outbox flush has no neutral owner yet).
 */

/** The route's own deps plus the two port fields. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function workspaceSpecDeps({ deps }: { deps: Pick<WorkspaceRouteDeps, "workspaceId" | "workspaceRepo" | "authorize"> }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps & { workspaceRepo: WorkspaceRouteDeps["workspaceRepo"] } {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), workspaceRepo: deps.workspaceRepo };
}

/** The per-route `sendAdminFailure` operation the hand-written routes passed. */
const failureFor = (operation: string) => ({ failure: { operation, code: "INTERNAL_ERROR" } });

export const registerAdminWorkspaceListRoute: WorkspaceRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: workspaceListRoute, deps: workspaceSpecDeps({ deps }) }, failureFor("routes/workspace/list"));
};

export const registerAdminWorkspaceGetRoute: WorkspaceRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: workspaceGetRoute, deps: workspaceSpecDeps({ deps }) }, failureFor("routes/workspace/get"));
};

export const registerAdminWorkspaceUpdateRoute: WorkspaceRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: workspaceUpdateRoute, deps: workspaceSpecDeps({ deps }) }, failureFor("routes/workspace/update"));
};

export const registerAdminWorkspaceDeleteRoute: WorkspaceRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: workspaceDeleteRoute, deps: workspaceSpecDeps({ deps }) }, failureFor("routes/workspace/delete"));
};

export function createWorkspaceModule(deps: WorkspaceRouteDeps): ServerModuleHandle {
  return {
    name: "workspace",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminWorkspaceListRoute({ app, deps });
      registerAdminWorkspaceCreateRoute({ app, deps });
      registerAdminWorkspaceGetRoute({ app, deps });
      registerAdminWorkspaceUpdateRoute({ app, deps });
      registerAdminWorkspaceDeleteRoute({ app, deps });
    },
  };
}
