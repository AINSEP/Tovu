import { randomBytes } from "node:crypto";

import { createApiConnectionService, deriveApiConnectionKey, ApiConnectionError, type ApiConnectionClientKind, type ApiConnectionService } from "@jini-ai/integrations/api-connections";
import type { OAuthClient, OAuthHttpPorts } from "@jini-ai/oauth";
import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { Clock } from "@jini-ai/core/primitives";

import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import { loadDeclaredApiConnections, type ApiConnectionClientConfig, type DeclaredApiConnection } from "./contribution.js";
import { createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore, type ApiConnectionVaultRecordStore } from "./vault-stores.js";

/**
 * @file Composes Jini's api-connections service (G1) with Tovu's vault stores (G2 + 0020) for every
 * connection an active plugin declares. One host per workspace; callers ask it for a connection's
 * service, its record store or a fresh access token. Nothing here names a provider.
 *
 * Runtime decides the client: `hosted` uses the plugin's web client (confidential: its secret is
 * required) and the fixed public callback; `desktop` uses the installed-app client (public, PKCE,
 * optionally with a provider-issued non-confidential secret) and a per-attempt loopback redirect.
 * Tokens stay bound to the client that issued them.
 */

/** The public, cookie-less callback every hosted API-connection sign-in returns to. */
export const API_CONNECTION_OAUTH_CALLBACK_PATH = "/api/agent-plugins/connections/oauth/callback";

export type ApiConnectionRuntime = "hosted" | "desktop";

export interface ApiConnectionHostDeps {
  readonly workspaceId: string;
  readonly loadContributions: LoadPluginContributions;
  readonly vaultRepo: VaultRepoPort;
  readonly keyring: KeyringPort;
  readonly sealer: SecretSealerPort;
  readonly clock: Clock;
  /** Guarded OAuth fetch + URL policy (`createTovuOAuthHttpPorts`). */
  readonly oauthHttp: OAuthHttpPorts;
  /** The guarded HTTP capability plugin hooks receive (the same one plugin tools get). */
  readonly pluginHttp: unknown;
  readonly runtime: ApiConnectionRuntime;
  /** Host configuration the plugin's client names resolve in (process env at the composition root). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** This site's public origin for the hosted callback; undefined when it has none. */
  readonly publicOrigin: () => string | undefined;
  readonly displayName?: string;
}

/** Why a connection cannot be used on this host, in words for the person, never a secret value. */
function setupRefused(message: string): ApiConnectionError {
  return new ApiConnectionError({ code: "descriptor-invalid", message });
}

/** A configured host setting, trimmed; undefined when the plugin names none or it is unset. @complexity O(1). */
function configured(env: ApiConnectionHostDeps["env"], name: string | undefined): string | undefined {
  return name === undefined ? undefined : env[name]?.trim() || undefined;
}

/**
 * The runtime's OAuth client and how it is registered. Desktop is the installed app (`public`): PKCE,
 * and a provider-issued secret only when the provider requires one for installed apps (it is not
 * confidential there, but it still stays in host config and is never shown or logged). Hosted is the
 * web client (`confidential`) and must have its server-held secret.
 * @complexity O(1).
 */
function resolveClient(connection: DeclaredApiConnection, runtime: ApiConnectionRuntime, env: ApiConnectionHostDeps["env"]): { readonly client: OAuthClient; readonly clientKind: ApiConnectionClientKind } {
  const config: ApiConnectionClientConfig | undefined = runtime === "desktop" ? connection.clients.desktop : connection.clients.web;
  const where = runtime === "desktop" ? "desktop app" : "site";
  const clientId = configured(env, config?.clientIdEnv);
  if (!config || !clientId) {
    throw setupRefused(`${connection.descriptor.label} is not set up on this ${where}: its sign-in client is not configured. Ask the operator to configure it, then retry.`);
  }
  const clientSecret = configured(env, config.clientSecretEnv);
  const clientKind: ApiConnectionClientKind = runtime === "desktop" ? "public" : "confidential";
  if (clientKind === "confidential" && !clientSecret) {
    throw setupRefused(`${connection.descriptor.label} is not set up on this ${where}: its sign-in client secret is not configured. Ask the operator to configure it, then retry.`);
  }
  return { clientKind, client: clientSecret ? { clientId, clientSecret, authMethod: "client_secret_post" } : { clientId, authMethod: "none" } };
}

/**
 * Builds the workspace host. Declarations are read fresh per call, so enabling or disabling a
 * plugin takes effect without a restart (Node caches each hooks module per file URL).
 * @complexity O(1) setup; each lookup is one contribution load, O(p + c).
 */
