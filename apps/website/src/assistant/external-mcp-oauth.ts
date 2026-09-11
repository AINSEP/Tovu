import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../features/webhooks/index.js";
import {
  beginAuthorizationCode,
  beginDeviceAuthorization,
  buildOperatorOAuthProvider,
  completeAuthorizationCode,
  createTokenRefresher,
  discoverAuthorizationServer,
  getOAuthProvider,
  isOAuthError,
  OAuthError,
  pollDeviceAuthorizationOnce,
  registerOAuthClientDynamically,
  requestOAuthToken,
  type AuthorizationCallbackParams,
  type DeviceAuthorization,
  type DiscoveredOAuthConfiguration,
  type OAuthClient,
  type OAuthClientAuthMethod,
  type OAuthFetch,
  type OAuthProviderDescriptor,
  type OAuthTokenSet,
  type PendingAuthorizationStore,
} from "../platform/oauth/index.js";
import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  openExternalMcpOAuthPayload,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  sealExternalMcpOAuthPayload,
  type ExternalMcpOAuthStatus,
  type ExternalMcpOAuthTokenResolverPort,
  type ExternalMcpServerRecord,
  type ExternalMcpServerRepoPort,
} from "./external-mcp-store.js";

/**
 * @file Connects `src/platform/oauth/`'s generic client to one external-MCP connection row.
 *
 * This is the ONLY module that knows both halves. `src/platform/oauth/` knows nothing about MCP;
 * `external-mcp-store.ts` knows nothing about token endpoints; this file owns the join and nothing
 * else — no HTTP routing (that is `server/routes/`), no federation (that is `mcp-federation/`).
 *
 * ## What is reused from the connectors subsystem, and what is not
 *
 * REUSED, by the routes that call into this module: the public callback mount point outside
 * `/api/admin`, the XSS-safe callback page, the popup + origin-checked `postMessage` bridge with its
 * focus-regain fallback, and the per-IP rate limiters. Those are the hardened edges, and they were
 * right on the first try in `routes/connectors/` because someone had already got them wrong
 * elsewhere.
 *
 * NOT REUSED: the state machine. `ComposioConnectorProvider` performs no token exchange at all —
 * Composio is the OAuth client there, and Tovu asks it for a redirect URL and later for a
 * *connected account*. There is no authorization-code grant, no PKCE, no token endpoint, no refresh
 * token and no expiry column anywhere in that path. There was nothing to port; a direct integration
 * inherits every one of those duties, and they are implemented fresh in `src/platform/oauth/` behind a
 * provider-agnostic descriptor so no vendor's quirks reach this file either.
 *
 * ## Connect-time failures are loud, fast and never retried
 *
 * A connect attempt is a FOREGROUND action with a human watching a spinner — the exact opposite of
 * `mcp-federation/bootstrap.ts`'s boot-time federation, which fails open precisely because nobody
 * asked for that server at that moment. So every call here is bounded by a timeout and reports a
 * specific failure; nothing loops. An authorization code is single-use and the first response may
 * have been lost AFTER the provider redeemed it, so an automatic retry can burn a code that
 * actually worked. The operator retries with one click; the machine does not retry at all.
 */

/** A human is watching. Long enough for a slow but working provider, short enough that a dead one is
 *  reported while the operator still has the tab open. */
const CONNECT_TIMEOUT_MS = 15_000;
/**
 * How long a process may hold the cross-process refresh lease.
 *
 * Comfortably longer than {@link CONNECT_TIMEOUT_MS} so a legitimate in-flight refresh is never
 * treated as abandoned, and short enough that a process killed mid-refresh frees the connection
 * within a minute rather than until the next restart.
 */
const REFRESH_LEASE_MS = 45_000;

/**
 * Attempts `setOAuthStatus`'s clear-token re-seal is given before it gives up.
 *
 * Small and fixed, no backoff: a keyring write that fails because its active key briefly could not
 * be resolved usually succeeds on the very next try, so this exists to smooth over that blip rather
 * than to ride out a sustained outage — a re-seal still failing after this many immediate retries is
 * treated as a real, reportable failure, not something to keep retrying indefinitely.
 */
const CLEAR_TOKEN_RESEAL_ATTEMPTS = 3;

/**
 * The terminal, non-retryable failure a federated tool returns once its connection needs
 * re-authorization.
 *
 * The message is a UX surface, and its audience is a language model. It says *do not retry* in
 * words, because a model that reads "authorization expired" without that instruction will search,
 * select the same tool, fail, and search again — burning turns on a server that cannot work until a
 * human acts. It also names WHERE the human acts, because the model's only useful move is to tell
 * whoever it is talking to.
 */
export class ExternalMcpReauthRequiredError extends Error {
  readonly code = "EXTERNAL_MCP_REAUTH_REQUIRED";
  /** Always false. Present as a field so a caller can branch on it without matching on the class. */
  readonly retryable = false;
  readonly serverId: string;
  /** Where an operator fixes it. Safe to render — built from a validated server id, no user text. */
  readonly settingsLink: string;

