import { buildDomainRegistrations, indexCatalogById, ToolInputError,
  type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration, type SurfaceMessage } from '@jini-ai/core';
import { requireToolPermission, adaptLegacyAuthorize, ForbiddenError, type AuthorizeFn } from '@jini-ai/cms/core';
import type { InstanceAuthorizeFn } from '@jini-ai/core/gated-mutations';
import type { VaultKind, VaultCopyResult } from '@jini-ai/platform/secrets/credential-sets';
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { buildFormSurface, buildOutcomeSurface, type FormSurfaceSpec, type UIResource, type UIResourceUri } from '@jini-ai/ui/mcp-ui/surfaces';
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';

export const CREDENTIAL_COPY_TOOL_ID = 'credential_copy_from_project';
type SourceChoice = { siteId: string; name: string; reasonCode?: string; message?: string;
  keys: { kind: VaultKind; id: string; label: string; provider: string | null; last4?: string; worksFor: string[]; publishHosts?: string[] }[] };

/** Allowlisted local discovery for model results. No key IDs, hints, paths or envelope fields.
 * No I/O or mutation; O(sites + keys + host IDs) time and space.
 */
export function summarizeCredentialSources({ sources }: { sources: readonly SourceChoice[] }, _options = {}) {
  return sources.map(source => ({ siteId: source.siteId, name: source.name,
    ...(source.reasonCode ? { reasonCode: source.reasonCode } : {}),
    keys: source.keys.map(key => ({ kind: key.kind, label: key.label, provider: key.provider,
      worksFor: [...(key.worksFor ?? [])], publishHosts: [...(key.publishHosts ?? [])] })) }));
}
/** Structural C2 port: inventory eligibility, source re-resolution, CAS and resealing have one owner. */
export interface CredentialCopyToolDeps {
  readonly workspaceId: string;
  readonly ownerPrincipalId: Promise<string>;
  readonly authorize: AuthorizeFn;
  readonly gatedMutations: { gatewayDeps: { authorizeInstance?: InstanceAuthorizeFn } };
  readonly localCredentialCopy?: {
    localHost: boolean;
    list(required: Record<string, never>, optional?: Record<string, never>): Promise<SourceChoice[]>;
    copy(required: { sourceSiteId: string; ids: readonly string[]; overwrite: boolean; actorId: string },
      optional?: Record<string, never>): Promise<VaultCopyResult[]>;
  };
}
export const catalog: AgentToolDefinition[] = [{ name: CREDENTIAL_COPY_TOOL_ID,
  description: 'Copy saved keys from another registered local Tovu project into this project. Call when the owner wants to reuse another project’s keys. ' +
    'Opens a human card to choose the source, keys and optional Overwrite; waits for copy, cancel or expiry. Accepts no model-supplied selection or secrets. ' +
    'Returns secret-free kind, id, status and optional last4/reasonCode. Requires the local installation owner and system.write; sources needing upgrade must be started normally first.',
  sideEffects: 'mutates-durable-state', authorization: { permission: 'system.write' },
  inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];
export const credentialCopyDerivedRisk: DerivedRiskByToolId = new Map([[CREDENTIAL_COPY_TOOL_ID, 'mutates-durable-state']]);
const failureMessages: { 'copy-failed': string; [reasonCode: string]: string } = {
  'copy-refused': 'Copy is no longer authorized.', 'copy-failed': 'Copying keys failed. Try again.',
  'invalid-selection': 'Choose an available source and its keys.', 'source-unavailable': 'The source is no longer available.',
  'source-missing': 'A selected key is no longer available. Choose it again.', 'source-busy': 'The source is busy. Try again.',
  'source-key-unavailable': 'Recover this source site’s key in Tovu, then copy.',
  'source-unsupported': 'Only local SQLite sources are supported.',
};

/** Require current owner, workspace RBAC, instance admission and explicit local capability.
 * Throws a fixed input/permission error before discovery or mutation. O(1), two admission calls.
 */
async function admit({ deps, principalId }: { deps: CredentialCopyToolDeps; principalId: string }, _optional = {}): Promise<void> {
  if (principalId !== await deps.ownerPrincipalId) throw new ToolInputError({ message: 'Use the installation owner’s session to copy keys.' });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }),
    workspaceId: deps.workspaceId, principalId, permission: 'system.write' });
  const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
  if (instance && !(await instance({ principalId, permission: 'system.write' })).allowed) {
    throw new ToolInputError({ message: 'Copy is not authorized for this installation.' });
  }
  if (!deps.localCredentialCopy?.localHost) throw new ToolInputError({ message: 'Copy keys on a local Tovu host.' });
}

/** Jini owns controls/bridge; product CSS makes the native picker inline and actions right-aligned.
 * No interpolated CSS or new form lifecycle. O(fields + document length); returns a fresh resource.
 */
