import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { toAdminRoleResponse } from "@jini-ai/user-management/admin-http/http/users";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { UsersRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * GET roles — list a workspace's roles (built-in + custom) for the Users admin screen's role
 * picker. Gated by `role.manage` — matches `createRole`/`createPolicy`'s own gate (identity's
 * `grant-service.ts`), since no separate `role.read` permission exists in the catalog (2026-07-16
 * authz sweep: this route previously had zero permission check beyond session auth).
 */
export const registerAdminRoleListRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/roles", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond({ res, authorize: deps.authorize, params: {
          principalId: principal.id,
          permission: "role.manage",
          workspaceId: deps.workspaceId,
        } }))
      )
        return;

      const roles = await deps.roleRepo.list({ workspaceId: deps.workspaceId });
      res.json({ roles: roles.map(toAdminRoleResponse) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/users/list-roles", code: "INTERNAL_ERROR" });
    }
  });
};
