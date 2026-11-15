import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminMenuListResponse, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * GET the workspace's menus (admin list view, ADR-029).
 *
 * Reads go straight through `MenuRepoPort.list` — `navigation` ships no
 * `listMenus` service wrapper (only the mutation slice: create/update-tree/
 * assign/delete in `menu-service.ts`), so there is no business logic to
 * front this plain repo read with. See the handoff report's "interface
 * friction" note. This D-9 service-layer-bypass gap is unchanged by
 * ADR-PIPE-012 — only the permission naming below is in scope for this
 * remediation (see ADR-PIPE-012's "Note on D-9").
 *
 * Gated by `admin.menus.read` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from
 * the old flat navigation permission).
 */
export const registerAdminMenuListRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/menus", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.menus.read", workspaceId: deps.workspaceId, entityType: "menu" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const menus = await deps.menuRepo.list({ workspaceId: deps.workspaceId });
      res.json(toAdminMenuListResponse(menus));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/menus/list", code: "INTERNAL_ERROR" });
    }
  });
};
