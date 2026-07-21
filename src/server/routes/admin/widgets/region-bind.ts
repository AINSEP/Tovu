import { bindWidgetArea } from "../../../../widgets/region-area-service";
import { mapWidgetErrorToResponse, requireWidgetsPermissionOrRespond, toAdminWidgetAreaResponse } from "../../../http/admin/widgets";
import type { RouteRegistrar } from "../../types";

/**
 * POST bind a new region by key (SPEC-043 REQ-11/13), `widgets.place`-gated. `bindWidgetArea`
 * itself is idempotent (an already-bound region key returns its existing area entry, never
 * duplicates) — this is the free-text bind control `ui.spec.md` §3.6/§9 documents, the manual
 * counterpart to REQ-13's (currently unwired, see the implementation-outline addendum) automatic
 * on-theme-activation seeding.
 */
export const registerAdminWidgetRegionBindRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/regions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.regionKey !== "string" || body.regionKey.trim() === "") {
      res.status(400).json({ error: "regionKey is required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireWidgetsPermissionOrRespond(deps.authorize, deps.workspaceId, "widgets.place", res);
      if (!principal) return;
      const { areaEntry } = await bindWidgetArea({
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
        input: { workspaceId: deps.workspaceId, regionKey: body.regionKey.trim() },
      });
      res.status(201).json(toAdminWidgetAreaResponse(areaEntry));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
