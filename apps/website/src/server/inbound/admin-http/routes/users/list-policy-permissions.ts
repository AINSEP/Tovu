import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { UsersRouteRegistrar } from "./deps.js";

/**
 * GET policies/:policyId/permissions — the permission rows written onto one policy (OQ-10).
 *
 * Nothing exposed these before: `toAdminPolicyResponse` carries `id`/`name`/`description`/
 * `isBuiltin`/`isFrozen` and no permissions field, so the admin could POST a permission onto a
 * policy but never see what a policy already held. That made `remove-policy-permission.ts`
 * unusable on its own — a removal route needs an id, and this is the only route that yields one.
 *
 * Gated by `role.manage`, the same permission `list-policies.ts` requires (a policy's permission
 * set is exactly as sensitive as the policy list itself), and checked with the same inline
 * `deps.authorize` shape that file uses rather than the service-layer helper — this is a read, so
 * there is no identity transition to call.
 */
export const registerAdminPolicyPermissionListRoute: UsersRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "role.manage",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const policyId = String(req.params.policyId ?? "");
      const policy = await deps.policyRepo.findById({ workspaceId: deps.workspaceId, id: policyId });
      if (!policy) {
        res.status(404).json({ error: `policy '${policyId}' was not found`, code: "RESOURCE_NOT_FOUND" });
        return;
      }

      const policyPermissions = await deps.policyPermissionRepo.listByPolicyId({
        workspaceId: deps.workspaceId,
        policyId,
      });
      res.json({ policyPermissions });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
