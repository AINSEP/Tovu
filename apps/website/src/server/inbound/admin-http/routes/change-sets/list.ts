import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toChangeSetHeaderResponse } from "#src/server/inbound/admin-http/http/change-sets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * GET change sets, newest-first, workspace-scoped (SPEC-001 REQ-06).
 *
 * Gated by the existing `changeset.read` permission, checked directly via `authorize()`.
 */
export const registerAdminChangeSetListRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "changeset.read", workspaceId: deps.workspaceId, entityType: "change_set" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const changeSets = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
      res.json({ changeSets: changeSets.map(toChangeSetHeaderResponse) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/change-sets/list", code: "INTERNAL_ERROR" });
    }
  });
};
