import type { ExternalMcpOAuthStatus } from "../../contracts/core/external-mcp-auth.js";
/** External-MCP connection DTOs and ports; no assistant or service initialization. */
import type { Clock as ClockPort, ISODateTime, UUID } from "@jini-ai/core/primitives";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { CredentialTokenHint } from "../../contracts/core/credential-token.js";
import type { ExternalMcpAuthMode } from "../../contracts/core/external-mcp-auth.js";
import type { AuthorizationCallbackParams, DeviceAuthorization, OAuthHttpPorts, OAuthProviderDescriptor, OAuthProviderRegistry } from "@jini-ai/oauth";

/**
 * Both transports are federated. `stdio` is served by `mcp-federation/adapter.stdio.ts` (a local
 * child process); `streamable_http` by `mcp-federation/adapter.http.ts` (a hosted endpoint, with a
 * bearer header when the row is OAuth- or access-token-authenticated — see `resolveHttpTarget`).
 * {@link readEnabledExternalMcpConfigs} resolves a hosted row to a `streamable_http` target,
 * `toFederatedLaunchSpec` maps it to a `{ url, headers }` launch spec, and
 * `mcp-federation/bootstrap.ts`'s `defaultConnect` picks the HTTP adapter from that spec's shape.
 * A hosted row is reported unusable only when it has no URL or its token cannot be resolved.
 */
export const SUPPORTED_EXTERNAL_MCP_TRANSPORTS = ["stdio", "streamable_http"] as const;

export type ExternalMcpTransport = (typeof SUPPORTED_EXTERNAL_MCP_TRANSPORTS)[number];

/** Which OAuth grant an operator chose. Mirrors `src/platform/oauth/`'s `OAuthGrantKind`; restated rather
 *  than imported so the stored row shape does not depend on the flow module. */
export const EXTERNAL_MCP_OAUTH_GRANTS = ["authorization_code", "device_code"] as const;

export type ExternalMcpOAuthGrant = (typeof EXTERNAL_MCP_OAUTH_GRANTS)[number];

