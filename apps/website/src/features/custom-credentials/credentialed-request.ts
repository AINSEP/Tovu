import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../webhooks/index.js";
import { CustomCredentialNotFoundError, resolveCustomCredentialByLabel } from "./store.js";
import type { CustomCredentialSetRepoPort, CustomProviderConnectionInput } from "./types.js";
import type { HttpClientPort } from "../../platform/http/index.js";

/**
 * @file Closes the "the agent can SAVE a custom credential but can never USE one" gap:
 * `custom_credential_sets` (the Access Tokens page's "Add custom provider" rows — an operator-typed
 * label, API base URL, and token, e.g. "name.com", "fly.io") had a write path
 * (`createCustomCredential`/`updateCustomCredential`, `store.ts`) and, since 2026-08-31, exactly one
 * decrypting reader (`resolveCustomCredentialByLabel`, added for the mail adapter) — but nothing that
 * ever turned a saved credential into a live authenticated call. This module is the second real
 * caller of that decrypting reader, and the first one built for agent use.
 *
 * Two capabilities, both GET-only in this slice:
 * - {@link verifyCustomCredential} — one bounded, read-only probe against the credential's own saved
 *   base URL, classified into the SAME three-way `"valid" | "invalid" | "unreachable"` result
 *   `features/deployments/static-publish/verify.ts`'s own `classifyProviderResponse` already
 *   establishes for this codebase (2xx accepted, 401/403 affirmatively rejected, everything else —
 *   including a 3xx this module's policy deliberately never follows — folds into "unreachable": it
 *   says nothing about whether the credential itself is good). That function is not imported here:
 *   it lives in a different feature (`features/deployments`) this one has no reason to depend on for
 *   three lines of logic, and reuses `fetch` directly against a small set of HARDCODED, reviewed
 *   provider URLs (`api.github.com`, `api.vercel.com`, ...) — safe because those hosts are fixed
 *   constants, never attacker- or operator-influenced. THIS module's target host is exactly the
 *   opposite: an arbitrary, operator-typed `baseUrl`, which is precisely why it goes through the
 *   guarded `HttpClientPort` (ADR-038) instead, the same reason `platform/mail/adapters/
 *   http-api.resend.ts` and `server/runtime/boot/resolve-mailer.ts` do for the identical shape of
 *   credential.
 * - {@link makeCredentialedRequest} — an authenticated request through a saved credential. **GET
 *   only, deliberately, for this slice.** Write methods (POST/PUT/PATCH/DELETE) are a disclosed
 *   omission, not an oversight: this codebase's `core/gated-mutations` ceremony (plan/confirm/
 *   execute with a durable token) is the established pattern for an agent-triggered external mutation
 *   with real consequences (see `features/recovery/gated-hooks.ts`/`features/database/
 *   gated-hooks.ts`), and wiring a brand-new domain into that ceremony is a separate, larger piece of
 *   work this thin slice does not attempt. A GET-only credentialed request already closes the
 *   motivating gap (reading third-party state — "what domains do I own", "what is my app's current
 *   deploy status" — through a saved credential) without that larger ceremony design.
 *
 * ## Security design (every point below is load-bearing, not decoration)
 *
 * **The token never reaches the model.** The agent supplies a `label` (a human-chosen display name,
 * never a secret) and, for {@link makeCredentialedRequest}, a `path`/`headers`. Neither function
 * accepts a token, and neither ever returns one: {@link buildAuthorizationHeader}'s result is used
 * only as an outbound request header, never echoed in any return value or thrown error message (both
 * this module's own thrown errors and `store.ts`'s `resolveCustomCredentialByLabel` are checked to
 * never interpolate `connection.token`/`connection.username` into a message).
 *
 * **Per-credential host binding — the control that stops "send my fly.io token to
 * evil.example.com".** A credential's `baseUrl` is plaintext operator input, set through the Access
 * Tokens "Add custom provider" form (`store.ts`'s `validateBaseUrl`) — never through either tool
 * call here. {@link buildRequestUrl} constructs the real request URL by concatenating that saved
 * origin with a `path` {@link validateRelativePath} has already proven carries no scheme, host, or
 * `//`/backslash of its own — so the resolved URL's origin can never be anything other than the
 * credential's own saved origin, regardless of what `path` the caller supplies. This is this
 * module's own allowlist: derived from the credential's own saved state, never from tool input, the
 * same requirement `features/deployments/publish-agent-tools.ts`'s vendor-credential tools satisfy
 * via a small closed `VendorId` catalog — this table has no such catalog (`types.ts`'s own header:
 * "no fixed provider identity at all"), so the credential's own persisted `baseUrl` origin plays the
 * identical role for a table where every row is its own standalone identity.
 *
 * **SSRF/loopback/link-local/metadata protection** is NOT reimplemented here — both functions route
 * every outbound call through the injected `HttpClientPort` (ADR-038, `platform/http/client.ts`),
 * which already resolves DNS, classifies every resolved address (denying private/loopback/
 * link-local/reserved, including `169.254.169.254`), pins the connection to the checked address, and
 * either strips auth on a cross-origin redirect or (per this module's own policy, set by the
 * composition root) never follows a redirect at all. This module's only NEW responsibility is the
 * per-credential host binding above, which `EgressPolicy` has no concept of on its own.
 *
 * **This module never constructs an `HttpClientPort` itself.** `CredentialedRequestDeps.httpClient`
 * is a required, injected field — built ONLY by a composition root
 * (`server/runtime/composition/{deps,app}.ts`), per `.dependency-cruiser.mjs`'s `platform/http`
 * guarded-module boundary (feature code may not deep-import `platform/http/client.ts`, only the
 * type-only barrel). Same discipline `resolve-mailer.ts`'s own `ResolveMailerDeps.httpClient` doc
 * documents for the identical shape of dependency.
 *
 * **Audit, never the secret.** Every call — success, rejection, or transport failure — records
 * exactly `{label, host, method, status, at}` via {@link CredentialedRequestAuditPort}. `status: 0`
 * means "never got a response" (DNS failure, timeout, or an `EgressPolicy` refusal), distinct from
 * any real HTTP status a provider could return. Never the token, the Authorization header, or the
 * request/response body.
 *
 * **Bounded.** {@link CREDENTIALED_REQUEST_TIMEOUT_MS} caps one call; the response-size cap
 * (`EgressPolicy.maxResponseBytes`/`maxDecompressedBytes`) is enforced one layer down, by the
 * `HttpClientPort` itself, and is set by the composition root that builds it.
 *
 * Architectural role: `features/custom-credentials` domain logic (agent-tool layer). See
 * `agent-tools.ts`/`tool-registrations.ts` in this directory for the tool surface built on top.
 */

