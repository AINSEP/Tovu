import { listWidgetInstances } from "../../../../widgets/read-service";
import { mapWidgetErrorToResponse } from "../../../http/admin/widgets";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/**
 * GET the widget instance library (SPEC-043 REQ-04), `widgets.read`-gated. Defaults to
 * `active`-only (`?includeInactive=true` to also list `trash`/`purged`), narrowable by
 * `?widgetType=`. Mirrors `routes/admin/menus/list.ts`'s registration shape.
 */
export const registerAdminWidgetListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instances } = await listWidgetInstances({
        deps: { entryRepo: deps.entryRepo, authorize: deps.authorize },
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetType: typeof req.query.widgetType === "string" ? req.query.widgetType : undefined,
          includeInactive: req.query.includeInactive === "true",
        },
      });
      res.status(200).json({ widgets: instances });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