export interface ExternalMcpServerRecord {
  workspaceId: UUID;
  serverId: string;
  label: string | null;
  /** The Agent Plugin id that auto-provisioned this row, or `null` for an operator-created one. See
   *  `schema.sqlite.ts`'s `provisioned_by_plugin_id` column doc for the full rule. */
  provisionedByPluginId: string | null;
  transport: string;
  /** How credentials are obtained. Independent of `transport` — see this file's header. */
  authMode: string;
  enabled: boolean;
  command: string | null;
  /** Endpoint for a remote transport. NULL for `stdio`, where `command` is used instead. */
  url: string | null;
  /** JSON array of argv strings, as stored. */
  args: string | null;
  /** JSON array of admissible remote tool names, as stored. */
  allowedToolNames: string | null;
  /**
   * JSON array of remote tool names separately authorized to write, as stored. `trust.ts` R3's
   * override — a tool declaring `readOnlyHint: false` is admitted only when it also appears in
   * {@link allowedToolNames}. See `@jini-ai/mcp/federation`'s `FederatedMcpConnectionConfig
   * .writeAllowedToolNames` for the full argument.
   */
  writeAllowedToolNames: string | null;
  /** Principal who last CHANGED {@link writeAllowedToolNames}'s contents. `null` until that list is
   *  ever touched, or for a row written before this column existed. */
  writeGrantsUpdatedByPrincipalId: string | null;
  /** When {@link writeAllowedToolNames} was last changed. `null` under the same condition. */
  writeGrantsUpdatedAt: ISODateTime | null;
  /** JSON array of env variable names, as stored. Plaintext by design. */
  envNames: string | null;
  sealedEnv: SealedSecret | null;
  /** Which registered provider descriptor this connection authorizes against. */
  oauthProviderId: string | null;
  oauthGrant: string | null;
  /** Plaintext: a client id is not a secret — it travels in the authorization URL by design. */
  oauthClientId: string | null;
  /** JSON object of operator-typed endpoints, when this connection defines its own provider instead
   *  of naming a registered one. Non-secret. */
  oauthEndpointsJson: string | null;
  /** JSON array of requested scopes. Non-secret. */
  oauthScopesJson: string | null;
  oauthStatus: string | null;
  /**
   * PLAINTEXT absolute expiry of the stored access token, beside the sealed blob rather than inside
   * it. Exactly the split this file already makes for `envNames` beside `sealedEnv`, and here it is
   * load-bearing rather than merely convenient: expiry has to be checkable by a scheduler and
   * displayable in the admin tab, and neither can afford a keyring round trip — nor should either be
   * a code path that decrypts a live token to answer a question about when it dies.
   */
  oauthExpiresAt: ISODateTime | null;
  /**
   * For `stdio` + `oauth`: which child-process environment variable receives the access token.
   * Plaintext because it is a NAME, exactly as `envNames` is.
   */
  oauthTokenEnvName: string | null;
  /**
   * Cross-process refresh lease. Held while one process is redeeming the refresh token, so the other
   * — the admin web server and the agent daemon are separate processes with separate database
   * handles — does not redeem the same single-use rotating token. Plaintext for the same reason as
   * `oauthExpiresAt`: a lease you must decrypt to inspect is a lease you cannot break after a crash.
   */
  oauthRefreshLeaseUntil: ISODateTime | null;
  /** Sealed `{ clientSecret?, tokens? }`. See `external-mcp-oauth.ts` for the read-modify-write rule. */
  sealedOAuth: SealedSecret | null;
  /** Compatibility read field; normalized vault envelopes use lineage 1. */
  aadVersion: number;
  /** Compatibility read field; actual authenticated context lives on the vault row. */
  oauthAadVersion: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence (ADR-007 §1). Multi-row per workspace, so list/upsert/delete rather
 *  than a single-row find/upsert. */
export interface ExternalMcpServerRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]>;
  findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null>;
  upsert(record: ExternalMcpServerRecord): Promise<void>;
  deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean>;
  /**
   * Atomically claims the OAuth refresh lease for one row, iff nobody holds an unexpired one.
   *
   * A COMPARE-AND-SET, not a read-then-write, and that is the entire point: `upsert` cannot express
   * it, because between reading "no lease" and writing "my lease" the other process does the same
   * and both go on to redeem the same single-use rotating refresh token. One statement with the
   * condition in its `WHERE` is what makes the loser observable.
   *
   * @returns `true` when this caller now holds the lease.
   */
  tryClaimOAuthRefreshLease(input: {
    workspaceId: UUID;
    serverId: string;
    /** Now, per the caller's clock. A lease at or before this instant is treated as abandoned. */
    nowIso: ISODateTime;
    /** When this claim expires, so a crashed holder cannot wedge the connection forever. */
    leaseUntil: ISODateTime;
  }): Promise<boolean>;
  /** Releases the lease unconditionally. Safe when not held — the lease is advisory and
   *  time-bounded, so a spurious release costs at most one extra refresh attempt. */
  releaseOAuthRefreshLease(input: { workspaceId: UUID; serverId: string }): Promise<void>;
}

/** The decrypted, validated domain shape. Only ever exists in memory. */
/**
 * Where a resolved connection's credentials go, which is the one thing the two transports do
 * genuinely differently.
 *
 * A union rather than a flat shape with an empty `command` on one arm and an empty `url` on the
 * other: a config carrying both is not a degraded row to tolerate, it is a bug, and this makes it
 * unrepresentable. It mirrors `@jini-ai/mcp/federation`'s `McpLaunchSpec` deliberately — this is
 * the same distinction one layer earlier, before policy is attached.
 */
export type ExternalMcpServerTarget =
  | {
      readonly kind: "stdio";
      readonly command: string;
      readonly args: string[];
      /**
       * The child process's environment. For an `oauth` connection this ALREADY contains the
       * resolved access token under the operator's chosen variable name — resolution happens before
       * this shape exists, so nothing downstream needs to know whether a value came from a pasted
       * block or a token endpoint.
       */
      readonly env: Record<string, string>;
    }
  | {
      readonly kind: "streamable_http";
      readonly url: string;
      /**
       * Request headers, carrying the resolved access token as `Authorization: Bearer ...` for an
       * `oauth` connection. The hosted analogue of `env` above, and resolved at the same point for
       * the same reason.
       */
      readonly headers: Record<string, string>;
    };