/** Every rejection this module raises for a caller-shape or security-boundary problem — separate
 *  from `store.ts`'s own `CustomCredentialValidationError` (which validates a credential's stored
 *  fields at save time): this class validates a REQUEST against an already-saved credential. */
export class CredentialedRequestValidationError extends Error {}

/** A network failure, timeout, or `EgressPolicy` refusal while sending the request — distinct from a
 *  request the provider itself answered (any real HTTP status, including an error one, resolves
 *  normally instead of throwing; see {@link makeCredentialedRequest}'s own doc). */
export class CredentialedRequestTransportError extends Error {}

/** Bounds one credentialed call — same order of magnitude as every other "an agent is waiting on
 *  this synchronously" bounded probe in this codebase (`static-publish/verify.ts`'s
 *  `VERIFY_TIMEOUT_MS`, `vendor-credentials/store.ts`'s `ACCOUNT_LABEL_PROBE_TIMEOUT_MS`). The
 *  composition root's own `EgressPolicy.connectTimeoutMs` is a CEILING on this value, never a
 *  replacement for it — see `platform/http/client.ts`'s `sendWithPolicy`. */
const CREDENTIALED_REQUEST_TIMEOUT_MS = 10_000;

/** Header names the caller may never set directly — the server injects the real credential's
 *  `Authorization` itself, and none of the other three have any legitimate reason to be
 *  caller-supplied on a request already pinned to one fixed, saved host. */
const FORBIDDEN_REQUEST_HEADER_NAMES: ReadonlySet<string> = new Set(["authorization", "cookie", "host", "proxy-authorization"]);

function requireLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CredentialedRequestValidationError("label must be a non-empty string");
  }
  return raw;
}

/** v1 scope decision (see this file's header) — only GET is wired. A caller-supplied method of any
 *  other value is refused with a clear reason rather than silently narrowed or ignored. */
function validateReadOnlyMethod(raw: unknown): "GET" {
  if (raw !== "GET") {
    throw new CredentialedRequestValidationError(
      "method must be 'GET' — this tool does not support write methods (POST/PUT/PATCH/DELETE) yet, see credentialed-request.ts's own header for why"
    );
  }
  return raw;
}

