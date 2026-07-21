import { registerAdminWorkspaceCreateRoute } from "../routes/admin/workspace/create";
import { registerAdminWorkspaceDeleteRoute } from "../routes/admin/workspace/delete";
import type { WorkspaceRouteDeps } from "../routes/admin/workspace/deps";
import { registerAdminWorkspaceGetRoute } from "../routes/admin/workspace/get";
import { registerAdminWorkspaceListRoute } from "../routes/admin/workspace/list";
import { registerAdminWorkspaceUpdateRoute } from "../routes/admin/workspace/update";
import type { ServerModuleHandle } from "./types";

/**
 * @file SPEC-044 — the `workspace` server module (list/view/rename/delete a workspace, plus the
 * hardened `CREATE_WORKSPACE`, ADR-046 §-style server module convention mirrored from
 * `modules/users.ts`).
 *
 * Owns all 5 registrations: `POST /workspaces` (moved off the original unauthenticated
 * `app.post("/workspaces", ...)` in `app.ts`), `GET /workspaces`, `GET /workspaces/:workspaceId`,
 * `PATCH /workspaces/:workspaceId`, `DELETE /workspaces/:workspaceId`.
 */
export function createWorkspaceModule(deps: WorkspaceRouteDeps): ServerModuleHandle {
  return {
    name: "workspace",
    registerRoutes: (app) => {
      registerAdminWorkspaceListRoute(app, deps);
      registerAdminWorkspaceCreateRoute(app, deps);
      registerAdminWorkspaceGetRoute(app, deps);
      registerAdminWorkspaceUpdateRoute(app, deps);
      registerAdminWorkspaceDeleteRoute(app, deps);
    },
  };
}
