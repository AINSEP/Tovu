import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from '@jini-ai/core';
import { CREDENTIAL_SAVE_TOOL_ID } from '../../contracts/headless/secret-form-cards.js';
import { CUSTOM_CREDENTIAL_CATEGORIES } from './types.js';

/** Tovu credential kinds delegate to the existing domain authorization and sealed-store owners.
 * Jini owns the secret-card lifecycle; this module only routes non-secret model metadata.
 */
export interface CredentialSaveAdapters {
  readonly apiCreate: ToolHandler;
  readonly apiRotate: ToolHandler;
  readonly mediaProvider: ToolHandler;
  readonly sourceControl: ToolHandler;
  readonly publishHost: ToolHandler;
  readonly agentPluginToken: ToolHandler;
}

const KINDS = ['api', 'media-provider', 'source-control', 'publish-host', 'agent-plugin-token'] as const;
type CredentialKind = typeof KINDS[number];

/** Model input carries non-secret metadata only. Schema additionalProperties is descriptive:
 * selectSave and each domain handler enforce the allowed keys independently, so no model-issued
 * argument can smuggle a token into the human-form path. Creation and rotation have distinct
 * contracts: optional creation hints make a new row; target addresses an existing credential.
 */
export const credentialSaveCatalog: AgentToolDefinition[] = [{
  name: CREDENTIAL_SAVE_TOOL_ID,
  description: 'Save, add, connect or rotate a credential through a secure human form. The person types the API key, token or password in a masked card; it is sealed server-side and never enters chat or model input. This one call waits for submit, cancel, expiry or abandonment. ' +
    'Choose kind: api for any third-party API, Stripe, Mailchimp, DNS registrar or hosting API; media-provider for image/video generation keys; source-control for GitHub/GitLab repository commit and backup tokens; publish-host for static site hosting or S3 storage credentials; agent-plugin-token for an installed plugin personal access token fallback after agent_plugin_connect could not start OAuth sign-in. ' +
    'Examples: create an API credential with {kind:"api",label:"Stripe",baseUrl:"https://api.stripe.com",category:"general"}; rotate a saved API token with {kind:"api",target:"github"} (target is the exact saved label, username is preserved); save an image generation key with {kind:"media-provider",target:"openai"}; connect repository backups with {kind:"source-control",target:"github",label:"default"}; save a hosting connection with {kind:"publish-host",target:"s3",prefill:{bucket:"my-site",region:"us-east-1"}}; use a plugin token with {kind:"agent-plugin-token",target:"supabase"}. ' +
    'Discover targets first with content_read.custom_credential, media_list_providers, source_control_get_capabilities or deployment_get_static_publish_capabilities. API creation accepts optional label/baseUrl/category prefill; without target it creates a new row and refuses a duplicate label. Publish prefill accepts only provider-declared non-secret fields. Never supply a secret in any argument. ' +
    'Permissions stay per kind: custom-credentials.write, admin.integrations.manage (media/plugin), source-control.credentials.write, deployments.credentials.write. Results retain each kind’s safe save status and errors; only API creation returns created/credential. Saving a media key does not verify it or add adapter support. External MCP server config, user creation, database destinations and app environment secrets use their own action tools. After success retry the original request once.',
  sideEffects: 'mutates-durable-state',
  authorization: { permission: 'resolved-per-kind' },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['kind'],
    properties: {
      kind: { type: 'string', enum: [...KINDS] },
      target: { type: 'string', minLength: 1, description: 'Existing API credential label to rotate, media/source-control/publish provider id, or installed plugin id.' },
      label: { type: 'string', description: 'Optional new API or source-control credential label; never a secret.' },
      baseUrl: { type: 'string', description: 'API creation only: non-secret base URL prefill.' },
      category: { type: 'string', enum: [...CUSTOM_CREDENTIAL_CATEGORIES], description: 'API creation only: category prefill.' },
      reason: { type: 'string', maxLength: 1000, description: 'Media only: non-secret reason shown on the form.' },
      prefill: { type: 'object', additionalProperties: { type: 'string' }, description: 'Publish only: provider-declared non-secret credential fields. Never tokens, keys or passwords.' },
    },
  },
}];

export const credentialSaveDerivedRisk: DerivedRiskByToolId = new Map([[CREDENTIAL_SAVE_TOOL_ID, 'mutates-durable-state']]);

