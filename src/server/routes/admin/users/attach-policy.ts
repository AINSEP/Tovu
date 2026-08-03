import {
  attachPolicy,
  GrantExceedsIssuerError,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
} from "#src/identity/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * POST users/:principalId/policies — `ATTACH_POLICY` (state.spec §3,
 * AC-24/AC-25). Gated by `role.manage`; target must be a `kind='user'`
 * principal; the INV-07 grant clamp must pass over every permission the
 * policy carries. See `grant-service.ts`'s `attachPolicy` for the full
 * contract.
 */
export const registerAdminUserAttachPolicyRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/users/:principalId/policies", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { attachment } = await attachPolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: String(req.params.principalId ?? ""),
          policyId: String(req.body?.policyId ?? ""),
        },
      });

      res.status(201).json({ attachment });
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

      if (err instanceof IdentityValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }

      if (err instanceof IdentityNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
