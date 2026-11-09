import { buildDomainRegistrations, indexCatalogById, ToolInputError,
  type AgentToolDefinition, type DerivedRiskByToolId, type ToolExecutionContext, type ToolExecutionOptions, type ToolHandler, type ToolRegistration } from '@jini-ai/core';
import { requireToolPermission, adaptLegacyAuthorize, type AuthorizeFn } from '@jini-ai/cms/core';
import type { InstanceAuthorizeFn } from '@jini-ai/core/gated-mutations';
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { buildFormSurface, type UIResourceUri } from '@jini-ai/ui/mcp-ui/surfaces';
import type { ProjectKeysPort, ProjectKeyRow } from '../project-keys/service.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';

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
  description: 'Use a saved key or OAuth connection on this site. Opens the owner-only picker of Shared Keys and keys saved on other sites of this install, with one approval card. ' +
    'Choose Enter a new key to open the normal secure key card. Accepts no selections, site identity or secrets from the model. ' +
    'Returns only the approved credentialId, or {granted:false, reason} where reason is dismissed (owner closed the card), interrupted (the run ended first) or nothing-to-pick (no saved keys exist).',
  sideEffects: 'mutates-durable-state', authorization: { permission: 'system.write' },
  inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];
export const credentialCopyDerivedRisk: DerivedRiskByToolId = new Map([[CREDENTIAL_COPY_TOOL_ID, 'mutates-durable-state']]);

/** Require the installation owner's current permissions before inventory and again before grant.
 * @throws ToolInputError for non-owner sessions; RBAC errors propagate without secrets.
 * @complexity O(1), two admission calls per card/open or submission.
 */
async function admit({ deps, principalId, permission = 'system.write' }: {
  deps: CredentialCopyToolDeps; principalId: string; permission?: string;
}): Promise<void> {
  if (principalId !== await deps.ownerPrincipalId) throw new ToolInputError({ message: 'Use the installation owner’s session to choose a saved key.' });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId, permission: 'system.write' });
  if (permission !== 'system.write') await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId, permission });
  const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
  if (instance && !(await instance({ principalId, permission })).allowed) {
    throw new ToolInputError({ message: 'Using saved keys is not allowed for this session. Sign in as the installation owner.' });
  }
}

/** Only an offered id can be approved; submitted site ids or other fields cannot widen the grant. */
function selectedKey({ params, rows }: { params: Record<string, unknown>; rows: readonly ProjectKeyRow[] }): ProjectKeyRow | 'new' {
  if (Object.keys(params).some(key => !['credentialId', SURFACE_EXCHANGE_ID_PARAM].includes(key))) {
    throw new ToolInputError({ message: 'Choose one saved key in this card. No site identity or secret can be submitted.' });
  }
  if (params.credentialId === NEW_KEY) return 'new';
  const row = rows.find(row => row.keyId === params.credentialId);
  if (!row) throw new ToolInputError({ message: 'This saved key is no longer offered. Open Use a saved key again.' });
  return row;
}

/** Selection and secrets come only from the human card, never model arguments. */
function validateInput({ input }: { input: unknown }): void {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
    throw new ToolInputError({ message: 'Use a saved key accepts only {}. Choose the key in the human card.' });
  }
}

/** The fallback uses the normal secret card and the same successful-save attachment owner. */
const OUTCOMES = {
  dismissed: { granted: false, reason: 'dismissed', message: 'The owner closed the card without choosing a key.' },
  interrupted: { granted: false, reason: 'interrupted', message: 'The run ended before the owner chose a key.' },
  'nothing-to-pick': { granted: false, reason: 'nothing-to-pick', message: 'No saved keys were available to pick from.' },
} as const;

/** Locked keys are named on the card with what to do, grouped by reason; they are never selectable. */
function lockedDetails({ rows }: { rows: readonly ProjectKeyRow[] }): { label: string; value: string }[] {
  const byReason = new Map<string, string[]>();
  for (const row of rows) if (row.locked) byReason.set(row.locked, [...(byReason.get(row.locked) ?? []), row.name]);
  return [...byReason].map(([reason, names]) => ({ label: `Can't use yet: ${names.join('; ')}`, value: reason }));
}

async function normalKeyCard({ ctx, options, deps, saveNew }: {
  ctx: ToolExecutionContext; options: ToolExecutionOptions; deps: CredentialCopyToolDeps; saveNew: ToolHandler;
}): Promise<unknown> {
  const result = await saveNew({ ...ctx, input: {} }, options);
  ctx.signal.throwIfAborted();
  await admit({ deps, principalId: ctx.principal.id });
  return deps.projectKeys ? deps.projectKeys.savedResult({ result }) : result;
}

