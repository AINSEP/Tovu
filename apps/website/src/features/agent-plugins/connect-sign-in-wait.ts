import { waitAtSignInCard } from '@jini-ai/ui/mcp-ui/sign-in-card';
import { type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginCredentialCard } from '../../contracts/core/plugin-credential-card.js';
import { buildAgentPluginConnectCard } from './connect-card-ui.js';
import type { AgentPluginConnectResult } from './connect-tool.js';

/** The plugin's MCP and API sign-ins share one card/exchange lifecycle. Skip cancels only the
 * sign-in watcher; the enclosing agent run continues. OAuth callback/token custody stays with
 * each connection owner. @complexity One bounded connection wait and one exchange per sign-in. */
export async function waitAtAgentPluginSignInCard(required: {
  surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string; pluginDisplayName: string;
  credentialCard?: PluginCredentialCard;
  connect: (input: { signal: AbortSignal; showSignIn: (input: { signInUrl: string }) => Promise<void> }) => Promise<AgentPluginConnectResult>;
}, optional: ToolExecutionOptions = {}): Promise<AgentPluginConnectResult> {
  const { surfaces, ctx, pluginId, pluginDisplayName, credentialCard, connect } = required;
  return waitAtSignInCard({
    surfaceExchanges: surfaces.surfaceExchanges, ctx, toolId: 'agent_plugin_connect', connect,
    card: state => buildAgentPluginConnectCard({ pluginId, pluginDisplayName, credentialCard, ...state }),
    missingEmitterMessage: 'agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.',
    skippedResult: () => ({ status: 'not-connected', reason: 'cancelled', next: 'The person skipped this sign-in. Continue without this plugin; do not ask them to sign in again unless they request it.' }),
  }, optional);
}
