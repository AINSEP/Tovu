import { getWidgetInstance } from "#src/widgets/read-service";
import { mapWidgetErrorToResponse, toWhereUsedResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/**
 * GET one widget instance (SPEC-043 REQ-04), plus its REQ-34 where-used disclosure — the exact
 * data `ui.spec.md`'s `WhereUsedBanner` needs, folded into the same response so the editor screen
 * needs one round-trip, not two.
 */
export const registerAdminWidgetGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instance, revisions } = await getWidgetInstance({
        deps: { entryRepo: deps.entryRepo, authorize: deps.authorize },
        input: { workspaceId: deps.workspaceId, actor: { principalId: principal.id }, widgetInstanceId: String(req.params.id) },
      });
      const refs = await deps.entryRefsRepo.findByTarget({ workspaceId: deps.workspaceId, targetKind: "entry", targetId: instance.id });
      res.status(200).json({ widget: instance, revisions, whereUsed: toWhereUsedResponse(refs) });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
