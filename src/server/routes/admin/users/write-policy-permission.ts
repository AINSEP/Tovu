import {
  GrantExceedsIssuerError,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  PermissionUnknownError,
  writePolicyPermission,
} from "../../../../identity";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * POST policies/:policyId/permissions — `WRITE_POLICY_PERMISSION` (SPEC-006 0.6.0, INV-07 — first
 * HTTP route for a transition specified since v0.5.3, AC-32). Gated by `role.manage`; refuses an
 * unregistered permission (`PERMISSION_UNKNOWN`), a built-in or frozen parent policy
 * (`VALIDATION_ERROR`, INV-06/AC-26), or a permission the caller does not hold unconstrained
 * (`GRANT_EXCEEDS_ISSUER`, INV-07/AC-24).
 */
export const registerAdminPolicyWritePermissionRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { policyPermission } = await writePolicyPermission({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          policyId: String(req.params.policyId ?? ""),
          permission: String(req.body?.permission ?? ""),
          resourceType: req.body?.resourceType !== undefined ? String(req.body.resourceType) : undefined,
          constraintJson: req.body?.constraintJson !== undefined ? String(req.body.constraintJson) : undefined,
        },
      });

      res.status(201).json({ policyPermission });
    } catch (err) {
      if (err instanceof IdentityForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }

      if (err instanceof GrantExceedsIssuerError) {
        res.status(403).json({
          error: err.message,
          code: "GRANT_EXCEEDS_ISSUER",
          details: { offendingPermissions: err.offendingPermissions },
        });
        return;
      }

      if (err instanceof PermissionUnknownError) {
        res.status(400).json({ error: err.message, code: "PERMISSION_UNKNOWN", details: { permission: req.body?.permission } });
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
