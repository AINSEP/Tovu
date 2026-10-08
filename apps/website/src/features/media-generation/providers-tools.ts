import { toolMetadata } from '../../contracts/core/tool-metadata/media-generation.js';
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/secret-form-cards.js";
import { assertCredentialFreeField, CREDENTIAL_MESSAGES, type CredentialTokenHint } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint } from '../../contracts/core/credential-copy.js';
import { resolveOperatorLocale, type OperatorLocaleDeps } from '../agent-plugins/operator-locale.js';
import { type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireNoInput, requireString, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from '@jini-ai/core';
import { IMAGE_MODELS, MEDIA_PROVIDERS, VIDEO_MODELS } from '@jini-ai/integrations/media-providers/catalog';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import type { AuthorizeFn } from '../../contracts/core/commands/index.js';
import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ToolContributor } from '#src/assistant/index';
import { getMediaProviderCredentials, type MediaProviderCredentialRepoPort } from '../media/provider-credential-store.js';
import type { KeyringPort, SecretSealerPort } from '../webhooks/index.js';
import type { AgentToolDefinition } from "@jini-ai/core";
import { saveMediaProviderKey } from './provider-credential-save.js';

/** Native credential setup uses the existing MCP-UI exchange; secrets never enter model input/result. */
interface ProviderView { id: string; label: string; kinds: Array<'image' | 'video'>; integrated: boolean; configured: boolean }
interface ProposalResult { saved: boolean; provider: string; configured: boolean; tokenHint?: CredentialTokenHint | null; message?: string; connection?: "not_tested" }
export interface MediaProviderToolDeps extends OperatorLocaleDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  mediaProviderCredentialRepo: MediaProviderCredentialRepoPort;
  siteAssistantSecretSealer: SecretSealerPort;
  siteAssistantSecretKeyring: KeyringPort;
  clock: Clock;
}

const imageIds = new Set(IMAGE_MODELS.map(model => model.provider));
const videoIds = new Set(VIDEO_MODELS.map(model => model.provider));
const PROVIDERS = MEDIA_PROVIDERS.flatMap(provider => {
  const kinds: Array<'image' | 'video'> = [];
  if (imageIds.has(provider.id)) kinds.push('image');
  if (videoIds.has(provider.id)) kinds.push('video');
  return kinds.length === 0 ? [] : [{ id: provider.id, label: provider.label, integrated: provider.integrated, kinds }];
});

export const mediaProvidersAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: 'media_list_providers',
    description: 'Lists the catalogued image/video generation providers and which have a saved workspace key. Call to inspect media provider setup before generation or opening a credential form. Returns {providers:[{id,label,kinds,integrated,configured}]}; configured means saved key presence, not live verification or adapter support. Never returns keys, prefixes, suffixes or lengths. Uses the same media.read permission and saved credential source as the admin Media providers tab. Does not inspect process environment credentials. Permission denial refuses the call.',
    sideEffects: 'none', authorization: { permission: 'media.read' },
    inputSchema: { type: 'object', additionalProperties: false, required: [], properties: {} },
  },

];
export const mediaProvidersDerivedRisk: DerivedRiskByToolId = new Map([
  // -> getMediaProviderCredentials: marker-only repo read, no decrypt or writes.
  ['media_list_providers', 'none'],
  // -> saveMediaProviderKey -> saveMediaProviderCredentials: seals and writes after human submit.

]);
const CATALOG = indexCatalogById({ catalog: mediaProvidersAgentToolCatalog });

/** Marker-only listing with an explicit safe projection; same saved source as GET /media/providers.
 * @complexity Time/space O(p + s), catalogued providers plus saved rows. No decrypt.
 */
async function listProviders(deps: MediaProviderToolDeps): Promise<{ providers: ProviderView[] }> {
  const stored = await getMediaProviderCredentials({ repo: deps.mediaProviderCredentialRepo }, { workspaceId: deps.workspaceId });
  return { providers: PROVIDERS.map(provider => ({ id: provider.id, label: provider.label, kinds: [...provider.kinds], integrated: provider.integrated, configured: stored[provider.id]?.apiKeyConfigured === true })) };
}

/** Strict non-secret model input; bound provider identity is never taken from the form submission.
 * @throws ToolInputError for unknown fields/providers or a missing interactive channel.
 * @complexity Time O(p + s) before a single store patch; space O(p + s).
 */
