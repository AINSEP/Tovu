import { agentPluginCardHost } from './card-host-bindings.js';
import type { AgentPluginCardsPort } from './service-ports.js';
import type { SurfaceCardSecretDeps } from '@jini-ai/core/contracts/cards';
import { type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginCredentialCard } from '@jini-ai/core/contracts/credentials';
import { buildAgentPluginConnectCard, type AgentPluginConnectCardSpec } from './connect-card-ui.js';
import type { AgentPluginConnectResult } from './connect-tool.js';

/** The plugin's MCP and API sign-ins share one card/exchange lifecycle. Skip cancels only the
 * sign-in watcher; the enclosing agent run continues. OAuth callback/token custody stays with
 * each connection owner. @complexity One bounded connection wait and one exchange per sign-in. */
export async function waitAtAgentPluginSignInCardWithPorts<Resource>(required: {
  surfaceExchanges: SurfaceCardSecretDeps['surfaceExchanges']; cards: AgentPluginCardsPort<Resource>;
  buildCard: (spec: AgentPluginConnectCardSpec) => Resource; toolId: string; missingEmitterMessage: string; skippedResult: () => AgentPluginConnectResult; ctx: ToolExecutionContext; pluginId: string; pluginDisplayName: string;
  credentialCard?: PluginCredentialCard;
  connect: (input: { signal: AbortSignal; showSignIn: (input: { signInUrl: string }) => Promise<void> }) => Promise<AgentPluginConnectResult>;
}, optional: ToolExecutionOptions = {}): Promise<AgentPluginConnectResult> {
  const { cards, ctx, pluginId, pluginDisplayName, credentialCard, connect } = required;
  return cards.waitAtSignInCard<AgentPluginConnectResult>({
    surfaceExchanges: required.surfaceExchanges, ctx, toolId: required.toolId, connect,
    card: state => required.buildCard(state.state === 'waiting'
      ? { pluginId, pluginDisplayName, credentialCard, ...state }
      : { pluginId, pluginDisplayName, ...state }),
    missingEmitterMessage: required.missingEmitterMessage,
    skippedResult: required.skippedResult,
  }, optional);
}

/** The original Tovu entry binds the actual UI and SAME process exchange store. */
export function waitAtAgentPluginSignInCard(required: {
  surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string; pluginDisplayName: string;
  credentialCard?: PluginCredentialCard;
  connect: (input: { signal: AbortSignal; showSignIn: (input: { signInUrl: string }) => Promise<void> }) => Promise<AgentPluginConnectResult>;
}, optional: ToolExecutionOptions = {}): Promise<AgentPluginConnectResult> {
  return waitAtAgentPluginSignInCardWithPorts({ ...required, surfaceExchanges: required.surfaces.surfaceExchanges,
    cards: agentPluginCardHost.cards, buildCard: buildAgentPluginConnectCard, toolId: agentPluginCardHost.connect.toolId,
    missingEmitterMessage: 'agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.',
    skippedResult: () => ({ status: 'not-connected', reason: 'cancelled', next: 'The person skipped this sign-in. Continue without this plugin; do not ask them to sign in again unless they request it.' }),
  }, optional);
}
