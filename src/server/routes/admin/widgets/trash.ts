import { trashWidgetInstance } from "#src/widgets/write-service";
import { mapWidgetErrorToResponse, toAdminWidgetResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/** POST trash a widget instance (SPEC-043 ADR-047 §7 deletion ladder, step 1 of 2) —
 * unconditional/soft/revisioned, `widgets.delete`-gated. Never blocked by references (EC-07). */
export const registerAdminWidgetTrashRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/:id/trash", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instance } = await trashWidgetInstance({
        deps: {
          entryRepo: deps.entryRepo,
          contentTypeRepo: deps.contentTypeRepo,
          entryRefsRepo: deps.entryRefsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          outbox: deps.outbox,
        },
        input: { workspaceId: deps.workspaceId, actor: { principalId: principal.id }, widgetInstanceId: String(req.params.id) },
      });
      res.status(200).json(toAdminWidgetResponse(instance));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