  /**
   * @param input.cause - A failure that happened while RECORDING this state, when the state write is
   *   best-effort and this error is thrown regardless (see `reportAuthFailure`). It rides along so a
   *   swallowed write failure stays visible to whoever logs the error, instead of disappearing —
   *   this class carries no logger, and the alternative was a silent `catch`.
   */
  constructor(input: { serverId: string; label?: string | null; cause?: unknown }) {
    const name = input.label ?? input.serverId;
    super(
      `"${name}" is disconnected: its authorization expired or was revoked. ` +
        `Ask the operator to reconnect it in Settings → External MCP. Do not retry this tool.`,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = "ExternalMcpReauthRequiredError";
    this.serverId = input.serverId;
    this.settingsLink = externalMcpSettingsDeepLink(input.serverId);
  }
}

/**
 * The admin deep link for one connection.
 *
 * A plain link into Settings is the whole of what an in-chat "connect" affordance should be. A full
 * OAuth redirect through the MCP-UI sandboxed iframe is rejected: its return leg cannot safely carry
 * the callback (`window.opener` inside a sandboxed frame is not the page holding the bridge, and
 * origin-checked `postMessage` across the sandbox boundary is exactly the escape hatch the sandbox
 * exists to prevent), and connecting a third-party account is an administrative act with
 * workspace-wide blast radius that a non-operator chat participant should not be walked into.
 *
 * The device grant is the exception that proves the rule — it has no return leg at all, so its user
 * code and verification URL are safe to render anywhere.
 *
 * @complexity O(1).
 */
export function externalMcpSettingsDeepLink(serverId: string): string {
  return `/settings/external-mcp?server=${encodeURIComponent(serverId)}`;
}

/**
 * One device authorization awaiting the operator's approval.
 *
 * `Promise`-returning for the same reason `oauth/pending-authorizations.ts`'s
 * `PendingAuthorizationStore` is: the real adapter
 * (`platform/db/sqlite/oauth-pending-store.sqlite.ts`'s `createSqliteDeviceAuthorizationStore`)
 * persists to `content.db` and seals `deviceCode` through the same ADR-058 sealer/keyring every
 * other secret there goes through, so both implementations share one async call shape. This file's
 * own `createDeviceAuthorizationStore` below is the in-memory ADR-006 "second adapter" — used by
 * tests and by any composition root with no persistent `content.db` — not the production path; see
 * `pending-authorizations.ts`'s header for the full argument (which applies here verbatim) for why
 * "worthless after a restart" was never the reason cross-process durability matters.
 */
export interface DeviceAuthorizationStore {
  put(serverId: string, authorization: DeviceAuthorization): Promise<void>;
  get(serverId: string): Promise<DeviceAuthorization | undefined>;
  delete(serverId: string): Promise<void>;
}

/** Bounded by the per-workspace server cap, so no explicit eviction policy is needed beyond
 *  overwriting a connection's own previous attempt. */
export function createDeviceAuthorizationStore(): DeviceAuthorizationStore {
  const byServerId = new Map<string, DeviceAuthorization>();
  return {
    async put(serverId, authorization) {
      byServerId.set(serverId, authorization);
    },
    async get(serverId) {
      return byServerId.get(serverId);
    },
    async delete(serverId) {
      byServerId.delete(serverId);
    },
  };
}

/**
 * Builds the liveness gate `mcp-federation/registrations.ts` checks before every federated call.
 *
 * ## Why this reads the database on every call, and why that is the right cost
 *
 * The connection's `oauthStatus` is PLAINTEXT on the row, so answering "is this server still
 * authorized" is one indexed primary-key read and no keyring round trip. That matters because the
 * process that DISCOVERS a dead grant is not necessarily the process serving the tool call: the
 * agent daemon and the admin web server hold separate database handles, and an in-memory flag in
 * either one would be invisible to the other. The row is the only thing both can see.
 *
 * A connection id with no row is passed through untouched. Federation's connection set is the union
 * of this operator roster and `mcp-federation/presets.ts`'s environment-resolved presets, and a
 * preset has no row here — refusing it would take out a working server to guard a state it cannot
 * be in.
 *
 * @returns The gate. Never throws at construction.
 * @complexity O(1) per call — one primary-key read, no unseal.
 * @tradeoffs One read per federated tool call, rather than caching the status. A cache is what would
 *   reintroduce the cross-process invisibility this exists to close, and the read is far cheaper
 *   than the network round trip it guards.
 */
export function createExternalMcpConnectionGate(deps: {
  readonly workspaceId: UUID;
  readonly repo: Pick<ExternalMcpServerRepoPort, "findByServerId">;
}): (connectionId: string) => Promise<void> {
  return async (connectionId) => {
    const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: connectionId });
    if (!record || resolveExternalMcpAuthMode(record) !== "oauth") return;
    if (resolveExternalMcpOAuthStatus(record) !== "needs_reauth") return;
    throw new ExternalMcpReauthRequiredError({ serverId: connectionId, label: record.label });
  };
}

export interface ExternalMcpOAuthDeps {
  readonly workspaceId: UUID;
  readonly repo: ExternalMcpServerRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly clock: ClockPort;
  readonly pending: PendingAuthorizationStore;
  readonly devices: DeviceAuthorizationStore;
  /** Injected so tests never touch the network. Defaults to global `fetch`. */
  readonly fetchFn?: OAuthFetch;
  /** Resolves a REGISTERED provider descriptor. Injected so a test can register its own without
   *  mutating the process-wide registry. Defaults to `src/platform/oauth/`'s. */
  readonly lookupProvider?: (providerId: string) => OAuthProviderDescriptor;
}

