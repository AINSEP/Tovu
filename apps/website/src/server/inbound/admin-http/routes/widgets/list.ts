import { listWidgetInstances } from "#src/features/widgets/read-service";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";

/**
 * GET the widget instance library (SPEC-043 REQ-04), `widgets.read`-gated. Defaults to
 * `active`-only (`?includeInactive=true` to also list `trash`/`purged`), narrowable by
 * `?widgetType=`. Mirrors `routes/admin/menus/list.ts`'s registration shape.
 *
 * Response body carries optional `skippedCount` and `skippedIds` fields (dossier C5 follow-up,
 * 2026-08-03) — present only when `listWidgetInstances` dropped malformed records, so a client
 * can identify the records that could not be read without every caller handling new keys.
 */
export const registerAdminWidgetListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instances, skippedCount, skippedIds } = await listWidgetInstances({
        deps: { entryRepo: deps.entryRepo, authorize: deps.authorize },
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetType: typeof req.query.widgetType === "string" ? req.query.widgetType : undefined,
          includeInactive: req.query.includeInactive === "true",
        },
      });
      // Additive, optional wire fields (dossier C5 follow-up) — only present when a malformed
      // record was skipped, so the response shape is unchanged for the common case.
      res.status(200).json({ widgets: instances, ...(skippedCount > 0 ? { skippedCount, skippedIds } : {}) });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
