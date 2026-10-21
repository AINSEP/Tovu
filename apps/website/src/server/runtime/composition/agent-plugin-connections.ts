import { defineAdminSurfaceContribution } from "@jini-ai/agent-plugins/admin-surfaces";
import { ADMIN_SURFACES_FILENAME } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { HttpClientPort } from "@jini-ai/core/primitives";
import { createIssuedTokenMemories } from "@jini-ai/agent-plugins/lifecycle/tools";

import type { FormDefinitionRepoPort } from "@jini-ai/cms/forms";
import type { SetValueRequired } from "@jini-ai/core/settings";

import type { CustomCredentialSetRepoPort } from "#src/features/custom-credentials/index";
import { loadFormDestinationRegistry } from "#src/features/form-destinations/registry";
import { readFormDeliveryBindings, writeFormDeliveryBindings } from "#src/features/settings/index";

import { createRateLimiter, type RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import { createApiConnectionHost, type ApiConnectionHost, type ApiConnectionRuntime } from "#src/features/api-connections/host";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import type { AgentPluginExecutableToolHost } from "#src/features/agent-plugins/executable-tools/register";
import { createAgentPluginToolCapabilities, createFrozenConnectionAccounts, createGuardedPluginHttp } from "#src/features/agent-plugins/executable-tools/host-capabilities";
import { createAgentPluginAdminSurfaceHandlers, type AgentPluginAdminSurfaceHandlers } from "#src/features/agent-plugins/admin-surfaces/handlers";
import { createAdminSurfaceCapabilities } from "#src/features/agent-plugins/admin-surfaces/capabilities";
import { createIssuedSignInCollector } from "#src/features/agent-plugins/admin-surfaces/issued-sign-ins";
import { createAdminSurfacePublicConfig } from "#src/features/agent-plugins/admin-surfaces/public-config";
import { createSurfaceDeliveryBindings, type FormDeliveryBindingsStore } from "#src/features/agent-plugins/admin-surfaces/delivery-bindings";
import { createSurfaceForms } from "#src/features/agent-plugins/admin-surfaces/forms";
import { createSurfaceConnections } from "#src/features/api-connections/surface-connections";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";

/**
 * @file One site's binding of the three plugin-facing host seams that share a connection port:
 * plugin-declared API connections (sign-in, callback, tokens), the executable plugin-tool host
 * ports, and plugin-supplied admin-surface handlers. Called by both composition roots (`deps.ts`
 * for SQLite sites, `app.ts` for the in-memory one) so they cannot drift.
 *
 * The connection port is built ONCE and shared, so a tool call and a surface action see the same
 * ownership rule (a ref must be declared by the calling plugin in this workspace) and the same
 * limiter budget. Surfaces additionally get account actions by connection id, the plugin's settings
 * store (read-write; tools read the same store), public config and, when the site passes its form
 * settings, the plugin's own form-delivery bindings. Nothing here names a provider.
 */

/**
 * The budget behind the `limiter` capability a plugin calls itself: per plugin key, one shared
 * window per site, sized to the largest per-instance budget a bundled provider needs (~240/min).
 * Budgets a plugin DECLARES on a connection (`budgets` in `tovu-connections.json`) are enforced by
 * the host on every token read instead (`features/api-connections/budgets.ts`), whatever the plugin
 * calls here.
 */
export const AGENT_PLUGIN_OUTBOUND_BUDGET: RateLimitProfile = { windowSeconds: 60, max: 240, burst: 40 };

/**
 * Installed-app (desktop) or hosted. The desktop shell starts this server with Electron's own Node
 * (`ELECTRON_RUN_AS_NODE=1`); every other launch is a hosted site with a public callback.
 * @complexity O(1).
 */
export function resolveApiConnectionRuntime(required: { readonly env: Readonly<Record<string, string | undefined>> }, _optional: Record<string, never> = {}): ApiConnectionRuntime {
  return required.env.ELECTRON_RUN_AS_NODE === "1" ? "desktop" : "hosted";
}

/**
 * The origin the hosted callback is built on: an operator-set `TOVU_PUBLIC_URL` wins, the derived
 * listener origin fills the gap (the same precedence `agent_plugin_connect` uses for MCP callbacks).
 * A malformed or non-http(s) `TOVU_PUBLIC_URL` counts as unset.
 * @complexity O(1).
 */
export function apiConnectionPublicOrigin(
  required: { readonly env: Readonly<Record<string, string | undefined>>; readonly derivedPublicOrigin: string | undefined },
  _optional: Record<string, never> = {},
): string | undefined {
  const configured = required.env.TOVU_PUBLIC_URL?.trim();
  const parsed = configured ? URL.parse(configured) : null;
  const origin = parsed && (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed.origin : undefined;
  return origin ?? (required.derivedPublicOrigin || undefined);
}

export interface AgentPluginConnectionsComposition {
  /** `AgentPluginConnectToolDeps.apiConnections` and the public callback route's host. */
  readonly apiConnections: { readonly host: ApiConnectionHost };
  /** `InstalledExtensionToolDeps.agentPluginTools`. */
  readonly agentPluginTools: AgentPluginExecutableToolHost;
  /** `AgentPluginsRouteDeps.adminSurfaceHost` (call `refresh` once at boot). */
  readonly adminSurfaceHost: AgentPluginAdminSurfaceHandlers;
}

/** What the admin-surface `deliveryBindings` port writes through: the site's settings ledger and its forms. */
export interface AgentPluginDeliveryBindingsDeps {
  /** The settings write deps; every write goes through the host chokepoint, authorized for the admin. */
  readonly settings: SetValueRequired["deps"];
  readonly forms: Pick<FormDefinitionRepoPort, "list">;
  readonly newBindingId: () => string;
}

/** `core.forms/deliveryBindings` through its owner's read and typed write. @complexity O(1) to build. */
function formDeliveryBindingsStore(required: { settings: SetValueRequired["deps"] }, _optional: Record<string, never> = {}): FormDeliveryBindingsStore {
  const { settings } = required;
  return {
    read: ({ workspaceId }) => readFormDeliveryBindings({ settingsRepo: settings.repo, workspaceId }),
    write: async ({ workspaceId, callerPrincipalId, value, expectedValue }) => { await writeFormDeliveryBindings({ deps: settings, workspaceId, callerPrincipalId, value }, { expectedValue }); },
  };
}

/**
 * Builds the shared connection port and the three seams over it.
 * @param required.customCredentialRepo - The site's saved custom credentials (an admin's own OAuth client lives there).
 * @param required.http - The site's guarded outbound HTTP client (OAuth, plugin hooks and plugin tools all use it).
 * @param required.env - Host configuration plugin client names resolve in (`process.env` in production).
 * @param required.derivedPublicOrigin - The listener origin, for the hosted callback when `TOVU_PUBLIC_URL` is unset.
 * @param optional.deliveryBindings - The site's settings and forms; absent, surfaces get no `deliveryBindings`.
 * @complexity O(1); every lookup is deferred to call time.
 */
export function composeAgentPluginConnections(
  required: {
    readonly workspaceId: string; readonly loadContributions: LoadPluginContributions;
    readonly vaultRepo: VaultRepoPort; readonly keyring: KeyringPort; readonly sealer: SecretSealerPort;
    readonly customCredentialRepo: CustomCredentialSetRepoPort;
    readonly clock: { nowMs(): number; nowIso(): string }; readonly http: HttpClientPort;
    readonly env: Readonly<Record<string, string | undefined>>; readonly derivedPublicOrigin: string | undefined;
  },
  optional: { readonly deliveryBindings?: AgentPluginDeliveryBindingsDeps } = {},
): AgentPluginConnectionsComposition {
  const { workspaceId, loadContributions, clock, http, env } = required;
  const runtime = resolveApiConnectionRuntime({ env });
  const host = createApiConnectionHost({
    workspaceId, loadContributions, vaultRepo: required.vaultRepo, keyring: required.keyring, sealer: required.sealer,
    customCredentialRepo: required.customCredentialRepo, clock,
    // The installed-app redirect is `http://127.0.0.1:<port>` (RFC 8252 loopback), and the OAuth guard
    // checks redirect URIs like endpoints, so desktop admits plaintext loopback there. Nothing is
    // fetched from loopback because of it: the guarded transport still refuses private addresses.
    oauthHttp: createTovuOAuthHttpPorts({ http }, { allowLoopbackHttp: runtime === "desktop" }), pluginHttp: createGuardedPluginHttp({ http }),
    runtime, env,
    publicOrigin: () => apiConnectionPublicOrigin({ env, derivedPublicOrigin: required.derivedPublicOrigin }),
  });
  const limiter = createRateLimiter({ profile: AGENT_PLUGIN_OUTBOUND_BUDGET, clock });
  const connections = host.toolConnections;
  // One plugin-settings store: surfaces write it, tools (and later form delivery) only read it.
  const state = (scope: { readonly workspaceId: string; readonly pluginId: string }) => host.pluginState.readerFor(scope);
  const apiOrigins = host.apiOriginsFor;
  const tools = createAgentPluginToolCapabilities({ connections, http, limiter, frozen: createFrozenConnectionAccounts(), state, apiOrigins });
  // ONE token memory for both seams: a plugin's tools and surface handlers share module scope, so a
  // token a handler obtained must be withheld from a tool's output too, and the reverse.
  const issuedTokens = createIssuedTokenMemories();
  const signIns = createIssuedSignInCollector();
  const delivery = optional.deliveryBindings;
  const deliveryBindingsFor = delivery && ((scope: { readonly pluginId: string; readonly workspaceId: string; readonly principalId?: string | undefined }) => createSurfaceDeliveryBindings({
    ...scope, siteWorkspaceId: workspaceId, forms: delivery.forms, newBindingId: delivery.newBindingId, bindings: formDeliveryBindingsStore({ settings: delivery.settings }),
    declaredConnectionIds: async ({ pluginId }) => (await host.listConnections({ pluginId })).map((connection) => connection.descriptor.connectionId),
    contributedAdapterIds: async ({ workspaceId: scopeWorkspaceId, pluginId }) => (await loadFormDestinationRegistry({ workspaceId: scopeWorkspaceId }, { loadContributions })).list()
      .filter((destination) => destination.pluginId === pluginId).map((destination) => destination.descriptor.id),
  }));
  const capabilities = createAdminSurfaceCapabilities({
    tools, publicConfig: createAdminSurfacePublicConfig({ env }),
    stateFor: (scope) => host.pluginState.forPlugin(scope),
    connectionsFor: ({ pluginId, workspaceId: scopeWorkspaceId, principalId }) => createSurfaceConnections({
      host, pluginId, workspaceId: scopeWorkspaceId, principalId, onSignInIssued: (issued) => signIns.record(issued),
    }),
  }, delivery && deliveryBindingsFor ? {
    deliveryBindingsFor,
    formsFor: ({ workspaceId: scopeWorkspaceId, principalId }) => createSurfaceForms({
      siteWorkspaceId: workspaceId, workspaceId: scopeWorkspaceId,
      ...(principalId === undefined ? {} : { principalId }),
      forms: delivery.forms, authorize: delivery.settings.authorize,
    }),
  } : {});
  const adminSurfaceHost = createAgentPluginAdminSurfaceHandlers({ workspaceId, loadContributions, capabilities, issuedTokens, hostKind: runtime }, { signIns });
  const surfaceDefinition = defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME });
  return {
    apiConnections: { host },
    agentPluginTools: { loadContributions, connections, http, limiter, state, apiOrigins, issuedTokens,
      adminSurfaces: { host: adminSurfaceHost, source: {
        list: async ({ workspaceId: scopeWorkspaceId }) => (await loadContributions({ workspaceId: scopeWorkspaceId, definition: surfaceDefinition }, { requireActive: true, orderByPluginId: true })).items,
      } },
    },
    adminSurfaceHost,
  };
}
