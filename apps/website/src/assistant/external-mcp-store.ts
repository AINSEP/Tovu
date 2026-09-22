import { createHash } from "node:crypto";

import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../features/webhooks/index.js";
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpLaunchSpec } from "./mcp-federation/ports.js";
import { assertValidConnectionId } from "./mcp-federation/trust.js";
import { supabaseMcpScopeFailure } from "./supabase-mcp-scope.js";

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
 * client in `src/platform/oauth/`; this store owns only the ROW — which auth mode a server uses, its
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

/** Which OAuth grant an operator chose. Mirrors `src/platform/oauth/`'s `OAuthGrantKind`; restated rather
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
import {
  buildExternalMcpEnvAad,
  buildExternalMcpOAuthAad,
  EXTERNAL_MCP_AAD_VERSION,
} from "./external-mcp-aad.js";
import type { ExternalMcpAadIdentity } from "./external-mcp-aad.js";

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
   * {@link allowedToolNames}. See `mcp-federation/ports.ts`'s `FederatedMcpConnectionConfig
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
  /** AAD lineage of `sealedEnv`. `0` = sealed before this table had AAD; see `external-mcp-aad.ts`. */
  aadVersion: number;
  /** AAD lineage of `sealedOAuth`, tracked separately from `aadVersion` — the two blobs are written by different flows. */
  oauthAadVersion: number;
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
/** Matches `src/platform/oauth/providers.ts`'s own rule. Restated rather than imported for the reason this
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
 * A connection's "admitted under this" fingerprint — what `external-mcp-revocation.ts`'s per-call
 * gate compares a roster connection's row against to catch a delete-then-recreate, a
 * url/command/args/transport/authMode edit, or a rotated/cleared `sealedEnv` credential, none of
 * which re-admit an already-running connection (the registry is append-only;
 * `mcp-federation/reload.ts` never re-admits an admitted id).
 *
 * `sealedEnv`'s CIPHERTEXT is included (not `sealedOAuth`): a `static_env`/`stdio` credential is
 * resealed only when an operator actually submits a new `env` block — an ordinary toggle/rename
 * leaves `env` undefined and carries the existing seal through byte-for-byte (see
 * `resolveExternalMcpSealedEnv`'s `rawEnv === undefined` branch), so the ciphertext is stable across
 * cosmetic saves and only moves when the credential itself is rotated or cleared. `sealedOAuth` is
 * deliberately excluded: it is re-sealed on every OAuth token refresh, so hashing it would flip the
 * revision — and refuse the connection — on every refresh, not just a genuine revocation.
 *
 * Otherwise deliberately narrow: `label`, `enabled`, both grant lists, OAuth status/expiry/tokens,
 * and `updatedAt` are excluded, because none of them identify WHERE or via WHAT credentials a call
 * reaches the remote, and including any of them would flip the revision on a toggle or a token
 * refresh that must not refuse an already-admitted tool. `createdAt` is included so a delete +
 * re-create under the same id (same url/command, different row) still changes the revision.
 *
 * Hashed rather than kept as plain text, because a hosted row's `url` can itself carry a bearer
 * token as a query parameter — this value is compared, logged, and passed to a model-facing gate, so
 * it must never be a place a credential could leak through.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function externalMcpAdmissionRevision(
  record: Pick<ExternalMcpServerRecord, "createdAt" | "transport" | "url" | "command" | "args" | "authMode" | "sealedEnv">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        record.createdAt,
        record.transport,
        record.url,
        record.command,
        record.args,
        record.authMode,
        record.sealedEnv?.ciphertext ?? null,
      ]),
    )
    .digest("hex");
}

/** Parses a row's two grant lists the same way {@link resolveExternalMcpConfig} does — shared so
 *  admission and `external-mcp-revocation.ts`'s per-call re-check can never silently disagree about
 *  what a malformed list means (both fail closed to `[]`).
 *  @complexity O(n) in the size of the two JSON blobs. */
export function readExternalMcpToolGrants(
  record: Pick<ExternalMcpServerRecord, "allowedToolNames" | "writeAllowedToolNames">,
): { allowedToolNames: string[]; writeAllowedToolNames: string[] } {
  return {
    allowedToolNames: parseJsonArray(record.allowedToolNames),
    writeAllowedToolNames: parseJsonArray(record.writeAllowedToolNames),
  };
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
 * Splits an operator's comma-separated list of remote tool names, shared by {@link
 * parseAllowedToolNames} and {@link parseWriteAllowedToolNames} — the two lists use the identical
 * charset, cap and dedup rule, and differ only in which field a rejection names.
 *
 * An empty result is a legitimate, meaningful value on either list — it yields a server that
 * contributes (or write-authorizes) zero tools — so it is returned rather than rejected. That is the
 * safe direction and matches `trust.ts` R2's default-deny posture.
 *
 * @throws {ExternalMcpValidationError} On a name the trust tier would refuse anyway, so the operator
 * learns at save time instead of discovering an unexplained absence after a restart.
 * @complexity O(n) in the number of names.
 */
