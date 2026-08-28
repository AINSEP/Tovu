import { parseWidgetAreaPayload, parseWidgetInstancePayload, toWidgetAreaEntry } from "#src/features/widgets/entry-payload";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "#src/features/widgets/types";
import { mapWidgetErrorToResponse, requireWidgetsPermissionOrRespond, toAdminWidgetAreaResponse } from "#src/server/inbound/admin-http/http/widgets";
import type { RouteRegistrar } from "../../../../routes/types.js";

/**
 * GET one region's area entry, with each placement's `widgetTitle`/`widgetType` resolved —
 * `ui.spec.md` §3.7's `RegionPlacementEditorScreen` loaded state ("an operator must be able to
 * identify what's placed without a second lookup", §5).
 */
export const registerAdminWidgetRegionGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets/regions/:regionKey", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireWidgetsPermissionOrRespond(deps.authorize, deps.workspaceId, "widgets.read", res);
      if (!principal) return;

      const binding = await deps.widgetBindingRepo.findByRegion({ workspaceId: deps.workspaceId, regionKey: String(req.params.regionKey) });
      if (!binding) {
        res.status(404).json({ error: `region '${req.params.regionKey}' is not bound`, code: "WIDGETS_AREA_NOT_FOUND" });
        return;
      }
      const areaEntry = await deps.entryRepo.findById({ workspaceId: deps.workspaceId, id: binding.areaEntryId });
      if (!areaEntry || areaEntry.type !== WIDGET_AREA_CONTENT_TYPE) {
        res.status(404).json({ error: `region area entry was not found`, code: "WIDGETS_AREA_NOT_FOUND" });
        return;
      }

      const area = toWidgetAreaEntry(areaEntry);
      const doc = parseWidgetAreaPayload(areaEntry.fieldsJson).doc;
      const placements = await Promise.all(
        doc.placements.map(async (placement) => {
          const widget = await deps.entryRepo.findById({ workspaceId: deps.workspaceId, id: placement.widgetEntryId });
          const payload = widget && widget.type === WIDGET_CONTENT_TYPE ? parseWidgetInstancePayload(widget.fieldsJson) : null;
          return {
            ...placement,
            widgetTitle: widget?.title ?? null,
            widgetType: payload?.widgetType ?? null,
            broken: !widget || !payload || payload.status !== "active",
          };
        })
      );

      res.status(200).json({ ...toAdminWidgetAreaResponse(area), placements });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
