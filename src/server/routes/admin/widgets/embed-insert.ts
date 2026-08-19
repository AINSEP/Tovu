import { buildWidgetsDeps } from "#src/widgets/deps";
import { insertWidgetEmbed } from "#src/widgets/embed-service";
import { mapWidgetErrorToResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types.js";

/**
 * POST insert a `widgetEmbed` node into a host entry's body (SPEC-043 REQ-44/45, ADR-047 Debate
 * Fold-In Amendment 6) — the server-side, no-live-editor-required mutation path. `widgets.place`-gated.
 */
export const registerAdminWidgetEmbedInsertRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number" || typeof body.widgetEntryId !== "string") {
      res.status(400).json({ error: "baseVersion and widgetEntryId are required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { entry, placementId } = await insertWidgetEmbed({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          hostEntryId: String(req.params.hostEntryId),
          baseVersion: body.baseVersion,
          widgetEntryId: body.widgetEntryId,
        },
      });
      res.status(201).json({ entry, placementId });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
