import { adaptLegacyAuthorize, buildDomainRegistrations, indexCatalogById, requireToolPermission, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, ToolInputError,
  type AgentToolDefinition, type DerivedRiskByToolId, type LegacyToolAuthorizeFn, type SurfaceExchangeStore, type ToolExecutionContext, type ToolExecutionOptions, type ToolHandler, type ToolRegistration } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/cms/core';
import type { InstanceAuthorizeFn } from '@jini-ai/core/gated-mutations';
import type { SurfaceCardUri } from '@jini-ai/core/contracts/cards';
import { askThenReport, type AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { buildFormSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import type { ProjectKeysPort } from '../project-keys/service.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';
import type { CredentialCopyProjectKeysPort, CredentialCopyToolHost } from './credential-tool-host.js';
import { tovuCredentialCardIdentity } from './tovu-credential-card-identity.js';

export const CREDENTIAL_COPY_TOOL_ID = 'credential_copy_from_project';
const NEW_KEY = ':new-key';

/** Trusted host ports: the owner inventory is rendered only inside the principal-bound card. */
export interface CredentialCopyToolDeps {
  readonly workspaceId: string;
  readonly ownerPrincipalId: Promise<string>;
  readonly authorize: AuthorizeFn;
  readonly gatedMutations: { gatewayDeps: { authorizeInstance?: InstanceAuthorizeFn } };
  readonly projectKeys?: ProjectKeysPort;
}
export const catalog: AgentToolDefinition[] = [{ name: CREDENTIAL_COPY_TOOL_ID,
  description: 'Use a saved key or OAuth connection on this site. Opens the owner-only Shared Keys picker and one approval card. ' +
    'No key is copied. Choose Enter a new key to open the normal secure key card. ' +
    'Accepts no selections, site identity or secrets from the model; returns only the approved credentialId.',
  sideEffects: 'mutates-durable-state', authorization: { permission: 'system.write' },
  inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];
export const credentialCopyDerivedRisk: DerivedRiskByToolId = new Map([[CREDENTIAL_COPY_TOOL_ID, 'mutates-durable-state']]);

/** Tovu's saved-key card: its ids, paths, words, and the actual surface helpers. */
const TOVU_CREDENTIAL_COPY_HOST: CredentialCopyToolHost = {
  vocabulary: { toolId: CREDENTIAL_COPY_TOOL_ID, domain: 'credential-copy', catalogModule: 'features/custom-credentials/credential-copy-tool.ts',
    ownerPermission: 'system.write', newKeyValue: NEW_KEY, cardPath: 'use-saved-key' },
  cardIdentity: tovuCredentialCardIdentity, catalog, metadata: toolMetadata, derivedRisk: credentialCopyDerivedRisk,
  messages: {
    ownerOnly: 'Use the installation owner’s session to choose a saved key.',
    instanceRefused: 'Using saved keys is not allowed for this session. Sign in as the installation owner.',
    unexpectedField: 'Choose one saved key in this card. No site identity or secret can be submitted.',
    notOffered: 'This saved key is no longer offered. Open Use a saved key again.',
    inputNotEmpty: 'Use a saved key accepts only {}. Choose the key in the human card.',
    keysUnavailable: 'Shared Keys could not open. Open the normal key card to save a key for this site.',
    needsInteractive: 'Using a saved key requires an interactive confirmation channel. Open this action in chat.',
    cardTitle: 'Use a saved key or connection on this site', siteLabel: 'Site', siteFallback: 'This site',
    cardDescription: 'Nothing is copied. This site can use only the one you choose.',
    fieldLabel: 'Shared Keys', fieldPlaceholder: 'Choose a key', newKeyLabel: 'Enter a new key',
    submitLabel: 'Use this key', cancelLabel: 'Cancel',
  },
  protocol: { askThenReport, buildFormSurface },
};

/**
 * What the saved-key card needs from its host, besides the host inputs.
 * @agent-note `authorize` and `authorizeInstance` are re-asked after the human answers; a session that
 *   lost the permission while the card was open is refused. `ownerPrincipalId` is the only principal
 *   that may see the inventory.
 */
export interface CredentialCopyRequired {
  readonly workspaceId: string;
  readonly ownerPrincipalId: Promise<string>;
  readonly authorize: LegacyToolAuthorizeFn;
  readonly gatedMutations: { gatewayDeps: { authorizeInstance?: InstanceAuthorizeFn } };
  readonly projectKeys?: CredentialCopyProjectKeysPort;
}

/** Require the installation owner's current permissions before inventory and again before grant.
 * @throws ToolInputError for non-owner sessions; RBAC errors propagate without secrets.
 * @complexity O(1), two admission calls per card/open or submission.
 */
async function admit({ deps, host, principalId, permission = host.vocabulary.ownerPermission }: {
  deps: CredentialCopyRequired; host: CredentialCopyToolHost; principalId: string; permission?: string;
}): Promise<void> {
  const owner = host.vocabulary.ownerPermission;
  if (principalId !== await deps.ownerPrincipalId) throw new ToolInputError({ message: host.messages.ownerOnly });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId, permission: owner });
  if (permission !== owner) await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId, permission });
  const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
  if (instance && !(await instance({ principalId, permission })).allowed) {
    throw new ToolInputError({ message: host.messages.instanceRefused });
  }
}

