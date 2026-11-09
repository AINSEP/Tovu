import type { Clock } from '@jini-ai/core/primitives';
import type { OAuthHttpPorts } from '@jini-ai/core/contracts/oauth';
import type { KeyringPort, SecretSealerPort } from '@jini-ai/platform/secrets';
import type { VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import { startLoopbackAuthorizationReceiver } from '@jini-ai/oauth';
import { apiConnectionOAuthCapabilities } from './oauth-bindings.js';
import type { ApiConnectionHostPorts, ApiConnectionHostMessages, ApiConnectionRuntime, ApiConnectionSharedFactoryInput, PluginHttp } from '@jini-ai/integrations/api-connections';
import type { LoadPluginContributions } from '../agent-plugins/lifecycle.js';
import type { CustomCredentialSetRepoPort } from '../custom-credentials/index.js';
import { createAdminSurfaceCallbackInbox } from '@jini-ai/agent-plugins/admin-surfaces';
import { createAgentPluginStateStore } from './plugin-state.js';
import { API_CONNECTION_OAUTH_CALLBACK_PATH } from './browser-binding.js';
import { createByoCredentials } from './byo-client.js';
import { createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore } from './vault-stores.js';
import { loadDeclaredApiConnections } from './contribution.js';
import { createSharedApiConnections, type SharedApiConnectionDeps } from './shared-api.js';
import { createRateLimiter } from '../../contracts/core/rate-limit/rate-limit.js';

/**
 * Host setting: the comma-separated site origins registered as hosted sign-in return addresses with
 * the shared web clients (a placeholder the operator fills; never a secret). It adds to a
 * connection's own `clients.web.redirectOrigins`; with neither, hosted sign-in is refused.
 */
export const API_CONNECTION_CALLBACK_ORIGINS_ENV = "TOVU_API_CONNECTION_CALLBACK_ORIGINS";

const messages: ApiConnectionHostMessages = {
  callbackOriginsEnv: API_CONNECTION_CALLBACK_ORIGINS_ENV,
  notConfigured: ({ label, runtime, what }) => `${label} is not set up on this ${runtime === "desktop" ? "desktop app" : "site"}: its ${what} is not configured. Ask the operator to configure it, then retry.`,
  missingReturnAddress: ({ label }) => `${label} cannot sign in on this site yet: no registered sign-in return address is configured. Ask the operator to set ${API_CONNECTION_CALLBACK_ORIGINS_ENV} to this site's address, then retry.`,
  unregisteredOrigin: ({ label }) => `${label} cannot sign in from this site's address. Use a registered address or configure your own sign-in client.`,
  noPublicOrigin: ({ label }) => `${label} cannot sign in from this site's address: this site has no public address. Set TOVU_PUBLIC_URL, then retry.`,
};

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
      workspaceId: required.workspaceId, clock: required.clock, oauthHttp: required.oauthHttp, oauth: apiConnectionOAuthCapabilities,
      pluginHttp: required.pluginHttp, runtime: required.runtime, env: required.env, publicOrigin: required.publicOrigin,
      apiConnectionStorage: { vault, records, tokensFor: ({ owner }: Parameters<ApiConnectionHostPorts['apiConnectionStorage']['tokensFor']>[0]) => createApiConnectionVaultTokenStore({ vault, records, clock: required.clock, owner }) },
      loadDeclaredConnections: ({ workspaceId }: { workspaceId: string }) => loadDeclaredApiConnections({ workspaceId, loadContributions: required.loadContributions }),
      createSharedConnections: (input: ApiConnectionSharedFactoryInput) => createSharedApiConnections({ ...optional.shared!, ...input }),
      appIdentity: { clientDisplayName: 'Tovu', softwareId: 'tovu' },
      byoCredentials: createByoCredentials({ credentials: { repo: required.customCredentialRepo, keyring: required.keyring, sealer: required.sealer } }),
      createLimiter,
      pluginState: createAgentPluginStateStore({ vault, workspaceId: required.workspaceId }),
      callbackInbox: createAdminSurfaceCallbackInbox({ now: () => required.clock.nowMs() }),
      callbackPath: API_CONNECTION_OAUTH_CALLBACK_PATH,
      startLoopback: optional.startLoopback ?? startLoopbackAuthorizationReceiver,
      messages,
    },
    optional: { ...(optional.shared ? { shared: optional.shared.storage } : {}) },
  };
}