/** What an authorization-code connect hands back to the route. Carries no secret. */
export interface ExternalMcpAuthorizationStart {
  readonly kind: "redirect_required";
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

/** What a device-grant connect hands back. `deviceCode` is deliberately absent — it stays
 *  server-side, and the poll route looks it up by server id. */
export interface ExternalMcpDeviceStart {
  readonly kind: "device_code";
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string | null;
  readonly expiresAt: ISODateTime;
  readonly intervalSeconds: number;
}

export type ExternalMcpConnectStart = ExternalMcpAuthorizationStart | ExternalMcpDeviceStart;

export interface ExternalMcpOAuthService {
  /**
   * Starts an authorization for one connection.
   *
   * @param input.redirectUri - The absolute public callback URL, built by the route from the
   *   request so a reverse-proxied deployment gets the origin the browser actually used.
   *
   *   OPTIONAL, because whether one is needed at all is a property of the GRANT, and only this
   *   function knows the grant: `device_code` never uses a redirect URI (RFC 8628 — the human types
   *   a code at the provider; nothing redirects back), while `authorization_code` cannot proceed
   *   without one. Requiring it here pushed that decision up to every caller, and the caller with no
   *   live HTTP request to derive an origin from (`external_mcp_oauth_connect`) consequently refused
   *   EVERY grant whenever `TOVU_PUBLIC_URL` was unset — including the one that needed nothing. So:
   *   omit it when there is genuinely no origin. Never pass one built from anything the CALLER
   *   supplied (a form field, a tool-call argument) — only from operator configuration or this
   *   process's own known bind origin (`features/external-mcp/tool-registrations.ts`'s
   *   `resolveExternalMcpOAuthRedirectUri`, 2026-09-10, covers both). A redirect URI the provider was
   *   not registered with still fails at the vendor with an error about the client, so this is not a
   *   license to guess from arbitrary caller input — it is what makes a value trustworthy enough to
   *   pass at all.
   * @throws {ExternalMcpValidationError} When the server is unknown, is not OAuth-authenticated, or
   *   uses a grant that requires a redirect URI and none was supplied.
   * @throws {OAuthError} Bounded, terminal, never retried — see this file's header.
   */
  beginConnect(input: { serverId: string; redirectUri?: string }): Promise<ExternalMcpConnectStart>;
  /**
   * Finishes an authorization-code handshake from the public callback route.
   *
   * @param input.params - The callback's query parameters, already narrowed to strings. Untrusted.
   */
  completeAuthorizationCallback(input: { serverId: string; params: AuthorizationCallbackParams }): Promise<void>;
  /**
   * Polls a device authorization exactly once.
   *
   * @returns `"pending"` with the interval to wait, or `"connected"` once the token is stored.
   * @throws {OAuthError} On any terminal outcome — declined, expired, or a provider failure.
   */
  pollDeviceAuthorization(input: { serverId: string }): Promise<
    { readonly status: "pending"; readonly retryAfterSeconds: number } | { readonly status: "connected" }
  >;
  /** Clears the stored token and returns the connection to `disconnected`. */
  disconnect(input: { serverId: string }): Promise<void>;
  /**
   * Reacts to a live federated call failing because the remote rejected our authorization (HTTP
   * 401/403), discovered mid-session rather than at boot — wired as
   * `mcp-federation/registrations.ts`'s `FederationDeps.onAuthFailed`.
   *
   * For an OAuth-authenticated row this records `needs_reauth` durably, the same state
   * `tokenResolver.resolveAccessToken` reaches at boot, so the NEXT call is refused cheaply by
   * `createExternalMcpConnectionGate`'s row read instead of reaching the network again — and
   * replaces the transport-shaped error with the same terminal, non-retryable
   * {@link ExternalMcpReauthRequiredError} that path already throws.
   *
   * A row that is not OAuth-authenticated (or no longer exists) has no reauth state to record;
   * `error` propagates unchanged.
   * @throws Always — either the original `error`, or {@link ExternalMcpReauthRequiredError}.
   */
  reportAuthFailure(serverId: string, error: Error): Promise<never>;
  /** The port `readEnabledExternalMcpConfigs` takes, wired to this service's refresher. */
  readonly tokenResolver: ExternalMcpOAuthTokenResolverPort;
}

/** Loads an OAuth-authenticated row, or explains why it cannot be used.
 *  @throws {ExternalMcpValidationError} */
async function requireOAuthRecord(deps: ExternalMcpOAuthDeps, serverId: string): Promise<ExternalMcpServerRecord> {
  const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
  if (!record) {
    throw new ExternalMcpValidationError(`no external MCP server is configured as '${serverId}'`, "id");
  }
  if (resolveExternalMcpAuthMode(record) !== "oauth") {
    throw new ExternalMcpValidationError(`external MCP server '${serverId}' is not configured to use OAuth`, "authMode");
  }
  return record;
}

/** The endpoint trio an operator may type onto a connection, as stored. Absent members mean "this
 *  connection names a registered provider for that part instead", or — on a remote connection — that
 *  discovery has not run yet. */
interface StoredOAuthEndpoints {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
  /**
   * How the token endpoint expects this client to authenticate.
   *
   * Only ever written by dynamic client registration, and only when the authorization server
   * volunteered a `client_secret` and asked for a secret-bearing method despite being asked for a
   * public client. It is stored because {@link buildConnectionOwnedProvider} rebuilds the descriptor
   * from this blob on every later call — a refresh six weeks from now has nothing else to read it
   * from, and a client that keeps authenticating as `none` at a server that issued it a secret gets
   * `invalid_client` on every token request.
   */
  clientAuth?: string;
}

/** Reads the stored endpoints column, tolerating a null or corrupt value as "none typed". */
function readStoredEndpoints(record: ExternalMcpServerRecord): StoredOAuthEndpoints {
  try {
    const parsed: unknown = JSON.parse(record.oauthEndpointsJson ?? "{}");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoredOAuthEndpoints) : {};
  } catch {
    return {};
  }
}

/** Builds a descriptor from the endpoints an operator typed on this connection.
 *  @throws {OAuthError} When they do not form a usable provider. */
function buildConnectionOwnedProvider(record: ExternalMcpServerRecord, endpoints: StoredOAuthEndpoints & { tokenEndpoint: string }): OAuthProviderDescriptor {
  return buildOperatorOAuthProvider({
    providerId: record.oauthProviderId ?? `connection-${record.serverId}`,
    label: record.label ?? record.serverId,
    tokenEndpoint: endpoints.tokenEndpoint,
    ...(endpoints.authorizationEndpoint === undefined ? {} : { authorizationEndpoint: endpoints.authorizationEndpoint }),
    ...(endpoints.deviceAuthorizationEndpoint === undefined ? {} : { deviceAuthorizationEndpoint: endpoints.deviceAuthorizationEndpoint }),
    scopes: readStoredScopes(record),
    ...(readStoredClientAuth(endpoints) === null ? {} : { clientAuth: readStoredClientAuth(endpoints) as OAuthClientAuthMethod }),
  });
}

/** The three RFC 6749 §2.3 methods `token-endpoint.ts` can actually perform. A stored value outside
 *  this set is treated as absent rather than trusted — the blob is plaintext on the row. */
const STORED_CLIENT_AUTH_METHODS: readonly string[] = ["none", "client_secret_post", "client_secret_basic"];

/** @complexity O(1). */
function readStoredClientAuth(endpoints: StoredOAuthEndpoints): OAuthClientAuthMethod | null {
  const stored = endpoints.clientAuth;
  return stored !== undefined && STORED_CLIENT_AUTH_METHODS.includes(stored) ? (stored as OAuthClientAuthMethod) : null;
}