/** Only an offered id can be approved; submitted site ids or other fields cannot widen the grant. */
function selectedKey<Row extends { readonly keyId: string }>({ params, rows, host }: { params: Record<string, unknown>; rows: readonly Row[]; host: CredentialCopyToolHost }): Row | 'new' {
  if (Object.keys(params).some(key => !['credentialId', SURFACE_EXCHANGE_ID_PARAM].includes(key))) {
    throw new ToolInputError({ message: host.messages.unexpectedField });
  }
  if (params.credentialId === host.vocabulary.newKeyValue) return 'new';
  const row = rows.find(row => row.keyId === params.credentialId);
  if (!row) throw new ToolInputError({ message: host.messages.notOffered });
  return row;
}

/** Selection and secrets come only from the human card, never model arguments. */
function validateInput({ input, host }: { input: unknown; host: CredentialCopyToolHost }): void {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
    throw new ToolInputError({ message: host.messages.inputNotEmpty });
  }
}

/** The fallback uses the normal secret card and the same successful-save attachment owner. */
async function normalKeyCard({ ctx, options, deps, host, saveNew }: {
  ctx: ToolExecutionContext; options: ToolExecutionOptions; deps: CredentialCopyRequired; host: CredentialCopyToolHost; saveNew: ToolHandler;
}): Promise<unknown> {
  const result = await saveNew({ ...ctx, input: {} }, options);
  ctx.signal.throwIfAborted();
  await admit({ deps, host, principalId: ctx.principal.id });
  return deps.projectKeys ? deps.projectKeys.savedResult({ result }) : result;
}

/** One human card selects and approves a CMS site grant. Jini owns actor binding, expiry and replay
 * protection. The site is captured by the project-keys port at host composition, never by submitted input.
 * @returns Only the approved reference, or a cancellation result; no owner inventory reaches chat.
 * @complexity O(k) card metadata, k capped by the owner inventory; one grant transaction per approval.
 * @agent-note Every id, permission, URI part, app and sentence comes from `host`; there is no default.
 *   The exchange is opened in `surfaces.surfaceExchanges`, which must be the store the answer route uses.
 *   A new key goes through `saveNew` (the host's normal secret card); keystrokes never reach this tool.
 */
