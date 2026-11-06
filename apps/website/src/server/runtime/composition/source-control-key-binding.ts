import { abortGuardedCredentialRepo } from '#src/features/vendor-credentials/abort-guarded-repo';
import { sourceControlSavedApiKeyLabels } from '#src/features/source-control/provider-module';
import { createCustomCredential, describeCredentialByLabel, resolveCustomCredentialByLabel, CustomCredentialDuplicateLabelError,
  type CustomCredentialWriteDeps } from '#src/features/custom-credentials/store';
import { SourceControlCredentialDuplicateLabelError } from '#src/features/source-control/store';
import type { CanonicalSourceControlKeys } from '#src/features/source-control/types';
import type { LoadSourceControlProviders } from '#src/features/source-control/provider-registry';

/** Bind all source-control operations to the same API-key reader used by provider requests.
 * The declaration map owns aliases; no second credential lookup follows a missing/revoked grant.
 * @returns Metadata, resolution and human-save ports; tokens never enter tool arguments/results.
 * @complexity O(1) indexed grant/credential reads per use; one owner write per human save.
 */
export function sourceControlKeyBinding({ credentials, loadProviders }: {
  credentials: CustomCredentialWriteDeps; loadProviders: LoadSourceControlProviders;
}, _optional = {}): CanonicalSourceControlKeys {
  const labelFor = (providerId: string) => sourceControlSavedApiKeyLabels.get(providerId)!;
  return {
    supports: ({ providerId }) => sourceControlSavedApiKeyLabels.has(providerId),
    describe: async ({ workspaceId, providerId }) => {
      const saved = await describeCredentialByLabel(credentials, { workspaceId, label: labelFor(providerId) });
      return saved ? { id: saved.id, label: saved.label, providerId } : null;
    },
    resolve: async ({ workspaceId, providerId }) => {
      const saved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label: labelFor(providerId) });
      return saved ? { id: saved.id, label: labelFor(providerId), connection: { providerId, token: saved.connection.token } } : null;
    },
    create: async ({ workspaceId, connection }, options = {}) => {
      const provider = (await loadProviders(workspaceId)).get(connection.providerId);
      if (!provider) throw new Error("The source control provider is unavailable. Turn it on and open its key card again.");
      const repo = options.signal ? abortGuardedCredentialRepo({ store: credentials.repo, signal: options.signal }) : credentials.repo;
      const saved = await createCustomCredential({ ...credentials, repo }, { workspaceId, label: labelFor(connection.providerId), category: 'source-control',
        baseUrl: provider.descriptor.apiOrigin, connection: { token: connection.token }, worksFor: [connection.providerId] }).catch(error => {
          if (error instanceof CustomCredentialDuplicateLabelError) throw new SourceControlCredentialDuplicateLabelError(error.message);
          throw error;
        });
      return { ...saved, providerId: connection.providerId, isDefault: true, accountLabel: null };
    },
  };
}