/** The scopes column, tolerating a null or corrupt value as "none requested". @complexity O(n). */
function readStoredScopes(record: ExternalMcpServerRecord): string[] {
  try {
    const parsed: unknown = JSON.parse(record.oauthScopesJson ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Resolves the provider descriptor for a row: a registered id, or the operator's own endpoints.
 *
 * Both paths end at the same validated {@link OAuthProviderDescriptor}, which is what keeps every
 * flow in `src/platform/oauth/` provider-agnostic. `buildOperatorOAuthProvider` derives the supported grants
 * from which endpoints are present, so a row cannot claim a grant it has no endpoint for.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when the row names neither, or
 * `OAUTH_UNSAFE_ENDPOINT` when a typed endpoint fails the outbound-safety check.
 * @complexity O(1).
 */
function resolveProviderDescriptor(deps: ExternalMcpOAuthDeps, record: ExternalMcpServerRecord): OAuthProviderDescriptor {
  const endpoints = readStoredEndpoints(record);
  if (endpoints.tokenEndpoint !== undefined) {
    return buildConnectionOwnedProvider(record, { ...endpoints, tokenEndpoint: endpoints.tokenEndpoint });
  }
  if (record.oauthProviderId === null) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `external MCP server '${record.serverId}' names no OAuth provider and defines no token endpoint`, {
      operatorAction: "Pick a provider, or type this connection's own OAuth endpoints, in Settings → External MCP.",
    });
  }
  return (deps.lookupProvider ?? getOAuthProvider)(record.oauthProviderId);
}

/** Builds the client identity for one row, unsealing the client secret only when there is one.
 *  @throws {OAuthError} When the row carries no client id — a state `saveExternalMcpServer` refuses
 *  to create, so reaching it means the row was written by something else. */
async function resolveClient(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  provider: OAuthProviderDescriptor,
): Promise<OAuthClient> {
  if (record.oauthClientId === null) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `external MCP server '${record.serverId}' has no OAuth client id`, {
      operatorAction: "Add this connection's OAuth client id in Settings → External MCP.",
    });
  }
  const payload = await openExternalMcpOAuthPayload(deps.sealer, record);
  return {
    clientId: record.oauthClientId,
    ...(payload.clientSecret === undefined ? {} : { clientSecret: payload.clientSecret }),
    authMethod: provider.clientAuth,
  };
}

// ---------------------------------------------------------------------------
// Self-configuration: discovery + dynamic client registration
//
// A connection may reach `beginConnect` missing the two things every grant needs: where the
// authorization server is, and who Tovu is to it. Both used to be operator-typed, and for a provider
// with a developer console that is still the right answer. A growing share of hosted MCP servers have
// no console at all — they publish RFC 9728 / RFC 8414 metadata and an RFC 7591 registration endpoint
// and expect clients to self-register — and for those there is no human path to a client id, so the
// connection is unreachable without this.
//
// It runs ONLY in `beginConnect`, and what it learns is PERSISTED. The callback, poll and refresh
// paths then read the row exactly as they did before, so there is one place where a connection can
// change shape rather than four. Persisting is also what keeps registration a once-per-connection
// event: an authorization server does not garbage-collect clients, so a connect that registered every
// time would leave one dead client behind per retry.
// ---------------------------------------------------------------------------

/** Whether a row still has to be told where its authorization server is. @complexity O(1). */
function needsEndpointDiscovery(record: ExternalMcpServerRecord, endpoints: StoredOAuthEndpoints): boolean {
  return endpoints.tokenEndpoint === undefined && record.oauthProviderId === null;
}

/**
 * Narrows a discovered authorization server into the blob shape the row stores.
 *
 * The `registration_endpoint` is deliberately NOT stored: nothing reads it once the client is minted,
 * and a credential-adjacent URL kept for no reader is a liability rather than a convenience.
 *
 * @complexity O(1).
 */
function toStoredEndpoints(discovered: DiscoveredOAuthConfiguration): StoredOAuthEndpoints {
  const server = discovered.server;
  return {
    tokenEndpoint: server.tokenEndpoint,
    ...(server.authorizationEndpoint === null ? {} : { authorizationEndpoint: server.authorizationEndpoint }),
    ...(server.deviceAuthorizationEndpoint === null ? {} : { deviceAuthorizationEndpoint: server.deviceAuthorizationEndpoint }),
  };
}

/**
 * Runs RFC 9728 / RFC 8414 discovery against the connection's own MCP endpoint.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when the row has no URL to discover from — a stdio
 *   connection, which the store still requires to name its provider explicitly. Same message the
 *   non-discovering path has always used, because from the operator's side it is the same problem.
 * @complexity O(1) in row size; a bounded, small number of outbound requests.
 */
async function discoverConnectionAuthorizationServer(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
): Promise<DiscoveredOAuthConfiguration> {
  if (record.url === null) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `external MCP server '${record.serverId}' names no OAuth provider and defines no token endpoint`, {
      operatorAction: "Pick a provider, or type this connection's own OAuth endpoints, in Settings → External MCP.",
    });
  }
  return discoverAuthorizationServer(
    { ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
    { resourceUrl: record.url, timeoutMs: CONNECT_TIMEOUT_MS },
  );
}

/** The grant types to register for, derived from the row's own grant rather than asked for twice.
 *  `refresh_token` is always included: it is what decides whether this connection survives its first
 *  access-token expiry, and a server that does not support it ignores the entry. @complexity O(1). */
function registrationGrantTypes(record: ExternalMcpServerRecord): readonly string[] {
  return record.oauthGrant === "device_code"
    ? ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
    : ["authorization_code", "refresh_token"];
}

/**
 * Mints a client for a connection that has none.
 *
 * @param input.redirectUri - Registered as this client's only callback. A server that pins redirect
 *   URIs will refuse an authorization whose `redirect_uri` was not registered, so the value used at
 *   authorization time is the value registered here — not a re-derived one. `undefined` registers no
 *   callback at all, which is correct (and the only honest option) for a device-grant client.
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when the authorization server offers no registration
 *   endpoint, which is the point at which an operator genuinely does have to supply a client id.
 * @complexity O(1) — one bounded outbound request.
 */
