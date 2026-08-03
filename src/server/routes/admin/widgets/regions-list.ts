import { parseWidgetAreaPayload } from "#src/widgets/entry-payload";
import { mapWidgetErrorToResponse, requireWidgetsPermissionOrRespond } from "#src/server/http/admin/widgets";
import type { RouteRegistrar } from "../../types";

/**
 * GET every currently-bound widget region (SPEC-043 REQ-11/12), `widgets.read`-gated — backs
 * `ui.spec.md`'s `WidgetRegionsScreen`. Only ACTIVELY-bound regions are listed:
 * `widgetBindingRepo.listByWorkspace` only ever holds live bindings (REQ-14's orphaned-on-theme-
 * switch case removes the BINDING row, retaining the underlying `widget_area` entry — see
 * `repo.memory.ts`'s `markInactive`) — a separate "list every widget_area entry including
 * currently-unbound ones" view is not built in this pass, disclosed rather than silently omitted.
 */
export const registerAdminWidgetRegionsListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets/regions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireWidgetsPermissionOrRespond(deps.authorize, deps.workspaceId, "widgets.read", res);
      if (!principal) return;
      const bindings = await deps.widgetBindingRepo.listByWorkspace({ workspaceId: deps.workspaceId });
      const regions = await Promise.all(
        bindings.map(async (binding) => {
          const areaEntry = await deps.entryRepo.findById({ workspaceId: deps.workspaceId, id: binding.areaEntryId });
          const placementCount = areaEntry ? parseWidgetAreaPayload(areaEntry.fieldsJson).doc.placements.length : 0;
          return { ...binding, placementCount };
        })
      );
      res.status(200).json({ regions });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