/** Select one domain owner without authorizing, opening a card, or inspecting secret fields.
 * @param required - Kind, non-secret metadata and injected domain handlers.
 * @returns The selected handler and its original input contract.
 * @throws ToolInputError for unknown kinds, cross-kind fields or malformed prefill.
 * @complexity Time/space O(k + f), input keys plus publish prefill fields.
 */
function selectSave({ input, adapters }: { input: Record<string, unknown>; adapters: CredentialSaveAdapters }, _optional = {}): { handler: ToolHandler; input: Record<string, unknown> } {
  const kind = requireString({ input, key: 'kind' });
  if (!KINDS.includes(kind as CredentialKind)) throw new ToolInputError({ message: 'Unknown credential kind. Use api, media-provider, source-control, publish-host or agent-plugin-token.' });
  const selectedKind = kind as CredentialKind;
  const { kind: _kind, ...metadata } = input;
  const fields: Record<CredentialKind, readonly string[]> = {
    api: ['target', 'label', 'baseUrl', 'category'],
    'media-provider': ['target', 'reason'],
    'source-control': ['target', 'label'],
    'publish-host': ['target', 'prefill'],
    'agent-plugin-token': ['target'],
  };
  const validateHere = selectedKind === 'publish-host' || (selectedKind === 'api' && !('target' in metadata));
  if (validateHere && Object.keys(metadata).some(key => !fields[selectedKind].includes(key))) {
    // Creation previously ignored unknown hints. Refuse them here; other owners already validate
    // their entire input and retain their exact per-kind errors. Never silently drop an extra key.
    throw new ToolInputError({ message: 'credential_save accepts only non-secret metadata for the selected kind; enter secrets in the human form.' });
  }
  const { target: _target, ...hints } = metadata;
  // Forward the raw target under the owner's field name. Its validation retains the exact
  // per-kind error and ordering; a generic target validator would change both.
  switch (selectedKind) {
    case 'api': {
      if (!('target' in metadata)) return { handler: adapters.apiCreate, input: metadata };
      if ('label' in hints) throw new ToolInputError({ message: 'API token rotation accepts target rather than a creation label.' });
      return { handler: adapters.apiRotate, input: { ...hints, label: metadata.target } };
    }
    case 'media-provider':
    case 'source-control': {
      if ('provider' in hints) throw new ToolInputError({ message: 'Use target for the credential provider.' });
      return { handler: selectedKind === 'media-provider' ? adapters.mediaProvider : adapters.sourceControl, input: { ...hints, provider: metadata.target } };
    }
    case 'agent-plugin-token': {
      if ('pluginId' in hints) throw new ToolInputError({ message: 'Use target for the installed plugin id.' });
      return { handler: adapters.agentPluginToken, input: { ...hints, pluginId: metadata.target } };
    }
    case 'publish-host': {
      // requireInputRecord intentionally accepts arrays; publish prefill requires named fields.
      if (Array.isArray(metadata.prefill)) throw new ToolInputError({ message: 'Credential prefill must be an object.' });
      const prefill = metadata.prefill === undefined ? {} : requireInputRecord({ input: metadata.prefill });
      // Keep the resolved target binding authoritative; provider validation owns all other field names.
      if ('target' in prefill) throw new ToolInputError({ message: 'Credential prefill cannot replace target.' });
      return { handler: adapters.publishHost, input: { ...prefill, target: metadata.target } };
    }
    default: throw new ToolInputError({ message: 'Unknown credential kind.' });
  }
}

/** Register the sole credential save tool through the existing registry, forwarding options intact.
 * @param required - Domain adapters, each retaining its own authorization, validation and save port.
 * @returns One registration; no executable aliases for the retired tools.
 * @example buildCredentialSaveRegistrations({ adapters });
 * @complexity Registration O(1); each invocation performs O(k + f) routing before one domain save.
 */
export function buildCredentialSaveRegistrations({ adapters }: { adapters: CredentialSaveAdapters }, _optional = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: 'credential-save', catalogModule: 'features/custom-credentials/credential-save-tool.ts',
    catalog: indexCatalogById({ catalog: credentialSaveCatalog }), derivedRisk: credentialSaveDerivedRisk,
    handlers: { [CREDENTIAL_SAVE_TOOL_ID]: async (ctx, optional = {}) => {
      const selected = selectSave({ input: requireInputRecord({ input: ctx.input }), adapters });
      return selected.handler({ ...ctx, input: selected.input }, optional);
    } },
  });
}