async function mintClientForConnection(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  discovered: DiscoveredOAuthConfiguration,
  input: { readonly redirectUri: string | undefined; readonly scopes: readonly string[] },
) {
  const registrationEndpoint = discovered.server.registrationEndpoint;
  if (registrationEndpoint === null) {
    throw new OAuthError(
      "OAUTH_INVALID_REQUEST",
      `external MCP server '${record.serverId}' has no OAuth client id and its authorization server offers no dynamic client registration`,
      { operatorAction: "Add this connection's OAuth client id in Settings → External MCP — this server does not mint them automatically." },
    );
  }
  return registerOAuthClientDynamically(
    { ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
    {
      registrationEndpoint,
      clientName: record.label ?? record.serverId,
      // Empty for a device-only client: RFC 7591 requires `redirect_uris` only for a client that
      // registers a redirect-based grant, and `registrationGrantTypes` below registers none for
      // `device_code`. Registering a placeholder instead would mint a client pinned to a callback
      // nothing serves.
      redirectUris: input.redirectUri === undefined ? [] : [input.redirectUri],
      scopes: input.scopes,
      grantTypes: registrationGrantTypes(record),
      timeoutMs: CONNECT_TIMEOUT_MS,
    },
  );
}

/** Writes one connect's self-configuration onto the row, preserving anything already sealed beside it.
 *
 *  Read-modify-write for the same reason {@link persistTokens} is: sealing `{ clientSecret }` alone
 *  would delete a token the connection is still holding.
 *  @complexity O(1) — one unseal, one seal, one upsert. */
async function persistSelfConfiguration(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  identity: {
    readonly endpoints: StoredOAuthEndpoints;
    readonly scopes: readonly string[];
    readonly clientId: string;
    readonly clientSecret: string | undefined;
  },
): Promise<ExternalMcpServerRecord> {
  const existing = await openExternalMcpOAuthPayload(deps.sealer, record);
  const clientSecret = identity.clientSecret ?? existing.clientSecret;
  const { sealedOAuth, oauthAadVersion } = await sealExternalMcpOAuthPayload(deps, record, {
    ...(clientSecret === undefined ? {} : { clientSecret }),
    ...(existing.tokens === undefined ? {} : { tokens: existing.tokens }),
  });

  const next: ExternalMcpServerRecord = {
    ...record,
    oauthClientId: identity.clientId,
    oauthEndpointsJson: JSON.stringify(identity.endpoints),
    oauthScopesJson: JSON.stringify(identity.scopes),
    sealedOAuth,
    // Carried from the seal, never from `...record` — the spread holds the row's OLD version.
    oauthAadVersion,
    updatedAt: deps.clock.nowIso(),
  };
  await deps.repo.upsert(next);
  return next;
}

/**
 * Fills in whatever a connection is missing, persists it, and returns the row as it now stands.
 *
 * A no-op — and, importantly, ZERO outbound requests — for a connection that already names its
 * endpoints and its client id. That is what keeps every existing connection behaving exactly as it
 * did: self-configuration is reached only by a row that could not have connected at all before.
 *
 * Nothing is written until every step has succeeded, so a failed registration leaves the row exactly
 * as it was and the operator's retry is a clean retry rather than one over half-written state.
 *
 * @param redirectUri - The absolute callback URL this connect will use, registered verbatim.
 * @returns The row, self-configured if it needed to be.
 * @throws {OAuthError} From discovery or registration; every one is terminal and nothing is retried.
 * @complexity O(1) in row size; a bounded, small number of outbound requests, and none at all on the
 *   already-configured path.
 */
async function selfConfigureConnection(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  redirectUri: string | undefined,
): Promise<ExternalMcpServerRecord> {
  const stored = readStoredEndpoints(record);
  const mustDiscover = needsEndpointDiscovery(record, stored);
  if (!mustDiscover && record.oauthClientId !== null) return record;

  const discovered = await discoverConnectionAuthorizationServer(deps, record);
  const endpoints: StoredOAuthEndpoints = mustDiscover ? toStoredEndpoints(discovered) : { ...stored };
  // Scopes the operator named win; an empty list adopts what the resource itself asks for, because a
  // resource that advertises `offline_access` is naming the scope that decides whether this
  // connection can ever refresh.
  const operatorScopes = readStoredScopes(record);
  const scopes = operatorScopes.length > 0 ? operatorScopes : [...discovered.resourceScopes];

  // Narrowed on the field rather than on `mustRegister`, so there is no fallback that could write an
  // empty client id if the two ever disagreed.
  if (record.oauthClientId !== null) {
    return persistSelfConfiguration(deps, record, { endpoints, scopes, clientId: record.oauthClientId, clientSecret: undefined });
  }

  const minted = await mintClientForConnection(deps, record, discovered, { redirectUri, scopes });
  if (minted.clientSecret !== null) endpoints.clientAuth = minted.tokenEndpointAuthMethod;
  return persistSelfConfiguration(deps, record, {
    endpoints,
    scopes,
    clientId: minted.clientId,
    clientSecret: minted.clientSecret ?? undefined,
  });
}

/** The binding key an authorization `state` is issued against. Workspace-scoped so a state minted in
 *  one workspace cannot be redeemed in another, and server-scoped so it cannot be redeemed against a
 *  different connection in the same workspace. */
function ownerKeyOf(workspaceId: UUID, serverId: string): string {
  return `${workspaceId}:${serverId}`;
}

/** Writes a token set into the row: sealed blob (preserving the client secret) plus the PLAINTEXT
 *  status and expiry beside it. One place, so the plaintext metadata cannot drift from the blob.
 *  @complexity O(1) — one unseal, one seal, one upsert. */
async function persistTokens(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  tokens: OAuthTokenSet,
): Promise<void> {
  const existing = await openExternalMcpOAuthPayload(deps.sealer, record);
  const { sealedOAuth, oauthAadVersion } = await sealExternalMcpOAuthPayload(deps, record, {
    // Read-modify-write: sealing `{ tokens }` alone would silently delete the operator's client
    // secret, and the next refresh would fail with a message about the provider rather than about us.
    ...(existing.clientSecret === undefined ? {} : { clientSecret: existing.clientSecret }),
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      scopes: [...tokens.scopes],
      expiresAt: tokens.expiresAt,
    },
  });

  await deps.repo.upsert({
    ...record,
    oauthStatus: "connected" satisfies ExternalMcpOAuthStatus,
    oauthExpiresAt: tokens.expiresAt,
    oauthRefreshLeaseUntil: null,
    sealedOAuth,
    // Carried from the seal, never from `...record` — the spread holds the row's OLD version.
    oauthAadVersion,
    updatedAt: deps.clock.nowIso(),
  });
}

