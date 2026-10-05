import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { optionalString, requireInputRecord, requireString } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError, type SurfaceEmission, type ToolExecutionOptions, type ToolExecutionContext } from '@jini-ai/core';
import { buildFormSurface, buildOutcomeSurface, type UIResourceUri } from '@jini-ai/ui/mcp-ui/surfaces';
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceMessage } from '../../contracts/core/tool-surface-exchanges.js';
import { createSourceControlCredential, isSourceControlProviderId, type SourceControlCredentialWriteDeps } from './store.js';
import type { LoadSourceControlProviders, SourceControlProviderDescriptor } from './provider-registry.js';
import type { SourceControlCredentialSummary } from './types.js';
import type { AuthorizeFn } from '../../contracts/core/commands/index.js';

/** Narrow save dependencies; independent of the registration module to avoid a type-import cycle.
 * `loadSourceControlProviders` is required: the composition root (`tool-registrations.ts`) resolves the
 * installed-plugins default, so this module never reads a workspace it was not handed. */
export interface SourceControlCredentialSetupDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  sourceControlCredentialSetRepo: SourceControlCredentialWriteDeps['repo'];
  siteAssistantSecretSealer: SourceControlCredentialWriteDeps['sealer'];
  siteAssistantSecretKeyring: SourceControlCredentialWriteDeps['keyring'];
  clock: SourceControlCredentialWriteDeps['clock'];
  idGen: SourceControlCredentialWriteDeps['idGen'];
  fetchFn?: SourceControlCredentialWriteDeps['fetchFn'];
  observability?: SourceControlCredentialWriteDeps['observability'];
  loadSourceControlProviders: LoadSourceControlProviders;
}

/** Human-only credential setup; model inputs/results never carry connection fields or raw errors. */
const SOURCE_CONTROL_PROPOSE_CREDENTIAL_TOOL_ID = "source_control_propose_credential";
interface ProposalResult { saved: boolean; credentialId: string | null; provider: string; label: string }
interface SubmissionContext { deps: SourceControlCredentialSetupDeps; descriptor: SourceControlProviderDescriptor; label: string; exchangeId: string }

/** Renders a value-free save outcome on the form's URI. @complexity Time/space O(1). */
function outcome(exchangeId: string, saved: boolean): SurfaceEmission {
  return { channel: 'mcp-ui', payload: { resource: buildOutcomeSurface({
    uri: `ui://tovu/source-control-credential/${exchangeId}` as UIResourceUri,
    title: saved ? 'Credential saved' : 'Credential not saved', state: saved ? 'success' : 'failure',
    message: saved ? 'The connection was saved. The assistant never sees its secret.' : 'Nothing was saved. Check the form fields and the server credential store, then try again.',
  }) } };
}

/** Saves only provider-declared fields through the admin POST's existing store function.
 * Returns an explicit safe projection; errors may quote secrets and are never forwarded.
 * @complexity Time O(f + c), declared fields plus saved credentials; space O(f).
 */
async function handleSubmission(answer: SurfaceMessage, spec: SubmissionContext): Promise<{ result: ProposalResult; outcome?: SurfaceEmission }> {
  const { deps, descriptor, label, exchangeId } = spec;
  const declined: ProposalResult = { saved: false, credentialId: null, provider: descriptor.id, label };
  if (answer.status !== 'received' || answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: declined };
  const connection: Record<string, unknown> = { providerId: descriptor.id };
  for (const field of descriptor.credential!.fields) connection[field.name] = answer.params[field.name];
  let credential: SourceControlCredentialSummary;
  try {
    credential = await createSourceControlCredential({
      repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen,
      loadSourceControlProviders: deps.loadSourceControlProviders,
      ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
      observability: deps.observability,
    }, { workspaceId: deps.workspaceId, label: answer.params.label, connection });
  } catch {
    // Fixed metadata only: neither an exception's text nor a submitted value is safe to log.
    console.warn(JSON.stringify({ service: 'source-control', operation: SOURCE_CONTROL_PROPOSE_CREDENTIAL_TOOL_ID, exchangeId, saved: false }));
    return { result: declined, outcome: outcome(exchangeId, false) };
  }
  return { result: { saved: true, credentialId: credential.id, provider: descriptor.id, label: credential.label }, outcome: outcome(exchangeId, true) };
}

/** Opens the registry-defined human form and parks this tool call until answered or aborted.
 * @param spec - Tool context, explicit store dependencies and the shared exchange store.
 * @example await proposeSourceControlCredential({ ctx, deps, surfaces });
 * @returns Safe save status; throws ToolInputError for invalid model input or absent form channel.
 * @complexity Time O(p + f) provider/field count before one existing credential save; space O(f).
 */
export async function proposeSourceControlCredential(spec: { ctx: ToolExecutionContext; deps: SourceControlCredentialSetupDeps; surfaces: AssistantSurfaceDeps }, optional: ToolExecutionOptions = {}): Promise<ProposalResult> {
  const { ctx, deps, surfaces } = spec;
  const raw = requireInputRecord({ input: ctx.input });
  if (Object.keys(raw).some(key => key !== 'provider' && key !== 'label')) {
    throw new ToolInputError({ message: 'source_control_propose_credential accepts only provider and label; enter secrets in the human form.' });
  }
  const provider = requireString({ input: raw, key: 'provider' });
  const label = optionalString({ input: raw, key: 'label' }) ?? 'default';
  if (label.length > 200) throw new ToolInputError({ message: 'Credential label must be at most 200 characters.' });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'source-control.credentials.write' }, { entityType: 'source-control' });
  const declined: ProposalResult = { saved: false, credentialId: null, provider, label };
  if (ctx.signal.aborted) return declined;
  const registry = await deps.loadSourceControlProviders(deps.workspaceId);
  const descriptor = registry.get(provider)?.descriptor;
  if (!isSourceControlProviderId(provider) || !descriptor?.credential) {
    throw new ToolInputError({ message: 'No enabled source control provider declares this credential form. Call source_control_get_capabilities for available hosts.' });
  }
  if (ctx.signal.aborted) return declined;
  if (!optional.emitSurface) throw new ToolInputError({ message: 'source_control_propose_credential requires an interactive form channel. Nothing was saved.' });
  const exchange = surfaces.surfaceExchanges.open({ toolId: SOURCE_CONTROL_PROPOSE_CREDENTIAL_TOOL_ID, principalId: ctx.principal.id }, optional.emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    const resource = buildFormSurface({
      uri: `ui://tovu/source-control-credential/${exchange.id}` as UIResourceUri,
      title: `Connect ${descriptor.label}`, description: descriptor.credential.help ?? 'Type the secret here. The assistant never sees it.',
      submitLabel: 'Save credential', toolName: SOURCE_CONTROL_PROPOSE_CREDENTIAL_TOOL_ID, baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
      fields: [{ kind: 'string', name: 'label', label: 'Label', required: true, value: label },
        ...descriptor.credential.fields.map(field => ({ kind: 'string' as const, name: field.name, label: field.label, required: field.required, ...(field.secret ? { secret: true } : {}) }))],
      cancel: { label: 'Cancel', toolName: SOURCE_CONTROL_PROPOSE_CREDENTIAL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
    });
    return await askThenReport(exchange, { channel: 'mcp-ui', payload: { resource } }, answer => handleSubmission(answer, { deps, descriptor, label, exchangeId: exchange.id }));
  } finally {
    ctx.signal.removeEventListener('abort', closeOnAbort);
    exchange.close();
  }
}
