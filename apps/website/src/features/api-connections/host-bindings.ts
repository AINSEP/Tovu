import type { Clock } from '@jini-ai/core/primitives';
import type { OAuthHttpPorts } from '@jini-ai/core/contracts/oauth';
import type { KeyringPort, SecretSealerPort } from '@jini-ai/platform/secrets';
import type { VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import type { startLoopbackAuthorizationReceiver } from '@jini-ai/oauth';
import type { ApiConnectionHostPorts, ApiConnectionRuntime, ApiConnectionSharedFactoryInput, PluginHttp } from '@jini-ai/integrations/api-connections';
import type { LoadPluginContributions } from '../agent-plugins/lifecycle.js';
import type { CustomCredentialSetRepoPort } from '../custom-credentials/index.js';
import { createByoCredentials } from './byo-client.js';
import { createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore } from './vault-stores.js';
import { loadDeclaredApiConnections } from './contribution.js';
import { createSharedApiConnections, type SharedApiConnectionDeps } from './shared-api.js';
import { createRateLimiter } from '../../contracts/core/rate-limit/rate-limit.js';

export interface ApiConnectionHostDeps {
  readonly workspaceId: string;
  readonly loadContributions: LoadPluginContributions;
  readonly vaultRepo: VaultRepoPort;
  /** The site's saved custom credentials, where an admin's own OAuth client is kept (`byo-client.ts`); opened with `keyring` + `sealer`. */
  readonly customCredentialRepo: CustomCredentialSetRepoPort;
  readonly keyring: KeyringPort;
  readonly sealer: SecretSealerPort;
  readonly clock: Clock;
  /** Guarded OAuth fetch + URL policy (`createTovuOAuthHttpPorts`). */
  readonly oauthHttp: OAuthHttpPorts;
  /** The guarded plugin HTTP (the same one plugin tools get); each connection's hooks get it limited to that connection's origins. */
  readonly pluginHttp: PluginHttp;
  readonly runtime: ApiConnectionRuntime;
  /** Host configuration the plugin's client names resolve in (process env at the composition root). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** This site's public origin for the hosted callback; undefined when it has none. */
  readonly publicOrigin: () => string | undefined;
}

export interface ApiConnectionHostOptions {
  /** Injectable for tests (observe listeners); production uses Jini's 127.0.0.1 loopback receiver. */
  readonly startLoopback?: typeof startLoopbackAuthorizationReceiver;
  readonly shared?: SharedApiConnectionDeps;
}

/** The one Tovu storage owner and exact existing host dependencies; this binder performs no reads. */
export function bindApiConnectionHost({ required, optional }: { required: ApiConnectionHostDeps; optional: ApiConnectionHostOptions }, _optional: Record<string, never> = {}) {
  const vault = createApiConnectionVault({ repo: required.vaultRepo, keyring: required.keyring, sealer: required.sealer, clock: required.clock, workspaceId: required.workspaceId });
  const records = createApiConnectionVaultRecordStore({ vault, workspaceId: required.workspaceId, clock: required.clock });
  const createLimiter: ApiConnectionHostPorts['createLimiter'] = ({ profile, clock }) => createRateLimiter({ profile, clock });
  return {
    required: {
      workspaceId: required.workspaceId, clock: required.clock, oauthHttp: required.oauthHttp,
      pluginHttp: required.pluginHttp, runtime: required.runtime, env: required.env, publicOrigin: required.publicOrigin,
      apiConnectionStorage: { vault, records, tokensFor: ({ owner }: Parameters<ApiConnectionHostPorts['apiConnectionStorage']['tokensFor']>[0]) => createApiConnectionVaultTokenStore({ vault, records, clock: required.clock, owner }) },
      loadDeclaredConnections: ({ workspaceId }: { workspaceId: string }) => loadDeclaredApiConnections({ workspaceId, loadContributions: required.loadContributions }),
      createSharedConnections: (input: ApiConnectionSharedFactoryInput) => createSharedApiConnections({ ...optional.shared!, ...input }),
      appIdentity: { clientDisplayName: 'Tovu', softwareId: 'tovu' },
      byoCredentials: createByoCredentials({ credentials: { repo: required.customCredentialRepo, keyring: required.keyring, sealer: required.sealer } }),
      createLimiter,
    },
    optional: { ...(optional.startLoopback ? { startLoopback: optional.startLoopback } : {}), ...(optional.shared ? { shared: optional.shared.storage } : {}) },
  };
}