/** The row-patch fields {@link setOAuthStatus} merges on top of `status`/`oauthRefreshLeaseUntil`
 *  when clearing a token. Empty when `clearToken` was not requested. */
type ClearedTokenPatch = Partial<Pick<ExternalMcpServerRecord, "sealedOAuth" | "oauthExpiresAt" | "oauthAadVersion">>;

/**
 * Resolves {@link setOAuthStatus}'s token-clear patch. Split out purely to keep that function's
 * complexity under the shop ceiling — behavior is unchanged.
 *
 * Read-modify-write, the same rule `persistTokens` follows: `sealedOAuth` holds
 * `{ clientSecret?, tokens? }` TOGETHER, so nulling it wholesale on a token clear would delete an
 * operator's client secret along with the dead token. For a dynamically-registered (RFC 7591)
 * client the operator never saw that secret, so losing it here means the row can never be
 * re-authorized — only deleted and recreated.
 *
 * The open and the re-seal below are kept in SEPARATE try/catches on purpose, even though both can
 * throw the same `ExternalMcpSecretStoreUnconfiguredError`
 * (`openExternalMcpOAuthPayload`/`sealExternalMcpOAuthPayload`'s own `@throws`): they mean different
 * things about whether the secret is actually lost. If OPEN fails, the blob could not be decrypted
 * at all — a rotated root key or a corrupt row — so whatever it held is already unrecoverable, and
 * falling back to the pre-existing wholesale-null behavior loses nothing that was not lost already
 * (this is what keeps `markNeedsReauth`, `disconnect()`, and the device-poll terminal path from
 * wedging on a blob that is already dead). If OPEN succeeds but the RE-SEAL fails, the secret was
 * just read successfully — it is NOT lost, only the write-back (a transient keyring/active-key
 * problem, say) failed, so it is retried a few times — bounded, no backoff — before giving up.
 * Wholesale-nulling would destroy a secret this call proves is still recoverable, so it is never the
 * outcome here; but silently leaving `sealedOAuth` untouched and reporting success would leave the
 * row's `oauthStatus` claiming a state (e.g. `disconnected`) the stored blob does not actually match,
 * with nothing to say so. So once the retry budget is exhausted, this rethrows instead: each of this
 * function's callers already has a place that reacts to `ExternalMcpSecretStoreUnconfiguredError`
 * without inventing a new one — `disconnect()`'s admin route already maps it to a 503
 * `SECRET_STORE_UNCONFIGURED`, `reportAuthFailure` already carries an unexpected `setOAuthStatus`
 * failure as `cause` on its terminal error, and `markNeedsReauth`'s two call sites in
 * `token-refresh.ts`'s `performRefresh` treat this write as best-effort the same way — its failure
 * is carried as `cause` on the `OAUTH_INVALID_GRANT` error they throw next, never left to propagate
 * in that error's place. (An earlier version of this comment claimed that path "already folds" a
 * write failure into the boot report; it did not — the failure escaped unguarded and displaced the
 * reauth signal every downstream caller branches on. Both call sites now guard it explicitly.) Any
 * OTHER error (a genuine bug, not an unopenable or unsealable blob) still propagates from either
 * step — this is a documented, targeted degrade, not a blanket swallow.
 *
 * @throws {ExternalMcpSecretStoreUnconfiguredError} If the re-seal never recovers within
 *   {@link CLEAR_TOKEN_RESEAL_ATTEMPTS} attempts.
 */
async function resolveClearedTokenPatch(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  options: { readonly clearToken?: boolean },
): Promise<ClearedTokenPatch> {
  if (options.clearToken !== true) return {};

  const opened = await openExistingOAuthPayloadForClear(deps, record);
  if ("wholesale" in opened) return { sealedOAuth: null, oauthExpiresAt: null };

  const clientSecret = opened.existing.clientSecret === undefined ? {} : { clientSecret: opened.existing.clientSecret };
  return resealClearedOAuthToken(deps, record, clientSecret);
}

/** {@link resolveClearedTokenPatch}'s OPEN step — reads the existing payload, or signals the
 *  wholesale-null fallback when the blob cannot be opened at all (see that function's doc for why
 *  this branch is safe). Split out purely to keep that function's cognitive complexity under the
 *  shop ceiling. */
async function openExistingOAuthPayloadForClear(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
): Promise<{ readonly existing: Awaited<ReturnType<typeof openExternalMcpOAuthPayload>> } | { readonly wholesale: true }> {
  try {
    return { existing: await openExternalMcpOAuthPayload(deps.sealer, record) };
  } catch (error) {
    if (!(error instanceof ExternalMcpSecretStoreUnconfiguredError)) throw error;
    return { wholesale: true };
  }
}

/** {@link resolveClearedTokenPatch}'s RE-SEAL step — retries a bounded number of times before giving
 *  up (see that function's doc for why). Split out purely to keep that function's cognitive
 *  complexity under the shop ceiling.
 *  @throws {ExternalMcpSecretStoreUnconfiguredError} If the re-seal never recovers within
 *  {@link CLEAR_TOKEN_RESEAL_ATTEMPTS} attempts. */
