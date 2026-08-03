import {
  createPolicy,
  IdentityForbiddenError,
  IdentityValidationError,
} from "@jini-ai/cms/identity";
import { toAdminPolicyResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

/**
 * POST policies — `CREATE_POLICY` (state.spec §3). Gated by `role.manage`;
 * always mints `isBuiltin=false` and `isFrozen=false`.
 */
export const registerAdminPolicyCreateRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { policy } = await createPolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          name: String(req.body?.name ?? ""),
          description: req.body?.description !== undefined ? String(req.body.description) : undefined,
        },
      });

      res.status(201).json({ policy: toAdminPolicyResponse(policy) });
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

      res.status(500).json({ error: "internal error" });
    }
  });
};
