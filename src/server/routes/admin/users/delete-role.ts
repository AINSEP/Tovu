import {
  deleteRole,
  IdentityConflictError,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
} from "@jini-ai/cms/identity";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * DELETE roles/:roleId — `DELETE_ROLE` (SPEC-006 0.6.0, REQ-19/INV-09). Gated by `role.manage`; a
 * built-in target is refused `VALIDATION_ERROR`, a still-referenced target `RESOURCE_CONFLICT`
 * (AC-31).
 */
export const registerAdminRoleDeleteRoute: UsersRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/roles/:roleId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      await deleteRole({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          roleId: String(req.params.roleId ?? ""),
        },
      });

      res.status(204).send();
    } catch (err) {
      if (err instanceof IdentityForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }

      if (err instanceof IdentityConflictError) {
        res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "roleId" } });
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
