/**
 * @file Tovu's implementation of the capability ports an executable Agent Plugin tool receives
 * (`AgentPluginToolCapabilitiesPort` from `@jini-ai/agent-plugins/lifecycle/tools`).
 *
 * Exists so plugin code never holds a credential store, a raw network client or another plugin's
 * budget: every capability is scoped here to the calling plugin and workspace.
 * - connections: delegated to the host's connection accessor, always with the calling plugin and
 *   workspace, so a plugin can only reach its own connections in this workspace. Jini's capability
 *   session already refuses any ref but the call's own top-level `connectionRef`; when the call was
 *   confirmed, the account shown on the card is required too (a switched account is refused).
 * - http: the guarded outbound client (public addresses only, no redirects), HTTPS only, bounded,
 *   and only to the https origins the calling plugin's connections declare (`apiOrigins`), so a URL
 *   built from tool input can never carry the plugin's bearer token to another host.
 * - limiter: the real http-kit limiter, keyed per workspace and plugin so budgets never mix.
 * - artifacts: an optional writer; absent, the capability is absent too (Jini's port is optional), so a
 *   tool can check for it before doing work it could not save.
 * - state: the plugin's own settings, read-only (`get` alone), from the store its admin surface
 *   writes, keyed by the same plugin and workspace.
 * Nothing here names a provider.
 */
import type { AgentPluginHttpOptions, AgentPluginLimitResult, AgentPluginStateReader, AgentPluginToolCapabilities, AgentPluginToolCapabilitiesPort } from '@jini-ai/agent-plugins/lifecycle/tools';
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

/** The read-only settings view for one plugin in one workspace (`api-connections/plugin-state.ts`'s `readerFor`). */
export type AgentPluginStateReaderFor = (required: { readonly workspaceId: string; readonly pluginId: string }, optional?: Record<string, never>) => AgentPluginStateReader;

/** The https origins one plugin's connections declare in one workspace (the union of their `apiOrigins`). */
export type AgentPluginApiOriginsFor = (required: { readonly workspaceId: string; readonly pluginId: string }, optional?: Record<string, never>) => Promise<readonly string[]>;

/** Accounts frozen when a call was confirmed, keyed by that call's abort signal (one per execution). */
export interface FrozenConnectionAccounts {
  bind(required: { readonly signal: AbortSignal; readonly accounts: ReadonlyMap<string, string> }, optional?: Record<string, never>): void;
  /** The frozen account id; `null` when the call was frozen but not for this connection; `undefined` when it was never frozen. */
  lookup(required: { readonly signal: AbortSignal | undefined; readonly connectionRef: string }, optional?: Record<string, never>): string | null | undefined;
}

