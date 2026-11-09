import { ApiConnectionError, resolveByoClient as resolveConnectionByoClient, type ApiConnectionByoCredentials, type ApiConnectionByoRefusal } from '@jini-ai/integrations/api-connections';
import type { KeyringPort, SecretSealerPort } from '@jini-ai/platform/secrets';
import { allowedOriginsFor, resolveCustomCredentialByLabel, type CustomCredentialSetRepoPort } from '../custom-credentials/index.js';
import type { DeclaredApiConnection } from './contribution.js';
export { byoClientLabel, type ByoClient } from '@jini-ai/integrations/api-connections';

/** What opening a saved custom credential needs (the site's vault repo, sealer and keyring). */
export interface ByoClientCredentials {
  readonly repo: CustomCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}

function unusable(connection: Pick<DeclaredApiConnection, 'descriptor'>, label: string, problem: string): ApiConnectionError {
  return new ApiConnectionError({ code: "descriptor-invalid", message: `${connection.descriptor.label} cannot use your own OAuth client: the saved credential "${label}" ${problem}. Edit it under Admin > Access Tokens, then retry.` });
}

/** Keeps credential ownership, origin projection and exact product refusal copy in this host. */
export function createByoCredentials(required: { credentials: ByoClientCredentials }, _optional: Record<string, never> = {}): ApiConnectionByoCredentials {
  return {
    async read(input) {
      const saved = await resolveCustomCredentialByLabel(required.credentials, input);
      return saved ? { connection: saved.connection, allowedOrigins: () => allowedOriginsFor(saved) } : null;
    },
    refuse(input: ApiConnectionByoRefusal) {
      const problem = input.problem === 'wrong-origin' ? `has the wrong base URL: its base URL must be on ${input.tokenOrigin}`
        : input.problem === 'unreadable' ? 'could not be read on this site' : 'has no client ID: save the OAuth client ID as its username';
      return unusable(input.connection, input.label, problem);
    },
  };
}

/** Same positional object contract; the existing credential owner fulfills the Jini read port. */
export function resolveByoClient(required: { readonly credentials: ByoClientCredentials; readonly workspaceId: string; readonly connection: DeclaredApiConnection }, _optional: Record<string, never> = {}) {
  return resolveConnectionByoClient({ workspaceId: required.workspaceId, connection: required.connection, byoCredentials: createByoCredentials({ credentials: required.credentials }) });
}
