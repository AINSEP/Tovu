/** Tovu compatibility shim (A10 seam). The portable destination card lives in
 * `./portable/connect-destination.ts`; this entry keeps its signature and binds Tovu's UI, card
 * identity, exchange helper, `mcp-ui` channel and "this Mac" wording (bytes unchanged). */
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { agentPluginCardHost } from './card-host-bindings.js';
import { chooseApiConnectionDestinationWithPorts, type AgentPluginDestinationCardHost } from './portable/connect-destination.js';
export { chooseApiConnectionDestinationWithPorts, type AgentPluginDestinationCardHost } from './portable/connect-destination.js';

export const tovuDestinationCardHost: AgentPluginDestinationCardHost = {
  channel: 'mcp-ui',
  messages: {
    description: 'Keep this sign-in on this site, or save a shared connection on this Mac. Other sites need your separate approval to use it. Existing local connections stay independent.',
    sharedOptionLabel: 'Save this connection on this Mac',
  },
};

/** Existing host entry supplies the same UI, namespace and exchange helper. */
export function chooseApiConnectionDestination(required: { readonly surfaces: AssistantSurfaceDeps; readonly ctx: ToolExecutionContext; readonly pluginDisplayName: string; readonly available: boolean }, optional: ToolExecutionOptions = {}): Promise<'site' | 'shared' | null> {
  return chooseApiConnectionDestinationWithPorts({ ...required, cards: agentPluginCardHost.cards, askThenReport: agentPluginCardHost.askThenReport, ...agentPluginCardHost.destination, host: tovuDestinationCardHost }, optional);
}
