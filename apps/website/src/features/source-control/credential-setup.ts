import { applyPluginCredentialCard, findPluginCredentialCard, type LoadPluginCredentialCards } from "../custom-credentials/plugin-credential-card.js";
import { abortGuardedCredentialRepo } from "../vendor-credentials/abort-guarded-repo.js";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/secret-form-cards.js";
import { assertCredentialFreeField, CREDENTIAL_MESSAGES, type CredentialTokenHint, type CredentialConnection } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint } from '../../contracts/core/credential-copy.js';
import { resolveOperatorLocale, type OperatorLocaleDeps } from '../agent-plugins/operator-locale.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { optionalString, requireInputRecord, requireString } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from '@jini-ai/core';
import { defineSecretCardTool, type SecretCardField, type SecretCardRun } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { SourceControlCredentialDuplicateLabelError, createSourceControlCredential, type SourceControlCredentialWriteDeps } from './store.js';
import type { LoadSourceControlProviders, SourceControlProviderDescriptor } from './provider-registry.js';
import type { AuthorizeFn } from '../../contracts/core/commands/index.js';

/** Narrow save dependencies; independent of the registration module to avoid a type-import cycle.
 * `loadSourceControlProviders` is required: the composition root (`tool-registrations.ts`) resolves the
 * installed-plugins default, so this module never reads a workspace it was not handed. */