/** One human card selects and approves a CMS site grant. Jini owns actor binding, expiry and replay
 * protection. The site is captured by ProjectKeysPort at host composition, never by submitted input.
 * @returns Only the approved reference, or a cancellation result; no owner inventory reaches chat.
 * @complexity O(k) card metadata, k capped by the owner inventory; one grant transaction per approval.
 */
export function buildCredentialCopyRegistrations({ deps, surfaces, saveNew }: {
  deps: CredentialCopyToolDeps; surfaces: AssistantSurfaceDeps; saveNew?: ToolHandler;
}, _optional = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'credential-copy',
    catalogModule: 'features/custom-credentials/credential-copy-tool.ts', catalog: indexCatalogById({ catalog }),
    derivedRisk: credentialCopyDerivedRisk, handlers: { [CREDENTIAL_COPY_TOOL_ID]: async (ctx, options = {}) => {
      validateInput({ input: ctx.input });
      await admit({ deps, principalId: ctx.principal.id });
      ctx.signal.throwIfAborted();
      if (!deps.projectKeys) {
        if (saveNew) return normalKeyCard({ ctx, options, deps, saveNew });
        throw new ToolInputError({ message: 'Shared Keys could not open. Open the normal key card to save a key for this site.' });
      }
      if (!options.emitSurface) throw new ToolInputError({ message: 'Using a saved key requires an interactive confirmation channel. Open this action in chat.' });
      const rows = await deps.projectKeys.listChoices({});
      const exchange = surfaces.surfaceExchanges.open({ binding: { toolId: CREDENTIAL_COPY_TOOL_ID, principalId: ctx.principal.id, channel: 'mcp-ui' }, emit: options.emitSurface });
      const uri: UIResourceUri = `ui://tovu/use-saved-key/${exchange.id}`;
      const abort = () => exchange.close({});
      ctx.signal.addEventListener('abort', abort, { once: true });
      if (ctx.signal.aborted) abort();
      try {
        const available = rows.filter(row => !row.locked);
        const result = await askThenReport<{ granted: boolean; credentialId?: string; newKey?: boolean; reason?: string; message?: string }>({ exchange,
          confirmationEmission: { channel: 'mcp-ui', payload: { resource: buildFormSurface({ uri,
            title: 'Use a saved key or connection on this site', details: [{ label: 'Site', value: deps.projectKeys!.site?.name ?? 'This site' }, ...lockedDetails({ rows })],
            // A site key is added to Shared Keys on approval; say so, the owner is approving it.
            description: available.length ? 'A key saved on another site is added to Shared Keys first. This site can use only the one you choose.' : 'No saved keys yet on this computer. Enter a new key to save one.',
            fields: [{ kind: 'enum', name: 'credentialId', label: 'Shared Keys', required: true, placeholder: 'Choose a key',
              options: [...available.map(row => ({ value: row.keyId, label: row.name })), { value: NEW_KEY, label: 'Enter a new key' }] }],
            // Keys and OAuth accounts stay in the owner store; shared OAuth keeps its original sign-in account and client.
            // The label fits both a saved key and Enter a new key, which goes on to the normal key card.
            // Start compact; Jini's shared bridge fits the body on load and content changes.
            preferredFrameSize: ['100%', '1px'],
            submitLabel: 'Use this key', toolName: CREDENTIAL_COPY_TOOL_ID,
            baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
            cancel: { label: 'Cancel', toolName: CREDENTIAL_COPY_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
          }) } },
          handle: async answer => {
            if (answer.status !== 'received' || ctx.signal.aborted) return { result: OUTCOMES.interrupted };
            if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: available.length ? OUTCOMES.dismissed : OUTCOMES['nothing-to-pick'] };
            const row = selectedKey({ params: answer.params, rows: available });
            if (row === 'new') {
              await admit({ deps, principalId: ctx.principal.id });
              return { result: { granted: false, newKey: true } };
            }
            await admit({ deps, principalId: ctx.principal.id, permission: await deps.projectKeys!.permissionFor({ keyId: row.keyId }) });
            ctx.signal.throwIfAborted();
            // Re-resolution inside use refuses entries deleted while the person was reading the card.
            // A key picked from another site gets its Shared Keys id here; that id is what the model receives.
            const used = await deps.projectKeys!.use({ keyId: row.keyId, use: true });
            return { result: { granted: true, credentialId: used.keyId } };
          } });
        if (result.newKey && saveNew) return normalKeyCard({ ctx, options, deps, saveNew });
        return result;
      } finally { ctx.signal.removeEventListener('abort', abort); exchange.close({}); }
    } } });
}