export function createCredentialCopyRegistrations({ deps, surfaces, host }: {
  deps: CredentialCopyRequired; surfaces: { readonly surfaceExchanges: SurfaceExchangeStore }; host: CredentialCopyToolHost;
}, { saveNew }: { saveNew?: ToolHandler } = {}): ToolRegistration[] {
  const { toolId } = host.vocabulary;
  return buildDomainRegistrations({ metadata: host.metadata, domain: host.vocabulary.domain,
    catalogModule: host.vocabulary.catalogModule, catalog: indexCatalogById({ catalog: host.catalog }),
    derivedRisk: host.derivedRisk, handlers: { [toolId]: async (ctx, options = {}) => {
      validateInput({ input: ctx.input, host });
      await admit({ deps, host, principalId: ctx.principal.id });
      ctx.signal.throwIfAborted();
      const projectKeys = deps.projectKeys;
      if (!projectKeys) {
        if (saveNew) return normalKeyCard({ ctx, options, deps, host, saveNew });
        throw new ToolInputError({ message: host.messages.keysUnavailable });
      }
      if (!options.emitSurface) throw new ToolInputError({ message: host.messages.needsInteractive });
      const rows = await projectKeys.list({});
      const exchange = surfaces.surfaceExchanges.open({ binding: { toolId, principalId: ctx.principal.id, channel: 'mcp-ui' }, emit: options.emitSurface });
      const uri: SurfaceCardUri = `ui://${host.cardIdentity.uriNamespace}/${host.vocabulary.cardPath}/${exchange.id}`;
      const abort = () => exchange.close({});
      ctx.signal.addEventListener('abort', abort, { once: true });
      if (ctx.signal.aborted) abort();
      try {
        const { messages } = host;
        const result = await host.protocol.askThenReport<{ granted: boolean; credentialId?: string; newKey?: boolean }>({ exchange,
          confirmationEmission: { channel: 'mcp-ui', payload: { resource: host.protocol.buildFormSurface({ uri,
            title: messages.cardTitle, details: [{ label: messages.siteLabel, value: projectKeys.site?.name ?? messages.siteFallback }], description: messages.cardDescription,
            fields: [{ kind: 'enum', name: 'credentialId', label: messages.fieldLabel, required: true, placeholder: messages.fieldPlaceholder,
              options: [...rows.map(row => ({ value: row.keyId, label: row.name })), { value: host.vocabulary.newKeyValue, label: messages.newKeyLabel }] }],
            // Keys and OAuth accounts stay in the owner store; shared OAuth keeps its original sign-in account and client.
            // The label fits both a saved key and Enter a new key, which goes on to the normal key card.
            // Start compact; Jini's shared bridge fits the body on load and content changes.
            preferredFrameSize: ['100%', '1px'],
            submitLabel: messages.submitLabel, toolName: toolId,
            baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
            cancel: { label: messages.cancelLabel, toolName: toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
          }) } },
          handle: async answer => {
            if (answer.status !== 'received' || answer.params[SURFACE_DISMISSED_PARAM] === true || ctx.signal.aborted) return { result: { granted: false } };
            const row = selectedKey({ params: answer.params, rows, host });
            if (row === 'new') {
              await admit({ deps, host, principalId: ctx.principal.id });
              return { result: { granted: false, newKey: true } };
            }
            await admit({ deps, host, principalId: ctx.principal.id, permission: await projectKeys.permissionFor({ keyId: row.keyId }) });
            ctx.signal.throwIfAborted();
            // Re-resolution inside use refuses entries deleted while the person was reading the card.
            await projectKeys.use({ keyId: row.keyId, use: true });
            return { result: { granted: true, credentialId: row.keyId } };
          } });
        if (result.newKey && saveNew) return normalKeyCard({ ctx, options, deps, host, saveNew });
        return result;
      } finally { ctx.signal.removeEventListener('abort', abort); exchange.close({}); }
    } } });
}

/** Tovu's old entry: the same registrations, bound to Tovu's saved-key card host inputs. */
export function buildCredentialCopyRegistrations({ deps, surfaces, saveNew }: {
  deps: CredentialCopyToolDeps; surfaces: AssistantSurfaceDeps; saveNew?: ToolHandler;
}, _optional = {}): ToolRegistration[] {
  return createCredentialCopyRegistrations({ deps, surfaces, host: TOVU_CREDENTIAL_COPY_HOST }, saveNew ? { saveNew } : {});
}