function parseToolNameList(raw: string, field: string): string[] {
  const names = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (names.length > MAX_ALLOWED_TOOLS) {
    throw new ExternalMcpValidationError(`at most ${MAX_ALLOWED_TOOLS} tools are supported`, field);
  }
  for (const name of names) {
    if (!REMOTE_TOOL_NAME_PATTERN.test(name)) {
      throw new ExternalMcpValidationError(
        `'${name}' is not a valid MCP tool name, so the trust tier would refuse it on connect`,
        field,
      );
    }
  }
  return [...new Set(names)];
}

/**
 * Splits an operator's comma-separated allowlist of remote tool names.
 *
 * @throws {ExternalMcpValidationError} See {@link parseToolNameList}. `field` is `"allowedToolNames"`.
 * @complexity O(n) in the number of names.
 * @overallScore 100
 */
export function parseAllowedToolNames(raw: string): string[] {
  return parseToolNameList(raw, "allowedToolNames");
}

/**
 * Splits an operator's comma-separated list of remote tool names separately authorized to write —
 * `trust.ts` R3's override, checked only after {@link parseAllowedToolNames}'s allowlist passes (see
 * {@link assertWriteAllowlistSubset}).
 *
 * @throws {ExternalMcpValidationError} See {@link parseToolNameList}. `field` is
 * `"writeAllowedToolNames"`.
 * @complexity O(n) in the number of names.
 * @overallScore 100
 */
export function parseWriteAllowedToolNames(raw: string): string[] {
  return parseToolNameList(raw, "writeAllowedToolNames");
}

/**
 * C-006: a tool may be write-authorized only if it is ALSO allowlisted. Enforced at save time so an
 * operator learns of the mistake immediately rather than the entry sitting inert (or, worse, being
 * misread as intentional) until a boot-time report surfaces it.
 *
 * @throws {ExternalMcpValidationError} Naming the first write-authorized tool absent from the
 * allowlist, with `field === "writeAllowedToolNames"`.
 * @complexity O(n) in the number of write-authorized names.
 */
function assertWriteAllowlistSubset(writeAllowedToolNames: readonly string[], allowedToolNames: readonly string[]): void {
  const allowed = new Set(allowedToolNames);
  for (const name of writeAllowedToolNames) {
    if (!allowed.has(name)) {
      throw new ExternalMcpValidationError(
        `'${name}' is authorized to write but is not in the allowlist — a tool must be allowlisted before it can be write-authorized`,
        "writeAllowedToolNames",
      );
    }
  }
}

/** Whether two tool-name lists name the same SET of tools, ignoring order — the write list is a set
 *  of operator decisions, not an ordered sequence, so a save that re-sends the same names in a
 *  different order must not read as a change. Used only to decide whether {@link
 *  resolveWriteGrantAttribution} owes a new attribution.
 *  @complexity O(n) in the longer list. */
function toolNameSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((name) => setB.has(name));
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

/**
 * Whether this row holds an access TOKEN — answered from PLAINTEXT columns alone, never by unsealing.
 *
 * `record.sealedOAuth !== null` used to answer this, and stopped being true the moment clearing a
 * token became a read-modify-write that PRESERVES the client secret sharing the blob (see
 * `external-mcp-oauth.ts`'s `setOAuthStatus`). A disconnected connection still carries a non-null
 * blob — a secret and no tokens — so blob presence began reporting a stored token for a row that
 * has none.
 *
 * Not repaired by unsealing, deliberately. This is read by a plain list route that must answer
 * without a keyring round trip, and must keep answering TRUTHFULLY for a row whose blob will not
 * open at all: a rotated root key, or a legacy `aad_version 0` ciphertext. A decrypt here would turn
 * either into a failed settings tab, and would put a keyring dependency on a read path that has
 * never had one.
 *
 * The blob check leads because it is the NECESSARY condition — no blob, no token, whatever the
 * plaintext says. Each of the two disjuncts after it is independently SUFFICIENT, which is what
 * makes a false positive unreachable:
 *
 * - `connected` is written by exactly one place, `persistTokens`, and that same upsert writes the
 *   tokens. Every path that clears a token moves the row off `connected` in the same write.
 * - `oauthExpiresAt` is written beside the tokens by that same `persistTokens`, and nulled by every
 *   clear (`setOAuthStatus`'s `clearToken` branch) and by every save that invalidates the token
 *   ({@link carryOAuthRuntimeState}), so a non-null expiry cannot outlive the token it describes.
 *
 * @returns `true` only when a token is stored. The single state it can UNDER-report is a token
 * issued with no `expires_in` — RFC 6749 §5.1 makes it optional and `platform/oauth/token-endpoint
 * .ts` stores `null` rather than fabricating one — on a row that has since moved off `connected`
 * without its token being cleared: a re-connect left `pending`, or a terminal device-poll failure.
 * Under-reporting is the safe direction, and closing it exactly needs a plaintext token-presence
 * column, which is a schema change rather than a read fix.
 * @complexity O(1) — three field reads, no I/O.
 */
