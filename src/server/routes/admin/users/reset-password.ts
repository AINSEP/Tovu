import type { Response } from "express";

import {
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  resetUserPassword,
} from "@jini-ai/cms/identity";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendResetPasswordError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
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

/**
 * POST users/:principalId/reset-password — `RESET_USER_PASSWORD` (SPEC-006 0.6.0, REQ-17). Gated
 * by **`user.manage`** only (stricter than `UPDATE_USER`). No response body — the raw new password
 * is never echoed back (INV-05); revokes every one of the target's active sessions (AC-29).
 */
export const registerAdminUserResetPasswordRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/users/:principalId/reset-password", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const body = (req.body ?? {}) as Record<string, unknown>;
      await resetUserPassword({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: String(req.params.principalId ?? ""),
          password: String(body.password ?? ""),
        },
      });

      res.status(204).send();
    } catch (err) {
      sendResetPasswordError(res, err);
    }
  });
};