async function resealClearedOAuthToken(
  deps: ExternalMcpOAuthDeps,
  record: ExternalMcpServerRecord,
  clientSecret: { readonly clientSecret?: string },
): Promise<ClearedTokenPatch> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const cleared = await sealExternalMcpOAuthPayload(deps, record, clientSecret);
      return { sealedOAuth: cleared.sealedOAuth, oauthExpiresAt: null, oauthAadVersion: cleared.oauthAadVersion };
    } catch (error) {
      if (!(error instanceof ExternalMcpSecretStoreUnconfiguredError)) throw error;
      if (attempt >= CLEAR_TOKEN_RESEAL_ATTEMPTS) throw error;
    }
  }
}

/** Moves a row into a terminal or reset OAuth state without touching anything else on it. See
 *  {@link resolveClearedTokenPatch} for the `clearToken` decision tree. */
async function setOAuthStatus(
  deps: ExternalMcpOAuthDeps,
  serverId: string,
  status: ExternalMcpOAuthStatus,
  options: { readonly clearToken?: boolean } = {},
): Promise<void> {
  const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
  if (!record) return;

  const clearedTokenPatch = await resolveClearedTokenPatch(deps, record, options);

  await deps.repo.upsert({
    ...record,
    oauthStatus: status,
    ...clearedTokenPatch,
    oauthRefreshLeaseUntil: null,
    updatedAt: deps.clock.nowIso(),
  });
}

/**
 * Builds the OAuth service for one workspace.
 *
 * @returns The service plus its `tokenResolver`, which `readEnabledExternalMcpConfigs` takes.
 * @complexity Construction is O(1) and performs no I/O.
 * @tradeoffs Whether the start of a handshake and its completion can land on different processes
 *   depends entirely on which `pending`/`devices` implementation the caller injects. The agent
 *   daemon is NOT an idle bystander here — `external_mcp_oauth_connect` is an assistant tool, and
 *   assistant tools execute inside the daemon, so `beginConnect` for a browser-redirect grant
 *   genuinely runs there while the public callback that completes it runs in the main web server, a
 *   separate OS process. The in-memory implementations
 *   (`oauth/pending-authorizations.ts`'s `createPendingAuthorizationStore`,
 *   this file's own `createDeviceAuthorizationStore`) cannot survive that split — a `Map` in one
 *   process is invisible to the other. The DB-backed implementations
 *   (`platform/db/sqlite/oauth-pending-store.sqlite.ts`) can, because both processes open the same
 *   `content.db`. Every production composition root injects the DB-backed pair for exactly this
 *   reason; the in-memory pair remains correct only for a caller that can guarantee both halves of
 *   a handshake run in the same process (a narrow test double, or a composition root with no
 *   persistent `content.db` at all).
 */
