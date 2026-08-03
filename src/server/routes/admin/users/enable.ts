import {
  enablePrincipal,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
} from "@jini-ai/cms/identity";
import { toAdminUserResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * POST users/:principalId/enable — `ENABLE_PRINCIPAL` (SPEC-006 0.6.0, REQ-15) — the symmetric
 * re-activation `DISABLE_PRINCIPAL` never had a counterpart for. Gated by `user.manage`; target
 * must be `kind='user'` (EC-14). See `disable.ts`'s doc for why the paired-user lookup below is
 * defensive, not an expected runtime path.
 */
export const registerAdminUserEnableRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/users/:principalId/enable", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { principal } = await enablePrincipal({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: String(req.params.principalId ?? ""),
        },
      });

      const user = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id });
      if (!user) throw new IdentityNotFoundError(`user '${principal.id}' was not found`);
      const [roleLinks, policyLinks] = await Promise.all([
        deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
        deps.principalPolicyRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
      ]);

      res.json({
        user: toAdminUserResponse({
          principal,
          user,
          roleIds: roleLinks.map((link) => link.roleId),
          policyIds: policyLinks.map((link) => link.policyId),
        }),
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
