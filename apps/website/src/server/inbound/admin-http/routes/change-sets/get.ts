import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import {
  toChangeSetHeaderResponse,
  toChangeSetItemResponse,
} from "#src/server/inbound/admin-http/http/change-sets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * GET one change set with its items (SPEC-001 REQ-06).
 *
 * Gated by the existing `changeset.read` permission, checked directly via `authorize()`.
 */
export const registerAdminChangeSetGetRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const changeSetId = String(req.params.changeSetId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "changeset.read", workspaceId: deps.workspaceId, entityType: "change_set", entityId: changeSetId };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const found = await deps.changeSets.findById({
        workspaceId: deps.workspaceId,
        id: changeSetId,
      });
      if (!found) {
        res.status(404).json({ error: "change set was not found", code: "CHANGE_SET_NOT_FOUND" });
        return;
      }

      res.json({
        changeSet: toChangeSetHeaderResponse(found.changeSet),
        items: found.items.map(toChangeSetItemResponse),
      });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/change-sets/get", code: "INTERNAL_ERROR" });
    }
  });
};
