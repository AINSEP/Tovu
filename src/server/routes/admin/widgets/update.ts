import { updateWidgetInstance } from "../../../../widgets/write-service";
import { mapWidgetErrorToResponse, toAdminWidgetResponse } from "../../../http/admin/widgets";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/** PUT an existing widget instance's config (SPEC-043 REQ-05/06), `widgets.update`-gated, OCC via `baseVersion`. */
export const registerAdminWidgetUpdateRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/widgets/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number") {
      res.status(400).json({ error: "baseVersion is required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instance } = await updateWidgetInstance({
        deps: {
          entryRepo: deps.entryRepo,
          contentTypeRepo: deps.contentTypeRepo,
          entryRefsRepo: deps.entryRefsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetInstanceId: String(req.params.id),
          baseVersion: body.baseVersion,
          config: typeof body.config === "object" && body.config !== null ? body.config : {},
        },
      });
      res.status(200).json(toAdminWidgetResponse(instance));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
