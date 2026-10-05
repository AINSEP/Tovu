import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { PluginInstallPreview } from "./install.js";
import { PLUGIN_INSTALL_STAYS_OFF, pluginInstallRiskSentence } from "./install-consent.js";

/**
 * @file The dialog `plugins_install` raises before it writes a site plugin to disk.
 *
 * Same held-open exchange as `uninstall-confirmation-ui.ts`: the model's one call parks, and only the
 * browser POST to `mcp-ui-tool-calls-route.ts` can resolve it (ADR-055 Decision 2). So
 * `plugins_install` must also be on `assistant/mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS`,
 * or every Confirm/Cancel click 403s. The fields are the admin Install Plugin dialog's and the CLI
 * prompt's (`install-consent.ts`): the human approves the same disclosure on every surface.
 */

export const PLUGINS_INSTALL_TOOL_ID = "plugins_install";

function installConfirmationUri(pluginId: string): UIResourceUri {
  return `ui://tovu/plugins-install/${encodeURIComponent(pluginId)}` as UIResourceUri;
}

const listed = (values: readonly string[]) => values.join(", ") || "—";

/**
 * Renders the install-confirmation dialog as a self-contained MCP-UI resource.
 * @param spec.preview - The inspected package. Its digest is what install later re-checks.
 * @param spec.source - The folder or ZIP path, shown so the human knows where the bytes came from.
 * @complexity O(n) in the rendered field lengths.
 */
export function buildInstallConfirmationResource(spec: { preview: PluginInstallPreview; source: string; exchangeId: string; expiresAtMs: number }): UIResource {
  const { preview, source, exchangeId, expiresAtMs } = spec;
  const conflicts = preview.conflicts.map((c) => `${c.kind} '${c.key}' (held by ${c.heldByName})`);
  return buildConfirmationSurface({
    uri: installConfirmationUri(preview.id),
    title: preview.upgradeFrom ? `Replace ${preview.name} ${preview.upgradeFrom} with ${preview.version}?` : `Install ${preview.name}?`,
    description: `Installs the site plugin "${preview.id}" (version ${preview.version}) for every workspace on this site. ${PLUGIN_INSTALL_STAYS_OFF}`,
    details: [
      { label: "Source", value: source },
      { label: "Trust", value: `${preview.tier} (local / unverified publisher)` },
      { label: "Capabilities", value: listed(preview.capabilities) },
      { label: "Hooks", value: listed(preview.hooks) },
      ...(preview.contentTypes.length ? [{ label: "Content types", value: listed(preview.contentTypes) }] : []),
      ...(conflicts.length ? [{ label: "Clashes if turned on", value: conflicts.join("; ") }] : []),
      { label: "Digest", value: preview.digest },
    ],
    warning: pluginInstallRiskSentence({ preview }),
    danger: preview.hasCode,
    confirm: { label: "Install", toolName: PLUGINS_INSTALL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: PLUGINS_INSTALL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-plugins-install", appVersion: "1" },
    preferredFrameSize: ["100%", "420px"],
    expiresAtMs,
  });
}
