import type { Translate } from "@jini-ai/ui/panel-kit";
import { agentHandle } from "@jini-ai/agentic";
import { defaultAgentPluginSurfacesPort } from "./hooks/agent-plugin-surfaces-dependencies.hooks";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "./hooks/agent-plugin-surfaces-port.hooks";
import { useAgentPluginSurfaces } from "./hooks/use-agent-plugin-surfaces.hooks";

/**
 * @file The row's "Manage" button: shown only when an enabled plugin contributes its own admin screens
 * (for example Google Workspace's connection panel), and opening the package modal straight on the
 * first of them. Before this, those screens were reachable only through the eye icon ("Inspect package
 * files") and then a tab past Package files and Memory (Chrome check, 2026-10-20).
 */

export interface AgentPluginManageButtonProps {
  readonly pluginId: string;
  readonly displayName: string;
  readonly t: Translate;
  readonly agentHandleBase: string;
  /** Opens the modal with these (already listed) screens, so it can start on the first one. */
  readonly onManage: (surfaces: readonly AgentPluginSurfaceSummary[]) => void;
  /** A test passes a typed fake. */
  readonly port?: AgentPluginSurfacesPort;
}

export function AgentPluginManageButton({ pluginId, displayName, t, agentHandleBase, onManage, port = defaultAgentPluginSurfacesPort }: AgentPluginManageButtonProps) {
  const surfaces = useAgentPluginSurfaces({ pluginId, port });
  if (surfaces.length === 0) return null;
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => onManage(surfaces)}
      aria-label={`${t("Manage")} ${displayName}`}
      {...agentHandle({ handle: `${agentHandleBase}-manage` }, { role: "button", label: `Open the "${displayName}" settings screens` })}
    >
      {t("Manage")}
    </button>
  );
}
