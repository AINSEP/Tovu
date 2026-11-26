/** Tovu compatibility shim (A10 seam). The portable waiter lives in `@jini-ai/agent-plugins/connect`
 * (generic over the card `Resource` and the connect result); these entries keep their signatures and
 * bind Tovu's UI, card identity, SAME process exchange store and missing-emitter/skip copy. */
import { agentPluginCardHost } from './card-host-bindings.js';
import type { AgentPluginConnectResult } from '@jini-ai/agent-plugins/connect';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import type { PluginCredentialCard } from '@jini-ai/core/contracts/credentials';
import { buildAgentPluginConnectCard } from './connect-card-ui.js';
import { waitAtAgentPluginSignInCardWithPorts as waitWithPorts } from '@jini-ai/agent-plugins/connect';

/** The original Tovu entry binds the actual UI and SAME process exchange store. */
export function waitAtAgentPluginSignInCard(required: {
  surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string; pluginDisplayName: string;
  credentialCard?: PluginCredentialCard;
  connect: (input: { signal: AbortSignal; showSignIn: (input: { signInUrl: string }) => Promise<void> }) => Promise<AgentPluginConnectResult>;
}, optional: ToolExecutionOptions = {}): Promise<AgentPluginConnectResult> {
  return waitWithPorts({ ...required, surfaceExchanges: required.surfaces.surfaceExchanges,
    cards: agentPluginCardHost.cards, buildCard: buildAgentPluginConnectCard, toolId: agentPluginCardHost.connect.toolId,
    missingEmitterMessage: 'agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.',
    skippedResult: (): AgentPluginConnectResult => ({ status: 'not-connected', reason: 'cancelled', next: 'The person skipped this sign-in. Continue without this plugin; do not ask them to sign in again unless they request it.' }),
  }, optional);
}