export interface SourceControlCredentialSetupDeps extends OperatorLocaleDeps {
  readonly loadPluginCredentialCards?: LoadPluginCredentialCards;
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

interface ProposalResult { saved: boolean; credentialId: string | null; provider: string; label: string; cancelled?: boolean; message?: string; tokenHint?: CredentialTokenHint | null; connection?: CredentialConnection }

/** Why nothing was saved, one per cause. Demo dry run 2026-10-05: all three used to return the same
 *  `{saved: false}`, so a person's Cancel was reported as "Either it was closed or the save failed". */
export const PROPOSE_CREDENTIAL_CANCELLED = 'The person cancelled the form. Nothing was saved.';
export const PROPOSE_CREDENTIAL_CLOSED = 'The form closed without an answer (it timed out or the chat run ended). Nothing was saved.';
export const PROPOSE_CREDENTIAL_ABORTED = 'The chat run ended before the form opened. Nothing was saved.';
export const PROPOSE_CREDENTIAL_SAVE_FAILED = 'The person submitted the form but the token could not be saved; the form told them why. Nothing was saved.';

/** Repository rules a site backup enforces (`site_backup_plan`), shown on the form beside the provider's token help. */
const BACKUP_REPOSITORY_RULES = 'For a site backup, the repository must be private and already have at least one commit (for example a README).';

/** Opens the registry-defined human form and parks this tool call until answered or aborted.
 * @param spec - Tool context, explicit store dependencies and the shared exchange store.
 * @example await proposeSourceControlCredential({ ctx, deps, surfaces });
 * @returns Safe save status; throws ToolInputError for invalid model input or absent form channel.
 * @complexity Time O(p + f) provider/field count before one existing credential save; space O(f).
 */
export async function proposeSourceControlCredential(spec: { ctx: ToolExecutionContext; deps: SourceControlCredentialSetupDeps; surfaces: AssistantSurfaceDeps }, optional: ToolExecutionOptions = {}): Promise<ProposalResult> {
  const { ctx, deps, surfaces } = spec;
  const { provider, label } = parseProposalInput({ input: ctx.input });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'source-control.credentials.write' }, { entityType: 'source-control' });
  // An ended run must not load plugins; the engine classifies abandonment without opening a card.
  const registry = ctx.signal.aborted ? undefined : await deps.loadSourceControlProviders(deps.workspaceId);
  const descriptor = registry?.get(provider)?.descriptor;
  if (!ctx.signal.aborted && !descriptor?.credential) {
    throw new ToolInputError({ message: 'No enabled source control provider declares this credential form. Call source_control_get_capabilities for available hosts.' });
  }
  const locale = await resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: ctx.principal.id });
  const pluginCard = ctx.signal.aborted ? undefined : await findPluginCredentialCard({ loadCards: deps.loadPluginCredentialCards, workspaceId: deps.workspaceId, saveKind: 'source-control', target: provider });
  const card = defineSecretCardTool<{
    descriptor: SourceControlProviderDescriptor | undefined; provider: string; label: string; locale: string;
  }, Awaited<ReturnType<typeof createSourceControlCredential>>, ProposalResult>({
    toolId: CREDENTIAL_SAVE_TOOL_ID,
    prepare: async () => ({ descriptor: ctx.signal.aborted ? undefined : descriptor, provider, label, locale }),
    form: ({ prep }) => applyPluginCredentialCard({ card: pluginCard, form: {
      title: `Connect ${prep.descriptor!.label}`,
      description: `${prep.descriptor!.credential!.help ?? 'Type the secret here. The assistant never sees it.'} ${BACKUP_REPOSITORY_RULES}`,
      submitLabel: 'Save credential',
      fields: [{ kind: 'string', name: 'label', label: 'Label', required: true, value: prep.label },
        ...prep.descriptor!.credential!.fields.map((field): SecretCardField => {
          const base = { kind: 'string' as const, name: field.name, label: field.label, required: field.required };
          return field.secret || field.name === prep.descriptor!.credential!.tokenField
            ? { ...base, secret: true, allowBlank: !field.required } : base;
        })],
    } }),
    // Saves only provider-declared fields through the admin POST's existing store function.
    // Returns an explicit safe projection; errors may quote secrets and are never forwarded.
    save: ({ values, prep, signal }) => {
      const connection = connectionFromForm({ descriptor: prep.descriptor!, values });
      const store = deps.sourceControlCredentialSetRepo;
      // The async seal can outlive the run; the existing store must not insert after abandonment.
      // Saves write through `vault`, so it must be forwarded (omitting it fails every save) with the same guard.
      const vault = store.vault;
      const repo: SourceControlCredentialSetupDeps['sourceControlCredentialSetRepo'] = {
        ...(vault ? { vault: {
          find: (input, options) => vault.find(input, options),
          list: (input, options) => vault.list(input, options),
          put: (input, options) => { signal.throwIfAborted(); return vault.put(input, options); },
          patchMeta: (input, options) => vault.patchMeta(input, options),
          delete: (input, options) => vault.delete(input, options),
          ...(vault.findDefault ? { findDefault: (input: Parameters<NonNullable<typeof vault.findDefault>>[0], options?: Parameters<NonNullable<typeof vault.findDefault>>[1]) => vault.findDefault!(input, options) } : {}),
          ...(vault.findOne ? { findOne: (input: Parameters<NonNullable<typeof vault.findOne>>[0], options?: Parameters<NonNullable<typeof vault.findOne>>[1]) => vault.findOne!(input, options) } : {}),
          ...(vault.applyBatch ? { applyBatch: (input: Parameters<NonNullable<typeof vault.applyBatch>>[0], options?: Parameters<NonNullable<typeof vault.applyBatch>>[1]) => { signal.throwIfAborted(); return vault.applyBatch!(input, options); } } : {}),
        } satisfies NonNullable<typeof vault> } : {}),
        insert: record => { signal.throwIfAborted(); return store.insert(record); },
        update: record => store.update(record),
        findById: input => store.findById(input),
        findDefaultByProvider: input => store.findDefaultByProvider(input),
        listByProvider: input => store.listByProvider(input),
        listByWorkspace: input => store.listByWorkspace(input),
        delete: input => store.delete(input),
        ...(store.updateAccountLabel ? { updateAccountLabel: (input: Parameters<NonNullable<typeof store.updateAccountLabel>>[0]) => store.updateAccountLabel!(input) } : {}),
        // The project half writes too (project-first saves): guarded alike.
        ...(store.project ? { project: { ...store.project, repo: abortGuardedCredentialRepo({ store: store.project.repo, signal }) } } : {}),
      };
      // New project keys stay non-default while the shared save-result path attaches them to this site.
      return createSourceControlCredential({ deps: {
        repo, sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen,
        loadSourceControlProviders: deps.loadSourceControlProviders,
        ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}), observability: deps.observability,
      }, input: { workspaceId: deps.workspaceId, label: values.label, connection, ...(store.project ? { isDefault: false } : {}) } });
    },
    result: ({ prep, run }): ProposalResult => {
      const declined = { saved: false, credentialId: null, provider: prep.provider, label: prep.label, cancelled: run.status === 'cancelled' };
      if (run.status !== 'saved') {
        const message = declinedMessage({ prep, run });
        return { ...declined, message };
      }
      const credential = run.saved;
      const connection = credential.connection ?? 'saved';
      return { saved: true, credentialId: credential.id, provider: prep.provider, label: credential.label, tokenHint: credential.tokenHint, connection,
        message: savedMessage({ credential, locale: prep.locale }) };
    },
    // Renders a value-free save outcome on the form's URI, supplied by the engine.
    outcome: ({ prep, run }) => {
      if (run.status === 'cancelled' || run.status === 'expired' || run.status === 'abandoned') return undefined;
      const saved = run.status === 'saved';
      const message = saved ? savedMessage({ credential: run.saved, locale: prep.locale })
        : run.status === 'blank' ? credentialText({ id: 'blank', locale: prep.locale }) : run.status === 'failed' ? run.safeMessage : PROPOSE_CREDENTIAL_SAVE_FAILED;
      return { title: saved ? 'Credential saved' : 'Credential not saved', state: saved ? 'success' : 'failure', message };
    },
  }, {
    uriHost: 'tovu',
    text: { noEmitter: 'source_control_propose_credential requires an interactive form channel. Nothing was saved.', saveFailure: PROPOSE_CREDENTIAL_SAVE_FAILED },
    safeError: err => {
      if (err instanceof SourceControlCredentialDuplicateLabelError) return err.message;
      const id = Object.entries(CREDENTIAL_MESSAGES).find(([, text]) => err instanceof Error && text === err.message)?.[0];
      return id ? credentialText({ id: id as keyof typeof CREDENTIAL_MESSAGES, locale }) : undefined;
    },
    // Fixed metadata only: neither an exception's text nor a submitted value is safe to log.
    logFailure: metadata => console.warn(JSON.stringify(metadata)),
  });
  return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, optional);
}

