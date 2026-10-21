import { agentHandle } from "@jini-ai/agentic";
import { useId, useState } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { AdminAgentPlugin } from "@/lib/api";
import { AddAgentPluginPanel } from "./AddAgentPluginPanel";
import { useAgentPluginInstall } from "./hooks/use-agent-plugin-install.hooks";
import { defaultAgentPluginInstallPort } from "./hooks/agent-plugin-install-dependencies.hooks";
import type { AgentPluginInstallPort } from "./hooks/agent-plugin-install-port.hooks";
import { agentPluginDisplayName } from "./rules";

export interface AgentPluginUpdateControlProps {
  /** An operator-installed row with its `archiveDigest` (`canUpdateAgentPlugin`); the row decides. */
  readonly plugin: AdminAgentPlugin & { readonly archiveDigest: string };
  readonly t: Translate;
  /** The row's own agent-handle base; the button and panel nest under `<base>-update`. */
  readonly agentHandleBase: string;
  /** The updated row, so the list replaces it in place (new version and digest). */
  readonly onUpdated: (plugin: AdminAgentPlugin) => void;
  /** A test passes a typed fake. */
  readonly port?: AgentPluginInstallPort;
}

/**
 * The explicit update of one operator-installed Agent Plugin: an "Update" button that opens the same
 * bounded `.zip`/folder upload the Add tab uses, sent to `AGENT_PLUGIN_UPDATE_ZIP` with the
 * revision this row shows (`archiveDigest`). If the plugin changed meanwhile, the server refuses
 * (`PLUGIN_CHANGED`) and nothing moves. The plugin keeps its memory and its on/off state.
 * There is no "update available" signal: without a catalog nothing knows a newer version exists.
 */
export function AgentPluginUpdateControl({ plugin, t, agentHandleBase, onUpdated, port = defaultAgentPluginInstallPort }: AgentPluginUpdateControlProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const displayName = agentPluginDisplayName(plugin);
  const controller = useAgentPluginInstall({ port, t, onInstalled: onUpdated },
    { update: { pluginId: plugin.pluginId, expectedOldDigest: plugin.archiveDigest } });
  const base = `${agentHandleBase}-update`;
  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t("Update")} ${displayName}`}
        disabled={controller.busy}
        onClick={() => setOpen(!open)}
        {...agentHandle({ handle: base }, { role: "button", label: `Show or hide the update upload for "${displayName}"` })}
      >
        {t("Update")}
      </button>
      <div id={panelId} hidden={!open}>
        {open ? <AddAgentPluginPanel controller={controller} handleBase={base} title={`${t("Update")} ${displayName}`} /> : null}
      </div>
    </div>
  );
}
