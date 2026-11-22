import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { trashWidgetInstance } from "@jini-ai/cms/widgets";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** POST move a widget instance to the Trash — `widgets.delete`-gated, never blocked by references
 * (EC-07). Kept for existing callers; the admin's Delete goes through `POST .../trash/items`. A
 * permanent delete is the Trash's purge (there is no widget purge route any more). */
export const registerAdminWidgetTrashRoute: RouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/:id/trash", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const { widgetInstanceId, version } = await trashWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: { workspaceId: deps.workspaceId, actor: { principalId: principal.id }, widgetInstanceId: String(req.params.id) },
      });
      res.status(200).json({ trashed: true, id: widgetInstanceId, version });
    } catch (err) {
      mapWidgetErrorToResponse({ err, res });
    }
  });
};
