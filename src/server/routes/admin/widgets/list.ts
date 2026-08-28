import { listWidgetInstances } from "#src/features/widgets/read-service";
import { mapWidgetErrorToResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "../../types.js";

/**
 * GET the widget instance library (SPEC-043 REQ-04), `widgets.read`-gated. Defaults to
 * `active`-only (`?includeInactive=true` to also list `trash`/`purged`), narrowable by
 * `?widgetType=`. Mirrors `routes/admin/menus/list.ts`'s registration shape.
 *
 * Response body carries an optional `skippedCount` (dossier C5 follow-up, 2026-08-03) — present
 * only when `listWidgetInstances` silently dropped one or more malformed rows, so a client can
 * surface "N rows could not be displayed" without every caller needing to handle a new key.
 */
export const registerAdminWidgetListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const { instances, skippedCount } = await listWidgetInstances({
        deps: { entryRepo: deps.entryRepo, authorize: deps.authorize },
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          widgetType: typeof req.query.widgetType === "string" ? req.query.widgetType : undefined,
          includeInactive: req.query.includeInactive === "true",
        },
      });
      // Additive, optional wire field (dossier C5 follow-up) — only present when non-zero, so the
      // response shape is unchanged for the common case and every existing consumer of this route.
      res.status(200).json({ widgets: instances, ...(skippedCount > 0 ? { skippedCount } : {}) });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
