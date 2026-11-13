import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `RouteDeps` narrowing for the `workspace` admin routes (SPEC-044).
 *
 * Purpose:
 * Mirrors `apps/website/src/server/inbound/admin-http/routes/users/deps.ts`'s `UsersRouteDeps` — a genuine `Pick<RouteDeps, ...>`
 * narrowing to exactly the fields the 5 workspace registrars read, so this module doesn't take a
 * dependency on the full `RouteDeps` service-locator shape (`apps/website/src/server/runtime/composition/modules/types.ts`'s own
 * `ServerModuleHandle` convention doc: "never the full RouteDeps service locator").
 */
export type WorkspaceRouteDeps = Pick<RouteDeps, "workspaceId" | "workspaceRepo" | "authorize" | "clock" | "idGen" | "outbox" | "bus">;

/** Registrar signature for the workspace route modules (mirrors `UsersRouteRegistrar`). */
export type WorkspaceRouteRegistrar = (app: Express, deps: WorkspaceRouteDeps) => void;
