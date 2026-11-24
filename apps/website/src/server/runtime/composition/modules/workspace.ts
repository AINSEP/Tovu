import { workspaceCreateRoute } from "@jini-ai/cms/admin-http/routes/workspace/create";
import { workspaceDeleteRoute } from "@jini-ai/cms/admin-http/routes/workspace/delete";
import { workspaceGetRoute } from "@jini-ai/cms/admin-http/routes/workspace/get";
import { workspaceListRoute } from "@jini-ai/cms/admin-http/routes/workspace/list";
import { workspaceUpdateRoute } from "@jini-ai/cms/admin-http/routes/workspace/update";
import { processOutbox } from "#src/contracts/core/events/outbox-worker";
import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";
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
 * All five are Jini route specs (`@jini-ai/cms/admin-http/routes/workspace/*`) mounted behind the
 * admin ports. `create`'s outbox flush stays host-owned (the outbox runtime has no neutral owner
 * yet) and reaches the spec as its injected `flushOutbox`.
 */

/**
 * `RouteDeps` narrowing for the `workspace` admin routes (SPEC-044).
 *
 * Purpose:
 * Mirrors `apps/website/src/server/inbound/admin-http/routes/users/deps.ts`'s `UsersRouteDeps` — a genuine `Pick<RouteDeps, ...>`
 * narrowing to exactly the fields the 5 workspace registrars read, so this module doesn't take a
 * dependency on the full `RouteDeps` service-locator shape (`apps/website/src/server/runtime/composition/modules/types.ts`'s own
 * `ServerModuleHandle` convention doc: "never the full RouteDeps service locator").
 * (Lives here since the workspace route specs moved to `@jini-ai/cms/admin-http/routes/workspace/*`: these
 * registrars are its only reader; the specs' own neutral deps are that package's `deps`.)
 */
export type WorkspaceRouteDeps = Pick<RouteDeps, "workspaceId" | "workspaceRepo" | "authorize" | "clock" | "idGen" | "outbox" | "bus">;

/** Registrar signature for the workspace route modules (mirrors `UsersRouteRegistrar`). */
export type WorkspaceRouteRegistrar = (required: { app: Express; deps: WorkspaceRouteDeps }, optional?: Record<string, never>) => void;

/** The route's own deps plus the two port fields. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function workspaceSpecDeps({ deps }: { deps: Pick<WorkspaceRouteDeps, "workspaceId" | "workspaceRepo" | "authorize"> }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps & { workspaceRepo: WorkspaceRouteDeps["workspaceRepo"] } {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), workspaceRepo: deps.workspaceRepo };
}

/** The per-route `sendAdminFailure` operation the hand-written routes passed. */
const failureFor = (operation: string) => ({ failure: { operation, code: "INTERNAL_ERROR" } });

/**
 * POST workspaces. The hand-written route authorized `workspace.manage` without naming an entity
 * type, so the port's `entityType` is dropped here to keep the authorizer's arguments byte-identical.
 * `flushOutbox` is the host outbox worker the hand-written route awaited before its `201`.
 */
export const registerAdminWorkspaceCreateRoute: WorkspaceRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: workspaceCreateRoute, deps: {
    workspaceId: deps.workspaceId,
    authorize: ({ entityType: _entityType, ...params }) => deps.authorize(params),
    workspaceRepo: deps.workspaceRepo,
    idGen: deps.idGen,
    clock: deps.clock,
    outbox: deps.outbox,
    flushOutbox: () => processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }),
  } }, failureFor("routes/workspace/create"));
};

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
