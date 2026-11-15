import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { IdentityForbiddenError, IdentityValidationError } from "@jini-ai/user-management";
import { createRole } from "@jini-ai/user-management/server";
import { toAdminRoleResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** POST roles — `CREATE_ROLE` (state.spec §3). Gated by `role.manage`; always mints `isBuiltin=false`. */
export const registerAdminRoleCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/roles", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const caller = getAuthedPrincipal(res);

      const { role } = await createRole({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          name: String(req.body?.name ?? ""),
        },
      });

      res.status(201).json({ role: toAdminRoleResponse(role) });
    } catch (err) {
      if (err instanceof IdentityForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }

      if (err instanceof IdentityValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }

      sendAdminFailure({ res, error: err }, { operation: "routes/users/create-role", code: "INTERNAL_ERROR" });
    }
  });
};
