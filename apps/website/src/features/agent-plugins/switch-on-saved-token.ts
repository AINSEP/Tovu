/** Tovu compatibility shim (A8 seam, A9 move). The portable body lives in `@jini-ai/agent-plugins/connect` and
 * requires the host's activation reads/switch and the sign-in's `onConnected`; this legacy entry, whose
 * frozen callers pass none of them, binds Tovu's (`apply-connect-defaults.ts`) and adds Tovu's projection
 * pair via `agentPluginMcpPortsOf`. The next-step copy names Tovu's admin screens, so it stays here. */
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import { switchOnSavedTokenConnection as switchWithPorts, type SavedTokenSwitchOutcome } from "@jini-ai/agent-plugins/connect";
import { withAgentPluginMcpPorts } from "./mcp-host-bindings.js";
import { createApplyConnectDefaults, isPluginOffByOperator as defaultIsPluginOffByOperator, switchPluginOnUnlessOperatorOff } from "./apply-connect-defaults.js";
import type { AgentPluginLayout } from "./layout.js";
import type { AgentPluginMcpContext, AgentPluginMcpPort } from "./service-ports.js";
export type { SavedTokenSwitchOutcome } from "@jini-ai/agent-plugins/connect";

/** Where each "off" is switched back on in the admin (`apps/admin/src/panels.tsx` nav labels). */
export const AGENT_PLUGINS_SCREEN = "Add-Ons → Agent Plugins";
export const EXTERNAL_MCP_SCREEN = "Add-Ons → Integrations → External MCP";


export interface SwitchOnSavedTokenDeps {
  readonly workspaceId: string;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly mcp: Pick<AgentPluginMcpPort, "repo" | "applyAccess"> & AgentPluginMcpContext;
  readonly clock: ClockPort;
  readonly notifyRosterChanged: () => Promise<void>;
  /** Injected for tests. Defaults to `createApplyConnectDefaults`, the sign-in's own `onConnected`. */
  readonly onConnected?: (serverId: string) => Promise<void>;
  /** Injected for tests. Defaults to reading this workspace's activations file. */
  readonly isPluginOffByOperator?: (pluginId: string) => Promise<boolean>;
  /** Injected for tests. Switches the plugin's activation on unless an operator turned it off; false
   *  when an operator's "off" stopped it. Defaults to `apply-connect-defaults.ts`'s {@link switchPluginOnUnlessOperatorOff}. */
  readonly switchPluginOn?: (pluginId: string) => Promise<boolean>;
}

export function switchOnSavedTokenConnection(
  deps: SwitchOnSavedTokenDeps,
  target: { readonly pluginId: string; readonly connectionId: string },
): Promise<SavedTokenSwitchOutcome> {
  const mcp = withAgentPluginMcpPorts(deps.mcp);
  return switchWithPorts({
    workspaceId: deps.workspaceId, mcp,
    isPluginOffByOperator: deps.isPluginOffByOperator ?? ((pluginId: string) => defaultIsPluginOffByOperator({ ...deps, pluginId })),
    // Created on first use (after the operator-off check), as before the move.
    onConnected: deps.onConnected ?? ((serverId: string) => createApplyConnectDefaults({ agentPluginLayout: deps.agentPluginLayout, workspaceId: deps.workspaceId, repo: mcp.repo, applyAccess: mcp.applyAccess, clock: deps.clock, notifyRosterChanged: deps.notifyRosterChanged, projections: mcp.projections, classifyError: mcp.classifyError })(serverId)),
    switchPluginOn: deps.switchPluginOn ?? ((pluginId: string) => switchPluginOnUnlessOperatorOff({ ...deps, pluginId })),
  }, target);
}

/** The plain next-step line for each outcome. Never carries a token. */
export function describeSavedTokenSwitch(outcome: SavedTokenSwitchOutcome, names: { readonly displayName: string; readonly connectionId: string }): string {
  const messages = {
    on: `${names.displayName} is connected and switched on. Its tools are ready to use.`,
    'plugin-off-by-operator': `Token saved. ${names.displayName} stays off because an operator turned it off. To use it, switch '${names.displayName}' on in ${AGENT_PLUGINS_SCREEN}.`,
    'connection-off-by-operator': `Token saved. The '${names.connectionId}' connection stays off because an operator changed its settings. To use it, switch it on in ${EXTERNAL_MCP_SCREEN}.`,
  };
  return messages[outcome.state];
}