export interface ExternalMcpServerConfig {
  /** Retained for matching the reviewed plugin declaration when the roster is loaded. */
  provisionedByPluginId?: string;
  serverId: string;
  label: string;
  transport: ExternalMcpTransport;
  authMode: ExternalMcpAuthMode;
  enabled: boolean;
  allowedToolNames: string[];
  /** The operator's second, write-authorization list. See {@link ExternalMcpServerRecord
   *  .writeAllowedToolNames}. Passed through untouched for `trust.ts` to enforce. */
  writeAllowedToolNames: string[];
  target: ExternalMcpServerTarget;
  /** {@link externalMcpAdmissionRevision} of the row this config was resolved from — carried onto
   *  {@link ResolvedFederatedConnection.config}'s `origin` by {@link toResolvedFederatedConnections}
   *  for `external-mcp-revocation.ts`'s per-call gate. */
  admissionRevision: string;
}

/** The OAuth half of {@link ExternalMcpServerView}. Non-secret by construction: no access token, no
 *  refresh token and no client secret appears here or in anything that builds it. */
export interface ExternalMcpOAuthView {
  providerId: string | null;
  grant: string | null;
  clientId: string | null;
  scopes: string[];
  status: ExternalMcpOAuthStatus;
  /** Plaintext expiry, straight off the row — nothing is unsealed to produce it. */
  expiresAt: ISODateTime | null;
  tokenEnvName: string | null;
  /** Whether an access TOKEN is stored. Presence, never the value — the same technique
   *  `routes/admin/system/deployment-overview.ts` uses for environment variables. Decided from
   *  PLAINTEXT columns only; see {@link externalMcpRecordHasStoredToken} for why it must not unseal
   *  and for the one state it under-reports. */
  hasStoredToken: boolean;
}

/** The read model the admin tab renders — never carries env VALUES or any OAuth secret. */
export interface ExternalMcpServerView {
  serverId: string;
  label: string;
  /** Which Agent Plugin auto-provisioned this row, or `null` for one an operator created by hand —
   *  what lets the admin tab (and a future uninstall flow) tell the two apart. */
  provisionedByPluginId: string | null;
  transport: string;
  authMode: string;
  enabled: boolean;
  command: string;
  url: string | null;
  args: string[];
  allowedToolNames: string[];
  /** The operator's second, write-authorization list. See {@link ExternalMcpServerRecord
   *  .writeAllowedToolNames}. */
  writeAllowedToolNames: string[];
  /** Who last changed {@link writeAllowedToolNames}, and when — so the tab can render "authorized by
   *  X on Y". `null` until that list is ever touched. */
  writeGrantsUpdatedByPrincipalId: string | null;
  writeGrantsUpdatedAt: ISODateTime | null;
  /** Variable names only. The tab masks values it never receives. */
  envNames: string[];
  /** Whether a `static_env` access token is stored. Presence only, decided from plaintext columns —
   *  see {@link externalMcpRecordHasStaticAccessToken}. */
  hasAccessToken: boolean;
  accessTokenHint?: CredentialTokenHint | null;
  envTokenHints?: Readonly<Record<string, CredentialTokenHint>>;
  /** For `stdio` + `static_env`: the child env variable that receives that token. A NAME, so plaintext. */
  accessTokenEnvName: string | null;
  oauth: ExternalMcpOAuthView;
}

