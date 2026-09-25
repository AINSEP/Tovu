import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { AgentPluginUninstallPreview } from "./uninstall.js";

/**
 * @file The dialog the Agent Plugin family's uninstall raises before it removes anything.
 *
 * Same held-open exchange as `plugin-runtime/set-enabled-confirmation-ui.ts` and `media_trash_asset`
 * (ADR-055 Decision 2; `post/delete-confirmation-ui.ts` has the full chain): the model's one call
 * parks, and only the browser POST to `mcp-ui-tool-calls-route.ts` can resolve it.
 *
 * (S4, 2026-09-24) This dialog's confirm/cancel `toolName` used to be the now-deleted
 * `agent_plugins_uninstall` id. Both plugin families redeem through the ONE `plugins_uninstall` tool
 * now (`features/plugin-runtime/tool-registrations.ts`), so `plugins_uninstall` — not a
 * family-specific id — is what must be on `assistant/mcp-ui-tool-calls.ts`'s
 * `MCP_UI_REDEEMABLE_TOOL_IDS`, or every Confirm/Cancel click 403s.
 *
 * Jini's `buildConfirmationSurface` owns how the dialog behaves; this only decides what it says. Its
 * subject is an `AgentPluginUninstallPreview`, which carries no host path by construction, and the
 * exchange id goes into the two button params and nowhere else.
 */

/** The tool id the dialog asks the Host to call back — the ONE `plugins_uninstall` id both plugin
 *  families redeem through (S4). Named separately from `plugin-runtime/uninstall-confirmation-ui.ts`'s
 *  identical constant rather than imported from it: that file's own header explains why the two
 *  dialogs stay separate modules (differing wording/warnings/preview shapes) even though the id they
 *  both target has converged. */
export const PLUGINS_UNINSTALL_TOOL_ID = "plugins_uninstall";

/** Keyed by plugin id; a URI is an identifier a host may log, and nothing here is sensitive. */
function uninstallConfirmationUri(pluginId: string): UIResourceUri {
  return `ui://tovu/agent-plugins-uninstall/${encodeURIComponent(pluginId)}` as UIResourceUri;
}

/**
 * Renders the uninstall-confirmation dialog as a self-contained MCP-UI resource.
 *
 * @param spec.preview - What would be removed. The plugin is NAMED, because "uninstall this plugin?"
 * without saying which one is not consent.
 * @param spec.exchangeId - The held-open call's correlation handle (`SurfaceExchange.id`).
 * @complexity O(n) in the rendered field lengths.
 */
export function buildUninstallConfirmationResource(spec: { preview: AgentPluginUninstallPreview; exchangeId: string }): UIResource {
  const { preview, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: uninstallConfirmationUri(preview.pluginId),
    title: `Uninstall ${preview.pluginId}?`,
    description: `This permanently removes the Agent Plugin "${preview.pluginId}" from this workspace: its package files and its activation record.`,
    details: [
      { label: "Plugin", value: preview.pluginId },
      ...(preview.versions.length === 0 ? [] : [{ label: "Version", value: preview.versions.join(", ") }]),
      { label: "Packages removed", value: String(preview.archiveDigests.length) },
    ],
    warning:
      "There is no trash and no undo — getting it back means installing its archive again. The plugin's own assistant " +
      "tool stays listed until Tovu restarts.",
    danger: true,
    confirm: {
      label: "Uninstall",
      toolName: PLUGINS_UNINSTALL_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action, not a bare dismiss: cancelling posts back and resolves the parked call at once.
    cancel: {
      label: "Cancel",
      toolName: PLUGINS_UNINSTALL_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-agent-plugins-uninstall", appVersion: "1" },
    preferredFrameSize: ["100%", "340px"],
  });
}
