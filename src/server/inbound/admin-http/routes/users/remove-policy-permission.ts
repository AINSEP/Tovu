import type { Response } from "express";

import {
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  removePolicyPermission,
} from "@jini-ai/cms/identity";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";

/** Maps this route's thrown error types onto the admin error envelope — the same mapping
 *  `delete-policy.ts` uses, minus `IdentityConflictError`: `removePolicyPermission` has no
 *  reference guard to violate (a permission row is a leaf, nothing points at it).
 *  @complexity O(1). */
function sendRemovePolicyPermissionError(res: Response, err: unknown): void {
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

/**
 * DELETE policies/:policyId/permissions/:policyPermissionId — `REMOVE_POLICY_PERMISSION` (OQ-10),
 * the inverse of `write-policy-permission.ts` and the route that closes the gap `Roles.tsx`'s own
 * header comment flagged: until now a policy's permission set was append-only, and the only way to
 * shrink it was `DELETE_POLICY` + recreate — which INV-09 refuses outright the moment any role or
 * principal references the policy.
 *
 * Gated by `role.manage`, exactly as the ADD route is. A built-in or frozen parent policy is
 * refused `VALIDATION_ERROR` (INV-06/AC-26); a permission id that is absent — or that belongs to a
 * different policy — is `RESOURCE_NOT_FOUND`, never a silent no-op success (the service proves
 * membership from the policy's own rows before deleting).
 *
 * Returns 204, matching `delete-policy.ts`'s convention for a delete with nothing to echo back.
 */
export const registerAdminPolicyPermissionRemoveRoute: UsersRouteRegistrar = (app, deps) => {
  app.delete(
    "/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions/:policyPermissionId",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      try {
        const caller = getAuthedPrincipal(res);

        await removePolicyPermission({
          deps: identityServiceDepsFrom(deps),
          input: {
            workspaceId: deps.workspaceId,
            callerPrincipalId: caller.id,
            policyId: String(req.params.policyId ?? ""),
            policyPermissionId: String(req.params.policyPermissionId ?? ""),
          },
        });

        res.status(204).send();
      } catch (err) {
        sendRemovePolicyPermissionError(res, err);
      }
    }
  );
};
