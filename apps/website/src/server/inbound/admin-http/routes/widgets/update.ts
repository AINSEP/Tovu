import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { updateWidgetInstance } from "@jini-ai/cms/widgets";
import { mapWidgetErrorToResponse, toAdminWidgetResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** PUT an existing widget instance's config (SPEC-043 REQ-05/06), `widgets.update`-gated, OCC via `baseVersion`. */
export const registerAdminWidgetUpdateRoute: RouteRegistrar = ({ app, deps }, _options = {}) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/widgets/:id", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number") {
      res.status(400).json({ error: "baseVersion is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      res.status(400).json({ error: "title must be a string", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instance } = await updateWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetInstanceId: String(req.params.id),
          baseVersion: body.baseVersion,
          title: body.title,
          config: typeof body.config === "object" && body.config !== null ? body.config : {},
        },
      });
      res.status(200).json(toAdminWidgetResponse(instance));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
