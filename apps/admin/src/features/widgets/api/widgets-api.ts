import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import { querySuffix } from "../../../lib/query-suffix";
import type { AdminWidget, AdminWidgetType, AdminWidgetWhereUsed } from "./widgets-api.types";

/** The admin API calls of the widgets feature. */
export const widgetsApi = {
  // -------------------------------------------------------------------------
  // Widgets (SPEC-043, ADR-047) — mirrors the Menus client functions' exact shape
  // -------------------------------------------------------------------------
  listWidgets: (options: { widgetType?: string; includeInactive?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (options.widgetType) params.set("widgetType", options.widgetType);
    if (options.includeInactive) params.set("includeInactive", "true");
    const qs = params.toString();
    // `skippedCount`/`skippedIds` (dossier C5 follow-up, 2026-08-03) are additive and optional —
    // present only when the server dropped one or more malformed records. Absent in the common case.
    return authenticatedAdminRequest<{ widgets: AdminWidget[]; skippedCount?: number; skippedIds?: string[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/widgets${querySuffix({ query: qs })}` });
  },
  getWidget: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ widget: AdminWidget; whereUsed: AdminWidgetWhereUsed }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}` }),
  createWidget: (
    input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> },
    options: { slug?: string } = {}
  ) =>
    authenticatedAdminRequest<{ widget: AdminWidget }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/widgets`, body: { ...input, ...options } }),
};