/** `true` iff `path` carries anything that could name a different host once resolved — a leading
 *  `//` (protocol-relative), an embedded scheme (`://`), or a backslash (treated as a path/host
 *  separator by some URL parsers). Checked separately from "does it start with '/'" so each
 *  rejection in {@link validateRelativePath} gets its own precise reason.
 *
 * @complexity O(1) — three bounded string checks.
 */
function looksLikeCrossHostPath(path: string): boolean {
  return path.startsWith("//") || path.includes("://") || path.includes("\\");
}

/**
 * Validates a caller-supplied `path` is safe to resolve against a credential's own saved base URL —
 * see this file's header, "Per-credential host binding", for why this function IS the security
 * boundary that stops a request from ever reaching a host other than the one saved on the
 * credential.
 *
 * @throws {CredentialedRequestValidationError} `path` is empty, does not start with `/`, or looks
 *   like it names a different host or scheme.
 * @complexity O(1).
 */
function validateRelativePath(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CredentialedRequestValidationError("path must be a non-empty string");
  }
  if (!raw.startsWith("/")) {
    throw new CredentialedRequestValidationError("path must start with '/' — it is resolved against the credential's own saved base URL, never an absolute URL");
  }
  if (looksLikeCrossHostPath(raw)) {
    throw new CredentialedRequestValidationError(
      `path '${raw}' looks like it names a different host or scheme — this tool only ever resolves a path against the credential's own saved base URL`
    );
  }
  return raw;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One header entry's own validation — split out of {@link validateExtraHeaders} so that function's
 *  loop body stays a single call. */
function validateHeaderEntry(key: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new CredentialedRequestValidationError(`header '${key}' must be a string value`);
  }
  if (FORBIDDEN_REQUEST_HEADER_NAMES.has(key.toLowerCase())) {
    throw new CredentialedRequestValidationError(`header '${key}' may not be set by the caller — the server injects the real credential's own Authorization header itself`);
  }
  return value;
}

/**
 * Validates the optional caller-supplied extra headers. `undefined` (the field was omitted) is not
 * an error — it degrades to no extra headers.
 *
 * @throws {CredentialedRequestValidationError} `raw` is not a plain object of string values, or
 *   names a forbidden header (see {@link FORBIDDEN_REQUEST_HEADER_NAMES}).
 * @complexity O(n) in the number of supplied header entries.
 */
function validateExtraHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined) return {};
  if (!isPlainRecord(raw)) {
    throw new CredentialedRequestValidationError("headers must be an object of string values");
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = validateHeaderEntry(key, value);
  }
  return result;
}

/**
 * Resolves the real request URL from a credential's own saved base URL plus an already-validated
 * relative `path` — see this file's header, "Per-credential host binding". Safe by construction:
 * `path` has already been proven (by {@link validateRelativePath}) to start with exactly one `/` and
 * to carry no scheme, host, `//`, or backslash of its own, so concatenating it onto the credential's
 * own origin can never land the resolved URL on a different host.
 *
 * @complexity O(1).
 */
function buildRequestUrl(baseUrl: string, path: string): URL {
  const origin = new URL(baseUrl).origin;
  return new URL(`${origin}${path}`);
}

/** HTTP Basic (base64 `username:token`) when the saved connection carries a `username` — the same
 *  convention `store.ts`'s own `CustomProviderConnectionInput.username` doc documents ("only needed
 *  if this provider authenticates a token against a username"); Bearer otherwise. Never logged, and
 *  never returned from this module — used only as an outbound request header value.
 *
 * @complexity O(1).
 */
function buildAuthorizationHeader(connection: CustomProviderConnectionInput): string {
  if (connection.username) {
    const credentials = `${connection.username}:${connection.token}`;
    return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
  }
  return `Bearer ${connection.token}`;
}

/** One audited call outcome — see this file's header, "Audit, never the secret", for exactly why
 *  these five fields and no others. */
export interface CredentialedRequestAuditEntry {
  readonly label: string;
  readonly host: string;
  readonly method: string;
  /** `0` means the request never got a response at all (DNS failure, timeout, or an `EgressPolicy`
   *  refusal) — distinct from any real HTTP status a provider could return. */
  readonly status: number;
  readonly at: string;
}

/** Records exactly {@link CredentialedRequestAuditEntry}'s five fields — never the token, the
 *  Authorization header, or the request/response body. */
export interface CredentialedRequestAuditPort {
  record(entry: CredentialedRequestAuditEntry): void;
}

