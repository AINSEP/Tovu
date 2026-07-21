import { IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError, updatePolicy } from "../../../../identity";
import { toAdminPolicyResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * PATCH policies/:policyId — `UPDATE_POLICY` (SPEC-006 0.6.0, REQ-18) — rename/re-describe a
 * non-built-in, non-frozen policy. Gated by `role.manage`; a built-in or frozen target is refused
 * `VALIDATION_ERROR` (INV-06/AC-26, AC-30).
 */
export const registerAdminPolicyUpdateRoute: UsersRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/policies/:policyId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { policy } = await updatePolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          policyId: String(req.params.policyId ?? ""),
          name: req.body?.name !== undefined ? String(req.body.name) : undefined,
          description: req.body?.description !== undefined ? String(req.body.description) : undefined,
        },
      });

      res.json({ policy: toAdminPolicyResponse(policy) });
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
