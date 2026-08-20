import { buildWidgetsDeps } from "#src/widgets/deps";
import { createWidgetInstance } from "#src/widgets/write-service";
import { mapWidgetErrorToResponse, toAdminWidgetResponse } from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { WidgetTypeKey } from "#src/widgets/types";
import type { RouteRegistrar } from "../../types.js";

/** This route's validated POST body shape, or `null` when `widgetType`/`title` failed validation.
 *  `widgetType` is cast, not validated, against the real `WidgetTypeKey` union here —
 *  `createWidgetInstance` (`getWidgetTypeRegistration`) is what rejects an unregistered type at
 *  runtime. @complexity O(1). */
function parseWidgetCreateBody(rawBody: unknown): {
  widgetType: WidgetTypeKey;
  title: string;
  config: Record<string, unknown>;
  slug: string | undefined;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  if (typeof body.widgetType !== "string" || typeof body.title !== "string") return null;
  return {
    widgetType: body.widgetType as WidgetTypeKey,
    title: body.title,
    config: typeof body.config === "object" && body.config !== null ? (body.config as Record<string, unknown>) : {},
    slug: typeof body.slug === "string" ? body.slug : undefined,
  };
}

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

    const parsedBody = parseWidgetCreateBody(req.body);
    if (!parsedBody) {
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
          ...parsedBody,
        },
      });
      res.status(201).json(toAdminWidgetResponse(instance));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
