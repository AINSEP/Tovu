import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { HttpClientPort } from "@jini-ai/core/primitives";

import { createRateLimiter, type RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import { createApiConnectionHost, type ApiConnectionHost, type ApiConnectionRuntime } from "#src/features/api-connections/host";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import type { AgentPluginExecutableToolHost } from "#src/features/agent-plugins/executable-tools/register";
import { createAgentPluginToolCapabilities, createFrozenConnectionAccounts, createGuardedPluginHttp } from "#src/features/agent-plugins/executable-tools/host-capabilities";
import { createAgentPluginAdminSurfaceHandlers, type AgentPluginAdminSurfaceHandlers } from "#src/features/agent-plugins/admin-surfaces/handlers";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";

/**
 * @file One site's binding of the three plugin-facing host seams that share a connection port:
 * plugin-declared API connections (sign-in, callback, tokens), the executable plugin-tool host
 * ports, and plugin-supplied admin-surface handlers. Called by both composition roots (`deps.ts`
 * for SQLite sites, `app.ts` for the in-memory one) so they cannot drift.
 *
 * The connection port is built ONCE and shared, so a tool call and a surface action see the same
 * ownership rule (a ref must be declared by the calling plugin in this workspace) and the same
 * limiter budget. Nothing here names a provider.
 */

/**
 * Every plugin's outbound budget until plugins can declare their own: per plugin key, one shared
 * window per site, sized to the largest per-instance budget a bundled provider needs (~240/min).
 * TODO(plugin budgets): read plugin-declared budgets (per user / per instance) once a declaration
 * format exists; until then a plugin narrows its own use through its `limiter.check` keys.
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

/**
 * Builds the shared connection port and the three seams over it.
 * @param required.http - The site's guarded outbound HTTP client (OAuth, plugin hooks and plugin tools all use it).
 * @param required.env - Host configuration plugin client names resolve in (`process.env` in production).
 * @param required.derivedPublicOrigin - The listener origin, for the hosted callback when `TOVU_PUBLIC_URL` is unset.
 * @complexity O(1); every lookup is deferred to call time.
 */
export function composeAgentPluginConnections(
  required: {
    readonly workspaceId: string; readonly loadContributions: LoadPluginContributions;
    readonly vaultRepo: VaultRepoPort; readonly keyring: KeyringPort; readonly sealer: SecretSealerPort;
    readonly clock: { nowMs(): number; nowIso(): string }; readonly http: HttpClientPort;
    readonly env: Readonly<Record<string, string | undefined>>; readonly derivedPublicOrigin: string | undefined;
  },
  _optional: Record<string, never> = {},
): AgentPluginConnectionsComposition {
  const { workspaceId, loadContributions, clock, http, env } = required;
  const host = createApiConnectionHost({
    workspaceId, loadContributions, vaultRepo: required.vaultRepo, keyring: required.keyring, sealer: required.sealer, clock,
    oauthHttp: createTovuOAuthHttpPorts({ http }), pluginHttp: createGuardedPluginHttp({ http }),
    runtime: resolveApiConnectionRuntime({ env }), env,
    publicOrigin: () => apiConnectionPublicOrigin({ env, derivedPublicOrigin: required.derivedPublicOrigin }),
  });
  const limiter = createRateLimiter({ profile: AGENT_PLUGIN_OUTBOUND_BUDGET, clock });
  const connections = host.toolConnections;
  const capabilities = createAgentPluginToolCapabilities({ connections, http, limiter, frozen: createFrozenConnectionAccounts() });
  return {
    apiConnections: { host },
    agentPluginTools: { loadContributions, connections, http, limiter },
    adminSurfaceHost: createAgentPluginAdminSurfaceHandlers({ workspaceId, loadContributions, capabilities }),
  };
}
