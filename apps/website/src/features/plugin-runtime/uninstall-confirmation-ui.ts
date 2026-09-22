import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { PluginUninstallPreview } from "./uninstall.js";

/**
 * @file The dialog `plugins_uninstall` raises before it removes anything.
 *
 * Same held-open exchange as `set-enabled-confirmation-ui.ts` (this domain's own sibling) and
 * `agent-plugins/uninstall-confirmation-ui.ts` (the OTHER plugin family's identical dialog): the
 * model's one call parks, and only the browser POST to `mcp-ui-tool-calls-route.ts` can resolve it
 * (ADR-055 Decision 2; `post/delete-confirmation-ui.ts` has the full chain). So `plugins_uninstall`
 * must also be on `assistant/mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS`, or every
 * Confirm/Cancel click 403s.
 *
 * This file is deliberately its own module rather than a shared one with `agent-plugins/
 * uninstall-confirmation-ui.ts`: the two plugin families' wording, warnings, and preview shapes
 * genuinely differ (a site plugin's artifact is shared across every workspace this instance serves;
 * an Agent Plugin's is per-workspace), and a shared builder would either blur that difference or grow
 * a family-switch branch neither side asked for.
 */

/** The tool id the dialog asks the Host to call back. Single source of truth for both halves. */
export const PLUGINS_UNINSTALL_TOOL_ID = "plugins_uninstall";

/** Keyed by plugin id; a URI is an identifier a host may log, and nothing here is sensitive. */
function uninstallConfirmationUri(pluginId: string): UIResourceUri {
  return `ui://tovu/plugins-uninstall/${encodeURIComponent(pluginId)}` as UIResourceUri;
}

/**
 * Renders the uninstall-confirmation dialog as a self-contained MCP-UI resource.
 *
 * @param spec.preview - What would be removed. The plugin is NAMED, because "uninstall this plugin?"
 * without saying which one is not consent.
 * @param spec.exchangeId - The held-open call's correlation handle (`SurfaceExchange.id`). This is
 * the only place it may go — see this file's header.
 * @complexity O(n) in the rendered field lengths.
 */
export function buildUninstallConfirmationResource(spec: { preview: PluginUninstallPreview; exchangeId: string }): UIResource {
  const { preview, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: uninstallConfirmationUri(preview.pluginId),
    title: `Move ${preview.name} to trash?`,
    description: `This moves the site plugin "${preview.pluginId}" (version ${preview.version}) to the Trash for 60 days.`,
    details: [
      { label: "Plugin", value: preview.pluginId },
      { label: "Version", value: preview.version },
    ],
    warning:
      "This removes it for all workspaces on this site. You can restore it from Admin → Trash for 60 days; " +
      "only a human can delete it permanently.",
    danger: true,
    confirm: {
      label: "Move to trash",
      toolName: PLUGINS_UNINSTALL_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action, not a bare dismiss: cancelling posts back and resolves the parked call at once,
    // rather than stranding the agent's call open until the idle deadline.
    cancel: {
      label: "Cancel",
      toolName: PLUGINS_UNINSTALL_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-plugins-uninstall", appVersion: "1" },
    preferredFrameSize: ["100%", "340px"],
  });
}
