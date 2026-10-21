import { useState } from "react";

import type { AdminAgentPlugin } from "@/lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { agentPluginDisplayName } from "../rules";
import type { AgentPluginInstallPort } from "./agent-plugin-install-port.hooks";
import { useAgentPluginInstall } from "./use-agent-plugin-install.hooks";

/**
 * One operator-installed row's Update state: whether its upload panel is open, and the same bounded
 * upload controller the Add tab uses, bound to `AGENT_PLUGIN_UPDATE_ZIP` with the revision the row
 * shows (`expectedOldDigest`). Composed by the wired list (`AgentPlugins.tsx`) and handed to
 * `AgentPluginUpdateControl`, which only renders it.
 * @complexity O(1) per render.
 */
export function useAgentPluginUpdate(
  required: { plugin: AdminAgentPlugin; expectedOldDigest: string; port: AgentPluginInstallPort; t: Translate; onUpdated: (plugin: AdminAgentPlugin) => void },
  _optional: Record<string, never> = {},
) {
  const { plugin, expectedOldDigest, port, t, onUpdated } = required;
  const [open, setOpen] = useState(false);
  const controller = useAgentPluginInstall({ port, t, onInstalled: onUpdated }, { update: { pluginId: plugin.pluginId, expectedOldDigest } });
  return { open, onToggle: () => setOpen(!open), displayName: agentPluginDisplayName(plugin), controller };
}

export type AgentPluginUpdateState = ReturnType<typeof useAgentPluginUpdate>;
