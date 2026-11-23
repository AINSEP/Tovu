import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import { IdentityConflictError, IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError } from "@jini-ai/user-management";
import { updateRole } from "@jini-ai/user-management/server";
import { toAdminRoleResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendRoleUpdateError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  // B227: the role service refuses a name another role already holds (plain-words message).
  if (err instanceof IdentityConflictError) {
    res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "name" } });
    return;
  }
  if (err instanceof IdentityNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  sendAdminFailure({ res, error: err }, { operation: "routes/users/update-role", code: "INTERNAL_ERROR" });
}

/**
 * PATCH roles/:roleId — `UPDATE_ROLE` (SPEC-006 0.6.0, REQ-18) — rename a non-built-in role. Gated
 * by `role.manage`; a built-in target is refused `VALIDATION_ERROR` (INV-06 extended, AC-30).
 */
export const registerAdminRoleUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/roles/:roleId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const caller = getAuthedPrincipal(res);

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { role } = await updateRole({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          roleId: String(req.params.roleId ?? ""),
          name: String(body.name ?? ""),
        },
      });

      res.json({ role: toAdminRoleResponse(role) });
    } catch (err) {
      sendRoleUpdateError({ res, err });
    }
  });
};
