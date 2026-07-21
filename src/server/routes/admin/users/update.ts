import { IdentityForbiddenError, IdentityNotFoundError, updateUser } from "../../../../identity";
import { toAdminUserResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * PATCH users/:principalId — `UPDATE_USER` (SPEC-006 0.6.0, REQ-16). Gated by `user.manage` **or**
 * `member.manage` (mirrors `CREATE_USER`'s admin-onboarding gate). `email`-only — `username` and
 * `password` fields in the body are silently ignored (AC-28), not rejected.
 */
export const registerAdminUserUpdateRoute: UsersRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/users/:principalId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);
      const principalId = String(req.params.principalId ?? "");

      const { user } = await updateUser({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId,
          email: req.body?.email !== undefined ? String(req.body.email) : undefined,
        },
      });

      const principal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
      if (!principal) throw new IdentityNotFoundError(`principal '${principalId}' was not found`);
      const [roleLinks, policyLinks] = await Promise.all([
        deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId }),
        deps.principalPolicyRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId }),
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

      if (err instanceof IdentityNotFoundError) {
        res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
