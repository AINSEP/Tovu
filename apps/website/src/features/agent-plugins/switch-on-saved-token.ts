/** Tovu compatibility shim (A8 seam). The portable body lives in `portable/switch-on-saved-token.ts` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import { agentPluginMcpPortsOf } from "./mcp-host-bindings.js";
import { switchOnSavedTokenConnection as switchWithPorts, type SavedTokenSwitchOutcome, type SwitchOnSavedTokenDeps as PortableSwitchOnSavedTokenDeps } from "./portable/switch-on-saved-token.js";
import type { AgentPluginMcpContext, AgentPluginMcpPort } from "./service-ports.js";
export * from "./portable/switch-on-saved-token.js";

export interface SwitchOnSavedTokenDeps extends Omit<PortableSwitchOnSavedTokenDeps, "mcp"> {
  readonly mcp: Pick<AgentPluginMcpPort, "repo" | "applyAccess"> & AgentPluginMcpContext;
}

export function switchOnSavedTokenConnection(
  deps: SwitchOnSavedTokenDeps,
  target: { readonly pluginId: string; readonly connectionId: string },
): Promise<SavedTokenSwitchOutcome> {
  const mcp = deps.mcp.projections ? deps.mcp : { ...deps.mcp, ...agentPluginMcpPortsOf(deps.mcp) };
  return switchWithPorts({ ...deps, mcp }, target);
}
