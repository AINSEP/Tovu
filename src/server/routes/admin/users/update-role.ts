import { IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError, updateRole } from "#src/identity/index";
import { toAdminRoleResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * PATCH roles/:roleId — `UPDATE_ROLE` (SPEC-006 0.6.0, REQ-18) — rename a non-built-in role. Gated
 * by `role.manage`; a built-in target is refused `VALIDATION_ERROR` (INV-06 extended, AC-30).
 */
export const registerAdminRoleUpdateRoute: UsersRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/roles/:roleId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { role } = await updateRole({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          roleId: String(req.params.roleId ?? ""),
          name: String(req.body?.name ?? ""),
        },
      });

      res.json({ role: toAdminRoleResponse(role) });
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

      if (err instanceof IdentityNotFoundError) {
        res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
