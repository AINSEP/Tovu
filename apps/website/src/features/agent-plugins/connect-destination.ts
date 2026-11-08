import { ToolInputError, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { SurfaceAskThenReport } from '@jini-ai/core';
import type { AgentPluginCardBuilders } from './service-ports.js';
import { agentPluginCardHost } from './card-host-bindings.js';

type Destination = 'site' | 'shared';

/** Only the current human exchange can select the shared destination. */
function selectedDestination(params: Record<string, unknown>): Destination {
  if (Object.keys(params).some(key => !['destination', SURFACE_EXCHANGE_ID_PARAM].includes(key))
    || (params.destination !== 'site' && params.destination !== 'shared')) {
    throw new ToolInputError({ message: 'Choose where to save this connection in its sign-in card. No site identity or credential can be submitted.' });
  }
  return params.destination as Destination;
}

/** Ask before sign-in, so a shared credential is issued directly into owner storage.
 * The host supplies availability only for the installation owner; cancellation starts no flow.
 * @returns Explicit destination, or null on cancellation/expiry/abort.
 * @complexity O(1), one bounded principal-bound human exchange; no storage or provider I/O.
 */
export async function chooseApiConnectionDestinationWithPorts<Resource>(required: {
  readonly cards: AgentPluginCardBuilders<Resource>; readonly askThenReport: SurfaceAskThenReport; readonly uriNamespace: string; readonly toolId: string;
  readonly surfaces: AssistantSurfaceDeps; readonly ctx: ToolExecutionContext;
  readonly pluginDisplayName: string; readonly available: boolean;
}, optional: ToolExecutionOptions = {}): Promise<Destination | null> {
  if (!required.available) return 'site';
  if (!optional.emitSurface) throw new ToolInputError({ message: 'Choosing where to save a connection requires the interactive sign-in card. Open this action in chat.' });
  const { ctx } = required;
  ctx.signal.throwIfAborted();
  const exchange = required.surfaces.surfaceExchanges.open({ binding: { toolId: required.toolId, principalId: ctx.principal.id, channel: 'mcp-ui' }, emit: optional.emitSurface });
  const close = () => exchange.close({});
  ctx.signal.addEventListener('abort', close, { once: true });
  try {
    return await required.askThenReport<Destination | null>({ exchange,
      confirmationEmission: { channel: 'mcp-ui', payload: { resource: required.cards.buildFormSurface({
        uri: `ui://${required.uriNamespace}/${exchange.id}`, title: `Connect ${required.pluginDisplayName}`,
        description: 'Keep this sign-in on this site, or save a shared connection on this Mac. Other sites need your separate approval to use it. Existing local connections stay independent.',
        fields: [{ kind: 'enum', name: 'destination', label: 'Save this connection', required: true, options: [
          { value: 'site', label: 'Use only on this site' }, { value: 'shared', label: 'Save this connection on this Mac' },
        ] }], submitLabel: 'Continue to sign in', toolName: required.toolId, preferredFrameSize: ['100%', '1px'],
        baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
        cancel: { label: 'Cancel', toolName: required.toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
      }) } },
      handle: async answer => ({ result: answer.status !== 'received' || answer.params[SURFACE_DISMISSED_PARAM] === true || ctx.signal.aborted
        ? null : selectedDestination(answer.params) }),
    });
  } finally { ctx.signal.removeEventListener('abort', close); exchange.close({}); }
}

/** Existing host entry supplies the same UI, namespace and exchange helper. */
export function chooseApiConnectionDestination(required: { readonly surfaces: AssistantSurfaceDeps; readonly ctx: ToolExecutionContext; readonly pluginDisplayName: string; readonly available: boolean }, optional: ToolExecutionOptions = {}): Promise<Destination | null> {
  return chooseApiConnectionDestinationWithPorts({ ...required, cards: agentPluginCardHost.cards, askThenReport: agentPluginCardHost.askThenReport, ...agentPluginCardHost.destination }, optional);
}