export interface ExternalMcpStoreDeps {
  repo: ExternalMcpServerRepoPort;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

/**
 * Resolves an `oauth` row's contribution to the child environment.
 *
 * Kept behind a port rather than inlined, so this store never imports a token endpoint, a refresher,
 * or `src/platform/oauth/` at all: the boot path asks for a token, and whoever wired the daemon decides where
 * it comes from. That is also what keeps this module testable without a network.
 */
export interface ExternalMcpOAuthTokenResolverPort {
  /**
   * Returns the access token to inject, refreshing first when it is due.
   *
   * @throws When the connection needs re-authorization or the provider could not be reached. The
   * caller turns that into a per-server failure entry rather than letting it abort the whole read.
   */
  resolveAccessToken(input: { serverId: string }): Promise<string>;
}

/**
 * The OAuth half of a save. Every field follows the same three-state rule `env` established:
 * ABSENT keeps what is stored, a STRING replaces it, an EMPTY string clears it.
 *
 * Structural validation only happens here — charsets, lengths, required-when-oauth. Whether
 * `providerId` names a registered descriptor, and whether the endpoints form a usable provider, is
 * `external-mcp-oauth.ts`'s call: resolving a descriptor is the flow module's job, and importing its
 * registry here would put the store back in the business of the thing its header says it is not.
 */
export interface SaveExternalMcpOAuthInput {
  /** A registered provider id, or empty to define this connection's own endpoints below — or, on a
   *  REMOTE connection, to leave both to discovery at connect time. */
  providerId?: string;
  grant?: string;
  /** Empty on a remote connection means "mint one by dynamic client registration at connect". */
  clientId?: string;
  /** SECRET. Sealed, never returned by any read model. */
  clientSecret?: string;
  /** Raw operator input, comma- or space-separated. */
  scopes?: string;
  /** For `stdio`: which child env variable receives the access token. */
  tokenEnvName?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
}

export interface SaveExternalMcpServerInput {
  workspaceId: UUID;
  serverId: string;
  label?: string;
  transport: string;
  /** One of {@link EXTERNAL_MCP_AUTH_MODES}. Absent keeps an existing row's mode, or defaults a new
   *  row to `static_env` — the mode every row written before this field existed effectively had. */
  authMode?: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a remote transport. Required for `streamable_http`, ignored for `stdio`. */
  url?: string;
  /** Raw operator input, space-separated. */
  args: string;
  /** Raw operator input, comma-separated remote tool names. */
  allowedToolNames: string;
  /** Raw operator input, comma-separated remote tool names the operator separately authorizes to
   *  write. Same shape and same "resent in full on every save" convention as {@link
   *  allowedToolNames} — this is NOT tri-state like {@link env}, because the admin tab shows this
   *  list in the clear and can always resend it. Rejected at save (C-006) if it names a tool absent
   *  from {@link allowedToolNames}. Defaulted defensively to `""` if a caller omits it, so a route or
   *  test written before this field existed degrades to "no write grants" rather than throwing. */
  writeAllowedToolNames: string;
  /** Raw operator input, `KEY=VALUE` per line. `undefined` leaves an existing block untouched. */
  env?: string;
  /** SECRET, `static_env` only. Sealed, never returned by any read model. Three-state like {@link env}:
   *  `undefined` keeps the stored token, a string replaces it, `""` clears it. Delivered as
   *  {@link accessTokenEnvName} to a stdio child, or as `Authorization: Bearer` to a hosted server. */
  accessToken?: string;
  /** For `stdio` + `static_env`: which child env variable receives {@link accessToken}. `undefined`
   *  keeps the stored name. */
  accessTokenEnvName?: string;
  oauth?: SaveExternalMcpOAuthInput;
  /**
   * Set ONLY by `features/agent-plugins/federate-mcp.ts`, on the ONE save that creates a brand-new
   * plugin-provisioned row. Every other caller (the admin PUT route, the assistant's own
   * `external_mcp_save` tool) omits this field entirely, and an omitted field PRESERVES whatever the
   * row already has — the same three-state rule `env` establishes, minus the "empty string clears
   * it" arm: nothing should ever intentionally clear this column once set, so no clear signal is
   * defined for it. See `schema.sqlite.ts`'s `provisioned_by_plugin_id` doc for the full rule.
   */
  provisionedByPluginId?: string;
  /**
   * The principal performing this save, threaded from `getAuthedPrincipal(res)` at the route. Used
   * ONLY to attribute a change to {@link writeAllowedToolNames} — see {@link
   * resolveWriteGrantAttribution}. Required so every new caller has to supply one; a caller that
   * never touches the write list never reads it, so an un-migrated caller cannot crash on its
   * absence (see that function's doc).
   */
  principalId: string;
}

export interface ExternalMcpSealedOAuthPayload {
  /**
   * A `static_env` row's operator-pasted access token — the only member such a row's blob ever holds
   * (see {@link externalMcpRecordHasStaticAccessToken}). Additive to payload v1: the OAuth flow never
   * reads a `static_env` row (`requireOAuthRecord` refuses it), so no older reader can mishandle it.
   */
  readonly staticAccessToken?: string;
  readonly clientSecret?: string;
  readonly tokens?: {
    readonly accessToken: string;
    readonly refreshToken: string | null;
    readonly tokenType: string;
    readonly scopes: readonly string[];
    readonly expiresAt: ISODateTime | null;
  };
}

/**
 * Seals an OAuth payload, or resolves `null` when there is nothing worth sealing.
 *
 * An empty payload seals to `null` rather than to a blob containing `{}`, so `sealedOAuth !== null`
 * is a truthful answer to "does this connection hold anything secret". It is NOT an answer to "does
 * it hold a token" — a cleared connection keeps its client secret in that blob — which is why
 * {@link externalMcpRecordHasStoredToken} reads the plaintext columns instead.
 *
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no site key is available.
 * @complexity O(1) — one seal.
 */
/**
 * A sealed OAuth blob with its compatibility lineage. Vault identity travels with the opaque
 * envelope so carried credentials keep the exact ID/context they were authenticated under.
 * The server repository commits that vault row, its pointer, status and expiry together.
 */
export interface SealedExternalMcpOAuth {
  readonly sealedOAuth: SealedSecret | null;
  readonly oauthAadVersion: number;
}

/**
 * One device authorization awaiting the operator's approval.
 *
 * `Promise`-returning because the real adapter
 * (`platform/db/repos/oauth-pending-store.ts`'s `createSqlDeviceAuthorizationStore`)
 * persists to `content.db` and seals `deviceCode` through the same ADR-058 sealer/keyring every
 * other secret there goes through, so both implementations share one async call shape. This file's
 * own `createDeviceAuthorizationStore` below is the in-memory ADR-006 "second adapter" — used by
 * tests and by any composition root with no persistent `content.db` — not the production path.
 * "Worthless after a restart" was never the reason durability matters: the agent daemon starts the
 * handshake and the web server completes it in a different process, and a process-local Map cannot
 * join those two legs. Memory stores remain useful only where the whole handshake stays in one process.
 */
export interface DeviceAuthorizationStore {
  put(serverId: string, authorization: DeviceAuthorization): Promise<void>;
  get(serverId: string): Promise<DeviceAuthorization | undefined>;
  delete(serverId: string): Promise<void>;
}

export interface ExternalMcpOAuthDeps {
  readonly workspaceId: UUID;
  readonly repo: ExternalMcpServerRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly clock: ClockPort;
  readonly devices: DeviceAuthorizationStore;
  /** Required guarded transport and endpoint policy: no raw-fetch fallback can send a credential. */
  readonly httpPorts: OAuthHttpPorts;
  /** Host-owned registration; separate services do not mutate a process-wide provider map. */
  readonly providers?: OAuthProviderRegistry;
  /** Resolves a REGISTERED provider descriptor. Injected so a test can register its own without
   *  mutating another service's registry. Defaults to this service's host-owned instance. */
  readonly lookupProvider?: (providerId: string) => OAuthProviderDescriptor;
  /** Runs after a sign-in succeeds (redirect callback or device poll), once the token is durable.
   *  The composition root wires `features/agent-plugins/apply-connect-defaults.ts` here. A throw is
   *  logged and never fails the sign-in: the connection itself already succeeded. */
  readonly onConnected?: (serverId: string) => Promise<void>;
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
   *   `resolveExternalMcpOAuthRedirectUri` covers both). A redirect URI the provider was
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
   * @param input.redirectUri - Canonical callback URI from the host's existing trusted origin policy.
   */
  completeAuthorizationCallback(input: { serverId: string; redirectUri: string; params: AuthorizationCallbackParams }, optionalArgs?: Record<string, never>): Promise<void>;
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

/** Why an admitted federated tool is refused on THIS call. Every value pairs with one D3 message in
 *  {@link revocationMessage} — see that lookup for the exact, test-pinned wording. */
export type ExternalMcpRevocationReason =
  | "removed"
  | "turned-off"
  | "disconnected"
  | "changed"
  | "tool-not-allowed"
  | "write-not-allowed"
  | "unverifiable";