export async function saveMediaCredential(required: { ctx: ToolExecutionContext; deps: MediaProviderToolDeps; surfaces: AssistantSurfaceDeps }, optional: ToolExecutionOptions = {}): Promise<ProposalResult> {
  const { ctx, deps, surfaces } = required;
  const raw = requireInputRecord({ input: ctx.input });
  if (Object.keys(raw).some(key => key !== 'provider' && key !== 'reason')) throw new ToolInputError({ message: 'media_propose_provider_credential accepts only provider and reason; enter the key in the human form.' });
  const providerId = requireString({ input: raw, key: 'provider' });
  const provider = PROVIDERS.find(candidate => candidate.id === providerId);
  if (!provider) throw new ToolInputError({ message: 'Unknown media provider. Call media_list_providers for supported provider ids.' });
  const reason = optionalString({ input: raw, key: 'reason' });
  if (reason !== undefined) assertCredentialFreeField({ value: reason, field: "reason" });
  if (reason !== undefined && reason.length > 1000) throw new ToolInputError({ message: 'Credential setup reason must be at most 1000 characters.' });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'admin.integrations.manage' }, { entityType: 'media' });
  const { providers } = await listProviders(deps);
  const configured = providers.find(candidate => candidate.id === providerId)!.configured;
  const locale = await resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: ctx.principal.id });
  const saveFailure = 'Nothing was saved. Check the key and the server credential store, then try again.';
  // Strict non-secret validation and authorization retain their precedence over channel errors.
  const card = defineSecretCardTool<{
    provider: (typeof PROVIDERS)[number]; configured: boolean; reason: string | undefined; locale: string;
  }, Awaited<ReturnType<typeof saveMediaProviderKey>>, ProposalResult>({
    toolId: CREDENTIAL_SAVE_TOOL_ID,
    prepare: async () => ({ provider, configured, reason, locale }),
    form: ({ prep }) => ({
      title: `Connect ${prep.provider.label}`,
      description: prep.reason ?? 'Type the API key directly into this form. The assistant never sees it.',
      submitLabel: 'Save provider key',
      fields: [{ kind: 'string', name: 'apiKey', label: 'API key', secret: true, required: !prep.configured, allowBlank: prep.configured }],
    }),
    save: ({ values, prep, signal }) => {
      const store = deps.mediaProviderCredentialRepo;
      const repo: MediaProviderCredentialRepoPort = {
        listByWorkspaceId: workspaceId => store.listByWorkspaceId(workspaceId),
        upsert: record => store.upsert(record),
        deleteByProviderIds: input => store.deleteByProviderIds(input),
        // The planner runs inside the transaction, after sealing and any lock wait. Abort rolls it back.
        replaceWorkspace: input => store.replaceWorkspace({ ...input, plan: current => {
          signal.throwIfAborted();
          return input.plan(current);
        } }),
      };
      return saveMediaProviderKey({
        deps: { repo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
        workspaceId: deps.workspaceId, provider: prep.provider.id, apiKey: values.apiKey as string,
      });
    },
    result: ({ prep, run }): ProposalResult => {
      const declined: ProposalResult = { saved: false, provider: prep.provider.id, configured: prep.configured };
      if (run.status === 'blank') return { ...declined, message: credentialText({ id: 'blank', locale: prep.locale }) };
      if (run.status === 'failed') return { ...declined, ...(run.safeMessage !== saveFailure ? { message: run.safeMessage } : {}) };
      if (run.status !== 'saved') return declined;
      const hint = formatCredentialHint({ hint: run.saved.tokenHint, locale: prep.locale });
      const unavailable = prep.provider.integrated === false ? ` ${credentialText({ id: 'generationUnavailable', locale: prep.locale })}` : '';
      const message = `${hint ? `${hint}. ` : ''}${credentialText({ id: 'saved', locale: prep.locale })}${unavailable}`;
      return { saved: true, provider: prep.provider.id, configured: run.saved.configured, tokenHint: run.saved.tokenHint, connection: 'not_tested', message };
    },
    // Fixed outcome text cannot echo a submitted key or a raw persistence error.
    outcome: ({ prep, run }) => {
      if (run.status === 'cancelled' || run.status === 'expired' || run.status === 'abandoned') return undefined;
      const saved = run.status === 'saved';
      const hint = saved ? formatCredentialHint({ hint: run.saved.tokenHint, locale: prep.locale }) : '';
      const unavailable = prep.provider.integrated === false ? ` ${credentialText({ id: 'generationUnavailable', locale: prep.locale })}` : '';
      const message = saved ? `${hint ? `${hint}. ` : ''}${credentialText({ id: 'saved', locale: prep.locale })}${unavailable}`
        : run.status === 'blank' ? credentialText({ id: 'blank', locale: prep.locale }) : run.status === 'failed' ? run.safeMessage : saveFailure;
      return { title: saved ? 'Provider key saved' : 'Provider key not saved', state: saved ? 'success' : 'failure', message };
    },
  }, {
    uriHost: 'tovu',
    text: { noEmitter: 'media_propose_provider_credential requires an interactive form channel. Nothing was saved.', saveFailure },
    safeError: err => {
      const id = Object.entries(CREDENTIAL_MESSAGES).find(([, text]) => err instanceof Error && text === err.message)?.[0];
      return id ? credentialText({ id: id as keyof typeof CREDENTIAL_MESSAGES, locale }) : undefined;
    },
    logFailure: metadata => console.warn(JSON.stringify(metadata)),
  });
  return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, optional);
}

/** Wires read-only listing and human credential saves under a distinct contributor domain.
 * @example buildMediaProviderRegistrations(deps, { surfaceExchanges });
 * @complexity Registration time/space O(1); handlers document their own I/O costs.
 */
export function buildMediaProviderRegistrations(deps: MediaProviderToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'media-providers', catalogModule: 'features/media-generation/providers-tools.ts', catalog: CATALOG,
    derivedRisk: mediaProvidersDerivedRisk, handlers: {
      media_list_providers: async ctx => {
        requireNoInput({ input: ctx.input });
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'media.read' }, { entityType: 'media' });
        return listProviders(deps);
      },
    } });
}

/** Composition-root entrypoint; type-only assistant dependency.
 * @example registerToolContributor(contributeMediaProviderTools());
 * @complexity Time/space O(1).
 */
export function contributeMediaProviderTools(): ToolContributor {
  return { domain: 'media-providers', build: buildMediaProviderRegistrations, risk: mediaProvidersDerivedRisk };
}
