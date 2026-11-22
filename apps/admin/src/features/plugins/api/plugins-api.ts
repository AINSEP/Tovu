import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminPlugin, AdminPluginFiles, AdminPluginProviderSettings } from "./plugins-api.types";

/** The admin API calls of the plugins feature. */
export const pluginsApi = {
  // SPEC-005 REQ-12..17 (1.1.0 UI amendment) — consumes REQ-10's PLUGINS_LIST/PLUGIN_SET_ENABLED
  // HTTP contract as a black box (ui.spec.md §3.1/§4.2).
  listPlugins: () => request<{ plugins: AdminPlugin[] }>({ path: `/workspaces/${WORKSPACE_ID}/plugins` }),
  /** PLUGIN_PROVIDER_SETTINGS (2026-10-26) — a provider plugin's declared settings card. */
  getPluginProviderSettings: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<AdminPluginProviderSettings>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/provider-settings` }),
  /** Saves and reapplies card values; a blank secret keeps the saved one. */
  savePluginProviderSettings: ({ pluginId, values }: { pluginId: string; values: Record<string, string> }, _optional: Record<string, never> = {}) =>
    request<AdminPluginProviderSettings>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/provider-settings` }, { init: {
      method: "PUT", body: JSON.stringify({ values }),
    } }),
  setPluginEnabled: ({ pluginId, enabled }: { pluginId: string; enabled: boolean }, _optional: Record<string, never> = {}) =>
    request<{ plugin: { id: string; version: string; enabled: boolean; updatedAt: string }; changeSetId: string }>(
      { path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}` },
      { init: { method: "PATCH", body: JSON.stringify({ enabled }) } }
    ),
  /** Moves a site plugin to the 60-day Trash. `PLUGIN_IN_TRASH` reports an existing parked copy. */
  uninstallPlugin: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<{ pluginId: string; trashed: true }>(
      { path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}` },
      { init: { method: "DELETE" } }
    ),
  /** PLUGIN_FILES (2026-09-13) — `GET /workspaces/:id/plugins/:pluginId/files`: the read-only,
   *  server-capped listing of one plugin's own files behind the Plugins screen's package-files
   *  viewer. Refuses `PLUGIN_NOT_FOUND` (404) and `PLUGIN_ID_INVALID` (400). */
  getPluginFiles: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<AdminPluginFiles>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/files` }),
};
