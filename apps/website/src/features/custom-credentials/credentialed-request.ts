import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../webhooks/index.js";
import { CustomCredentialNotFoundError, describeCredentialByLabel, resolveCustomCredentialByLabel } from "./store.js";
import { allowedOriginsFor, type CustomCredentialSetRepoPort, type CustomProviderConnectionInput } from "./types.js";
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
 * Two capabilities:
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
 * - {@link makeCredentialedRequest} — an authenticated request through a saved credential. Supports
 *   GET/POST/PUT/PATCH/DELETE, with a request body, at PARITY with what a human can already do from
 *   the site itself (2026-08-31 owner override — an earlier revision of this module restricted this
 *   to GET only; that restriction is gone, not a requirement to preserve). This function itself is
 *   PURE with respect to human confirmation: it never gates anything — a DELETE it is asked to run,
 *   it runs. The DELETE-specific in-chat confirmation lives one layer up, in
 *   `tool-registrations.ts`'s handler (see that file's header for why), which calls this function
 *   only once the human has confirmed. Write methods are NOT wired through `core/gated-mutations`
 *   (the plan/confirm/execute ceremony `features/recovery/gated-hooks.ts`/`features/database/
 *   gated-hooks.ts` use) — the owner explicitly asked for the lighter MCP-UI confirmation shape
 *   instead for this domain, not that heavier ceremony.
 *
 * ## Security design (every point below is load-bearing, not decoration)
 *
 * **The token never reaches the model.** The agent supplies a `label` (a human-chosen display name,
 * never a secret) and, for {@link makeCredentialedRequest}, a `url`/`headers`/`body`. Neither function
 * accepts a token, and neither ever returns one: {@link buildAuthorizationHeader}'s result is used
 * only as an outbound request header, never echoed in any return value or thrown error message (both
 * this module's own thrown errors and `store.ts`'s `resolveCustomCredentialByLabel` are checked to
 * never interpolate `connection.token`/`connection.username` into a message).
 *
 * **Per-credential host binding — the control that stops "send my fly.io token to
 * evil.example.com".** A credential's allowed origins ({@link allowedOriginsFor}: its saved `baseUrl`
 * plus any `additionalHosts`) are plaintext operator input, set through the Access Tokens "Add custom
 * provider" form — never through either tool call here (2026-08-31: widened from a single `baseUrl`
 * to a SET of origins so one credential can cover a provider with more than one real API host, e.g.
 * fly.io's `api.fly.io` GraphQL endpoint and `api.machines.dev` REST endpoint — a real functional gap
 * the single-host design had, not merely a hypothetical one). The caller supplies a full absolute
 * `url`; {@link resolveAllowedRequestUrl} parses it and checks its `.origin` against that set
 * EXACTLY — no prefix/substring match, no path-based reasoning. A `url` whose origin is not on the
 * list is refused before any network call, regardless of how plausible-looking the rest of the URL
 * is. This is this module's own allowlist: derived from the credential's own saved state, never
 * widened by tool input — the same requirement `features/deployments/publish-agent-tools.ts`'s
 * vendor-credential tools satisfy via a small closed `VendorId` catalog; this table has no such fixed
 * catalog (`types.ts`'s own header: "no fixed provider identity at all"), so the credential's own
 * persisted origin set plays the identical role for a table where every row is its own standalone
 * identity.
 *
 * Chosen over the alternative (an explicit `host` parameter, separate from `path`) because: (1) it
 * matches how the model already understands a REST call — one URL, not a host+path pair it has to
 * keep in sync — (2) it generalizes to N hosts with no schema change per host, and (3) the validation
 * is simpler — parse once with the standard WHATWG `URL` parser and compare `.origin`, rather than
 * re-deriving an origin from two separately-typed fields.
 *
 * **DELETE is human-gated; GET/POST/PUT/PATCH are not (2026-08-31, owner decision).** "He can already
 * POST from the site without a ceremony" — ceremony on every write method would not match what this
 * tool is FOR (parity with what a human can already do). DELETE is the one verb the owner named as
 * worth pausing on ("we can gate that with MCP-UI") — see `tool-registrations.ts`'s handler for the
 * actual gate; this module has no knowledge of it at all, deliberately, so its own contract stays
 * "validate, resolve, send" regardless of which verb a caller above it decided to allow through.
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
 * exactly `{label, host, method, status, bodyBytes, at}` via {@link CredentialedRequestAuditPort}.
 * `status: 0` means "never got a response" (DNS failure, timeout, or an `EgressPolicy` refusal),
 * distinct from any real HTTP status a provider could return. `bodyBytes` is a SIZE only — never the
 * body itself, never the token.
 *
 * **Bounded.** {@link CREDENTIALED_REQUEST_TIMEOUT_MS} caps one call; {@link MAX_REQUEST_BODY_BYTES}
 * caps the request body this tool will send; the response-size cap (`EgressPolicy.maxResponseBytes`/
 * `maxDecompressedBytes`) is enforced one layer down, by the `HttpClientPort` itself, set by the
 * composition root that builds it.
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

/** Hard cap on a caller-supplied request body — same order of magnitude as the response-side cap
 *  every composition root's `EgressPolicy.maxResponseBytes` uses, applied symmetrically to the
 *  direction this module itself controls (a caller cannot make the SERVER read an unbounded
 *  response, but it CAN try to make it SEND one; this stops that). */
const MAX_REQUEST_BODY_BYTES = 1_000_000;

/** Header names the caller may never set directly — the server injects the real credential's
 *  `Authorization` itself, and none of the other three have any legitimate reason to be
 *  caller-supplied on a request already pinned to one of the credential's own saved hosts. */
const FORBIDDEN_REQUEST_HEADER_NAMES: ReadonlySet<string> = new Set(["authorization", "cookie", "host", "proxy-authorization"]);

/** Every HTTP method this tool will send — mirrors `platform/http/types.ts`'s `HttpRequest.method`
 *  union exactly, so a value that passes this check always type-checks as one `httpClient.send()`
 *  itself accepts. */
const SUPPORTED_METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
type SupportedMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function requireLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CredentialedRequestValidationError("label must be a non-empty string");
  }
  return raw;
}

