import {
  disablePrincipal,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  OwnerRequiredError,
} from "../../../../identity";
import { toAdminUserResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * POST users/:principalId/disable — `DISABLE_PRINCIPAL` (SPEC-006 0.6.0, REQ-11, first HTTP route
 * for a transition specified since v0.5.0). Gated by `user.manage`; refuses the seeded owner
 * unconditionally and refuses any disable that would drop the active owner-`*` count to zero
 * (INV-08) — see `identity/admin-crud-service.ts`'s `disablePrincipal` for the full contract.
 *
 * `disablePrincipal` returns only the updated `PrincipalRecord` — `toAdminUserResponse` also needs
 * the paired `UserRecord` (every `kind='user'` principal has one by construction, CREATE_USER's
 * atomicity guarantee, so the second lookup below is defensive, not an expected runtime path).
 */
export const registerAdminUserDisableRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/users/:principalId/disable", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);
      const seededOwnerPrincipalId = await deps.ownerPrincipalId;

      const { principal } = await disablePrincipal({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: String(req.params.principalId ?? ""),
          seededOwnerPrincipalId,
        },
      });

      const user = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id });
      if (!user) throw new IdentityNotFoundError(`user '${principal.id}' was not found`);
      const [roleLinks, policyLinks] = await Promise.all([
        deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
        deps.principalPolicyRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
      ]);

      res.json({
        user: toAdminUserResponse(
          principal,
          user,
          roleLinks.map((link) => link.roleId),
          policyLinks.map((link) => link.policyId)
        ),
      });
    } catch (err) {
      if (err instanceof IdentityForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
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

      res.status(500).json({ error: "internal error" });
    }
  });
};
