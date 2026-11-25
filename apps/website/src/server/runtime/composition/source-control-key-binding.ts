import { abortGuardedCredentialRepo } from '@jini-ai/integrations/vendor-credentials/abort-guarded-repo';
import { sourceControlSavedApiKeyLabels } from '@jini-ai/devops/source-control/site/saved-key-bindings';
import { createCustomCredential, deleteCustomCredential, describeCredentialByLabel, listCustomCredentials, resolveCustomCredentialByLabel,
  updateCustomCredential, CustomCredentialDuplicateLabelError, CustomCredentialNotFoundError, CustomCredentialValidationError,
  type CustomCredentialSummary, type CustomCredentialWriteDeps } from '#src/features/custom-credentials/index';
import { SourceControlCredentialDuplicateLabelError, SourceControlCredentialNotFoundError, SourceControlCredentialValidationError } from '#src/features/source-control/index';
import type { CanonicalSourceControlKeys, SourceControlCredentialPatch, SourceControlCredentialSummary } from '#src/features/source-control/types';
import type { LoadSourceControlProviders } from '#src/features/source-control/provider-registry';

/** Bind all source-control operations to the same API-key reader used by provider requests.
 * The declaration map owns aliases; no second credential lookup follows a missing/revoked grant.
 * @returns Metadata, resolution and human-save ports; tokens never enter tool arguments/results.
 * @complexity O(1) indexed grant/credential reads per use; one owner write per human save.
 */
export function sourceControlKeyBinding({ credentials, loadProviders }: {
  credentials: CustomCredentialWriteDeps; loadProviders: LoadSourceControlProviders;
}, _optional = {}): CanonicalSourceControlKeys {
  const labelFor = ({ providerId }: { providerId: string }, _optional = {}) => {
    const label = sourceControlSavedApiKeyLabels.get(providerId);
    if (label === undefined) throw new Error(`source control provider ${providerId} has no saved key label`);
    return label;
  };
  return {
    supports: ({ providerId }) => sourceControlSavedApiKeyLabels.has(providerId),
    describe: async ({ workspaceId, providerId }) => {
      const saved = await describeCredentialByLabel(credentials, { workspaceId, label: labelFor({ providerId }) });
      return saved ? { id: saved.id, label: saved.label, providerId } : null;
    },
    resolve: async ({ workspaceId, providerId }) => {
      const saved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label: labelFor({ providerId }) });
      return saved ? { id: saved.id, label: labelFor({ providerId }), connection: { providerId, token: saved.connection.token } } : null;
    },
    create: async ({ workspaceId, connection }, options = {}) => {
      const provider = (await loadProviders({ workspaceId })).get({ providerId: connection.providerId });
      if (!provider) throw new Error("The source control provider is unavailable. Turn it on and open its key card again.");
      const repo = options.signal ? abortGuardedCredentialRepo({ store: credentials.repo, signal: options.signal }) : credentials.repo;
      const saved = await createCustomCredential({ ...credentials, repo }, { workspaceId, label: labelFor({ providerId: connection.providerId }), category: 'source-control',
        baseUrl: provider.descriptor.apiOrigin, connection: { token: connection.token }, worksFor: [connection.providerId] }).catch(error => {
          if (error instanceof CustomCredentialDuplicateLabelError) throw new SourceControlCredentialDuplicateLabelError(error.message);
          throw error;
        });
      return { ...saved, providerId: connection.providerId, isDefault: true, accountLabel: null };
    },
    list: async ({ workspaceId }) => (await siteKeys({ credentials, workspaceId })).map(({ row, providerId }) => safeRow({ row, providerId })),
    update: async ({ workspaceId, id, patch }) => {
      const owned = (await siteKeys({ credentials, workspaceId })).find(key => key.row.id === id);
      if (!owned) return { owned: false };
      const token = rotatedToken({ patch, owned: { label: owned.row.label, providerId: owned.providerId } });
      const row = token === undefined ? owned.row : await translated(() => updateCustomCredential(credentials, { workspaceId, id, connection: { token } }));
      return { owned: true, summary: safeRow({ row, providerId: owned.providerId }) };
    },
    remove: async ({ workspaceId, id }) => {
      if (!(await siteKeys({ credentials, workspaceId })).some(key => key.row.id === id)) return { owned: false };
      await translated(() => deleteCustomCredential(credentials, { workspaceId, id }));
      return { owned: true };
    },
  };
}

/** Which provider each saved key label stands for; the declaration map is the only authority. */
const providerByLabel = new Map([...sourceControlSavedApiKeyLabels].map(([providerId, label]) => [label, providerId]));

/** The site's canonical keys: the effective, granted custom-key rows whose label a provider declares.
 * Create, describe and resolve select the same rows by the same labels in the same scoped store. Edits
 * and removal must use this authority too: a key created here and then edited through any wider view
 * could reach a project key this site was never granted, or a generic API key it does not own.
 * @complexity O(n) metadata rows for the site plus its granted project rows; no key is opened. */
async function siteKeys({ credentials, workspaceId }: { credentials: CustomCredentialWriteDeps; workspaceId: string }, _optional = {}) {
  const rows = await listCustomCredentials(credentials, { workspaceId });
  return rows.flatMap(row => {
    const providerId = providerByLabel.get(row.label);
    return providerId === undefined ? [] : [{ row, providerId }];
  });
}

/** A display row built from metadata only: the hint, never the sealed token. */
function safeRow({ row, providerId }: { row: CustomCredentialSummary; providerId: string }, _optional = {}): SourceControlCredentialSummary {
  return { id: row.id, providerId, label: row.label, configured: true, tokenHint: row.tokenHint ?? null, isDefault: true, accountLabel: null,
    createdAt: row.createdAt, updatedAt: row.updatedAt, ...(row.scope === undefined ? {} : { scope: row.scope }) };
}

/** A canonical key holds only its token under its declared name: a blank token keeps it, and a
 * rename, host move or paired field is refused rather than silently dropped. */
function rotatedToken({ patch, owned }: { patch: SourceControlCredentialPatch; owned: { label: string; providerId: string } }, _optional = {}): string | undefined {
  if (patch.label !== undefined && patch.label !== owned.label) throw new SourceControlCredentialValidationError("This shared key keeps its provider's name. Save a new key to use another name.");
  if (patch.connection === undefined) return undefined;
  if (typeof patch.connection !== 'object' || patch.connection === null || Array.isArray(patch.connection)) throw new SourceControlCredentialValidationError('connection must be an object');
  return ownedConnectionToken({ connection: patch.connection as Record<string, unknown>, ownedProviderId: owned.providerId });
}

/** The token a canonical key's connection patch carries, refusing a host move or any paired field. */
function ownedConnectionToken({ connection, ownedProviderId }: { connection: Record<string, unknown>; ownedProviderId: string }, _optional = {}): string | undefined {
  const { providerId = ownedProviderId, token, ...rest } = connection;
  if (providerId !== ownedProviderId || Object.keys(rest).length > 0) throw new SourceControlCredentialValidationError("This shared key holds only its provider's token. Save a new key for another host.");
  if (token === undefined || token === '') return undefined;
  if (typeof token !== 'string') throw new SourceControlCredentialValidationError('token must be a string');
  return token;
}

/** Owned keys keep the Source Control error identities the routes already map to plain words. */
async function translated<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof CustomCredentialValidationError) throw new SourceControlCredentialValidationError(error.message);
    if (error instanceof CustomCredentialNotFoundError) throw new SourceControlCredentialNotFoundError(error.message);
    throw error;
  }
}