function form({ uri, exchangeId, fields, submitLabel }: {
  uri: UIResourceUri; exchangeId: string; fields: FormSurfaceSpec['fields']; submitLabel: string;
}, _optional = {}): UIResource {
  const resource = buildFormSurface({ uri, title: 'Copy keys from another project', fields, submitLabel,
    toolName: CREDENTIAL_COPY_TOOL_ID, baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    cancel: { label: 'Cancel', toolName: CREDENTIAL_COPY_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },
    // Start compact; Jini's shared bridge fits the body on load and content changes.
    preferredFrameSize: ['100%', '1px'] });
  return { ...resource, resource: { ...resource.resource, text: resource.resource.text.replace('</head>',
    '<style>.mcpui-field:has(select){flex-direction:row;align-items:center;gap:8px}' +
    '.mcpui-select{width:auto;max-width:75%}.mcpui-actions{justify-content:flex-end}</style></head>') } };
}

/** Terminal exchange answers never imply consent; O(1), no effects. */
function ended({ answer, aborted }: { answer: SurfaceMessage; aborted: boolean }, _optional = {}): string | undefined {
  if (aborted) return 'abandoned';
  if (answer.status !== 'received') return answer.status;
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return 'cancelled';
  return undefined;
}

/** Validate the entire batch against the shown inventory, with a 100-key cap; O(keys + ids).
 * A forged key mixed with valid ones refuses all of them. No I/O or input mutation.
 */
function selection({ params, source }: { params: Record<string, unknown>; source: SourceChoice }, _optional = {}):
  { ids: string[]; overwrite: boolean } | undefined {
  const { ids, overwrite } = params;
  const allowed = new Set(source.keys.map(key => key.id));
  if (Object.keys(params).some(key => !['ids', 'overwrite', SURFACE_EXCHANGE_ID_PARAM].includes(key))) return undefined;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return undefined;
  if (new Set(ids).size !== ids.length || !ids.every((id: unknown) => typeof id === 'string' && allowed.has(id)) || typeof overwrite !== 'boolean') return undefined;
  return { ids, overwrite };
}

function validateCopyInput({ input }: { input: unknown }, _options = {}): void {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
    throw new ToolInputError({ message: 'Choose the source and keys in the human card; model input must be {}.' });
  }
}

function keyFields({ source }: { source: SourceChoice }, _options = {}): FormSurfaceSpec['fields'] {
  return [
    { kind: 'multi-enum', name: 'ids', label: 'Keys', required: true, options: source.keys.map(key => {
      const tail = key.last4 ? ` · …${key.last4}` : '';
      let publish = '';
      if (key.publishHosts !== undefined) {
        publish = key.publishHosts.length ? ` · Publish: ${key.publishHosts.join(', ')}` : ' · No static publish host';
      }
      return { value: key.id, label: `${key.label} · ${key.provider ?? key.kind}${tail}` +
        ` · Works for: ${(key.worksFor ?? []).join(', ') || 'none'}` + publish };
    }) },
    { kind: 'boolean', name: 'overwrite', label: 'Overwrite existing', value: false },
  ];
}

function copyOutcome({ copied, source, uri }: {
  copied: VaultCopyResult[]; source: SourceChoice; uri: UIResourceUri;
}, _options = {}) {
  // Allowlist projection: neither unexpected payload fields nor exceptions reach model/card.
  const results = copied.map(({ kind, id, status, last4, reasonCode }) => ({ kind, id, status,
    ...(last4 ? { last4: last4.slice(-4) } : {}), ...(reasonCode ? { reasonCode } : {}) }));
  const keysById = new Map(source.keys.map(key => [key.id, key]));
  const failed = results.some(row => row.status === 'failed');
  const failureState = results.some(row => row.status === 'copied') ? 'partial' : 'failure';
  return { result: { results }, outcome: { channel: 'mcp-ui' as const, payload: { resource: buildOutcomeSurface({ uri, preferredFrameSize: ['100%', '1px'], title: 'Copy results',
    state: failed ? failureState : 'success', message: '',
    details: results.map(row => {
      const key = keysById.get(row.id);
      const provider = key?.provider ? ` · ${key.provider}` : '';
      let value: string;
      if (row.status === 'copied') {
        const tail = row.last4 ? ` …${row.last4}` : '';
        value = `copied ✓${tail}`;
      } else {
        value = row.reasonCode === 'target-exists' ? 'skipped — already there' : `not copied — ${row.reasonCode ?? 'copy-failed'}`;
      }
      return { label: key?.label ?? row.kind, description: `${row.kind}${provider}`, format: 'status', value };
    }) }) } } };
}

/** Register one human-only selection flow. C2 owns all storage effects and fresh revision checks.
 * @param required - Injected C2/admission ports and the daemon's principal-bound exchanges.
 * @returns One tool registration; results contain only safe summaries or a fixed refusal code.
 * @example buildCredentialCopyRegistrations({ deps, surfaces });
 * @complexity O(sources + keys + results), plus C2 inventory/copy I/O; selection is capped at 100.
 */