/**
 * Default production audit sink: one structured line per call via an injected logger (defaults to
 * `console.log`), so every install gets a real, grep-able audit trail with zero additional wiring. A
 * durable/queryable store (a DB table, an admin UI) is a disclosed future improvement, not built in
 * this slice — see this file's header.
 *
 * @complexity O(1) per `record` call.
 */
export class ConsoleCredentialedRequestAuditLog implements CredentialedRequestAuditPort {
  constructor(private readonly log: (line: string) => void = (line) => console.log(line)) {}

  record(entry: CredentialedRequestAuditEntry): void {
    this.log(`[custom-credentials] request label=${entry.label} host=${entry.host} method=${entry.method} status=${entry.status} at=${entry.at}`);
  }
}

/** Test double: keeps every recorded entry in memory, in order — lets a test assert on exactly what
 *  was audited without parsing log lines. */
export class InMemoryCredentialedRequestAuditLog implements CredentialedRequestAuditPort {
  readonly entries: CredentialedRequestAuditEntry[] = [];

  record(entry: CredentialedRequestAuditEntry): void {
    this.entries.push(entry);
  }
}

export interface CredentialedRequestDeps {
  readonly repo: CustomCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  /** The guarded outbound-HTTP seam (ADR-038) both functions in this module call through — built
   *  ONLY by a composition root; see this file's header, "This module never constructs an
   *  `HttpClientPort` itself." */
  readonly httpClient: HttpClientPort;
  readonly clock: { nowIso(): string };
  /** Defaults to {@link ConsoleCredentialedRequestAuditLog}. */
  readonly audit?: CredentialedRequestAuditPort;
}

/** Shared "find the credential or fail loudly" step both entry points use — never returns `null`,
 *  matching `store.ts`'s own `CustomCredentialNotFoundError` contract for a missing row (reused here
 *  keyed by label instead of id, the same conceptual "no such credential" outcome).
 *
 * @throws {CustomCredentialNotFoundError} No row with this label exists in this workspace.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted —
 *   left to propagate uncaught, matching `resolveCustomCredentialByLabel`'s own documented contract.
 * @complexity O(n) in the workspace's own (small) credential-set count, plus one decrypt.
 */
async function resolveCredentialOrThrow(
  deps: Pick<CredentialedRequestDeps, "repo" | "sealer">,
  input: { workspaceId: UUID; label: string }
): Promise<{ baseUrl: string; connection: CustomProviderConnectionInput }> {
  const resolved = await resolveCustomCredentialByLabel({ repo: deps.repo, sealer: deps.sealer }, input);
  if (!resolved) {
    throw new CustomCredentialNotFoundError(`no custom credential labeled '${input.label}' in this workspace`);
  }
  return resolved;
}

/** {@link classifyCustomCredentialStatus}/{@link CustomCredentialVerificationResult}'s shared
 *  tri-state — never a plain boolean, same "unreachable must stay distinguishable from invalid"
 *  discipline `features/deployments/static-publish/verify.ts`'s own
 *  `PublishCredentialVerificationResult.status` doc establishes. */
export type CustomCredentialCheckStatus = "valid" | "invalid" | "unreachable";

/** Same three-way classification `features/deployments/static-publish/verify.ts`'s own
 *  `classifyProviderResponse` establishes for this codebase (see this file's header for why it is
 *  reused as logic, not imported): 2xx accepted, 401/403 affirmatively rejected, everything else —
 *  including a 3xx this module's policy deliberately never follows — folds into "unreachable".
 *
 * @complexity O(1).
 */
function classifyCustomCredentialStatus(status: number): CustomCredentialCheckStatus {
  if (status >= 200 && status < 300) return "valid";
  if (status === 401 || status === 403) return "invalid";
  return "unreachable";
}

/** Builds {@link verifyCustomCredential}'s human-facing message for one classified outcome — kept
 *  separate from the classifier itself so wording changes never touch the classification logic. */
function buildVerificationMessage(label: string, status: number, outcome: CustomCredentialCheckStatus): string {
  if (outcome === "valid") return `'${label}' accepted this credential.`;
  if (outcome === "invalid") {
    return `'${label}' rejected this credential (HTTP ${status}) — it is invalid, expired, or missing required permissions.`;
  }
  return `Could not get a clear accept or reject from '${label}' (HTTP ${status}) — this does not necessarily mean the credential is bad.`;
}

export interface CustomCredentialVerificationResult {
  readonly status: CustomCredentialCheckStatus;
  readonly message: string;
  readonly checkedAt: string;
}

