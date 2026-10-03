import { type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireNoInput, requireString, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError, type SurfaceEmission, type ToolExecutionOptions, type ToolExecutionContext } from '@jini-ai/core';
import { IMAGE_MODELS, MEDIA_PROVIDERS, VIDEO_MODELS } from '@jini-ai/integrations/media-providers/catalog';
import { buildFormSurface, buildOutcomeSurface, type UIResourceUri } from '@jini-ai/ui/mcp-ui/surfaces';
import type { AuthorizeFn } from '../../contracts/core/commands/index.js';
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceMessage } from '../../contracts/core/tool-surface-exchanges.js';
import type { ToolContributor } from '#src/assistant/index';
import { getMediaProviderCredentials, type MediaProviderCredentialRepoPort } from '../media/provider-credential-store.js';
import type { KeyringPort, SecretSealerPort } from '../webhooks/index.js';
import type { AgentToolDefinition } from "@jini-ai/core";
import { saveMediaProviderKey } from './provider-credential-save.js';

/** Native credential setup uses the existing MCP-UI exchange; secrets never enter model input/result. */
interface ProviderView { id: string; label: string; kinds: Array<'image' | 'video'>; configured: boolean }
interface ProposalResult { saved: boolean; provider: string; configured: boolean }
export interface MediaProviderToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  mediaProviderCredentialRepo: MediaProviderCredentialRepoPort;
  siteAssistantSecretSealer: SecretSealerPort;
  siteAssistantSecretKeyring: KeyringPort;
  clock: Clock;
}
const MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID = "media_propose_provider_credential";
const imageIds = new Set(IMAGE_MODELS.map(model => model.provider));
const videoIds = new Set(VIDEO_MODELS.map(model => model.provider));
const PROVIDERS = MEDIA_PROVIDERS.flatMap(provider => {
  const kinds: Array<'image' | 'video'> = [];
  if (imageIds.has(provider.id)) kinds.push('image');
  if (videoIds.has(provider.id)) kinds.push('video');
  return kinds.length === 0 ? [] : [{ id: provider.id, label: provider.label, kinds }];
});

export const mediaProvidersAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: 'media_list_providers',
    description: 'Lists the catalogued image/video generation providers and which have a saved workspace key. Call to inspect media provider setup before generation or opening a credential form. Returns {providers:[{id,label,kinds,configured}]}; configured means saved key presence, not live verification or adapter support. Never returns keys, prefixes, suffixes or lengths. Uses the same media.read permission and saved credential source as the admin Media providers tab. Does not inspect process environment credentials. Permission denial refuses the call.',
    sideEffects: 'none', authorization: { permission: 'media.read' },
    inputSchema: { type: 'object', additionalProperties: false, required: [], properties: {} },
  },
  {
    name: MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID,
    description: 'Opens a human form to save or rotate an image/video provider API key. Call when generation needs a missing provider credential; use media_list_providers for ids. Supply only provider and optional reason, never a key. The person types the key into a masked form and the server seals it; this call waits for submit/cancel and returns {saved,provider,configured} without any secret or key fragment. Preserves other providers and existing base URL/model settings. Invalid input, permission denial or absent interactive channel refuses the call; cancelled, expired or failed saves return saved:false. Does not verify a key with the vendor or enable an unimplemented adapter.',
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.integrations.manage' },
    inputSchema: { type: 'object', additionalProperties: false, required: ['provider'], properties: {
      provider: { type: 'string', enum: PROVIDERS.map(provider => provider.id) },
      reason: { type: 'string', maxLength: 1000, description: 'Optional non-secret reason shown beside the form.' },
    } },
  },
];
export const mediaProvidersDerivedRisk: DerivedRiskByToolId = new Map([
  // -> getMediaProviderCredentials: marker-only repo read, no decrypt or writes.
  ['media_list_providers', 'none'],
  // -> saveMediaProviderKey -> saveMediaProviderCredentials: seals and writes after human submit.
  [MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID, 'mutates-durable-state'],
]);
const CATALOG = indexCatalogById({ catalog: mediaProvidersAgentToolCatalog });

/** Marker-only listing with an explicit safe projection; same saved source as GET /media/providers.
 * @complexity Time/space O(p + s), catalogued providers plus saved rows. No decrypt.
 */
async function listProviders(deps: MediaProviderToolDeps): Promise<{ providers: ProviderView[] }> {
  const stored = await getMediaProviderCredentials({ repo: deps.mediaProviderCredentialRepo }, { workspaceId: deps.workspaceId });
  return { providers: PROVIDERS.map(provider => ({ id: provider.id, label: provider.label, kinds: [...provider.kinds], configured: stored[provider.id]?.apiKeyConfigured === true })) };
}

/** Fixed outcome text cannot echo a submitted key or a raw persistence error. @complexity Time/space O(1). */
function outcome(exchangeId: string, saved: boolean): SurfaceEmission {
  return { channel: 'mcp-ui', payload: { resource: buildOutcomeSurface({
    uri: `ui://tovu/media-provider-credential/${exchangeId}` as UIResourceUri,
    title: saved ? 'Provider key saved' : 'Provider key not saved', state: saved ? 'success' : 'failure',
    message: saved ? 'The provider key was saved. The assistant never sees it.' : 'Nothing was saved. Check the key and the server credential store, then try again.',
  }) } };
}