export function buildCredentialCopyRegistrations({ deps, surfaces }: {
  deps: CredentialCopyToolDeps; surfaces: AssistantSurfaceDeps;
}, _optional = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'credential-copy',
    catalogModule: 'features/custom-credentials/credential-copy-tool.ts', catalog: indexCatalogById({ catalog }),
    derivedRisk: credentialCopyDerivedRisk, handlers: { [CREDENTIAL_COPY_TOOL_ID]: async (ctx, options = {}) => {
      validateCopyInput({ input: ctx.input });
      if (!options.emitSurface) throw new ToolInputError({ message: 'Copying keys requires an interactive card.' });
      await admit({ deps, principalId: ctx.principal.id });
      if (ctx.signal.aborted) return { results: [], reasonCode: 'abandoned' };
      let sources: SourceChoice[];
      try { sources = await deps.localCredentialCopy!.list({}); }
      catch { throw new ToolInputError({ message: failureMessages['copy-failed'] }); }
      if (ctx.signal.aborted) return { results: [], reasonCode: 'abandoned' };
      const exchange = surfaces.surfaceExchanges.open({ binding: { toolId: CREDENTIAL_COPY_TOOL_ID,
        principalId: ctx.principal.id, channel: 'mcp-ui' }, emit: options.emitSurface });
      const uri: UIResourceUri = `ui://tovu/credential-copy/${exchange.id}`;
      const abort = () => exchange.close({});
      ctx.signal.addEventListener('abort', abort, { once: true });
      if (ctx.signal.aborted) abort();
      const emission = (resource: UIResource) => ({ channel: 'mcp-ui' as const, payload: { resource } });
      const refused = (reasonCode: string, message = failureMessages[reasonCode] ?? failureMessages['copy-failed']) => ({
        result: { results: [] as VaultCopyResult[], reasonCode },
        outcome: emission(buildOutcomeSurface({ uri, preferredFrameSize: ['100%', '1px'], title: 'Keys not copied', state: 'failure', message })) });
      async function copySelectedSource({ source }: { source: SourceChoice }, _options = {}) {
        await admit({ deps, principalId: ctx.principal.id });
        if (source.reasonCode) return refused(source.reasonCode, source.reasonCode === 'source-needs-upgrade'
          ? `Start ${source.name} once in Tovu to upgrade it, then copy.` : failureMessages[source.reasonCode]);
        await exchange.send({ emission: emission(form({ uri, exchangeId: exchange.id, submitLabel: 'Copy',
          fields: keyFields({ source }) })) });
        const answer = await exchange.receive({});
        const ending = ended({ answer, aborted: ctx.signal.aborted });
        if (ending) return { result: { results: [], reasonCode: ending } };
        const selected = selection({ params: (answer as Extract<SurfaceMessage, { status: 'received' }>).params, source });
        if (!selected) return refused('invalid-selection');
        await admit({ deps, principalId: ctx.principal.id });
        if (ctx.signal.aborted) return { result: { results: [], reasonCode: 'abandoned' } };
        const copied = await deps.localCredentialCopy!.copy({ sourceSiteId: source.siteId, ...selected, actorId: ctx.principal.id });
        return copyOutcome({ copied, source, uri });
      }
      function copyFailure({ error, source }: { error: unknown; source: SourceChoice }, _options = {}) {
        let code: unknown;
        if (error && typeof error === 'object' && 'reasonCode' in error) code = error.reasonCode;
        if (code === 'source-needs-upgrade') return refused(code, `Start ${source.name} once in Tovu to upgrade it, then copy.`);
        if (error instanceof ToolInputError || error instanceof ForbiddenError) return refused('copy-refused');
        return refused(typeof code === 'string' && Object.hasOwn(failureMessages, code) ? code : 'copy-failed');
      }
      try {
        return await askThenReport<{ results: VaultCopyResult[]; reasonCode?: string }>({ exchange, confirmationEmission: emission(form({ uri, exchangeId: exchange.id,
          fields: [{ kind: 'enum', name: 'sourceSiteId', label: 'Source project', required: true,
            options: sources.map(choice => ({ value: choice.siteId, label: choice.name })) }], submitLabel: 'Next' })),
        handle: async answer => {
          const ending = ended({ answer, aborted: ctx.signal.aborted });
          if (ending) return { result: { results: [], reasonCode: ending } };
          const params = (answer as Extract<SurfaceMessage, { status: 'received' }>).params;
          if (Object.keys(params).some(key => !['sourceSiteId', SURFACE_EXCHANGE_ID_PARAM].includes(key))) return refused('invalid-selection');
          const source = sources.find(choice => choice.siteId === params.sourceSiteId);
          if (!source) return refused('invalid-selection');
          try {
            return await copySelectedSource({ source });
          } catch (error) {
            return copyFailure({ error, source });
          }
        } });
      } finally { ctx.signal.removeEventListener('abort', abort); exchange.close({}); }
    } } });
}
