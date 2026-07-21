import { mutateWidgetAreaPlacements } from "../../../../widgets/region-area-service";
import { mapWidgetErrorToResponse, toAdminWidgetAreaResponse } from "../../../http/admin/widgets";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/**
 * PUT a region's whole placement list (SPEC-043 REQ-15/16), `widgets.place`-gated. Always a
 * whole-document, version-guarded write (INV-03) — never a per-placement patch endpoint, matching
 * `ui.spec.md` §4.6/§4.7's single `onSave` event over the full `placements` array.
 */
export const registerAdminWidgetRegionMutatePlacementsRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/widgets/regions/:regionKey", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number" || !Array.isArray(body.placements)) {
      res.status(400).json({ error: "baseVersion and placements[] are required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const binding = await deps.widgetBindingRepo.findByRegion({ workspaceId: deps.workspaceId, regionKey: String(req.params.regionKey) });
      if (!binding) {
        res.status(404).json({ error: `region '${req.params.regionKey}' is not bound`, code: "WIDGETS_AREA_NOT_FOUND" });
        return;
      }

      const { areaEntry } = await mutateWidgetAreaPlacements({
        deps: {
          entryRepo: deps.entryRepo,
          contentTypeRepo: deps.contentTypeRepo,
          entryRefsRepo: deps.entryRefsRepo,
          bindingRepo: deps.widgetBindingRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          areaEntryId: binding.areaEntryId,
          baseVersion: body.baseVersion,
          placements: body.placements,
        },
      });
      res.status(200).json(toAdminWidgetAreaResponse(areaEntry));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
