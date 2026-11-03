import { SURFACE_DISMISSED_PARAM, type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps, SurfaceExchangeConversation } from '@jini-ai/daemon/surface-exchanges';
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
  const waiting = new AbortController();
  const signal = AbortSignal.any([ctx.signal, waiting.signal]);
  let exchange: SurfaceExchangeConversation | undefined;
  let skipped = false;
  const closeOnAbort = () => exchange?.close({});
  ctx.signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    ctx.signal.throwIfAborted();
    const result = await connect({ signal, showSignIn: async ({ signInUrl }) => {
      if (!optional.emitSurface) throw new Error('agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.');
      ctx.signal.throwIfAborted();
      exchange = surfaces.surfaceExchanges.open({ binding: { toolId: 'agent_plugin_connect', principalId: ctx.principal.id, channel: 'mcp-ui' }, emit: optional.emitSurface });
      // Register before emission: a fast click may answer while the emitter is still awaiting I/O.
      void exchange.receive({}).then(answer => {
        skipped = answer.status === 'received' && answer.params[SURFACE_DISMISSED_PARAM] === true;
        waiting.abort();
      });
      await exchange.send({ emission: { channel: 'mcp-ui', payload: { resource: buildAgentPluginConnectCard({
        pluginId, pluginDisplayName, state: 'waiting', signInUrl, exchangeId: exchange.id, credentialCard,
      }) } } });
    } });
    if (skipped) {
      await sendFinalCard({ exchange, pluginId, pluginDisplayName, state: 'skipped' });
      return { status: 'not-connected', reason: 'cancelled', next: 'The person skipped this sign-in. Continue without this plugin; do not ask them to sign in again unless they request it.' };
    }
    if (result.status === 'connected') await sendFinalCard({ exchange, pluginId, pluginDisplayName, state: 'connected' });
    return result;
  } finally {
    ctx.signal.removeEventListener('abort', closeOnAbort);
    exchange?.close({});
    waiting.abort();
  }
}

/** A human-visible card update failing must never turn a real connection into a tool failure.
 * @complexity O(1), one emission. */
async function sendFinalCard({ exchange, ...spec }: {
  exchange: SurfaceExchangeConversation | undefined; pluginId: string; pluginDisplayName: string; state: 'connected' | 'skipped';
}, _optional = {}): Promise<void> {
  await exchange?.send({ emission: { channel: 'mcp-ui', payload: { resource: buildAgentPluginConnectCard(spec) } } }).catch(() => undefined);
}
