import type { Response } from "express";

import {
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  OwnerRequiredError,
} from "@jini-ai/cms/identity";
import { trashUser, SelfDeleteError } from "#src/features/identity/delete-user-service";
import { UserDeleteUnsupportedError } from "#src/features/identity/user-purge-types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteDeps, type UsersRouteRegistrar } from "./deps.js";

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendUserDeleteError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof SelfDeleteError) {
    res.status(409).json({ error: err.message, code: "SELF_DELETE" });
    return;
  }
  if (err instanceof OwnerRequiredError) {
    res.status(409).json({ error: err.message, code: "OWNER_REQUIRED" });
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
  if (err instanceof UserDeleteUnsupportedError) {
    res.status(501).json({ error: err.message, code: "NOT_SUPPORTED" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * DELETE users/:principalId — moves a user to the Trash (delete-user plan v2, decisions 4/5/7, and
 * the OWNER DECISION 2026-09-24 that supersedes decision 1). Gated by the caller being the owner or
 * holding the built-in `admin` role; refuses the caller's own principal (`SELF_DELETE`), the seeded
 * owner or the workspace's last active owner-`*` principal (`OWNER_REQUIRED`); a target already in
 * the Trash is an idempotent 204; 501s when the composition root has no Trash wiring
 * (`NOT_SUPPORTED`, the in-memory identity store) — see `delete-user-service.ts`'s `trashUser` for
 * the full rule set. Permanent deletion happens only through the Trash's own purge, never here.
 */
export const registerAdminUserDeleteRoute: UsersRouteRegistrar = (app, deps: UsersRouteDeps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/users/:principalId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);
      const seededOwnerPrincipalId = await deps.ownerPrincipalId;

      await trashUser({
        deps: { identity: identityServiceDepsFrom(deps), removeUser: deps.removeUser, isInTrash: deps.isInTrash },
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: String(req.params.principalId ?? ""),
          seededOwnerPrincipalId,
        },
      });

      res.status(204).send();
    } catch (err) {
      sendUserDeleteError(res, err);
    }
  });
};
