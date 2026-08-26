import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../webhooks/index.js";
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpLaunchSpec } from "./mcp-federation/ports.js";
import { assertValidConnectionId } from "./mcp-federation/trust.js";

/**
 * @file The operator-editable roster of external MCP servers — what Settings → External MCP writes,
 * and what the agent daemon reads at boot to decide which third-party servers to federate.
 *
 * This is the SECOND config source for `mcp-federation/`. The first is `presets.ts`, whose
 * resolvers read `TOVU_<VENDOR>_MCP_*` environment variables; it stays exactly as it was. The two
 * differ in kind, which is why this is not written as a preset: a preset resolver is synchronous and
 * returns at most one connection, while this store is async (sealing is promise-based) and returns
 * N. `bootstrap.ts`'s `extraConnections` parameter is the seam that carries them.
 *
 * ## Secrets
 *
 * An MCP server's `env` block routinely carries live credentials, so it is sealed through ADR-058's
 * `SecretSealerPort` using the same keyring instance the Composio/BYOK/media-provider stores share
 * — `src/webhooks/ports.ts` states the rule this follows: keep secret material out of the
 * portable `content.db`.
 *
 * The block is sealed WHOLE rather than per-variable. Every read path wants all of it at once (it
 * becomes one child process's environment), so per-variable sealing would buy nothing and cost N
 * round-trips. Variable NAMES are stored separately in plaintext so the tab can show which
 * variables are set without unsealing anything.
 *
 * ## What this file does NOT do
 *
 * It does not decide whether a remote tool may be called. That is `mcp-federation/trust.ts`'s
 * default-deny admission tier, applied at connect time to whatever this store produced.
 * `allowedToolNames` is carried here and enforced there, on purpose: a config store that also
 * adjudicated trust would be two mechanisms with one owner.
 *
 * It does not run the OAuth flow either. That is `assistant/external-mcp-oauth.ts` over the generic
 * client in `src/oauth/`; this store owns only the ROW — which auth mode a server uses, its
 * plaintext OAuth metadata, and the sealed blob. Same split as `allowedToolNames`, same reason.
 *
 * ## Transport and auth mode are ORTHOGONAL
 *
 * {@link ExternalMcpTransport} and {@link ExternalMcpAuthMode} are two independent fields and must
 * stay that way. Encoding OAuth as a transport (`transport: "oauth"`) would be the wrong
 * abstraction immediately, not eventually: a hosted server may be HTTP + OAuth, and a LOCAL stdio
 * server may also require OAuth — Tovu obtains the token and hands it to the child process in its
 * environment. Both combinations are real, so neither field can be derived from the other.
 */

/**
 * `stdio` is what `mcp-federation/adapter.stdio.ts` implements and is the only transport that can
 * actually be federated today. `streamable_http` is accepted and STORED so an operator can describe
 * a hosted server and authorize it now, but {@link readEnabledExternalMcpConfigs} reports such a row
 * as unusable rather than pretending — there is no HTTP MCP client in this repo yet, and
 * half-building one behind a config flag is how a feature ends up looking supported while never
 * having worked.
 */
export const SUPPORTED_EXTERNAL_MCP_TRANSPORTS = ["stdio", "streamable_http"] as const;
export type ExternalMcpTransport = (typeof SUPPORTED_EXTERNAL_MCP_TRANSPORTS)[number];

/**
 * How a server's credentials are obtained — independent of {@link ExternalMcpTransport}.
 *
 * - `none` — no credentials at all. Common for local developer tooling.
 * - `static_env` — the operator pasted a `KEY=VALUE` block. What this store has always done, and
 *   the default for every row that predates this field.
 * - `oauth` — Tovu holds a token it obtained itself and must keep alive. See
 *   `assistant/external-mcp-oauth.ts`.
 */
export const EXTERNAL_MCP_AUTH_MODES = ["none", "static_env", "oauth"] as const;
export type ExternalMcpAuthMode = (typeof EXTERNAL_MCP_AUTH_MODES)[number];

/**
 * The runtime lifecycle of an OAuth-backed connection.
 *
 * `needs_reauth` is the state that earns its place here. It is deliberately NOT the boot-time "skip
 * this row and report why" path {@link readEnabledExternalMcpConfigs} already uses for a sealed blob
 * that will not decrypt: that is a STORAGE failure, nothing the operator types can fix it, and it is
 * discovered while the daemon starts. `needs_reauth` is an expected RUNTIME lifecycle state — a
 * token expired or was revoked while everything was working — it is exactly operator-actionable, and
 * it must be visible in the admin tab rather than buried in a boot log nobody is reading at the time.
 */
export const EXTERNAL_MCP_OAUTH_STATUSES = ["disconnected", "pending", "connected", "needs_reauth"] as const;
export type ExternalMcpOAuthStatus = (typeof EXTERNAL_MCP_OAUTH_STATUSES)[number];

/** Which OAuth grant an operator chose. Mirrors `src/oauth/`'s `OAuthGrantKind`; restated rather
 *  than imported so the stored row shape does not depend on the flow module. */
export const EXTERNAL_MCP_OAUTH_GRANTS = ["authorization_code", "device_code"] as const;
export type ExternalMcpOAuthGrant = (typeof EXTERNAL_MCP_OAUTH_GRANTS)[number];

/** Raised when operator-supplied input cannot be stored. Carries `field` so a route can point the
 *  form at the offending input rather than rejecting the whole submission opaquely. */
export class ExternalMcpValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "ExternalMcpValidationError";
  }
}

/** Raised when sealing fails because no root key is configured — distinct from a validation error,
 *  because nothing the operator types can fix it. */
export class ExternalMcpSecretStoreUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalMcpSecretStoreUnconfiguredError";
  }
}

/** One stored row. `sealedEnv` is null when the server needs no credentials, which is normal. */
export interface ExternalMcpServerRecord {
  workspaceId: UUID;
  serverId: string;
  label: string | null;
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
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence (ADR-007 §1). Multi-row per workspace, so list/upsert/delete rather
 *  than the single-row find/upsert `ComposioConfigRepoPort` uses. */
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
 * unrepresentable. It mirrors `mcp-federation/ports.ts`'s `McpLaunchSpec` deliberately — this is
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
  serverId: string;
  label: string;
  transport: ExternalMcpTransport;
  authMode: ExternalMcpAuthMode;
  enabled: boolean;
  allowedToolNames: string[];
  target: ExternalMcpServerTarget;
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
  /** Whether a sealed blob exists at all. Presence, never the value — the same technique
   *  `routes/admin/system/deployment-overview.ts` uses for environment variables. */
  hasStoredToken: boolean;
}

