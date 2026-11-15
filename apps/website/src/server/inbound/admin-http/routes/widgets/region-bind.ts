import { buildWidgetsRegionDeps } from "#src/features/widgets/deps";
import { bindWidgetArea } from "@jini-ai/cms/widgets";
import { mapWidgetErrorToResponse, requireWidgetsPermissionOrRespond, toAdminWidgetAreaResponse } from "#src/server/inbound/admin-http/http/widgets";
import type { RouteRegistrar } from "#src/server/routes/types";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * POST bind a new region by key (SPEC-043 REQ-11/13), `widgets.place`-gated. `bindWidgetArea`
 * itself is idempotent (an already-bound region key returns its existing area entry, never
 * duplicates) — this is the free-text bind control `ui.spec.md` §3.6/§9 documents, the manual
 * counterpart to REQ-13's (currently unwired, see the implementation-outline addendum) automatic
 * on-theme-activation seeding.
 */
export const registerAdminWidgetRegionBindRoute: RouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/regions", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const body = req.body ?? {};
    if (typeof body.regionKey !== "string" || body.regionKey.trim() === "") {
      res.status(400).json({ error: "regionKey is required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireWidgetsPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "widgets.place", res });
      if (!principal) return;
      const { areaEntry } = await bindWidgetArea({
        deps: buildWidgetsRegionDeps(deps),
        input: { workspaceId: deps.workspaceId, regionKey: body.regionKey.trim() },
      });
      res.status(201).json(toAdminWidgetAreaResponse(areaEntry));
    } catch (err) {
      mapWidgetErrorToResponse({ err, res });
    }
  });
};
