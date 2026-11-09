/** Tovu compatibility shim (A10 seam). The portable waiter lives in `./portable/connect-sign-in-wait.ts`
 * (generic over the card `Resource` and the connect result); these entries keep their signatures and
 * bind Tovu's UI, card identity, SAME process exchange store and missing-emitter/skip copy. */
import { agentPluginCardHost } from './card-host-bindings.js';
import type { AgentPluginCardsPort } from './service-ports.js';
import type { SurfaceCardSecretDeps } from '@jini-ai/core/contracts/cards';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginCredentialCard } from '@jini-ai/core/contracts/credentials';
import { buildAgentPluginConnectCard, type AgentPluginConnectCardSpec } from './connect-card-ui.js';
import { waitAtAgentPluginSignInCardWithPorts as waitWithPorts } from './portable/connect-sign-in-wait.js';
import type { AgentPluginConnectResult } from './connect-tool.js';

/** Old seam signature (connect result fixed to Tovu's `AgentPluginConnectResult`). */
export function waitAtAgentPluginSignInCardWithPorts<Resource>(required: {
  surfaceExchanges: SurfaceCardSecretDeps['surfaceExchanges']; cards: AgentPluginCardsPort<Resource>;
  buildCard: (spec: AgentPluginConnectCardSpec) => Resource; toolId: string; missingEmitterMessage: string; skippedResult: () => AgentPluginConnectResult; ctx: ToolExecutionContext; pluginId: string; pluginDisplayName: string;
  credentialCard?: PluginCredentialCard;
  connect: (input: { signal: AbortSignal; showSignIn: (input: { signInUrl: string }) => Promise<void> }) => Promise<AgentPluginConnectResult>;
}, optional: ToolExecutionOptions = {}): Promise<AgentPluginConnectResult> {
  return waitWithPorts<Resource, AgentPluginConnectResult>(required, optional);
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