export function createExternalMcpOAuthService(deps: ExternalMcpOAuthDeps): ExternalMcpOAuthService {
  const refresher = createTokenRefresher({
    clock: deps.clock,
    port: {
      async load(serverId) {
        const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
        if (!record) return null;
        // A row already parked in `needs_reauth` must not be probed again on every tool call: the
        // state is durable and only a human clears it.
        if (resolveExternalMcpOAuthStatus(record) === "needs_reauth") return null;
        const payload = await openExternalMcpOAuthPayload(deps.sealer, record);
        return payload.tokens === undefined
          ? null
          : { ...payload.tokens, scopes: [...payload.tokens.scopes] };
      },

      async refresh(serverId, refreshToken) {
        const record = await requireOAuthRecord(deps, serverId);
        const provider = resolveProviderDescriptor(deps, record);
        return requestOAuthToken(
          { clock: deps.clock, ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
          {
            tokenEndpoint: provider.tokenEndpoint,
            client: await resolveClient(deps, record, provider),
            params: { grant_type: "refresh_token", refresh_token: refreshToken },
            timeoutMs: CONNECT_TIMEOUT_MS,
          },
        );
      },

      async persist(serverId, tokens) {
        const record = await requireOAuthRecord(deps, serverId);
        await persistTokens(deps, record, tokens);
      },

      async markNeedsReauth(serverId) {
        // The token is CLEARED, not kept: it is known dead, and a dead credential sitting in the
        // row is one accidental read away from being sent to a provider that will reject it.
        await setOAuthStatus(deps, serverId, "needs_reauth", { clearToken: true });
      },

      async tryAcquireRefreshLease(serverId) {
        const nowIso = deps.clock.nowIso();
        return deps.repo.tryClaimOAuthRefreshLease({
          workspaceId: deps.workspaceId,
          serverId,
          nowIso,
          leaseUntil: new Date(Date.parse(nowIso) + REFRESH_LEASE_MS).toISOString(),
        });
      },

      async releaseRefreshLease(serverId) {
        await deps.repo.releaseOAuthRefreshLease({ workspaceId: deps.workspaceId, serverId });
      },
    },
  });

  return {
    async beginConnect(input) {
      // Self-configuration first: a row that names no endpoints or no client id gets them here, once,
      // and every step below then reads an ordinary fully-specified connection.
      const record = await selfConfigureConnection(deps, await requireOAuthRecord(deps, input.serverId), input.redirectUri);
      const provider = resolveProviderDescriptor(deps, record);
      const client = await resolveClient(deps, record, provider);
      const scopes = readStoredScopes(record);

      if (record.oauthGrant === "device_code") {
        const authorization = await beginDeviceAuthorization(
          { provider, clock: deps.clock, ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
          { client, scopes, timeoutMs: CONNECT_TIMEOUT_MS },
        );
        await deps.devices.put(record.serverId, authorization);
        await setOAuthStatus(deps, record.serverId, "pending");
        return {
          kind: "device_code",
          userCode: authorization.userCode,
          verificationUri: authorization.verificationUri,
          verificationUriComplete: authorization.verificationUriComplete,
          expiresAt: authorization.expiresAt,
          intervalSeconds: authorization.intervalSeconds,
        };
      }

      // Every path below this line is redirect-based, so the requirement is real rather than
      // defensive — and it is stated where it can name both the grant and the fix, instead of being
      // a blanket precondition a caller had to satisfy before it knew which grant it had.
      if (input.redirectUri === undefined) {
        throw new ExternalMcpValidationError(
          `external MCP server '${record.serverId}' uses the authorization_code grant, which needs an absolute callback URL ` +
            `Tovu can be reached at, and none could be found: TOVU_PUBLIC_URL is not set, and this execution context has no ` +
            `derived origin either. Set TOVU_PUBLIC_URL to this instance's public origin (for example ` +
            `https://your-site.example.com) and try again, or start this connection from Settings → External MCP, which derives ` +
            `the origin from the browser's own request. Nothing was changed.`,
          // The field an operator would change to fix it is the environment's, not a form's — the
          // nearest honest answer this error's shape allows, and the one the message names.
          "redirectUri",
        );
      }

      const started = await beginAuthorizationCode(
        { provider, pending: deps.pending },
        {
          ownerKey: ownerKeyOf(deps.workspaceId, record.serverId),
          client,
          redirectUri: input.redirectUri,
          scopes,
        },
      );
      await setOAuthStatus(deps, record.serverId, "pending");
      return { kind: "redirect_required", authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt };
    },

    async completeAuthorizationCallback(input) {
      const record = await requireOAuthRecord(deps, input.serverId);
      const provider = resolveProviderDescriptor(deps, record);
      const client = await resolveClient(deps, record, provider);

      const tokens = await completeAuthorizationCode(
        { provider, pending: deps.pending, clock: deps.clock, ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
        {
          ownerKey: ownerKeyOf(deps.workspaceId, record.serverId),
          client,
          params: input.params,
          timeoutMs: CONNECT_TIMEOUT_MS,
        },
      );
      // Re-read rather than reusing `record`: `beginConnect` wrote `pending` to it, and persisting a
      // stale copy would resurrect the pre-connect row wholesale.
      await persistTokens(deps, await requireOAuthRecord(deps, input.serverId), tokens);
    },

    async pollDeviceAuthorization(input) {
      const record = await requireOAuthRecord(deps, input.serverId);
      const authorization = await deps.devices.get(input.serverId);
      if (!authorization) {
        throw new OAuthError("OAUTH_INVALID_STATE", `no device authorization is in progress for '${input.serverId}'`, {
          operatorAction: "Start the connection again from Settings → External MCP.",
        });
      }

      const provider = resolveProviderDescriptor(deps, record);
      const client = await resolveClient(deps, record, provider);
      try {
        const tokens = await pollDeviceAuthorizationOnce(
          { provider, clock: deps.clock, ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
          {
            client,
            deviceCode: authorization.deviceCode,
            expiresAt: authorization.expiresAt,
            timeoutMs: CONNECT_TIMEOUT_MS,
          },
        );
        await deps.devices.delete(input.serverId);
        await persistTokens(deps, record, tokens);
        return { status: "connected" };
      } catch (error) {
        // The ONLY retryable branch in this whole module — RFC 8628 §3.5 requires the client to keep
        // polling on these two, and only these two.
        if (isOAuthError(error) && error.retryable) {
          return { status: "pending", retryAfterSeconds: error.retryAfterSeconds ?? authorization.intervalSeconds };
        }
        await deps.devices.delete(input.serverId);
        await setOAuthStatus(deps, input.serverId, "disconnected");
        throw error;
      }
    },

    async disconnect(input) {
      await deps.devices.delete(input.serverId);
      await setOAuthStatus(deps, input.serverId, "disconnected", { clearToken: true });
    },

    async reportAuthFailure(serverId, error) {
      const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
      // A preset connection, a `static_env` row, or one already deleted has no reauth state this
      // service owns — see `createExternalMcpConnectionGate`'s identical passthrough.
      if (!record || resolveExternalMcpAuthMode(record) !== "oauth") throw error;

      // The state write is BEST EFFORT; the terminal error below is the guarantee. `setOAuthStatus`
      // can still fail here — a row write that rejects, or a blob `openExternalMcpOAuthPayload`
      // refuses for a reason that is NOT `ExternalMcpSecretStoreUnconfiguredError` (a payload written
      // at a newer schema version, which `hydrateExternalMcpOAuthPayload` throws deliberately outside
      // its own catch). Letting that escape would hand the caller an incidental error in place of the
      // terminal one, and every consumer branches on the CLASS: the connection gate would not engage,
      // the in-chat `external_mcp_reauth_prompt` surface would never render, and the "do not retry"
      // sentence a model needs in order to stop hammering a dead connection would be gone — the
      // failure mode that surface exists for. So the write's failure is carried out as `cause`
      // instead of thrown in its place: nothing is silently swallowed, and nothing displaces the
      // signal. A row left un-updated is recoverable on the next call; a lost signal is not.
      let statusWriteFailure: unknown;
      // Idempotent: a call that arrives after `tokenResolver` already discovered the same dead
      // grant must not re-clear an already-cleared token or bump `updatedAt` needlessly.
      if (resolveExternalMcpOAuthStatus(record) !== "needs_reauth") {
        try {
          await setOAuthStatus(deps, serverId, "needs_reauth", { clearToken: true });
        } catch (writeError) {
          statusWriteFailure = writeError;
        }
      }
      throw new ExternalMcpReauthRequiredError({
        serverId,
        label: record.label,
        ...(statusWriteFailure === undefined ? {} : { cause: statusWriteFailure }),
      });
    },

    tokenResolver: {
      async resolveAccessToken({ serverId }) {
        try {
          return await refresher.getAccessToken(serverId);
        } catch (error) {
          // Whatever the refresher's own taxonomy says, the caller here is about to hand a message to
          // a model, so a `needs_reauth` outcome is translated into the one non-retryable sentence
          // that makes it stop. Anything else (a provider outage) keeps its own error, because it is
          // NOT a durable state and must not be reported as one.
          if (isOAuthError(error) && error.code === "OAUTH_INVALID_GRANT") {
            const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
            throw new ExternalMcpReauthRequiredError({ serverId, label: record?.label ?? null });
          }
          throw error;
        }
      },
    },
  };
}