/** The read model the admin tab renders — never carries env VALUES or any OAuth secret. */
export interface ExternalMcpServerView {
  serverId: string;
  label: string;
  transport: string;
  authMode: string;
  enabled: boolean;
  command: string;
  url: string | null;
  args: string[];
  allowedToolNames: string[];
  /** Variable names only. The tab masks values it never receives. */
  envNames: string[];
  oauth: ExternalMcpOAuthView;
}

export interface ExternalMcpStoreDeps {
  repo: ExternalMcpServerRepoPort;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

const MAX_SERVERS_PER_WORKSPACE = 32;
const MAX_ENV_VARS = 64;
const MAX_ARGS = 64;
const MAX_ALLOWED_TOOLS = 64;
/** Matches `trust.ts`'s own `REMOTE_TOOL_NAME_PATTERN`. Restated rather than imported because that
 *  constant is private to the trust tier; `__tests__/external-mcp-store.test.ts` asserts the two
 *  agree by round-tripping a name through `admitRemoteTools`. */
const REMOTE_TOOL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
/** POSIX-ish environment variable name. Deliberately stricter than what a shell tolerates: a name
 *  outside this set is far more likely a mis-pasted line than an intentional variable. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Generous — a provider asking for more distinct scopes than this is misconfigured, not ambitious. */
const MAX_OAUTH_SCOPES = 64;
/** Bounds the single-line OAuth identity fields (client id, secret). A real one is far shorter; the
 *  cap exists so a pasted file cannot become a database row. */
const MAX_OAUTH_FIELD_LENGTH = 1024;
/** Matches `src/oauth/providers.ts`'s own rule. Restated rather than imported for the reason this
 *  file's header gives: the row shape must not depend on the flow module. */
const OAUTH_PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Parses a stored JSON object column, tolerating a null/absent/corrupt value as `{}` — the same
 *  posture {@link parseJsonArray} takes, and for the same reason: one unreadable column must not
 *  make a whole row unreadable. */
function parseJsonObject(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Parses an operator's `KEY=VALUE`-per-line environment block into a map.
 *
 * Blank lines and `#` comments are skipped so an operator can annotate the block. Everything else
 * must parse: a line without `=` is rejected rather than ignored, because silently dropping what
 * looks like a credential is how a server ends up launching without the token the operator believes
 * they supplied. Only the FIRST `=` splits, so values may contain `=` (base64 padding, connection
 * strings).
 *
 * @param text - Raw textarea content.
 * @returns The parsed variables, in first-seen order.
 * @throws {ExternalMcpValidationError} On a malformed line, an invalid name, a duplicate, or more
 * than {@link MAX_ENV_VARS} variables.
 * @complexity O(n) in the number of lines.
 * @overallScore 100
 */
/** One line of {@link parseEnvBlock}'s input, parsed and name-validated but not yet checked against
 *  the running `env` map (dedup/cap are the loop's own job, since they need cross-line state). Split
 *  out purely to keep `parseEnvBlock`'s cognitive complexity under the shop ceiling — `null` means
 *  "skip this line" (blank or `#` comment), matching the original inline `continue`. */
function parseEnvLine(rawLine: string, index: number): { readonly name: string; readonly value: string } | null {
  const line = rawLine.trim();
  if (line === "" || line.startsWith("#")) return null;

  const separator = line.indexOf("=");
  if (separator <= 0) {
    throw new ExternalMcpValidationError(
      `line ${index + 1} of the environment block is not \`NAME=VALUE\`: ${JSON.stringify(rawLine.slice(0, 40))}`,
      "env",
    );
  }

  const name = line.slice(0, separator).trim();
  if (!ENV_NAME_PATTERN.test(name)) {
    throw new ExternalMcpValidationError(
      `'${name}' is not a valid environment variable name (letters, digits and underscore, not starting with a digit)`,
      "env",
    );
  }
  return { name, value: line.slice(separator + 1).trim() };
}

export function parseEnvBlock(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const parsed = parseEnvLine(rawLine, index);
    if (!parsed) continue;
    // Rejected rather than last-write-wins: two lines setting the same variable means the operator
    // believes both are in effect, and picking one silently is the failure mode this guards.
    if (Object.hasOwn(env, parsed.name)) {
      throw new ExternalMcpValidationError(`environment variable '${parsed.name}' is set more than once`, "env");
    }
    if (Object.keys(env).length >= MAX_ENV_VARS) {
      throw new ExternalMcpValidationError(`at most ${MAX_ENV_VARS} environment variables are supported`, "env");
    }
    env[parsed.name] = parsed.value;
  }

  return env;
}

/**
 * Splits an operator's space-separated argv string.
 *
 * No shell quoting is honoured, and that is deliberate rather than unfinished: supporting quotes
 * would invite the belief that this string is shell-interpreted, when the command is spawned
 * WITHOUT a shell (`adapter.stdio.ts` uses `spawn` with an argv array). An operator who needs a
 * literal space in one argument is better served by learning that than by a quoting scheme that
 * silently differs from their shell's.
 *
 * @complexity O(n) in the string length.
 * @overallScore 100
 */
export function parseArgs(raw: string): string[] {
  const args = raw.split(/\s+/).filter((part) => part.length > 0);
  if (args.length > MAX_ARGS) {
    throw new ExternalMcpValidationError(`at most ${MAX_ARGS} arguments are supported`, "args");
  }
  return args;
}

/**
 * Splits an operator's comma-separated allowlist of remote tool names.
 *
 * An empty result is a legitimate, meaningful value — it yields a server that contributes zero
 * tools — so it is returned rather than rejected. That is the safe direction and matches
 * `trust.ts` R2's default-deny posture.
 *
 * @throws {ExternalMcpValidationError} On a name the trust tier would refuse anyway, so the operator
 * learns at save time instead of discovering an unexplained absence after a restart.
 * @complexity O(n) in the number of names.
 * @overallScore 100
 */
export function parseAllowedToolNames(raw: string): string[] {
  const names = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (names.length > MAX_ALLOWED_TOOLS) {
    throw new ExternalMcpValidationError(`at most ${MAX_ALLOWED_TOOLS} allowed tools are supported`, "allowedToolNames");
  }
  for (const name of names) {
    if (!REMOTE_TOOL_NAME_PATTERN.test(name)) {
      throw new ExternalMcpValidationError(
        `'${name}' is not a valid MCP tool name, so the trust tier would refuse it on connect`,
        "allowedToolNames",
      );
    }
  }
  return [...new Set(names)];
}

/**
 * Reads a row's auth mode, defaulting a row written before the column existed.
 *
 * `static_env` is the correct default rather than `none`: every pre-existing row was written by a
 * form whose only credential mechanism was the env block, and a row with an empty block behaves
 * identically under either mode. Defaulting to `none` would silently relabel rows that DO carry a
 * sealed block as credential-free.
 *
 * @complexity O(1).
 */
export function resolveExternalMcpAuthMode(record: Pick<ExternalMcpServerRecord, "authMode">): ExternalMcpAuthMode {
  const mode = record.authMode;
  return EXTERNAL_MCP_AUTH_MODES.includes(mode as ExternalMcpAuthMode) ? (mode as ExternalMcpAuthMode) : "static_env";
}

/** A row's OAuth status, defaulting an absent or unrecognized value to `disconnected` — the safe
 *  direction, since it is the state in which no token is used and the operator is prompted. */
export function resolveExternalMcpOAuthStatus(record: Pick<ExternalMcpServerRecord, "oauthStatus">): ExternalMcpOAuthStatus {
  const status = record.oauthStatus;
  return status !== null && EXTERNAL_MCP_OAUTH_STATUSES.includes(status as ExternalMcpOAuthStatus)
    ? (status as ExternalMcpOAuthStatus)
    : "disconnected";
}

function toView(record: ExternalMcpServerRecord): ExternalMcpServerView {
  return {
    serverId: record.serverId,
    label: record.label ?? record.serverId,
    transport: record.transport,
    authMode: resolveExternalMcpAuthMode(record),
    enabled: record.enabled,
    command: record.command ?? "",
    url: record.url,
    args: parseJsonArray(record.args),
    allowedToolNames: parseJsonArray(record.allowedToolNames),
    envNames: parseJsonArray(record.envNames),
    oauth: {
      providerId: record.oauthProviderId,
      grant: record.oauthGrant,
      clientId: record.oauthClientId,
      scopes: parseJsonArray(record.oauthScopesJson),
      status: resolveExternalMcpOAuthStatus(record),
      expiresAt: record.oauthExpiresAt,
      tokenEnvName: record.oauthTokenEnvName,
      hasStoredToken: record.sealedOAuth !== null,
    },
  };
}

/**
 * Lists the workspace's servers for the admin tab. Never unseals — the tab has no use for env
 * values and must not be a route that decrypts them.
 *
 * @complexity O(n) in the stored server count.
 * @overallScore 100
 */
export async function listExternalMcpServerViews(
  deps: Pick<ExternalMcpStoreDeps, "repo">,
  workspaceId: UUID,
): Promise<ExternalMcpServerView[]> {
  const records = await deps.repo.listByWorkspaceId(workspaceId);
  return records.map(toView);
}

/**
 * Reads and decrypts every ENABLED server, for the daemon's boot-time federation pass.
 *
 * A row whose sealed env cannot be opened is SKIPPED rather than thrown on, and the reason is
 * returned in `failures`. This mirrors `bootstrap.ts`'s fail-open posture for the same reason: a
 * rotated root key or a corrupt row must not stop the daemon booting, and one unusable server must
 * not take out a second working one. Disabled rows never reach the sealer at all.
 *
 * @returns The usable configs plus a per-server accounting of what could not be read.
 * @complexity O(n) in the enabled server count, one unseal each.
 * @overallScore 100
 */
/** Opens `record`'s sealed env block, or returns `{}` when there is none to open. Split out of
 *  {@link resolveExternalMcpConfig} purely to keep that function's complexity under the shop
 *  ceiling — a decrypt failure is reported through the same ok/reason shape the caller already
 *  threads through, not thrown, since one unreadable server must not abort the whole read. */
async function openExternalMcpEnv(
  record: Pick<ExternalMcpServerRecord, "sealedEnv">,
  sealer: Pick<SecretSealerPort, "open">,
): Promise<{ readonly ok: true; readonly env: Record<string, string> } | { readonly ok: false; readonly reason: string }> {
  if (record.sealedEnv === null) return { ok: true, env: {} };
  try {
    const opened = await sealer.open({ sealed: record.sealedEnv });
    const parsed: unknown = JSON.parse(opened);
    const env = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
    return { ok: true, env };
  } catch (err) {
    return { ok: false, reason: `stored credentials could not be decrypted: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Resolves an `oauth` row's contribution to the child environment.
 *
 * Kept behind a port rather than inlined, so this store never imports a token endpoint, a refresher,
 * or `src/oauth/` at all: the boot path asks for a token, and whoever wired the daemon decides where
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
 * A `needs_reauth`/`disconnected`/`pending` row is reported rather than connected.
 *
 * Reported, not silently skipped: an operator whose token expired needs to see WHY the server's
 * tools vanished, and the reason string is the only thing carrying that at boot. The admin tab's
 * `needs_reauth` badge is the out-of-band half of the same signal.
 */
function oauthStatusFailure(record: ExternalMcpServerRecord): string | null {
  const status = resolveExternalMcpOAuthStatus(record);
  if (status === "connected") return null;
  if (status === "needs_reauth") {
    return "its authorization expired or was revoked — reconnect it in Settings → External MCP";
  }
  return `it has not been authorized yet (status '${status}') — connect it in Settings → External MCP`;
}

/**
 * Obtains one record's OAuth access token, or explains why it cannot be.
 *
 * Returns the raw token rather than a placement, because WHERE it goes is the transport's business:
 * a child-process variable for `stdio`, an `Authorization` header for a hosted endpoint. Splitting
 * "can we get a token" from "where does it go" is what stops the second question's answer from
 * being duplicated per transport.
 *
 * @complexity O(1) plus at most one token refresh round trip.
 */
async function resolveExternalMcpAccessToken(
  record: ExternalMcpServerRecord,
  oauth: ExternalMcpOAuthTokenResolverPort | undefined,
): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: string }> {
  const statusFailure = oauthStatusFailure(record);
  if (statusFailure !== null) return { ok: false, reason: statusFailure };
  if (!oauth) {
    return { ok: false, reason: "this process was not wired with an OAuth token resolver, so its access token cannot be obtained" };
  }
  try {
    return { ok: true, token: await oauth.resolveAccessToken({ serverId: record.serverId }) };
  } catch (err) {
    return { ok: false, reason: `its OAuth access token could not be obtained: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** A failure entry for one record, in the shape {@link readEnabledExternalMcpConfigs} collects. */
function externalMcpFailure(record: ExternalMcpServerRecord, reason: string): { readonly ok: false; readonly failure: { serverId: string; reason: string } } {
  return { ok: false, failure: { serverId: record.serverId, reason } };
}

/**
 * Builds a `stdio` row's target: its pasted environment, plus the access token under the operator's
 * chosen variable name when the row is OAuth-authenticated.
 *
 * The two credential sources compose rather than exclude: a server can need a pasted `BASE_URL` AND
 * an OAuth bearer token. The OAuth-derived variable is applied LAST so it cannot be shadowed by a
 * stale hand-typed copy of the same name in the pasted block.
 */
async function resolveStdioTarget(
  record: ExternalMcpServerRecord,
  env: Record<string, string>,
  authMode: ExternalMcpAuthMode,
  oauth: ExternalMcpOAuthTokenResolverPort | undefined,
): Promise<{ readonly ok: true; readonly target: ExternalMcpServerTarget } | { readonly ok: false; readonly failure: { serverId: string; reason: string } }> {
  if (!record.command) return externalMcpFailure(record, "no command is configured to launch it");

  let resolvedEnv = env;
  if (authMode === "oauth") {
    if (!record.oauthTokenEnvName) {
      return externalMcpFailure(record, "no environment variable name is configured to receive its OAuth access token");
    }
    const token = await resolveExternalMcpAccessToken(record, oauth);
    if (!token.ok) return externalMcpFailure(record, token.reason);
    resolvedEnv = { ...resolvedEnv, [record.oauthTokenEnvName]: token.token };
  }

  return { ok: true, target: { kind: "stdio", command: record.command, args: parseJsonArray(record.args), env: resolvedEnv } };
}

/**
 * Builds a hosted row's target: its endpoint, plus the bearer header when the row is
 * OAuth-authenticated.
 *
 * A hosted row's pasted `env` block is deliberately NOT turned into headers. An operator typing
 * `FOO=bar` means an environment variable, and silently promoting it to a request header would send
 * a value they scoped to a local process to a third party over the network. A hosted server that
 * needs a non-OAuth header is a capability this does not yet have, and failing to have it is much
 * better than guessing at it.
 */
async function resolveHttpTarget(
  record: ExternalMcpServerRecord,
  authMode: ExternalMcpAuthMode,
  oauth: ExternalMcpOAuthTokenResolverPort | undefined,
): Promise<{ readonly ok: true; readonly target: ExternalMcpServerTarget } | { readonly ok: false; readonly failure: { serverId: string; reason: string } }> {
  if (!record.url) return externalMcpFailure(record, "no URL is configured to reach it");

  const headers: Record<string, string> = {};
  if (authMode === "oauth") {
    const token = await resolveExternalMcpAccessToken(record, oauth);
    if (!token.ok) return externalMcpFailure(record, token.reason);
    headers.authorization = `Bearer ${token.token}`;
  }

  return { ok: true, target: { kind: "streamable_http", url: record.url, headers } };
}

/** Resolves one ENABLED record into either a usable config or a failure entry, for
 *  {@link readEnabledExternalMcpConfigs}'s loop. */
async function resolveExternalMcpConfig(
  record: ExternalMcpServerRecord,
  sealer: Pick<SecretSealerPort, "open">,
  oauth: ExternalMcpOAuthTokenResolverPort | undefined,
): Promise<
  | { readonly ok: true; readonly config: ExternalMcpServerConfig }
  | { readonly ok: false; readonly failure: { serverId: string; reason: string } }
> {
  const transport = record.transport as ExternalMcpTransport;
  if (!SUPPORTED_EXTERNAL_MCP_TRANSPORTS.includes(transport)) {
    return externalMcpFailure(record, `unsupported transport '${record.transport}'`);
  }

  const opened = await openExternalMcpEnv(record, sealer);
  if (!opened.ok) return externalMcpFailure(record, opened.reason);

  const authMode = resolveExternalMcpAuthMode(record);
  const resolved =
    transport === "stdio"
      ? await resolveStdioTarget(record, opened.env, authMode, oauth)
      : await resolveHttpTarget(record, authMode, oauth);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    config: {
      serverId: record.serverId,
      label: record.label ?? record.serverId,
      transport,
      authMode,
      enabled: true,
      allowedToolNames: parseJsonArray(record.allowedToolNames),
      target: resolved.target,
    },
  };
}

export async function readEnabledExternalMcpConfigs(
  deps: Pick<ExternalMcpStoreDeps, "repo" | "sealer"> & { oauth?: ExternalMcpOAuthTokenResolverPort },
  workspaceId: UUID,
): Promise<{ configs: ExternalMcpServerConfig[]; failures: { serverId: string; reason: string }[] }> {
  const records = await deps.repo.listByWorkspaceId(workspaceId);
  const configs: ExternalMcpServerConfig[] = [];
  const failures: { serverId: string; reason: string }[] = [];

  for (const record of records) {
    if (!record.enabled) continue;
    const resolved = await resolveExternalMcpConfig(record, deps.sealer, deps.oauth);
    if (resolved.ok) configs.push(resolved.config);
    else failures.push(resolved.failure);
  }

  return { configs, failures };
}

/**
 * Maps stored configs onto the shape `mcp-federation/bootstrap.ts` consumes.
 *
 * Timeouts and caps come from core's shared `FEDERATED_CONNECTION_DEFAULTS` rather than being
 * stored per server: they are policy about how much a third party may cost this process, which is
 * Tovu's call and not an operator preference. `allowedToolNames` is the one field that IS the
 * operator's, and it is passed through untouched for `trust.ts` to enforce.
 *
 * @complexity O(n) in the config count.
 * @overallScore 100
 */
export function toResolvedFederatedConnections(
  configs: readonly ExternalMcpServerConfig[],
): ResolvedFederatedConnection[] {
  return configs.map((config) => ({
    config: {
      connectionId: config.serverId,
      label: config.label,
      allowedToolNames: config.allowedToolNames,
      connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs,
      callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
      maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes,
      maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools,
    },
    launch: toFederatedLaunchSpec(config.target),
  }));
}

/** Maps a resolved target onto the federation layer's launch spec. The two shapes are deliberately
 *  separate — this one is the store's, that one is federation's — so neither domain has to widen
 *  when the other gains a field. */
function toFederatedLaunchSpec(target: ExternalMcpServerTarget): McpLaunchSpec {
  if (target.kind === "streamable_http") return { url: target.url, headers: target.headers };
  return {
    command: target.command,
    args: target.args,
    // The child's environment REPLACES the daemon's rather than extending it, matching the
    // Supabase preset. `PATH`/`HOME`/`TMPDIR` are added by the launcher, not here; anything else
    // a server needs is an explicit, written-down grant in its own env block.
    env: target.env,
  };
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
  /** Raw operator input, `KEY=VALUE` per line. `undefined` leaves an existing block untouched. */
  env?: string;
  oauth?: SaveExternalMcpOAuthInput;
}

/**
 * Validates and persists one server, sealing its env block.
 *
 * `env: undefined` preserves whatever is already stored, which is what lets the tab patch `enabled`
 * or `label` without the operator re-typing credentials the UI never sent them. `env: ""` is the
 * distinct, explicit "clear the credentials" instruction — the same unset-vs-empty distinction
 * `mcp-federation/config.ts` draws for allowlists, and for the same reason.
 *
 * @throws {ExternalMcpValidationError} On any invalid operator input.
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available to seal under.
 * @complexity O(n) in the size of the env block.
 * @overallScore 100
 */
/** Validates `serverId` via the trust tier's own assertion, remapped onto this store's own error
 *  type. Split out purely to keep {@link saveExternalMcpServer}'s complexity under the shop
 *  ceiling — reuses `trust.ts`'s rule rather than restating it, since this id becomes part of every
 *  federated tool id and two copies of that rule could drift. */
function assertValidExternalMcpServerId(serverId: string): void {
  try {
    assertValidConnectionId(serverId);
  } catch (err) {
    throw new ExternalMcpValidationError(err instanceof Error ? err.message : String(err), "id");
  }
}

function assertSupportedExternalMcpTransport(transport: string): void {
  if (!SUPPORTED_EXTERNAL_MCP_TRANSPORTS.includes(transport as ExternalMcpTransport)) {
    throw new ExternalMcpValidationError(
      `transport '${transport}' is not supported — only ${SUPPORTED_EXTERNAL_MCP_TRANSPORTS.join(", ")} is implemented`,
      "transport",
    );
  }
}

/** Resolves the auth mode for one save: explicit input wins, then the existing row's mode, then
 *  `static_env` for a brand-new row.
 *  @throws {ExternalMcpValidationError} On a mode outside {@link EXTERNAL_MCP_AUTH_MODES}. */
function resolveSavedAuthMode(input: SaveExternalMcpServerInput, existing: ExternalMcpServerRecord | null): ExternalMcpAuthMode {
  if (input.authMode === undefined) return existing ? resolveExternalMcpAuthMode(existing) : "static_env";
  if (!EXTERNAL_MCP_AUTH_MODES.includes(input.authMode as ExternalMcpAuthMode)) {
    throw new ExternalMcpValidationError(
      `auth mode '${input.authMode}' is not supported — expected one of ${EXTERNAL_MCP_AUTH_MODES.join(", ")}`,
      "authMode",
    );
  }
  return input.authMode as ExternalMcpAuthMode;
}

/**
 * Splits an operator's comma- or space-separated OAuth scope list.
 *
 * An empty result is legitimate — several providers infer scope from the client registration — so it
 * is returned rather than rejected, the same call {@link parseAllowedToolNames} makes.
 *
 * @throws {ExternalMcpValidationError} Past {@link MAX_OAUTH_SCOPES}.
 * @complexity O(n) in the number of scopes.
 */
export function parseOAuthScopes(raw: string): string[] {
  const scopes = raw.split(/[\s,]+/).filter((part) => part.length > 0);
  if (scopes.length > MAX_OAUTH_SCOPES) {
    throw new ExternalMcpValidationError(`at most ${MAX_OAUTH_SCOPES} OAuth scopes are supported`, "oauth.scopes");
  }
  return [...new Set(scopes)];
}

/** The endpoints an operator typed for a connection that defines its own provider. Empty strings are
 *  dropped so `{}` — "this connection names a registered provider instead" — stays representable. */
function buildOAuthEndpoints(oauth: SaveExternalMcpOAuthInput): Record<string, string> {
  const entries: readonly (readonly [string, string | undefined])[] = [
    ["authorizationEndpoint", oauth.authorizationEndpoint],
    ["tokenEndpoint", oauth.tokenEndpoint],
    ["deviceAuthorizationEndpoint", oauth.deviceAuthorizationEndpoint],
  ];
  const endpoints: Record<string, string> = {};
  for (const [key, value] of entries) {
    const trimmed = value?.trim();
    if (trimmed) endpoints[key] = trimmed;
  }
  return endpoints;
}

/**
 * The identity a stored token was issued under.
 *
 * Compared before and after a save so a token cannot silently survive a change that invalidates it:
 * a new client id, a different provider, a re-pointed token endpoint or a changed scope list all mean
 * the stored access token no longer corresponds to what the row now says. Keeping it would leave a
 * connection reporting `connected` while holding a credential for something else — which then fails
 * opaquely at a tool call instead of loudly at save time.
 *
 * @complexity O(1).
 */
function oauthBindingFingerprint(
  record: Pick<ExternalMcpServerRecord, "oauthProviderId" | "oauthGrant" | "oauthClientId" | "oauthEndpointsJson" | "oauthScopesJson">,
): string {
  return JSON.stringify([
    record.oauthProviderId,
    record.oauthGrant,
    record.oauthClientId,
    record.oauthEndpointsJson,
    record.oauthScopesJson,
  ]);
}

/** The OAuth columns produced by one save, plus the operator's client-secret instruction. */
interface ResolvedOAuthFields {
  readonly oauthProviderId: string | null;
  readonly oauthGrant: string | null;
  readonly oauthClientId: string | null;
  readonly oauthEndpointsJson: string | null;
  readonly oauthScopesJson: string | null;
  readonly oauthTokenEnvName: string | null;
  /** Three-state, as `env` is: `undefined` keeps, a string replaces, `""` clears. */
  readonly clientSecret: string | undefined;
}

/**
 * Validates and resolves the OAuth columns for one save.
 *
 * @throws {ExternalMcpValidationError} On any invalid operator input, with `field` naming the
 * offending form control (`oauth.clientId`, `oauth.grant`, ...).
 * @complexity O(n) in the number of scopes.
 */
/** The OAuth columns of a row that is NOT OAuth-authenticated: all cleared.
 *
 *  Cleared rather than preserved, deliberately: a row switched to `static_env` that still carried a
 *  provider and a client id would silently re-adopt them if it were ever switched back, along with a
 *  token issued under configuration nobody has looked at since. */
const NO_OAUTH_FIELDS: ResolvedOAuthFields = {
  oauthProviderId: null,
  oauthGrant: null,
  oauthClientId: null,
  oauthEndpointsJson: null,
  oauthScopesJson: null,
  oauthTokenEnvName: null,
  clientSecret: "",
};

/**
 * The first non-empty trimmed candidate, or `""`.
 *
 * Every OAuth identity field follows the same precedence — what the operator just submitted, then
 * what the row already holds, then nothing — and writing that as a `??` chain at each field is both
 * repetitive and, measurably, most of these functions' branch count. One helper makes the precedence
 * a single named rule instead of five copies of it.
 *
 * @complexity O(n) in the number of candidates, each trimmed once.
 */
function firstTrimmed(...candidates: readonly (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** @throws {ExternalMcpValidationError} On a grant outside {@link EXTERNAL_MCP_OAUTH_GRANTS}. */
function assertOAuthGrant(grant: string): ExternalMcpOAuthGrant {
  if (!EXTERNAL_MCP_OAUTH_GRANTS.includes(grant as ExternalMcpOAuthGrant)) {
    throw new ExternalMcpValidationError(
      `OAuth grant '${grant}' is not supported — expected one of ${EXTERNAL_MCP_OAUTH_GRANTS.join(", ")}`,
      "oauth.grant",
    );
  }
  return grant as ExternalMcpOAuthGrant;
}

/**
 * Validates a client id, or admits its absence on a row that can obtain one for itself.
 *
 * `selfConfigurable` is what makes an empty client id legitimate rather than a validation failure.
 * A growing share of hosted authorization servers publish an RFC 7591 `registration_endpoint` and no
 * developer console at all, so for those there is no human path to a client id — demanding one here
 * would make the connection unreachable by any amount of operator effort. A row that carries a REMOTE
 * URL can run discovery against it at connect time and mint one; a stdio row has nothing to discover
 * from, so for those the requirement stands unchanged.
 *
 * @returns The validated client id, or `null` when the row will mint one at connect.
 * @throws {ExternalMcpValidationError} On an empty client id the row cannot obtain, or an oversized one.
 * @complexity O(1).
 */
function assertOAuthClientId(clientId: string, selfConfigurable: boolean): string | null {
  if (clientId === "") {
    if (selfConfigurable) return null;
    throw new ExternalMcpValidationError("an OAuth connection needs a client id", "oauth.clientId");
  }
  if (clientId.length > MAX_OAUTH_FIELD_LENGTH) {
    throw new ExternalMcpValidationError(`the OAuth client id may be at most ${MAX_OAUTH_FIELD_LENGTH} characters`, "oauth.clientId");
  }
  return clientId;
}

/**
 * Resolves the provider half of an OAuth connection: a registered provider id, its own endpoints, or
 * both.
 *
 * Endpoints are re-derived whenever the operator touched EITHER identity field, so clearing a
 * provider id and typing endpoints (or the reverse) cannot leave half of the old pairing behind.
 *
 * @throws {ExternalMcpValidationError} When neither a provider id nor a token endpoint is present,
 * or the provider id is malformed.
 * @complexity O(1).
 */
function resolveOAuthEndpoints(
  oauth: SaveExternalMcpOAuthInput,
  existing: ExternalMcpServerRecord | null,
): Record<string, string> {
  const touchedIdentity = oauth.providerId !== undefined || oauth.tokenEndpoint !== undefined;
  return touchedIdentity ? buildOAuthEndpoints(oauth) : parseJsonObject(existing?.oauthEndpointsJson ?? null);
}

/**
 * @param selfConfigurable - Whether this row can discover its own endpoints — see
 *   {@link assertOAuthClientId} for the same argument applied to the client id.
 * @throws {ExternalMcpValidationError} When neither identity is present on a row that cannot
 *   discover one, or the id is malformed.
 */
function assertOAuthProviderIdentity(providerId: string, endpoints: Record<string, string>, selfConfigurable: boolean): void {
  if (providerId === "" && endpoints.tokenEndpoint === undefined && !selfConfigurable) {
    throw new ExternalMcpValidationError(
      "an OAuth connection needs either a registered provider id or its own token endpoint",
      "oauth.providerId",
    );
  }
  if (providerId !== "" && !OAUTH_PROVIDER_ID_PATTERN.test(providerId)) {
    throw new ExternalMcpValidationError(
      `'${providerId}' is not a valid provider id (lowercase letters, digits and hyphens)`,
      "oauth.providerId",
    );
  }
}

function resolveOAuthProviderIdentity(
  oauth: SaveExternalMcpOAuthInput,
  existing: ExternalMcpServerRecord | null,
  selfConfigurable: boolean,
): { readonly oauthProviderId: string | null; readonly oauthEndpointsJson: string | null } {
  const providerId = firstTrimmed(oauth.providerId, existing?.oauthProviderId);
  const endpoints = resolveOAuthEndpoints(oauth, existing);
  assertOAuthProviderIdentity(providerId, endpoints, selfConfigurable);

  return {
    oauthProviderId: providerId === "" ? null : providerId,
    oauthEndpointsJson: Object.keys(endpoints).length === 0 ? null : JSON.stringify(endpoints),
  };
}

/**
 * Resolves which child-process environment variable receives the access token.
 *
 * `null` for every non-`stdio` transport: only `stdio` hands credentials to a child process, so only
 * `stdio` needs a name for one.
 *
 * @throws {ExternalMcpValidationError} When a stdio+OAuth row names none, or names an invalid one.
 * @complexity O(n) in the name length.
 */
function resolveOAuthTokenEnvName(
  transport: ExternalMcpTransport,
  oauth: SaveExternalMcpOAuthInput,
  existing: ExternalMcpServerRecord | null,
): string | null {
  if (transport !== "stdio") return null;

  const tokenEnvName = firstTrimmed(oauth.tokenEnvName, existing?.oauthTokenEnvName);
  if (tokenEnvName === "") {
    throw new ExternalMcpValidationError(
      "a stdio server authenticated with OAuth needs the name of the environment variable that receives its access token",
      "oauth.tokenEnvName",
    );
  }
  if (!ENV_NAME_PATTERN.test(tokenEnvName)) {
    throw new ExternalMcpValidationError(
      `'${tokenEnvName}' is not a valid environment variable name (letters, digits and underscore, not starting with a digit)`,
      "oauth.tokenEnvName",
    );
  }
  return tokenEnvName;
}

/** Scopes for one save. Absent input KEEPS the stored list (the three-state rule `env` sets); an
 *  empty string clears it, since {@link parseOAuthScopes} of `""` is `[]`. */
function resolveSavedOAuthScopes(oauth: SaveExternalMcpOAuthInput, existing: ExternalMcpServerRecord | null): string[] {
  if (oauth.scopes === undefined) return parseJsonArray(existing?.oauthScopesJson ?? null);
  return parseOAuthScopes(oauth.scopes);
}

function resolveOAuthFields(
  authMode: ExternalMcpAuthMode,
  transport: ExternalMcpTransport,
  input: SaveExternalMcpServerInput,
  existing: ExternalMcpServerRecord | null,
): ResolvedOAuthFields {
  if (authMode !== "oauth") return NO_OAUTH_FIELDS;

  const oauth = input.oauth ?? {};
  // Only a remote row has a URL for `external-mcp-oauth.ts` to run RFC 9728 / RFC 8414 discovery
  // against, so only a remote row may leave its provider identity and client id to be filled in at
  // connect time.
  const selfConfigurable = transport !== "stdio";

  return {
    ...resolveOAuthProviderIdentity(oauth, existing, selfConfigurable),
    oauthGrant: assertOAuthGrant(firstTrimmed(oauth.grant, existing?.oauthGrant)),
    oauthClientId: assertOAuthClientId(firstTrimmed(oauth.clientId, existing?.oauthClientId), selfConfigurable),
    oauthScopesJson: JSON.stringify(resolveSavedOAuthScopes(oauth, existing)),
    oauthTokenEnvName: resolveOAuthTokenEnvName(transport, oauth, existing),
    clientSecret: oauth.clientSecret,
  };
}

/** Trims and validates `rawCommand`, returning the trimmed value. Split out purely to keep
 *  {@link saveExternalMcpServer}'s complexity under the shop ceiling. */
function assertNonEmptyExternalMcpCommand(rawCommand: string): string {
  const command = rawCommand.trim();
  if (command === "") {
    throw new ExternalMcpValidationError("a stdio server needs a command to launch", "command");
  }
  return command;
}

/** Enforces {@link MAX_SERVERS_PER_WORKSPACE} for a NEW server only — an existing row is always an
 *  update, never a new slot, so it is exempt. Split out purely to keep
 *  {@link saveExternalMcpServer}'s complexity under the shop ceiling. */
async function assertUnderExternalMcpServerCap(
  deps: Pick<ExternalMcpStoreDeps, "repo">,
  workspaceId: UUID,
  existing: ExternalMcpServerRecord | null,
): Promise<void> {
  if (existing) return;
  const count = (await deps.repo.listByWorkspaceId(workspaceId)).length;
  if (count >= MAX_SERVERS_PER_WORKSPACE) {
    throw new ExternalMcpValidationError(
      `this workspace already has the maximum of ${MAX_SERVERS_PER_WORKSPACE} external MCP servers`,
      "id",
    );
  }
}

/** Resolves the sealed env block and its plaintext variable-name index for one save. `rawEnv ===
 *  undefined` preserves whatever `existing` already has (see {@link saveExternalMcpServer}'s doc for
 *  why); an empty parsed block clears the seal to `null` rather than sealing `{}`. Split out purely
 *  to keep {@link saveExternalMcpServer}'s complexity under the shop ceiling.
 *  @throws {ExternalMcpValidationError} On a malformed env block (via {@link parseEnvBlock}).
 *  @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available to seal under. */
async function resolveExternalMcpSealedEnv(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  rawEnv: string | undefined,
  existing: ExternalMcpServerRecord | null,
): Promise<{ readonly sealedEnv: SealedSecret | null; readonly envNames: string[] }> {
  if (rawEnv === undefined) {
    return { sealedEnv: existing?.sealedEnv ?? null, envNames: parseJsonArray(existing?.envNames ?? null) };
  }

  const env = parseEnvBlock(rawEnv);
  const envNames = Object.keys(env);
  if (envNames.length === 0) return { sealedEnv: null, envNames };

  try {
    const sealedEnv = await deps.sealer.seal({ plaintext: JSON.stringify(env), key: await deps.keyring.activeKey() });
    return { sealedEnv, envNames };
  } catch (err) {
    throw new ExternalMcpSecretStoreUnconfiguredError(
      `external MCP credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Hosts for which plaintext `http` is tolerated — a local development server, and nothing else. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Validates a remote MCP server URL.
 *
 * Same rule the OAuth endpoints follow (`oauth/endpoint-safety.ts`): https, or http only for
 * loopback. A remote MCP endpoint carries the bearer token this whole subsystem exists to obtain, so
 * a plaintext one to anywhere but a developer's own machine is a credential on the wire.
 *
 * @returns The normalized absolute URL.
 * @throws {ExternalMcpValidationError} On an empty, unparseable, or plaintext-non-loopback URL.
 * @complexity O(n) in the URL length.
 */
function assertSafeRemoteMcpUrl(rawUrl: string, transport: ExternalMcpTransport): string {
  const url = rawUrl.trim();
  if (url === "") {
    throw new ExternalMcpValidationError(`a ${transport} server needs a URL`, "url");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ExternalMcpValidationError(`'${url}' is not a valid absolute URL`, "url");
  }
  const loopback = LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new ExternalMcpValidationError("a remote MCP server URL must use https (http is permitted only for loopback)", "url");
  }
  return parsed.toString();
}

/** A `stdio` row needs a command; a remote row needs a URL. Split out to keep
 *  {@link saveExternalMcpServer}'s complexity under the shop ceiling.
 *  @throws {ExternalMcpValidationError} When the transport's own required field is missing or unsafe. */
function resolveTransportTarget(
  transport: ExternalMcpTransport,
  input: SaveExternalMcpServerInput,
): { readonly command: string | null; readonly url: string | null } {
  if (transport === "stdio") return { command: assertNonEmptyExternalMcpCommand(input.command), url: null };

  return { command: null, url: assertSafeRemoteMcpUrl(input.url ?? "", transport) };
}

/**
 * The OAuth runtime columns a save carries forward.
 *
 * A save that leaves the token's binding unchanged preserves the live connection untouched — an
 * operator toggling `enabled` or renaming a server must not have to re-authorize. A save that
 * CHANGES the binding discards the token and returns the row to `disconnected`, because the stored
 * credential was issued for configuration that no longer exists.
 *
 * @complexity O(1).
 */
function carryOAuthRuntimeState(
  authMode: ExternalMcpAuthMode,
  resolved: ResolvedOAuthFields,
  existing: ExternalMcpServerRecord | null,
): Pick<ExternalMcpServerRecord, "oauthStatus" | "oauthExpiresAt" | "oauthRefreshLeaseUntil"> & { readonly keepToken: boolean } {
  const cleared = { oauthStatus: null, oauthExpiresAt: null, oauthRefreshLeaseUntil: null, keepToken: false } as const;
  if (authMode !== "oauth" || existing === null) return cleared;

  const unchanged = oauthBindingFingerprint(existing) === oauthBindingFingerprint({ ...resolved });
  if (!unchanged) return { oauthStatus: "disconnected", oauthExpiresAt: null, oauthRefreshLeaseUntil: null, keepToken: false };

  return {
    oauthStatus: existing.oauthStatus ?? "disconnected",
    oauthExpiresAt: existing.oauthExpiresAt,
    oauthRefreshLeaseUntil: existing.oauthRefreshLeaseUntil,
    keepToken: true,
  };
}

/**
 * What the OAuth sealed blob holds.
 *
 * ONE blob rather than a column per secret, for exactly the reason the env block is one blob: every
 * read path wants the whole thing at once, and per-secret sealing would buy nothing and cost N
 * keyring round trips. The consequence is a READ-MODIFY-WRITE rule that every writer must honour —
 * unseal, change one member, reseal — because a writer that seals `{ tokens }` alone silently
 * deletes the operator's client secret.
 *
 * Structurally compatible with `src/oauth/`'s `OAuthTokenSet`, but declared here rather than
 * imported: this is the STORED shape, and it must be able to stay still while the flow module's
 * in-memory type moves.
 */
export interface ExternalMcpSealedOAuthPayload {
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
 * Opens a row's sealed OAuth blob.
 *
 * @returns `{}` when the row holds none, which is the normal state before a connection is authorized.
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When the blob exists but cannot be opened — a
 * rotated root key or a corrupt row. Distinct from "no blob" on purpose: the caller must not treat a
 * decryption failure as "not connected yet" and start a fresh authorization over a token that is
 * still live at the provider.
 * @complexity O(1) — one unseal.
 */
export async function openExternalMcpOAuthPayload(
  sealer: Pick<SecretSealerPort, "open">,
  record: Pick<ExternalMcpServerRecord, "sealedOAuth">,
): Promise<ExternalMcpSealedOAuthPayload> {
  if (record.sealedOAuth === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(await sealer.open({ sealed: record.sealedOAuth }));
  } catch (err) {
    throw new ExternalMcpSecretStoreUnconfiguredError(
      `stored OAuth credentials could not be decrypted: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ExternalMcpSealedOAuthPayload) : {};
}

/**
 * Seals an OAuth payload, or resolves `null` when there is nothing worth sealing.
 *
 * An empty payload seals to `null` rather than to a blob containing `{}`, so `sealedOAuth !== null`
 * is a truthful answer to "does this connection hold anything secret" — which is what
 * {@link ExternalMcpOAuthView.hasStoredToken} reports without unsealing.
 *
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available.
 * @complexity O(1) — one seal.
 */
export async function sealExternalMcpOAuthPayload(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  payload: ExternalMcpSealedOAuthPayload,
): Promise<SealedSecret | null> {
  const hasSecret = (payload.clientSecret !== undefined && payload.clientSecret !== "") || payload.tokens !== undefined;
  if (!hasSecret) return null;
  try {
    return await deps.sealer.seal({ plaintext: JSON.stringify(payload), key: await deps.keyring.activeKey() });
  } catch (err) {
    throw new ExternalMcpSecretStoreUnconfiguredError(
      `external MCP credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Applies one save's client-secret instruction to the stored blob, preserving the token.
 *
 * `carryToken` is `null` when the save invalidated the stored token (see
 * {@link carryOAuthRuntimeState}); passing the record means "keep whatever token it holds".
 *
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When the blob cannot be opened or resealed.
 * @complexity O(1) — at most one unseal plus one seal.
 */
async function resolveSealedOAuthBlob(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  clientSecret: string | undefined,
  carryToken: ExternalMcpServerRecord | null,
): Promise<SealedSecret | null> {
  // Nothing to preserve and nothing to write: skip the keyring entirely rather than seal an empty
  // object, which is what keeps a `none`/`static_env` row's OAuth blob genuinely absent.
  if (carryToken === null && (clientSecret === undefined || clientSecret === "")) return null;

  const existingPayload = carryToken === null ? {} : await openExternalMcpOAuthPayload(deps.sealer, carryToken);
  const next: ExternalMcpSealedOAuthPayload = {
    ...(clientSecret === undefined
      ? existingPayload.clientSecret === undefined
        ? {}
        : { clientSecret: existingPayload.clientSecret }
      : clientSecret === ""
        ? {}
        : { clientSecret }),
    ...(existingPayload.tokens === undefined ? {} : { tokens: existingPayload.tokens }),
  };
  return sealExternalMcpOAuthPayload(deps, next);
}

export async function saveExternalMcpServer(
  deps: ExternalMcpStoreDeps,
  input: SaveExternalMcpServerInput,
): Promise<ExternalMcpServerView> {
  const serverId = input.serverId.trim().toLowerCase();
  assertValidExternalMcpServerId(serverId);
  assertSupportedExternalMcpTransport(input.transport);
  const transport = input.transport as ExternalMcpTransport;
  const { command, url } = resolveTransportTarget(transport, input);
  const args = parseArgs(input.args);
  const allowedToolNames = parseAllowedToolNames(input.allowedToolNames);

  const existing = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId });
  await assertUnderExternalMcpServerCap(deps, input.workspaceId, existing);
  const authMode = resolveSavedAuthMode(input, existing);
  const oauthFields = resolveOAuthFields(authMode, transport, input, existing);
  const runtime = carryOAuthRuntimeState(authMode, oauthFields, existing);
  const { sealedEnv, envNames } = await resolveExternalMcpSealedEnv(deps, input.env, existing);
  const sealedOAuth = await resolveSealedOAuthBlob(deps, oauthFields.clientSecret, runtime.keepToken ? existing : null);

  const now = deps.clock.nowIso();
  const record: ExternalMcpServerRecord = {
    workspaceId: input.workspaceId,
    serverId,
    label: input.label?.trim() || null,
    transport: input.transport,
    authMode,
    enabled: input.enabled,
    command,
    url,
    args: JSON.stringify(args),
    allowedToolNames: JSON.stringify(allowedToolNames),
    envNames: JSON.stringify(envNames),
    sealedEnv,
    oauthProviderId: oauthFields.oauthProviderId,
    oauthGrant: oauthFields.oauthGrant,
    oauthClientId: oauthFields.oauthClientId,
    oauthEndpointsJson: oauthFields.oauthEndpointsJson,
    oauthScopesJson: oauthFields.oauthScopesJson,
    oauthStatus: runtime.oauthStatus,
    oauthExpiresAt: runtime.oauthExpiresAt,
    oauthTokenEnvName: oauthFields.oauthTokenEnvName,
    oauthRefreshLeaseUntil: runtime.oauthRefreshLeaseUntil,
    sealedOAuth,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Removes one server. Returns whether a row was actually deleted, so a route can answer 404 rather
 * than reporting success for an id that never existed.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function deleteExternalMcpServer(
  deps: Pick<ExternalMcpStoreDeps, "repo">,
  input: { workspaceId: UUID; serverId: string },
): Promise<boolean> {
  return deps.repo.deleteByServerId(input);
}