/** Response bodies a plugin may read in one request; larger answers fail instead of truncating. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const IDLE_TIMEOUT_MS = 30_000;

export const HTTPS_ONLY_MESSAGE = 'Plugin tools may only call https:// addresses. Report this to the plugin author.';
export const UNDECLARED_ORIGIN_MESSAGE = 'Plugin tools may only call the API addresses their plugin declares. Report this to the plugin author.';
export const RESPONSE_TOO_LARGE_MESSAGE = 'The service returned more data than a plugin tool may read at once. Request a smaller range and retry.';
export const UNAPPROVED_CONNECTION_MESSAGE = 'This call was approved for another connection, so it cannot use this one. Nothing was changed.';

/** Creates the frozen-account map. Weakly keyed: an execution's entry disappears with its signal. @complexity O(1). */
export function createFrozenConnectionAccounts(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): FrozenConnectionAccounts {
  const bySignal = new WeakMap<AbortSignal, ReadonlyMap<string, string>>();
  return {
    bind: ({ signal, accounts }) => { bySignal.set(signal, accounts); },
    lookup: ({ signal, connectionRef }) => {
      const accounts = signal ? bySignal.get(signal) : undefined;
      return accounts === undefined ? undefined : accounts.get(connectionRef) ?? null;
    },
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
 * The guarded `http` capability alone, for host code that hands plugin modules the same HTTP a tool
 * gets (API-connection hooks read the signed-in account through it).
 * @complexity O(1); each fetch is O(response size).
 */
export function createGuardedPluginHttp(required: { readonly http: HttpClientPort }, _optional: Record<string, never> = {}): AgentPluginToolCapabilities['http'] {
  return { fetch: ({ url }, options) => guardedPluginFetch(required.http, url, options) };
}

/**
 * One plugin's HTTP: an https URL outside its declared origins is refused before anything is sent;
 * the https rule itself stays in {@link guardedPluginFetch} so a plaintext URL keeps its own message.
 * @complexity One origins lookup per fetch, then O(response size).
 */
function declaredOriginsHttp(http: HttpClientPort, origins: () => Promise<readonly string[]>, toolSignal: AbortSignal | undefined): AgentPluginToolCapabilities['http'] {
  return { async fetch({ url }, options = {}) {
    const target = new URL(url);
    if (target.protocol === 'https:' && !(await origins()).includes(target.origin)) throw new Error(UNDECLARED_ORIGIN_MESSAGE);
    return guardedPluginFetch(http, url, { ...options, ...withToolSignal(toolSignal, options.signal) });
  } };
}

/** Aborting the tool aborts its requests too, alongside any signal the plugin passed itself. @complexity O(1). */
function withToolSignal(toolSignal: AbortSignal | undefined, pluginSignal: AbortSignal | undefined): { signal?: AbortSignal } {
  const signals = [toolSignal, pluginSignal].filter((signal): signal is AbortSignal => signal !== undefined);
  if (signals.length === 0) return {};
  return { signal: signals.length === 1 ? signals[0]! : AbortSignal.any(signals) };
}

/**
 * Builds the capabilities port the tool projection calls once per invocation.
 * @param required.connections - Host connection accessor (ownership enforced there and by the scope passed here).
 * @param required.http - The guarded outbound HTTP client.
 * @param required.limiter - The http-kit limiter sized for plugin budgets.
 * @param required.frozen - Accounts frozen by the confirmation step.
 * @param required.state - The plugin settings reader, scoped here to the calling plugin and workspace.
 * @param required.apiOrigins - The calling plugin's declared API origins; its HTTP reaches no other host.
 * @param optional.artifacts - File writer; omitted, the `artifacts` capability is omitted.
 * @complexity O(1) per call; each capability is one delegated call.
 */
export function createAgentPluginToolCapabilities(
  required: {
    readonly connections: AgentPluginConnectionAccess; readonly http: HttpClientPort; readonly limiter: AgentPluginRateLimiter;
    readonly frozen: FrozenConnectionAccounts; readonly state: AgentPluginStateReaderFor; readonly apiOrigins: AgentPluginApiOriginsFor;
  },
  optional: { readonly artifacts?: AgentPluginArtifactWriter } = {},
): AgentPluginToolCapabilitiesPort {
  const { connections, limiter, frozen, state, apiOrigins } = required;
  const writer = optional.artifacts;
  return ({ pluginId, workspaceId, signal }): AgentPluginToolCapabilities => ({
    connections: { async getAccessToken({ connectionRef }) {
      const expectedAccountId = frozen.lookup({ signal, connectionRef });
      // A confirmed call may only use the connections its approval froze, never an unpinned other one.
      if (expectedAccountId === null) throw new Error(UNAPPROVED_CONNECTION_MESSAGE);
      return connections.getAccessToken({ workspaceId, pluginId, connectionRef }, expectedAccountId === undefined ? {} : { expectedAccountId });
    } },
    http: declaredOriginsHttp(required.http, () => apiOrigins({ workspaceId, pluginId }), signal),
    // NUL cannot appear in a workspace or plugin id, so one plugin's key can never name another's budget.
    limiter: { check: ({ key }) => limiter.check({ key: `${workspaceId}\u0000${pluginId}\u0000${key}` }) },
    ...(writer === undefined ? {} : { artifacts: { write: (input) => writer.write({ ...input, workspaceId, pluginId }) } }),
    // A fresh object with `get` alone: whatever the store exposes, a tool can never write through it.
    state: { get: (input) => state({ workspaceId, pluginId }).get(input) },
  });
}