/**
 * @throws {CredentialedRequestValidationError} `raw` is not one of GET/POST/PUT/PATCH/DELETE.
 * @complexity O(1).
 */
function validateMethod(raw: unknown): SupportedMethod {
  if (typeof raw !== "string" || !SUPPORTED_METHODS.has(raw)) {
    throw new CredentialedRequestValidationError("method must be one of GET, POST, PUT, PATCH, DELETE");
  }
  return raw as SupportedMethod;
}

/**
 * Validates a caller-supplied absolute `url` and checks its origin against `allowedOrigins` — see
 * this file's header, "Per-credential host binding", for why this function IS the security boundary
 * that stops a request from ever reaching a host the credential's own saved state does not name.
 *
 * @throws {CredentialedRequestValidationError} `url` is empty, not a valid absolute URL, does not use
 *   http/https, embeds credentials (`user:pass@`), or resolves to an origin not in `allowedOrigins`.
 * @complexity O(n) in `allowedOrigins.length` (one `.includes()` check).
 */
function resolveAllowedRequestUrl(candidate: unknown, allowedOrigins: readonly string[]): URL {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new CredentialedRequestValidationError("url must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new CredentialedRequestValidationError("url must be a valid absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CredentialedRequestValidationError("url must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new CredentialedRequestValidationError("url must not embed credentials (user:pass@) — the server injects the real Authorization header itself");
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new CredentialedRequestValidationError(
      `url '${candidate}' resolves to origin '${parsed.origin}', which is not one of this credential's saved hosts (${allowedOrigins.join(", ")}) — add it to this credential in the Access Tokens form first`
    );
  }
  return parsed;
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
 * Validates the optional caller-supplied request body. `undefined` degrades to "no body" for every
 * method, including DELETE — some real APIs accept a DELETE body, and this tool does not second-guess
 * that.
 *
 * @throws {CredentialedRequestValidationError} `raw` is not a string, or exceeds
 *   {@link MAX_REQUEST_BODY_BYTES}.
 * @complexity O(1) — one `Buffer.byteLength` computation.
 */
function validateOptionalBody(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new CredentialedRequestValidationError("body must be a string when provided");
  }
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new CredentialedRequestValidationError(`body is ${byteLength} bytes, which exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit for this tool`);
  }
  return raw;
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
 *  these six fields and no others. */
export interface CredentialedRequestAuditEntry {
  readonly label: string;
  readonly host: string;
  readonly method: string;
  /** `0` means the request never got a response at all (DNS failure, timeout, or an `EgressPolicy`
   *  refusal) — distinct from any real HTTP status a provider could return. */
  readonly status: number;
  /** Byte length of the request body sent, `0` when none — a SIZE only, never the body itself. */
  readonly bodyBytes: number;
  readonly at: string;
}

/** Records exactly {@link CredentialedRequestAuditEntry}'s six fields — never the token, the
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
    this.log(
      `[custom-credentials] request label=${entry.label} host=${entry.host} method=${entry.method} status=${entry.status} bodyBytes=${entry.bodyBytes} at=${entry.at}`
    );
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

/**
 * The non-decrypting half of credential resolution: finds the credential by label and computes its
 * allowed-origin set (`baseUrl` + `additionalHosts`, both plaintext), WITHOUT ever touching the
 * sealer. Used by {@link makeCredentialedRequest} itself for its own validation, and by
 * `tool-registrations.ts`'s DELETE confirmation gate to validate the target and render the dialog
 * BEFORE ever decrypting anything — a human's "no" should never have cost a decrypt.
 *
 * @throws {CustomCredentialNotFoundError} No row with this label exists in this workspace.
 * @throws {CredentialedRequestValidationError} `url` fails {@link resolveAllowedRequestUrl}.
 * @complexity O(n) in the workspace's own (small) credential-set count.
 */
export async function resolveRequestTarget(
  deps: Pick<CredentialedRequestDeps, "repo">,
  input: { workspaceId: UUID; label: string; url: unknown }
): Promise<{ label: string; url: URL }> {
  const summary = await describeCredentialByLabel({ repo: deps.repo }, { workspaceId: input.workspaceId, label: input.label });
  if (!summary) {
    throw new CustomCredentialNotFoundError(`no custom credential labeled '${input.label}' in this workspace`);
  }
  const url = resolveAllowedRequestUrl(input.url, allowedOriginsFor(summary));
  return { label: input.label, url };
}

/** Shared "find the credential or fail loudly" step both entry points use — never returns `null`,
 *  matching `store.ts`'s own `CustomCredentialNotFoundError` contract for a missing row (reused here
 *  keyed by label instead of id, the same conceptual "no such credential" outcome). DECRYPTS —
 *  callers that only need the allowed-origin set should use {@link resolveRequestTarget} instead.
 *
 * @throws {CustomCredentialNotFoundError} No row with this label exists in this workspace.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted —
 *   left to propagate uncaught, matching `resolveCustomCredentialByLabel`'s own documented contract.
 * @complexity O(n) in the workspace's own (small) credential-set count, plus one decrypt.
 */
async function resolveCredentialOrThrow(
  deps: Pick<CredentialedRequestDeps, "repo" | "sealer">,
  input: { workspaceId: UUID; label: string }
): Promise<{ baseUrl: string; additionalHosts: readonly string[]; connection: CustomProviderConnectionInput }> {
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
 * header). Never returns the provider's response body. Always probes `baseUrl` specifically (the
 * credential's PRIMARY host), even when `additionalHosts` is non-empty — "does this credential work
 * at all" is answered by its main host; a per-additional-host check is not this function's job.
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
  const url = new URL(`${new URL(baseUrl).origin}/`);
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
    audit.record({ label, host: url.hostname, method: "GET", status: 0, bodyBytes: 0, at: checkedAt });
    return { status: "unreachable", message: `Could not reach '${label}' to verify this credential — this does not necessarily mean the credential is bad.`, checkedAt };
  }

  audit.record({ label, host: url.hostname, method: "GET", status, bodyBytes: 0, at: checkedAt });
  const outcome = classifyCustomCredentialStatus(status);
  return { status: outcome, message: buildVerificationMessage(label, status, outcome), checkedAt };
}