/** Validates a human key, saves via the shared store and returns only fixed safe fields.
 * @complexity Time/space O(n) for the catalogue-bounded store patch; no provider network call.
 */
async function handleSubmission(answer: SurfaceMessage, spec: { deps: MediaProviderToolDeps; provider: string; exchangeId: string; configured: boolean }): Promise<{ result: ProposalResult; outcome?: SurfaceEmission }> {
  const { deps, provider, exchangeId, configured } = spec;
  const declined: ProposalResult = { saved: false, provider, configured };
  if (answer.status !== 'received' || answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: declined };
  const key = answer.params.apiKey;
  if (typeof key !== 'string' || key.trim() === '') return { result: declined, outcome: outcome(exchangeId, false) };
  let saved: { configured: boolean };
  try {
    saved = await saveMediaProviderKey({
      deps: { repo: deps.mediaProviderCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
      workspaceId: deps.workspaceId, provider, apiKey: key,
    });
  } catch {
    console.warn(JSON.stringify({ service: 'media-providers', operation: MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID, exchangeId, saved: false }));
    return { result: declined, outcome: outcome(exchangeId, false) };
  }
  return { result: { saved: true, provider, configured: saved.configured }, outcome: outcome(exchangeId, true) };
}

/** Strict non-secret model input; bound provider identity is never taken from the form submission.
 * @throws ToolInputError for unknown fields/providers or a missing interactive channel.
 * @complexity Time O(p + s) before a single store patch; space O(p + s).
 */
async function proposeCredential(ctx: ToolExecutionContext, deps: MediaProviderToolDeps, surfaces: AssistantSurfaceDeps, optional: ToolExecutionOptions = {}): Promise<ProposalResult> {
  const raw = requireInputRecord({ input: ctx.input });
  if (Object.keys(raw).some(key => key !== 'provider' && key !== 'reason')) throw new ToolInputError({ message: 'media_propose_provider_credential accepts only provider and reason; enter the key in the human form.' });
  const providerId = requireString({ input: raw, key: 'provider' });
  const provider = PROVIDERS.find(candidate => candidate.id === providerId);
  if (!provider) throw new ToolInputError({ message: 'Unknown media provider. Call media_list_providers for supported provider ids.' });
  const reason = optionalString({ input: raw, key: 'reason' });
  if (reason !== undefined && reason.length > 1000) throw new ToolInputError({ message: 'Credential setup reason must be at most 1000 characters.' });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'admin.integrations.manage' }, { entityType: 'media' });
  const { providers } = await listProviders(deps);
  const configured = providers.find(candidate => candidate.id === providerId)!.configured;
  const declined: ProposalResult = { saved: false, provider: providerId, configured };
  if (ctx.signal.aborted) return declined;
  if (!optional.emitSurface) throw new ToolInputError({ message: 'media_propose_provider_credential requires an interactive form channel. Nothing was saved.' });
  const exchange = surfaces.surfaceExchanges.open({ toolId: MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID, principalId: ctx.principal.id }, optional.emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    const resource = buildFormSurface({
      uri: `ui://tovu/media-provider-credential/${exchange.id}` as UIResourceUri, title: `Connect ${provider.label}`,
      description: reason ?? 'Type the API key directly into this form. The assistant never sees it.',
      submitLabel: 'Save provider key', toolName: MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID, baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
      fields: [{ kind: 'string', name: 'apiKey', label: 'API key', secret: true, required: true }],
      cancel: { label: 'Cancel', toolName: MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
    });
    return await askThenReport(exchange, { channel: 'mcp-ui', payload: { resource } }, answer => handleSubmission(answer, { deps, provider: providerId, configured, exchangeId: exchange.id }));
  } finally {
    ctx.signal.removeEventListener('abort', closeOnAbort);
    exchange.close();
  }
}

/** Wires read-only listing and human credential saves under a distinct contributor domain.
 * @example buildMediaProviderRegistrations(deps, { surfaceExchanges });
 * @complexity Registration time/space O(1); handlers document their own I/O costs.
 */
export function buildMediaProviderRegistrations(deps: MediaProviderToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildDomainRegistrations({ domain: 'media-providers', catalogModule: 'features/media-generation/providers-tools.ts', catalog: CATALOG,
    derivedRisk: mediaProvidersDerivedRisk, handlers: {
      media_list_providers: async ctx => {
        requireNoInput({ input: ctx.input });
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'media.read' }, { entityType: 'media' });
        return listProviders(deps);
      },
      [MEDIA_PROPOSE_PROVIDER_CREDENTIAL_TOOL_ID]: (ctx, optional = {}) => proposeCredential(ctx, deps, surfaces, optional),
    } });
}

/** Composition-root entrypoint; type-only assistant dependency.
 * @example registerToolContributor(contributeMediaProviderTools());
 * @complexity Time/space O(1).
 */
export function contributeMediaProviderTools(): ToolContributor {
  return { domain: 'media-providers', build: buildMediaProviderRegistrations, risk: mediaProvidersDerivedRisk };
}