export function createApiConnectionHost(required: ApiConnectionHostDeps, _optional: Record<string, never> = {}) {
  const vault = createApiConnectionVault({ repo: required.vaultRepo, keyring: required.keyring, sealer: required.sealer, clock: required.clock, workspaceId: required.workspaceId });
  const records: ApiConnectionVaultRecordStore = createApiConnectionVaultRecordStore({ vault, workspaceId: required.workspaceId, clock: required.clock });

  async function listConnections(input: { readonly pluginId?: string } = {}): Promise<readonly DeclaredApiConnection[]> {
    const { connections } = await loadDeclaredApiConnections({ workspaceId: required.workspaceId, loadContributions: required.loadContributions });
    return input.pluginId === undefined ? connections : connections.filter((connection) => connection.pluginId === input.pluginId);
  }

  /** The hosted callback URL, refused when this site has no public origin or the shared client did not register it. */
  function hostedCallbackUrl({ connection }: { readonly connection: DeclaredApiConnection }): string {
    const origin = required.publicOrigin();
    const allowed = connection.clients.web?.redirectOrigins;
    if (!origin || (allowed && !allowed.includes(origin))) {
      throw setupRefused(`${connection.descriptor.label} cannot sign in from this site's address. Use a registered address or configure your own sign-in client.`);
    }
    return `${origin}${API_CONNECTION_OAUTH_CALLBACK_PATH}`;
  }

  /** One connection's service. Desktop passes the loopback redirect URI its attempt listens on. @complexity O(1). */
  function serviceFor(input: { readonly connection: DeclaredApiConnection; readonly redirectUri?: string }): ApiConnectionService {
    const { connection } = input;
    const { client, clientKind } = resolveClient(connection, required.runtime, required.env);
    const redirectUri = input.redirectUri ?? (required.runtime === "hosted" ? hostedCallbackUrl({ connection }) : undefined);
    const owner = { workspaceId: required.workspaceId, pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId, clientId: client.clientId };
    return createApiConnectionService({
      descriptor: connection.descriptor, client, clientKind,
      appOptions: { clientDisplayName: required.displayName ?? "Tovu", softwareId: "tovu", redirectUris: redirectUri ? [redirectUri] : [] },
      hooks: connection.module.createHooks({ http: required.pluginHttp }),
      records, tokens: createApiConnectionVaultTokenStore({ vault, records, clock: required.clock, owner }),
      fetchFn: required.oauthHttp.fetchFn, guard: required.oauthHttp.guard, clock: required.clock,
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      sleep: ({ ms }) => new Promise((resolve) => { setTimeout(resolve, ms); }),
    });
  }

  /**
   * The plugin host capability `connections.getAccessToken({ connectionRef })`, scoped to one plugin.
   * The ref must be the key of a connection THIS plugin declares in THIS workspace; anything else is
   * the same refusal, so a plugin cannot probe other plugins' or workspaces' refs. Only an access
   * token ever leaves: the refresh token stays inside the vault token store.
   * @complexity O(p + c) contribution load, then one token read (and at most one refresh).
   */
  function accessTokensFor(scope: { readonly pluginId: string }) {
    return {
      async getAccessToken(input: { readonly connectionRef: string }, options: { readonly expectedAccountId?: string } = {}): Promise<string> {
        const connection = (await listConnections({ pluginId: scope.pluginId })).find((candidate) =>
          deriveApiConnectionKey({ workspaceId: required.workspaceId, pluginId: scope.pluginId, connectionId: candidate.descriptor.connectionId }) === input.connectionRef);
        if (!connection) {
          throw new ApiConnectionError({ code: "connection-not-found", message: "This connection is not available to this plugin here. Connect the plugin's account, then retry." });
        }
        return serviceFor({ connection }).getAccessToken({ connectionRef: input.connectionRef }, options);
      },
    };
  }

  /** The scopes a sign-in for these scope sets would request, via the plugin's own hook. @complexity One hook call. */
  async function requestedScopes(input: { readonly connection: DeclaredApiConnection; readonly scopeSetIds: readonly string[] }): Promise<readonly string[]> {
    return input.connection.module.createHooks({ http: required.pluginHttp }).resolveScopes({ scopeSetIds: [...input.scopeSetIds] });
  }

  /** Token-free status straight from the record; a connection never created reads as disconnected. @complexity One read. */
  async function statusOf({ connection }: { readonly connection: DeclaredApiConnection }) {
    const key = deriveApiConnectionKey({ workspaceId: required.workspaceId, pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId });
    const record = await records.read({ key });
    return { connectionRef: key, status: record?.status ?? "disconnected", grantedScopes: record?.grantedScopes ?? [] } as const;
  }

  return { workspaceId: required.workspaceId, runtime: required.runtime, records, listConnections, serviceFor, accessTokensFor,
    requestedScopes, hostedCallbackUrl, statusOf };
}

export type ApiConnectionHost = ReturnType<typeof createApiConnectionHost>;