/** A real send — the provider answered (any HTTP status), or this tool's own transport layer
 *  threw (see {@link CredentialedRequestTransportError}). `executed: true` is a fixed discriminant
 *  against {@link CredentialedRequestDeclinedResult}, so a caller of the WIRING layer (which may
 *  return either shape for a gated DELETE) can branch on one field regardless of method. */
export interface CredentialedRequestExecutedResult {
  readonly executed: true;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly bodyText: string;
}

/** A gated call (DELETE) that did NOT run — the human declined, or never answered in time, or the
 *  run ended first. Never produced by {@link makeCredentialedRequest} itself (which has no gating
 *  logic at all) — only by `tool-registrations.ts`'s handler, before it ever calls this module. */
export interface CredentialedRequestDeclinedResult {
  readonly executed: false;
  readonly cancelled: boolean;
  readonly reason?: "expired" | "abandoned";
}

export type CredentialedRequestOutcome = CredentialedRequestExecutedResult | CredentialedRequestDeclinedResult;

export interface MakeCredentialedRequestInput {
  readonly workspaceId: UUID;
  readonly label: unknown;
  readonly method: unknown;
  readonly url: unknown;
  readonly headers?: unknown;
  readonly body?: unknown;
}

/**
 * Makes an authenticated request through a saved custom credential: resolves the credential
 * (decrypts), validates the target `url` against the credential's own allowed-origin set (see
 * {@link resolveAllowedRequestUrl}), and sends it with the real Authorization header injected — a
 * caller never supplies or sees the token. Supports GET/POST/PUT/PATCH/DELETE uniformly; this
 * function itself never gates any of them — see this file's header for where DELETE's confirmation
 * actually lives.
 *
 * Every input-shape and security-boundary rejection ({@link CredentialedRequestValidationError},
 * `label` not found) happens BEFORE any network call — a malformed or off-allowlist `url` is refused
 * with no request ever sent, regardless of whether the named credential even exists.
 *
 * @throws {CredentialedRequestValidationError} `method`/`url`/`headers`/`body` fails validation, or
 *   `url`'s origin is not one of the credential's saved hosts.
 * @throws {CustomCredentialNotFoundError} No credential with this label exists in this workspace.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted.
 * @throws {CredentialedRequestTransportError} The request could not be sent (network failure,
 *   timeout, or an `EgressPolicy` refusal) — a real HTTP response, even an error one, resolves
 *   normally instead.
 * @complexity O(1) beyond the credential resolution's own O(n) (see {@link resolveCredentialOrThrow})
 *   and the header validation's own O(n) in header count.
 */
