import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { reorderWidgetEmbeds } from "#src/features/widgets/embed-service";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "../../../../routes/types.js";

/** PUT a new widget-per-slot order for every EXISTING `widgetEmbed` node in a host entry's body
 * (SPEC-043 REQ-44/45), `widgets.place`-gated. */
export const registerAdminWidgetEmbedReorderRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    // Round-2 external-audit fix (2026-07-21, codex): reject a malformed element shape (400) before
    // it ever reaches the domain layer's existence/liveness check (404) — mirrors
    // region-mutate-placements.ts's own shape-then-existence split.
    if (
      typeof body.baseVersion !== "number" ||
      !Array.isArray(body.orderedWidgetEntryIds) ||
      !body.orderedWidgetEntryIds.every((id: unknown) => typeof id === "string" && id.length > 0)
    ) {
      res.status(400).json({ error: "baseVersion and non-empty string orderedWidgetEntryIds[] are required", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { entry } = await reorderWidgetEmbeds({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          hostEntryId: String(req.params.hostEntryId),
          baseVersion: body.baseVersion,
          orderedWidgetEntryIds: body.orderedWidgetEntryIds,
        },
      });
      res.status(200).json({ entry });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
