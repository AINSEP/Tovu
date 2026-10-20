/**
 * @file Tovu's implementation of the capability ports an executable Agent Plugin tool receives
 * (`AgentPluginToolCapabilitiesPort` from `@jini-ai/agent-plugins/lifecycle/tools`).
 *
 * Exists so plugin code never holds a credential store, a raw network client or another plugin's
 * budget: every capability is scoped here to the calling plugin and workspace.
 * - connections: delegated to the host's connection accessor, always with the calling plugin and
 *   workspace, so a plugin can only reach its own connections in this workspace. When the call was
 *   confirmed, the account shown on the card is required (a switched account is refused).
 * - http: the guarded outbound client (public addresses only, no redirects), HTTPS only, bounded.
 * - limiter: the real http-kit limiter, keyed per workspace and plugin so budgets never mix.
 * - artifacts: an optional writer; absent, writes refuse with a next step.
 * Nothing here names a provider.
 */
import type { AgentPluginHttpOptions, AgentPluginLimitResult, AgentPluginToolCapabilities, AgentPluginToolCapabilitiesPort } from '@jini-ai/agent-plugins/lifecycle/tools';
import type { HttpClientPort } from '@jini-ai/core/primitives';

/** Which connection a call asks for. `connectionRef` is opaque and comes from plugin input. */
export interface AgentPluginConnectionTarget {
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly connectionRef: string;
}

/** Host port over the API-connection service (implemented with the connection lots). It must refuse
 *  a `connectionRef` that the plugin does not own in that workspace, and never return a refresh token. */
export interface AgentPluginConnectionAccess {
  /** The signed-in account, or null when the connection is not connected or not owned. */
  readAccount(required: AgentPluginConnectionTarget, optional?: Record<string, never>): Promise<{ readonly accountId: string; readonly displayName: string } | null>;
  /** A fresh access token; refuses (`account-changed`) when `expectedAccountId` no longer matches. */
  getAccessToken(required: AgentPluginConnectionTarget, optional?: { readonly expectedAccountId?: string }): Promise<string>;
}

/** Optional host store for files a tool hands to the user (e.g. an export). */
export interface AgentPluginArtifactWriter {
  write(required: { readonly workspaceId: string; readonly pluginId: string; readonly name: string; readonly mediaType: string; readonly content: string | Uint8Array }, optional?: Record<string, never>): Promise<{ readonly artifactRef: string }>;
}

/** The limiter shape of `@jini-ai/http-kit`'s `RateLimiter` (Tovu's `createRateLimiter`). */
export interface AgentPluginRateLimiter {
  check(required: { readonly key: string }): Promise<AgentPluginLimitResult>;
}

/** Accounts frozen when a call was confirmed, keyed by that call's abort signal (one per execution). */
export interface FrozenConnectionAccounts {
  bind(required: { readonly signal: AbortSignal; readonly accounts: ReadonlyMap<string, string> }, optional?: Record<string, never>): void;
  lookup(required: { readonly signal: AbortSignal | undefined; readonly connectionRef: string }, optional?: Record<string, never>): string | undefined;
}

/** Response bodies a plugin may read in one request; larger answers fail instead of truncating. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const IDLE_TIMEOUT_MS = 30_000;

export const ARTIFACTS_UNAVAILABLE_MESSAGE = 'Saving a file from a plugin tool is not available on this site yet. Ask for the data in chat instead.';
export const HTTPS_ONLY_MESSAGE = 'Plugin tools may only call https:// addresses. Report this to the plugin author.';
export const RESPONSE_TOO_LARGE_MESSAGE = 'The service returned more data than a plugin tool may read at once. Request a smaller range and retry.';

/** Creates the frozen-account map. Weakly keyed: an execution's entry disappears with its signal. @complexity O(1). */
export function createFrozenConnectionAccounts(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): FrozenConnectionAccounts {
  const bySignal = new WeakMap<AbortSignal, ReadonlyMap<string, string>>();
  return {
    bind: ({ signal, accounts }) => { bySignal.set(signal, accounts); },
    lookup: ({ signal, connectionRef }) => (signal ? bySignal.get(signal)?.get(connectionRef) : undefined),
  };
}

/** Plugin HTTP through the guarded client: HTTPS only, no redirects, bounded body, never truncated.
 * @complexity O(response size). */
async function guardedPluginFetch(http: HttpClientPort, url: string, options: AgentPluginHttpOptions = {}): Promise<Response> {
  if (new URL(url).protocol !== 'https:') throw new Error(HTTPS_ONLY_MESSAGE);
  const response = await http.send({ request: {
    url, method: options.method ?? 'GET', headers: { ...options.headers }, idleTimeoutMs: IDLE_TIMEOUT_MS, maxResponseBytes: MAX_RESPONSE_BYTES,
    ...(options.body === undefined ? {} : { body: options.body }), ...(options.signal === undefined ? {} : { signal: options.signal }),
  } }, { redirect: 'error' });
  if (response.bodyTruncated) throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  // Fetch forbids bodies on 204/205/304, even when the native port returns an empty string.
  return new Response([204, 205, 304].includes(response.status) ? null : response.bodyText, { status: response.status, headers: { ...response.headers } });
}

/**
 * Builds the capabilities port the tool projection calls once per invocation.
 * @param required.connections - Host connection accessor (ownership enforced there and by the scope passed here).
 * @param required.http - The guarded outbound HTTP client.
 * @param required.limiter - The http-kit limiter sized for plugin budgets.
 * @param required.frozen - Accounts frozen by the confirmation step.
 * @param optional.artifacts - File writer; omitted, `artifacts.write` refuses.
 * @complexity O(1) per call; each capability is one delegated call.
 */
export function createAgentPluginToolCapabilities(
  required: { readonly connections: AgentPluginConnectionAccess; readonly http: HttpClientPort; readonly limiter: AgentPluginRateLimiter; readonly frozen: FrozenConnectionAccounts },
  optional: { readonly artifacts?: AgentPluginArtifactWriter } = {},
): AgentPluginToolCapabilitiesPort {
  const { connections, http, limiter, frozen } = required;
  return ({ pluginId, workspaceId, signal }): AgentPluginToolCapabilities => ({
    connections: { async getAccessToken({ connectionRef }) {
      const expectedAccountId = frozen.lookup({ signal, connectionRef });
      return connections.getAccessToken({ workspaceId, pluginId, connectionRef }, expectedAccountId === undefined ? {} : { expectedAccountId });
    } },
    http: { fetch: ({ url }, options) => guardedPluginFetch(http, url, options) },
    // NUL cannot appear in a workspace or plugin id, so one plugin's key can never name another's budget.
    limiter: { check: ({ key }) => limiter.check({ key: `${workspaceId}\u0000${pluginId}\u0000${key}` }) },
    artifacts: { async write(input) {
      if (!optional.artifacts) throw new Error(ARTIFACTS_UNAVAILABLE_MESSAGE);
      return optional.artifacts.write({ ...input, workspaceId, pluginId });
    } },
  });
}
