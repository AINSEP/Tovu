import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { purgeWidgetInstance } from "#src/features/widgets/write-service";
import { mapWidgetErrorToResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "../../types.js";

/**
 * POST purge a (trashed) widget instance (ADR-047 §7 deletion ladder, step 2) — `?force=true`
 * requires `widgets.delete.force` (checked inside `purgeWidgetInstance` itself); without `force`,
 * a still-referenced instance is rejected `409` naming every referencing placement (REQ-42, `ui.spec.md`
 * §8's `WidgetReferencedError` treatment).
 */
export const registerAdminWidgetPurgeRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/:id/purge", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      await purgeWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetInstanceId: String(req.params.id),
          force: req.query.force === "true",
        },
      });
      res.status(200).json({ purged: true });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