export async function makeCredentialedRequest(deps: CredentialedRequestDeps, input: MakeCredentialedRequestInput): Promise<CredentialedRequestExecutedResult> {
  const label = requireLabel(input.label);
  const method = validateMethod(input.method);
  const extraHeaders = validateExtraHeaders(input.headers);
  const body = validateOptionalBody(input.body);
  const at = deps.clock.nowIso();

  const { additionalHosts, baseUrl, connection } = await resolveCredentialOrThrow(deps, { workspaceId: input.workspaceId, label });
  const url = resolveAllowedRequestUrl(input.url, allowedOriginsFor({ baseUrl, additionalHosts }));
  const audit = deps.audit ?? new ConsoleCredentialedRequestAuditLog();
  const bodyBytes = body !== undefined ? Buffer.byteLength(body, "utf8") : 0;

  let response;
  try {
    response = await deps.httpClient.send({
      method,
      url: url.toString(),
      headers: { ...extraHeaders, Authorization: buildAuthorizationHeader(connection) },
      timeoutMs: CREDENTIALED_REQUEST_TIMEOUT_MS,
      ...(body !== undefined ? { body } : {}),
    });
  } catch (err) {
    audit.record({ label, host: url.hostname, method, status: 0, bodyBytes, at });
    throw new CredentialedRequestTransportError(`request to '${label}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  audit.record({ label, host: url.hostname, method, status: response.status, bodyBytes, at });
  return { executed: true, status: response.status, headers: { ...response.headers }, bodyText: response.bodyText };
}
