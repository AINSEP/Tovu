import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminPolicyResponse } from "#src/server/inbound/admin-http/http/users";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { UsersRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * GET policies — list a workspace's policies (built-in + custom) for the Users admin screen's
 * policy picker. Gated by `role.manage`, mirroring `list-roles.ts`'s identical reasoning
 * (`createPolicy` is also gated by `role.manage`, not a separate `policy.manage`; 2026-07-16
 * authz sweep: this route previously had zero permission check beyond session auth).
 */
export const registerAdminPolicyListRoute: UsersRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond({ res, authorize: deps.authorize, params: {
          principalId: principal.id,
          permission: "role.manage",
          workspaceId: deps.workspaceId,
        } }))
      )
        return;

      const policies = await deps.policyRepo.list({ workspaceId: deps.workspaceId });
      res.json({ policies: policies.map(toAdminPolicyResponse) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/users/list-policies", code: "INTERNAL_ERROR" });
    }
  });
};