/**
 * Checks one saved custom credential against its own real provider, live: resolves the credential
 * (decrypts), makes one bounded GET to its own saved base URL's root with the real Authorization
 * header, and classifies the result. Never throws on a network failure — that classifies as
 * `"unreachable"`, matching every other verification surface in this codebase (see this file's
 * header). Never returns the provider's response body.
 *
 * @throws {CustomCredentialNotFoundError} No credential with this label exists in this workspace.
 * @throws {CredentialedRequestValidationError} `input.label` is not a non-empty string.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted.
 * @complexity O(1) beyond the credential resolution's own O(n) (see {@link resolveCredentialOrThrow}).
 */
export async function verifyCustomCredential(deps: CredentialedRequestDeps, input: { workspaceId: UUID; label: unknown }): Promise<CustomCredentialVerificationResult> {
  const label = requireLabel(input.label);
  const checkedAt = deps.clock.nowIso();
  const { baseUrl, connection } = await resolveCredentialOrThrow(deps, { workspaceId: input.workspaceId, label });
  const url = buildRequestUrl(baseUrl, "/");
  const audit = deps.audit ?? new ConsoleCredentialedRequestAuditLog();

  let status: number;
  try {
    const response = await deps.httpClient.send({
      method: "GET",
      url: url.toString(),
      headers: { Authorization: buildAuthorizationHeader(connection) },
      timeoutMs: CREDENTIALED_REQUEST_TIMEOUT_MS,
    });
    status = response.status;
  } catch {
    audit.record({ label, host: url.hostname, method: "GET", status: 0, at: checkedAt });
    return { status: "unreachable", message: `Could not reach '${label}' to verify this credential — this does not necessarily mean the credential is bad.`, checkedAt };
  }

  audit.record({ label, host: url.hostname, method: "GET", status, at: checkedAt });
  const outcome = classifyCustomCredentialStatus(status);
  return { status: outcome, message: buildVerificationMessage(label, status, outcome), checkedAt };
}

export interface CredentialedRequestResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly bodyText: string;
}

export interface MakeCredentialedRequestInput {
  readonly workspaceId: UUID;
  readonly label: unknown;
  readonly method: unknown;
  readonly path: unknown;
  readonly headers?: unknown;
}

/**
 * Makes an authenticated GET request through a saved custom credential: resolves the credential
 * (decrypts), resolves the real request URL against its own saved base URL (see
 * {@link buildRequestUrl}), and sends it with the real Authorization header injected — a caller
 * never supplies or sees the token, host, or full URL.
 *
 * Every input-shape and security-boundary rejection ({@link CredentialedRequestValidationError},
 * `label` not found) happens BEFORE any network call — a malformed or cross-host-looking `path` is
 * refused with no request ever sent, regardless of whether the named credential even exists.
 *
 * @throws {CredentialedRequestValidationError} `method` is not `'GET'`, `path` is empty/absolute/
 *   cross-host-looking, or `headers` carries a forbidden name or a non-string value.
 * @throws {CustomCredentialNotFoundError} No credential with this label exists in this workspace.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted.
 * @throws {CredentialedRequestTransportError} The request could not be sent (network failure,
 *   timeout, or an `EgressPolicy` refusal) — a real HTTP response, even an error one, resolves
 *   normally instead.
 * @complexity O(1) beyond the credential resolution's own O(n) (see {@link resolveCredentialOrThrow})
 *   and the header validation's own O(n) in header count.
 */
export async function makeCredentialedRequest(deps: CredentialedRequestDeps, input: MakeCredentialedRequestInput): Promise<CredentialedRequestResult> {
  const label = requireLabel(input.label);
  const method = validateReadOnlyMethod(input.method);
  const path = validateRelativePath(input.path);
  const extraHeaders = validateExtraHeaders(input.headers);
  const at = deps.clock.nowIso();

  const { baseUrl, connection } = await resolveCredentialOrThrow(deps, { workspaceId: input.workspaceId, label });
  const url = buildRequestUrl(baseUrl, path);
  const audit = deps.audit ?? new ConsoleCredentialedRequestAuditLog();

  let response;
  try {
    response = await deps.httpClient.send({
      method,
      url: url.toString(),
      headers: { ...extraHeaders, Authorization: buildAuthorizationHeader(connection) },
      timeoutMs: CREDENTIALED_REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    audit.record({ label, host: url.hostname, method, status: 0, at });
    throw new CredentialedRequestTransportError(`request to '${label}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  audit.record({ label, host: url.hostname, method, status: response.status, at });
  return { status: response.status, headers: { ...response.headers }, bodyText: response.bodyText };
}