export function externalMcpRecordHasStoredToken(
  record: Pick<ExternalMcpServerRecord, "sealedOAuth" | "oauthStatus" | "oauthExpiresAt">,
): boolean {
  if (record.sealedOAuth === null) return false;
  return resolveExternalMcpOAuthStatus(record) === "connected" || record.oauthExpiresAt !== null;
}

/**
 * Whether a row holds a `static_env` access token — answered from plaintext columns, never by unsealing.
 *
 * Truthful because a `static_env` row's sealed OAuth blob only ever holds that token: leaving `oauth`
 * clears the client secret and token set ({@link resolveSealedOAuthBlob}), and entering `oauth` never
 * carries this token forward ({@link openExternalMcpOAuthPayload}'s callers rebuild the payload from
 * `clientSecret`/`tokens` alone).
 *
 * @complexity O(1).
 */
export function externalMcpRecordHasStaticAccessToken(record: Pick<ExternalMcpServerRecord, "authMode" | "sealedOAuth">): boolean {
  return resolveExternalMcpAuthMode(record) === "static_env" && Boolean(record.sealedOAuth);
}

function toView(record: ExternalMcpServerRecord): ExternalMcpServerView {
  return {
    serverId: record.serverId,
    label: record.label ?? record.serverId,
    provisionedByPluginId: record.provisionedByPluginId,
    transport: record.transport,
    authMode: resolveExternalMcpAuthMode(record),
    enabled: record.enabled,
    command: record.command ?? "",
    url: record.url,
    args: parseJsonArray(record.args),
    allowedToolNames: parseJsonArray(record.allowedToolNames),
    writeAllowedToolNames: parseJsonArray(record.writeAllowedToolNames),
    writeGrantsUpdatedByPrincipalId: record.writeGrantsUpdatedByPrincipalId,
    writeGrantsUpdatedAt: record.writeGrantsUpdatedAt,
    envNames: parseJsonArray(record.envNames),
    hasAccessToken: externalMcpRecordHasStaticAccessToken(record),
    accessTokenEnvName: resolveExternalMcpAuthMode(record) === "static_env" ? record.oauthTokenEnvName : null,
    oauth: {
      providerId: record.oauthProviderId,
      grant: record.oauthGrant,
      clientId: record.oauthClientId,
      scopes: parseJsonArray(record.oauthScopesJson),
      status: resolveExternalMcpOAuthStatus(record),
      expiresAt: record.oauthExpiresAt,
      tokenEnvName: record.oauthTokenEnvName,
      hasStoredToken: externalMcpRecordHasStoredToken(record),
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
  record: Pick<ExternalMcpServerRecord, "sealedEnv" | "workspaceId" | "serverId" | "aadVersion">,
  sealer: Pick<SecretSealerPort, "open">,
): Promise<{ readonly ok: true; readonly env: Record<string, string> } | { readonly ok: false; readonly reason: string }> {
  if (record.sealedEnv === null) return { ok: true, env: {} };
  try {
    // Branching read: a row still at aad_version 0 was sealed before this table had AAD and must
    // keep opening through the legacy no-aad path until the backfill re-seals it.
    const opened = await sealer.open({
      sealed: record.sealedEnv,
      ...(record.aadVersion >= EXTERNAL_MCP_AAD_VERSION ? { aad: buildExternalMcpEnvAad(record) } : {}),
    });
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
  staticAccessToken: string | null,
): Promise<{ readonly ok: true; readonly target: ExternalMcpServerTarget } | { readonly ok: false; readonly failure: { serverId: string; reason: string } }> {
  if (!record.command) return externalMcpFailure(record, "no command is configured to launch it");

  const withStaticToken = withStaticAccessToken(record, env, authMode, staticAccessToken);
  if (withStaticToken === null) {
    return externalMcpFailure(record, "no environment variable name is configured to receive its access token");
  }
  let resolvedEnv = withStaticToken;
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
 * a value they scoped to a local process to a third party over the network. A hosted server's static
 * credential is the dedicated `static_env` access token instead: typed for THIS endpoint, and sent as
 * `Authorization: Bearer`.
 */
async function resolveHttpTarget(
  record: ExternalMcpServerRecord,
  authMode: ExternalMcpAuthMode,
  oauth: ExternalMcpOAuthTokenResolverPort | undefined,
  staticAccessToken: string | null,
): Promise<{ readonly ok: true; readonly target: ExternalMcpServerTarget } | { readonly ok: false; readonly failure: { serverId: string; reason: string } }> {
  if (!record.url) return externalMcpFailure(record, "no URL is configured to reach it");

  const headers: Record<string, string> = {};
  if (authMode === "static_env" && staticAccessToken !== null) headers.authorization = `Bearer ${staticAccessToken}`;
  if (authMode === "oauth") {
    const token = await resolveExternalMcpAccessToken(record, oauth);
    if (!token.ok) return externalMcpFailure(record, token.reason);
    headers.authorization = `Bearer ${token.token}`;
  }

  return { ok: true, target: { kind: "streamable_http", url: record.url, headers } };
}

/**
 * `env` with a `static_env` row's access token applied under its variable name — LAST, as the OAuth
 * token is in {@link resolveStdioTarget}, so a stale pasted copy of the same variable cannot shadow it.
 *
 * @returns `env` unchanged when the row holds no static token; `null` when it holds one but names no
 *   variable to put it in (the save path refuses that, so reaching it means another writer).
 * @complexity O(n) in the env variable count.
 */
function withStaticAccessToken(
  record: Pick<ExternalMcpServerRecord, "oauthTokenEnvName">,
  env: Record<string, string>,
  authMode: ExternalMcpAuthMode,
  staticAccessToken: string | null,
): Record<string, string> | null {
  if (authMode !== "static_env" || staticAccessToken === null) return env;
  if (!record.oauthTokenEnvName) return null;
  return { ...env, [record.oauthTokenEnvName]: staticAccessToken };
}

/**
 * Opens a `static_env` row's sealed access token, or resolves `null` when it holds none — without
 * touching the sealer for any other row. A blob that will not open is a per-row failure, the same
 * posture {@link openExternalMcpEnv} takes for the env block.
 *
 * @complexity O(1) — at most one unseal.
 */
async function openExternalMcpStaticAccessToken(
  record: ExternalMcpServerRecord,
  sealer: Pick<SecretSealerPort, "open">,
): Promise<{ readonly ok: true; readonly token: string | null } | { readonly ok: false; readonly reason: string }> {
  if (!externalMcpRecordHasStaticAccessToken(record)) return { ok: true, token: null };
  try {
    const payload = await openExternalMcpOAuthPayload(sealer, record);
    return { ok: true, token: payload.staticAccessToken ?? null };
  } catch (err) {
    return { ok: false, reason: `its stored access token could not be decrypted: ${err instanceof Error ? err.message : String(err)}` };
  }
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
  // SPEC-052 INV-04: a connection to Supabase's hosted server with no project selected would reach
  // every project in the account, so it is reported rather than offered. Checked before any unseal.
  const scopeFailure = supabaseMcpScopeFailure(record.url);
  if (scopeFailure !== null) return externalMcpFailure(record, scopeFailure);

  const opened = await openExternalMcpEnv(record, sealer);
  if (!opened.ok) return externalMcpFailure(record, opened.reason);

  const authMode = resolveExternalMcpAuthMode(record);
  const staticToken = await openExternalMcpStaticAccessToken(record, sealer);
  if (!staticToken.ok) return externalMcpFailure(record, staticToken.reason);
  const resolved =
    transport === "stdio"
      ? await resolveStdioTarget(record, opened.env, authMode, oauth, staticToken.token)
      : await resolveHttpTarget(record, authMode, oauth, staticToken.token);
  if (!resolved.ok) return resolved;

  const grants = readExternalMcpToolGrants(record);
  return {
    ok: true,
    config: {
      serverId: record.serverId,
      label: record.label ?? record.serverId,
      transport,
      authMode,
      enabled: true,
      allowedToolNames: grants.allowedToolNames,
      writeAllowedToolNames: grants.writeAllowedToolNames,
      target: resolved.target,
      admissionRevision: externalMcpAdmissionRevision(record),
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
      writeAllowedToolNames: config.writeAllowedToolNames,
      connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs,
      callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
      maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes,
      maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools,
      origin: { kind: "roster", admissionRevision: config.admissionRevision },
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

/**
 * Validates a sign-in method, or admits its absence on a row that can discover it for itself.
 *
 * The same exception {@link assertOAuthClientId} documents, extended to the grant: a REMOTE row can
 * run RFC 8414 discovery against its own URL at connect time and read the authorization server's own
 * `grant_types_supported` (`discovery.ts`) instead of an operator having to guess between "Browser
 * sign-in" and "Device code" before they know what the server even offers. See
 * `external-mcp-oauth.ts`'s `selfConfigureConnection`, which resolves and persists a concrete grant
 * the first time such a row connects. A stdio row has no URL to discover from, so for those the
 * requirement stands unchanged.
 *
 * @returns The validated grant, or `null` when the row will resolve one at connect.
 * @throws {ExternalMcpValidationError} On an empty grant the row cannot leave to discovery, or one
 * outside {@link EXTERNAL_MCP_OAUTH_GRANTS}.
 * @complexity O(1).
 */
function assertOAuthGrant(grant: string, selfConfigurable: boolean): ExternalMcpOAuthGrant | null {
  if (grant === "") {
    if (selfConfigurable) return null;
    throw new ExternalMcpValidationError("an OAuth connection needs a sign-in method", "oauth.grant");
  }
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
 * Endpoints are re-derived whenever the operator actually TYPED into either identity field, so
 * clearing a provider id and typing endpoints (or the reverse) cannot leave half of the old pairing
 * behind. "Actually typed" is judged by content, not key presence: the admin form sends both fields
 * on every save (it cannot round-trip a connection's own endpoints), so treating mere presence as a
 * touch made an untouched save look like an identity change on every edit — see
 * `use-external-mcp.hooks.ts`'s header for the caller-side half of this fix.
 *
 * `clientAuth` is exempted from re-derivation regardless of branch: it is server-owned, minted only
 * by dynamic client registration (`external-mcp-oauth.ts`), and no operator input can express it, so
 * even a save that legitimately edits the other endpoints must not drop it.
 *
 * @throws {ExternalMcpValidationError} When neither a provider id nor a token endpoint is present,
 * or the provider id is malformed.
 * @complexity O(1).
 */
function resolveOAuthEndpoints(
  oauth: SaveExternalMcpOAuthInput,
  existing: ExternalMcpServerRecord | null,
): Record<string, string> {
  const stored = parseJsonObject(existing?.oauthEndpointsJson ?? null);
  const touchedIdentity = (oauth.providerId ?? "").trim() !== "" || (oauth.tokenEndpoint ?? "").trim() !== "";
  if (!touchedIdentity) return stored;
  const rebuilt = buildOAuthEndpoints(oauth);
  return stored.clientAuth === undefined ? rebuilt : { ...rebuilt, clientAuth: stored.clientAuth };
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
  // against, so only a remote row may leave its provider identity, grant and client id to be filled
  // in at connect time.
  const selfConfigurable = transport !== "stdio";

  return {
    ...resolveOAuthProviderIdentity(oauth, existing, selfConfigurable),
    oauthGrant: assertOAuthGrant(firstTrimmed(oauth.grant, existing?.oauthGrant), selfConfigurable),
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
/** {@link resolveExternalMcpSealedEnv}'s `rawEnv === undefined` branch — carries the existing sealed
 *  env block through untouched. Split out purely to keep that function's complexity under the shop
 *  ceiling.
 *
 *  Carried through untouched, so its lineage must be carried too — bumping the version here would
 *  claim an AAD binding the stored ciphertext does not have, and brick the row. */
function carryForwardExternalMcpSealedEnv(
  existing: ExternalMcpServerRecord | null,
): { readonly sealedEnv: SealedSecret | null; readonly envNames: string[]; readonly aadVersion: number } {
  return {
    sealedEnv: existing?.sealedEnv ?? null,
    envNames: parseJsonArray(existing?.envNames ?? null),
    aadVersion: existing?.aadVersion ?? EXTERNAL_MCP_AAD_VERSION,
  };
}

/** {@link resolveExternalMcpSealedEnv}'s fresh-seal branch — parses and seals a NEW env block. Split
 *  out purely to keep that function's complexity under the shop ceiling.
 *  @throws {ExternalMcpValidationError} On a malformed env block (via {@link parseEnvBlock}).
 *  @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available to seal under. */
async function sealFreshExternalMcpEnv(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: ExternalMcpAadIdentity,
  rawEnv: string,
): Promise<{ readonly sealedEnv: SealedSecret | null; readonly envNames: string[]; readonly aadVersion: number }> {
  const env = parseEnvBlock(rawEnv);
  const envNames = Object.keys(env);
  if (envNames.length === 0) return { sealedEnv: null, envNames, aadVersion: EXTERNAL_MCP_AAD_VERSION };

  try {
    const sealedEnv = await deps.sealer.seal({
      plaintext: JSON.stringify(env),
      key: await deps.keyring.activeKey(),
      aad: buildExternalMcpEnvAad(identity),
    });
    return { sealedEnv, envNames, aadVersion: EXTERNAL_MCP_AAD_VERSION };
  } catch (err) {
    throw new ExternalMcpSecretStoreUnconfiguredError(
      `external MCP credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function resolveExternalMcpSealedEnv(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: ExternalMcpAadIdentity,
  rawEnv: string | undefined,
  existing: ExternalMcpServerRecord | null,
): Promise<{ readonly sealedEnv: SealedSecret | null; readonly envNames: string[]; readonly aadVersion: number }> {
  return rawEnv === undefined
    ? carryForwardExternalMcpSealedEnv(existing)
    : sealFreshExternalMcpEnv(deps, identity, rawEnv);
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
 * Structurally compatible with `src/platform/oauth/`'s `OAuthTokenSet`, but declared here rather than
 * imported: this is the STORED shape, and it must be able to stay still while the flow module's
 * in-memory type moves.
 */
/**
 * Schema version of the *plaintext* inside the sealed OAuth blob.
 *
 * Distinct from `oauth_aad_version`, which versions how the blob is BOUND to its row and says
 * nothing about what is inside it. Without this, a field could be added but never renamed, changed,
 * or removed — there would be nothing to branch on at open time, and the only way out would be a
 * migration over live credentials. Stamped at seal; a blob without it predates versioning and is
 * upgraded on read.
 */
export const EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION = 1;

/**
 * The branching read for a sealed OAuth payload. A missing version is v0 (pre-versioning) and is
 * upgraded in place; a newer version is refused rather than misread, because silently
 * reinterpreting an unknown shape here means handing back a wrong or partial live credential.
 *
 * `schemaVersion` is stripped from the result: it is a wire concern, and a caller that saw it could
 * persist it back into a payload it does not own.
 *
 * @throws When the payload was written by a newer build than this one understands.
 * @complexity O(1).
 */
export function hydrateExternalMcpOAuthPayload(parsed: unknown): ExternalMcpSealedOAuthPayload {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const { schemaVersion, ...rest } = parsed as Record<string, unknown>;
  const stored = typeof schemaVersion === "number" ? schemaVersion : 0;
  if (stored > EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION) {
    throw new Error(
      `external MCP OAuth payload was written at schema version ${stored}, newer than this build understands (${EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION}) — upgrade rather than risk misreading a live credential`,
    );
  }
  // v0 -> v1 added only the discriminator, so the upgrade is a stamp; a later version adds its own
  // branch here rather than a backfill over live credentials.
  return rest as ExternalMcpSealedOAuthPayload;
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
  record: Pick<ExternalMcpServerRecord, "sealedOAuth" | "workspaceId" | "serverId" | "oauthAadVersion">,
): Promise<ExternalMcpSealedOAuthPayload> {
  if (record.sealedOAuth === null) return {};
  let parsed: unknown;
  try {
    // Branching read, same rule as the env blob — and the aad is derived from THIS row's identity,
    // so another row's ciphertext sitting in this column fails its auth tag instead of opening.
    parsed = JSON.parse(
      await sealer.open({
        sealed: record.sealedOAuth,
        ...(record.oauthAadVersion >= EXTERNAL_MCP_AAD_VERSION ? { aad: buildExternalMcpOAuthAad(record) } : {}),
      }),
    );
  } catch (err) {
    throw new ExternalMcpSecretStoreUnconfiguredError(
      `stored OAuth credentials could not be decrypted: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Deliberately OUTSIDE the catch above: a version mismatch is not a decryption failure, and must
  // not be swallowed by a caller that treats that error as "not connected yet".
  return hydrateExternalMcpOAuthPayload(parsed);
}

/**
 * Seals an OAuth payload, or resolves `null` when there is nothing worth sealing.
 *
 * An empty payload seals to `null` rather than to a blob containing `{}`, so `sealedOAuth !== null`
 * is a truthful answer to "does this connection hold anything secret". It is NOT an answer to "does
 * it hold a token" — a cleared connection keeps its client secret in that blob — which is why
 * {@link externalMcpRecordHasStoredToken} reads the plaintext columns instead.
 *
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available.
 * @complexity O(1) — one seal.
 */
/**
 * A sealed OAuth blob together with the AAD lineage it was sealed under.
 *
 * These are returned as ONE value on purpose. `open` decides whether to pass AAD by reading the
 * row's version, so a writer that stores the ciphertext while carrying the row's old version
 * forward leaves the blob permanently unopenable — silently, until the next read. Handing back a
 * bare `SealedSecret` made that the caller's job to remember, and three separate writers had to
 * remember it. This makes it impossible to take one without the other.
 */
export interface SealedExternalMcpOAuth {
  readonly sealedOAuth: SealedSecret | null;
  readonly oauthAadVersion: number;
}

export async function sealExternalMcpOAuthPayload(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: ExternalMcpAadIdentity,
  payload: ExternalMcpSealedOAuthPayload,
): Promise<SealedExternalMcpOAuth> {
  const hasSecret =
    (payload.clientSecret !== undefined && payload.clientSecret !== "") || payload.tokens !== undefined || Boolean(payload.staticAccessToken);
  if (!hasSecret) return { sealedOAuth: null, oauthAadVersion: EXTERNAL_MCP_AAD_VERSION };
  try {
    const sealedOAuth = await deps.sealer.seal({
      // The version travels INSIDE the ciphertext, so it is authenticated along with the secret and
      // cannot be edited by anyone who can write the row.
      plaintext: JSON.stringify({ ...payload, schemaVersion: EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION }),
      key: await deps.keyring.activeKey(),
      aad: buildExternalMcpOAuthAad(identity),
    });
    return { sealedOAuth, oauthAadVersion: EXTERNAL_MCP_AAD_VERSION };
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
  identity: ExternalMcpAadIdentity,
  clientSecret: string | undefined,
  carryToken: ExternalMcpServerRecord | null,
): Promise<SealedExternalMcpOAuth> {
  // Nothing to preserve and nothing to write: skip the keyring entirely rather than seal an empty
  // object, which is what keeps a `none`/`static_env` row's OAuth blob genuinely absent.
  if (carryToken === null && (clientSecret === undefined || clientSecret === "")) {
    return { sealedOAuth: null, oauthAadVersion: EXTERNAL_MCP_AAD_VERSION };
  }

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
  return sealExternalMcpOAuthPayload(deps, identity, next);
}

/**
 * Resolves the two write-grant attribution columns for one save.
 *
 * Written ONLY when {@link writeAllowedToolNames}'s contents actually change — compared as a set
 * against whatever the row already has — so a save that merely renames a connection or flips
 * `enabled` does not stamp a new "authorized by / on" over an untouched grant. `input.principalId`
 * is read only on the changed branch, which is what lets it stay a required TYPE without becoming a
 * runtime hazard: a caller written before this field existed can only reach `undefined` here if it
 * also never sets a non-empty {@link SaveExternalMcpServerInput.writeAllowedToolNames}, in which case
 * the list never changes and this branch never runs.
 *
 * @complexity O(n) in the length of the longer list (via {@link toolNameSetsEqual}).
 */
function resolveWriteGrantAttribution(
  input: Pick<SaveExternalMcpServerInput, "principalId">,
  writeAllowedToolNames: readonly string[],
  existing: ExternalMcpServerRecord | null,
  nowIso: ISODateTime,
): Pick<ExternalMcpServerRecord, "writeGrantsUpdatedByPrincipalId" | "writeGrantsUpdatedAt"> {
  const previousWriteAllowedToolNames = parseJsonArray(existing?.writeAllowedToolNames ?? null);
  if (toolNameSetsEqual(previousWriteAllowedToolNames, writeAllowedToolNames)) {
    return {
      writeGrantsUpdatedByPrincipalId: existing?.writeGrantsUpdatedByPrincipalId ?? null,
      writeGrantsUpdatedAt: existing?.writeGrantsUpdatedAt ?? null,
    };
  }
  return { writeGrantsUpdatedByPrincipalId: input.principalId, writeGrantsUpdatedAt: nowIso };
}

/** Generous: a JWT-shaped key can run to a few kilobytes. The cap exists so a pasted file cannot become a row. */
const MAX_STATIC_ACCESS_TOKEN_LENGTH = 8192;
/** C0 controls and DEL. A token carrying CR/LF would split the `Authorization` header it is sent in. */
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Validates an operator-pasted access token.
 *
 * @throws {ExternalMcpValidationError} On an oversized token, or one carrying a control character —
 *   which for a hosted row would be header injection, not a typo.
 * @complexity O(n) in the token length.
 */
function assertValidStaticAccessToken(token: string): string {
  if (token.length > MAX_STATIC_ACCESS_TOKEN_LENGTH) {
    throw new ExternalMcpValidationError(`the access token may be at most ${MAX_STATIC_ACCESS_TOKEN_LENGTH} characters`, "accessToken");
  }
  if (CONTROL_CHARACTER_PATTERN.test(token)) {
    throw new ExternalMcpValidationError("the access token must not contain line breaks or other control characters", "accessToken");
  }
  return token;
}

/**
 * The sealed blob for a `static_env` row's access token, under the `env` field's three-state rule.
 *
 * Stored in the row's existing sealed OAuth columns (and AAD lineage) rather than a new column: it is
 * the same kind of thing — a sealed connection credential beside the env block — and while a row is
 * `static_env` that blob holds nothing else. A carried token keeps its ciphertext AND its
 * `oauthAadVersion` together, for the reason {@link SealedExternalMcpOAuth} gives.
 *
 * @throws {ExternalMcpValidationError} Via {@link assertValidStaticAccessToken}.
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available to seal under.
 * @complexity O(n) in the token length; at most one seal.
 */
async function resolveSealedStaticAccessToken(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: ExternalMcpAadIdentity,
  rawToken: string | undefined,
  existing: ExternalMcpServerRecord | null,
): Promise<SealedExternalMcpOAuth> {
  const none: SealedExternalMcpOAuth = { sealedOAuth: null, oauthAadVersion: EXTERNAL_MCP_AAD_VERSION };
  if (rawToken === undefined) {
    return existing !== null && externalMcpRecordHasStaticAccessToken(existing)
      ? { sealedOAuth: existing.sealedOAuth, oauthAadVersion: existing.oauthAadVersion }
      : none;
  }
  const token = rawToken.trim();
  if (token === "") return none;
  return sealExternalMcpOAuthPayload(deps, identity, { staticAccessToken: assertValidStaticAccessToken(token) });
}

/**
 * Which child env variable receives a `stdio` + `static_env` row's access token. `null` for a hosted
 * row (its token travels in a header) and for a stdio row that neither holds a token nor names one.
 *
 * @throws {ExternalMcpValidationError} When a stdio row holds a token but names no variable, or an
 *   invalid one.
 * @complexity O(n) in the name length.
 */
function resolveStaticAccessTokenEnvName(
  transport: ExternalMcpTransport,
  input: Pick<SaveExternalMcpServerInput, "accessTokenEnvName">,
  existing: ExternalMcpServerRecord | null,
  holdsToken: boolean,
): string | null {
  if (transport !== "stdio") return null;
  const name = firstTrimmed(input.accessTokenEnvName, existing?.oauthTokenEnvName);
  if (name === "") {
    if (!holdsToken) return null;
    throw new ExternalMcpValidationError(
      "a local command given an access token needs the name of the environment variable that receives it",
      "accessTokenEnvName",
    );
  }
  if (!ENV_NAME_PATTERN.test(name)) {
    throw new ExternalMcpValidationError(
      `'${name}' is not a valid environment variable name (letters, digits and underscore, not starting with a digit)`,
      "accessTokenEnvName",
    );
  }
  return name;
}

/**
 * The sealed-credential columns for one save, by auth mode: a `static_env` row's access token and its
 * variable name, or an `oauth`/`none` row's client secret and carried token set (nothing, for `none`).
 * Split out to keep {@link saveExternalMcpServer} under the shop's complexity ceiling.
 *
 * @complexity O(1) beyond at most one unseal and one seal.
 */
async function resolveSavedCredentialColumns(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: ExternalMcpAadIdentity,
  context: {
    readonly authMode: ExternalMcpAuthMode;
    readonly transport: ExternalMcpTransport;
    readonly input: SaveExternalMcpServerInput;
    readonly oauthFields: ResolvedOAuthFields;
    readonly keepToken: boolean;
    readonly existing: ExternalMcpServerRecord | null;
  },
): Promise<SealedExternalMcpOAuth & { readonly oauthTokenEnvName: string | null }> {
  const { authMode, transport, input, oauthFields, keepToken, existing } = context;
  if (authMode !== "static_env") {
    const sealed = await resolveSealedOAuthBlob(deps, identity, oauthFields.clientSecret, keepToken ? existing : null);
    return { ...sealed, oauthTokenEnvName: oauthFields.oauthTokenEnvName };
  }
  const sealed = await resolveSealedStaticAccessToken(deps, identity, input.accessToken, existing);
  return { ...sealed, oauthTokenEnvName: resolveStaticAccessTokenEnvName(transport, input, existing, sealed.sealedOAuth !== null) };
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
  // `?? ""` is a defensive fallback, not the documented contract (the type requires the field): a
  // caller that predates this field reaches `undefined` here, and must degrade to "no write grants"
  // rather than throw on `undefined.split`. See `SaveExternalMcpServerInput.writeAllowedToolNames`'s
  // doc.
  const writeAllowedToolNames = parseWriteAllowedToolNames(input.writeAllowedToolNames ?? "");
  assertWriteAllowlistSubset(writeAllowedToolNames, allowedToolNames);

  const existing = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId });
  await assertUnderExternalMcpServerCap(deps, input.workspaceId, existing);
  const authMode = resolveSavedAuthMode(input, existing);
  const oauthFields = resolveOAuthFields(authMode, transport, input, existing);
  const runtime = carryOAuthRuntimeState(authMode, oauthFields, existing);
  const aadIdentity: ExternalMcpAadIdentity = { workspaceId: input.workspaceId, serverId };
  const { sealedEnv, envNames, aadVersion } = await resolveExternalMcpSealedEnv(deps, aadIdentity, input.env, existing);
  const { sealedOAuth, oauthAadVersion, oauthTokenEnvName } = await resolveSavedCredentialColumns(deps, aadIdentity, {
    authMode,
    transport,
    input,
    oauthFields,
    keepToken: runtime.keepToken,
    existing,
  });

  const now = deps.clock.nowIso();
  const writeGrantAttribution = resolveWriteGrantAttribution(input, writeAllowedToolNames, existing, now);
  const record: ExternalMcpServerRecord = {
    workspaceId: input.workspaceId,
    serverId,
    label: input.label?.trim() || null,
    provisionedByPluginId: input.provisionedByPluginId ?? existing?.provisionedByPluginId ?? null,
    transport: input.transport,
    authMode,
    enabled: input.enabled,
    command,
    url,
    args: JSON.stringify(args),
    allowedToolNames: JSON.stringify(allowedToolNames),
    writeAllowedToolNames: JSON.stringify(writeAllowedToolNames),
    writeGrantsUpdatedByPrincipalId: writeGrantAttribution.writeGrantsUpdatedByPrincipalId,
    writeGrantsUpdatedAt: writeGrantAttribution.writeGrantsUpdatedAt,
    envNames: JSON.stringify(envNames),
    sealedEnv,
    oauthProviderId: oauthFields.oauthProviderId,
    oauthGrant: oauthFields.oauthGrant,
    oauthClientId: oauthFields.oauthClientId,
    oauthEndpointsJson: oauthFields.oauthEndpointsJson,
    oauthScopesJson: oauthFields.oauthScopesJson,
    oauthStatus: runtime.oauthStatus,
    oauthExpiresAt: runtime.oauthExpiresAt,
    oauthTokenEnvName,
    oauthRefreshLeaseUntil: runtime.oauthRefreshLeaseUntil,
    sealedOAuth,
    aadVersion,
    oauthAadVersion,
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
