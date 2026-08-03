import { removeWidgetEmbed } from "#src/widgets/embed-service";
import { mapWidgetErrorToResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/** DELETE a `widgetEmbed` placement from a host entry's body (SPEC-043 REQ-44/45), `widgets.place`-gated. */
export const registerAdminWidgetEmbedRemoveRoute: RouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds/:placementId", async (req, res) => {
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
      const { entry } = await removeWidgetEmbed({
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
          hostEntryId: String(req.params.hostEntryId),
          baseVersion: body.baseVersion,
          placementId: String(req.params.placementId),
        },
      });
      res.status(200).json({ entry });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
