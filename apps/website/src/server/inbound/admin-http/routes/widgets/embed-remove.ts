import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { removeWidgetEmbed } from "@jini-ai/cms/widgets";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** DELETE a `widgetEmbed` placement from a host entry's body (SPEC-043 REQ-44/45), `widgets.place`-gated. */
export const registerAdminWidgetEmbedRemoveRoute: RouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds/:placementId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number") {
      res.status(400).json({ error: "baseVersion is required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { entry } = await removeWidgetEmbed({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id, kind: "user" },
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