/** Keep provider-defined names on the human form and canonical `token` on the store contract.
 * Only declared fields cross the save boundary. @complexity O(f) time/space, f <= 10. */
function connectionFromForm({ descriptor, values }: {
  descriptor: SourceControlProviderDescriptor; values: Readonly<Record<string, unknown>>;
}, _options = {}): Record<string, unknown> {
  const connection: Record<string, unknown> = { providerId: descriptor.id };
  for (const field of descriptor.credential!.fields) {
    const name = field.name === descriptor.credential!.tokenField ? 'token' : field.name;
    connection[name] = values[field.name];
  }
  return connection;
}

/** Validate only public model fields before authorization or plugin lookup. @complexity O(k) input keys. */
function parseProposalInput({ input }: { input: unknown }, _options = {}): { provider: string; label: string } {
  const raw = requireInputRecord({ input });
  if (Object.keys(raw).some(key => key !== 'provider' && key !== 'label')) {
    throw new ToolInputError({ message: 'source_control_propose_credential accepts only provider and label; enter secrets in the human form.' });
  }
  const provider = requireString({ input: raw, key: 'provider' });
  const label = optionalString({ input: raw, key: 'label' }) ?? 'default';
  assertCredentialFreeField({ value: label, field: "label" });
  if (label.length > 200) throw new ToolInputError({ message: 'Credential label must be at most 200 characters.' });
  return { provider, label };
}

type CredentialPrep = { descriptor: SourceControlProviderDescriptor | undefined; locale: string };
type SavedCredential = Awaited<ReturnType<typeof createSourceControlCredential>>;

/** Fixed decline copy preserves the distinction between unopened and closed forms. @complexity O(1). */
function declinedMessage({ prep, run }: { prep: CredentialPrep; run: Exclude<SecretCardRun<SavedCredential>, { status: 'saved' }> }, _options = {}): string {
  switch (run.status) {
    case 'cancelled': return PROPOSE_CREDENTIAL_CANCELLED;
    case 'blank': return credentialText({ id: 'blank', locale: prep.locale });
    case 'failed': return run.safeMessage;
    case 'abandoned': return prep.descriptor === undefined ? PROPOSE_CREDENTIAL_ABORTED : PROPOSE_CREDENTIAL_CLOSED;
    default: return PROPOSE_CREDENTIAL_CLOSED;
  }
}

/** Both projections use the same safe hint and connection copy. @complexity O(1). */
function savedMessage({ credential, locale }: { credential: SavedCredential; locale: string }, _options = {}): string {
  const hint = formatCredentialHint({ hint: credential.tokenHint, locale });
  return `${hint ? `${hint}. ` : ''}${credentialText({ id: credential.connection ?? 'saved', locale })}`;
}
