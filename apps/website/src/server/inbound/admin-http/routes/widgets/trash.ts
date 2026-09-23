import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { trashWidgetInstance } from "#src/features/widgets/write-service";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";

/** POST move a widget instance to the Trash — `widgets.delete`-gated, never blocked by references
 * (EC-07). Kept for existing callers; the admin's Delete goes through `POST .../trash/items`. A
 * permanent delete is the Trash's purge (there is no widget purge route any more). */
export const registerAdminWidgetTrashRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/:id/trash", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { widgetInstanceId, version } = await trashWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: { workspaceId: deps.workspaceId, actor: { principalId: principal.id }, widgetInstanceId: String(req.params.id) },
      });
      res.status(200).json({ trashed: true, id: widgetInstanceId, version });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
