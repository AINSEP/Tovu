import { buildWidgetsDeps } from "#src/widgets/deps";
import { createWidgetInstance } from "#src/widgets/write-service";
import { mapWidgetErrorToResponse, toAdminWidgetResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types.js";

/**
 * POST a new widget instance (SPEC-043 REQ-01/02/03), `widgets.create`-gated (enforced inside
 * `createWidgetInstance` itself — REQ-40 requires the SAME gate for human and AI-originated calls,
 * so the domain function owns the check, not this route). Backs both `ui.spec.md`'s
 * `WidgetInstanceEditorScreen` create flow and the `widgets.create` half of `WidgetPickerDialog`'s
 * "create new" path (REQ-33/35).
 */
export const registerAdminWidgetCreateRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.widgetType !== "string" || typeof body.title !== "string") {
      res.status(400).json({ error: "widgetType and title are required strings", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instance } = await createWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetType: body.widgetType,
          title: body.title,
          config: typeof body.config === "object" && body.config !== null ? body.config : {},
          slug: typeof body.slug === "string" ? body.slug : undefined,
        },
      });
      res.status(201).json(toAdminWidgetResponse(instance));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
