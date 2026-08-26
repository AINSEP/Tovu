import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import {
  beginAuthorizationCode,
  beginDeviceAuthorization,
  buildOperatorOAuthProvider,
  completeAuthorizationCode,
  createTokenRefresher,
  getOAuthProvider,
  isOAuthError,
  OAuthError,
  pollDeviceAuthorizationOnce,
  requestOAuthToken,
  type AuthorizationCallbackParams,
  type DeviceAuthorization,
  type OAuthClient,
  type OAuthFetch,
  type OAuthProviderDescriptor,
  type OAuthTokenSet,
  type PendingAuthorizationStore,
} from "../oauth/index.js";
import {
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
 * @file Connects `src/oauth/`'s generic client to one external-MCP connection row.
 *
 * This is the ONLY module that knows both halves. `src/oauth/` knows nothing about MCP;
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
 * inherits every one of those duties, and they are implemented fresh in `src/oauth/` behind a
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

  constructor(input: { serverId: string; label?: string | null }) {
    const name = input.label ?? input.serverId;
    super(
      `"${name}" is disconnected: its authorization expired or was revoked. ` +
        `Ask the operator to reconnect it in Settings → External MCP. Do not retry this tool.`,
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

/** One device authorization awaiting the operator's approval. Held in memory for the same reason
 *  `oauth/pending-authorizations.ts` gives: it is worthless after a restart, so persisting it would
 *  only keep a redeemable secret alive past the point where anyone is waiting on it. */
export interface DeviceAuthorizationStore {
  put(serverId: string, authorization: DeviceAuthorization): void;
  get(serverId: string): DeviceAuthorization | undefined;
  delete(serverId: string): void;
}

/** Bounded by the per-workspace server cap, so no explicit eviction policy is needed beyond
 *  overwriting a connection's own previous attempt. */
export function createDeviceAuthorizationStore(): DeviceAuthorizationStore {
  const byServerId = new Map<string, DeviceAuthorization>();
  return {
    put: (serverId, authorization) => {
      byServerId.set(serverId, authorization);
    },
    get: (serverId) => byServerId.get(serverId),
    delete: (serverId) => {
      byServerId.delete(serverId);
    },
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
   *  mutating the process-wide registry. Defaults to `src/oauth/`'s. */
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
   * @throws {ExternalMcpValidationError} When the server is unknown or is not OAuth-authenticated.
   * @throws {OAuthError} Bounded, terminal, never retried — see this file's header.
   */
  beginConnect(input: { serverId: string; redirectUri: string }): Promise<ExternalMcpConnectStart>;
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

/**
 * Resolves the provider descriptor for a row: a registered id, or the operator's own endpoints.
 *
 * Both paths end at the same validated {@link OAuthProviderDescriptor}, which is what keeps every
 * flow in `src/oauth/` provider-agnostic. `buildOperatorOAuthProvider` derives the supported grants
 * from which endpoints are present, so a row cannot claim a grant it has no endpoint for.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` / `OAUTH_UNSAFE_ENDPOINT`.
 * @complexity O(1).
 */
function resolveProviderDescriptor(deps: ExternalMcpOAuthDeps, record: ExternalMcpServerRecord): OAuthProviderDescriptor {
  const endpoints = JSON.parse(record.oauthEndpointsJson ?? "{}") as {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    deviceAuthorizationEndpoint?: string;
  };

  if (endpoints.tokenEndpoint === undefined) {
    if (record.oauthProviderId === null) {
      throw new OAuthError("OAUTH_INVALID_REQUEST", `external MCP server '${record.serverId}' names no OAuth provider and defines no token endpoint`, {
        operatorAction: "Pick a provider, or type this connection's own OAuth endpoints, in Settings → External MCP.",
      });
    }
    return (deps.lookupProvider ?? getOAuthProvider)(record.oauthProviderId);
  }

  return buildOperatorOAuthProvider({
    providerId: record.oauthProviderId ?? `connection-${record.serverId}`,
    label: record.label ?? record.serverId,
    tokenEndpoint: endpoints.tokenEndpoint,
    ...(endpoints.authorizationEndpoint === undefined ? {} : { authorizationEndpoint: endpoints.authorizationEndpoint }),
    ...(endpoints.deviceAuthorizationEndpoint === undefined ? {} : { deviceAuthorizationEndpoint: endpoints.deviceAuthorizationEndpoint }),
    scopes: JSON.parse(record.oauthScopesJson ?? "[]") as string[],
  });
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
  const sealedOAuth = await sealExternalMcpOAuthPayload(deps, {
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
    updatedAt: deps.clock.nowIso(),
  });
}

/** Moves a row into a terminal or reset OAuth state without touching anything else on it. */
async function setOAuthStatus(
  deps: ExternalMcpOAuthDeps,
  serverId: string,
  status: ExternalMcpOAuthStatus,
  options: { readonly clearToken?: boolean } = {},
): Promise<void> {
  const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
  if (!record) return;
  await deps.repo.upsert({
    ...record,
    oauthStatus: status,
    ...(options.clearToken === true ? { sealedOAuth: null, oauthExpiresAt: null } : {}),
    oauthRefreshLeaseUntil: null,
    updatedAt: deps.clock.nowIso(),
  });
}

/**
 * Builds the OAuth service for one workspace.
 *
 * @returns The service plus its `tokenResolver`, which `readEnabledExternalMcpConfigs` takes.
 * @complexity Construction is O(1) and performs no I/O.
 * @tradeoffs `pending` and `devices` are in-memory, so the start of a handshake and its completion
 *   must land on the same process. That holds today — both are Express routes on the main web
 *   server, and the agent daemon serves neither — and is stated here because a future multi-process
 *   web tier turns it into a shared-store problem rather than an intermittent, unexplained failure.
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
      const record = await requireOAuthRecord(deps, input.serverId);
      const provider = resolveProviderDescriptor(deps, record);
      const client = await resolveClient(deps, record, provider);
      const scopes = JSON.parse(record.oauthScopesJson ?? "[]") as string[];

      if (record.oauthGrant === "device_code") {
        const authorization = await beginDeviceAuthorization(
          { provider, clock: deps.clock, ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }) },
          { client, scopes, timeoutMs: CONNECT_TIMEOUT_MS },
        );
        deps.devices.put(record.serverId, authorization);
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

      const started = beginAuthorizationCode(
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
      const authorization = deps.devices.get(input.serverId);
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
        deps.devices.delete(input.serverId);
        await persistTokens(deps, record, tokens);
        return { status: "connected" };
      } catch (error) {
        // The ONLY retryable branch in this whole module — RFC 8628 §3.5 requires the client to keep
        // polling on these two, and only these two.
        if (isOAuthError(error) && error.retryable) {
          return { status: "pending", retryAfterSeconds: error.retryAfterSeconds ?? authorization.intervalSeconds };
        }
        deps.devices.delete(input.serverId);
        await setOAuthStatus(deps, input.serverId, "disconnected");
        throw error;
      }
    },

    async disconnect(input) {
      deps.devices.delete(input.serverId);
      await setOAuthStatus(deps, input.serverId, "disconnected", { clearToken: true });
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
