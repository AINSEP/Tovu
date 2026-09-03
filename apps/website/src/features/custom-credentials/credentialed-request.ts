import type { UUID } from "@jini-ai/cms/core";

import type { ToolFailureDiagnostic } from "../../contracts/core/tool-failure-diagnostics.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import { detectSelfDescribingAuthScheme } from "./providers/index.js";
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
 * ## Authentication-failure diagnostics (2026-09-01)
 *
 * The live incident this addition exists for: name.com's API accepts ONLY HTTP Basic
 * `username:token` (confirmed live — `Bearer` gets 401, `-u "user:token"` gets 200), and
 * {@link buildAuthorizationHeader} sent Basic only when the saved connection carried a `username`
 * (a third case, a token's own self-describing scheme, was added 2026-09-03 — see "Self-describing
 * token schemes" below). A credential saved without one 401'd on every single call with no
 * explanation, and the owner had to go hunt through the Access Tokens UI by hand to work out why.
 * Both entry points now attach {@link AuthFailureDiagnostic} to a 401/403 outcome —
 * {@link verifyCustomCredential}'s `"invalid"` result, and {@link makeCredentialedRequest}'s executed
 * result for that status.
 *
 * The diagnostic is two STRUCTURED FACTS, always present on a 401/403 regardless of cause
 * (`schemeSent`, `usernameStored`), plus an optional `hint` carrying the one HYPOTHESIS this module
 * can honestly make — never a claim. That hypothesis is narrow on purpose: `schemeSent === "Bearer"`
 * is the ONLY shape where "this provider might need a saved username" is a fair guess — and even
 * then, ONLY on a 401. (Before 2026-09-03 this was equivalent to `usernameStored === false`, since
 * {@link buildAuthorizationHeader} only ever sent Basic or Bearer; that equivalence no longer holds
 * now that a token can carry its own self-describing scheme — see "Self-describing token schemes"
 * below — so `schemeSent` is the fact this module actually gates the hint on, not `usernameStored`.)
 * A 401/403 on a credential that ALREADY has a stored username, or whose token embeds its own
 * scheme, is a completely different, un-guessable problem from here — a wrong username, an
 * expired/revoked token, missing scopes, the provider's own policy, or (for a self-describing token)
 * simply a bad credential sent with the correct scheme — so `hint` is deliberately omitted in those
 * cases rather than repeating advice that has already been tried and failed or does not apply;
 * asserting "add a username" there would be actively misleading, not merely unhelpful.
 *
 * **401 vs 403 (2026-09-03 — the GitHub incident this addition fixes).** The scheme-swap hypothesis
 * above shipped for status 401 and 403 alike, on the reasoning that both are "the provider rejected
 * this credential." That reasoning does not hold: HTTP's own split is that 401 Unauthorized means
 * authentication itself failed (a fair place to hypothesize about the auth SCHEME), while 403
 * Forbidden means the request was understood and often even authenticated but refused for a reason
 * that has nothing to do with which scheme was sent — insufficient token scopes, provider policy, or
 * (the live incident) a request the provider's edge rejected before auth was ever evaluated because
 * it carried no `User-Agent` header at all (now fixed at the source — see `platform/http/client.ts`'s
 * `DEFAULT_USER_AGENT`). A saved GitHub PAT with full scopes, sent as `Bearer` with no stored
 * username, 403'd for that header reason alone; this module's old logic saw "Bearer, no username,
 * 401-or-403" and offered the Basic-auth hypothesis anyway, which was simply wrong for GitHub and
 * sent the owner down a dead-end repair path (asked for and saved a GitHub username; the retry still
 * 403'd, because the scheme was never the problem). {@link buildAuthFailureDiagnostic} now offers the
 * scheme hypothesis ONLY for a 401 — status is a structural, general HTTP distinction, never a named
 * provider or hostname, so this does not rot the way a `hostname === "api.github.com"` special case
 * would: it generalizes to any provider whose 403 has a cause unrelated to auth scheme, not just
 * GitHub's. A 403 still reports the two structured facts (never hides them) but carries no `hint` —
 * the module has no honest hypothesis to offer there, matching the same "omit rather than mislead"
 * discipline the stored-username case already used.
 *
 * **Self-describing token schemes (2026-09-03 — the Fly.io incident this addition fixes).** Every
 * case above assumes {@link buildAuthorizationHeader} always sends either `Bearer <token>` or
 * `Basic <username:token>` — an assumption a saved fly.io credential breaks: fly.io's own token
 * string is self-describing, e.g. `FlyV1fm2_...` (a macaroon), and `FlyV1` is not incidental
 * content — it IS the correct `Authorization` HTTP scheme name, with the rest of the token string as
 * the value. See `./providers/fly-io.ts`'s own header for the full live verification.
 *
 * {@link resolveAuthorizationScheme} is the one place THIS module decides which of the three shapes
 * (self-describing, Basic, Bearer) to send; {@link buildAuthorizationHeader} and
 * {@link buildAuthFailureDiagnostic} both call it rather than each re-deriving the precedence, so the
 * scheme a 401/403 diagnostic REPORTS can never drift from the scheme that was actually SENT.
 * RECOGNIZING a self-describing scheme, however, is deliberately NOT this module's own logic:
 * {@link detectSelfDescribingAuthScheme} delegates to `./providers/index.ts`, a small per-vendor
 * registry (one file per provider, e.g. `./providers/fly-io.ts`) rather than an inline allow-list
 * living here. A first pass of this fix special-cased `"FlyV1"` directly in this file; that was
 * rejected in review because it does not scale — every future vendor with the same quirk would mean
 * editing this shared file and growing a shared conditional a new vendor has no reason to know
 * exists. See `./providers/index.ts`'s header for the full registry design, including why dispatch
 * there is try-each-in-turn (recognize by the token's own content) rather than keyed by the
 * credential's saved host — this module's job stays exactly "ask the registry, then apply the fixed
 * three-way precedence below," never "know which vendors exist."
 *
 * A self-describing scheme takes priority over a saved `username` (Basic auth): if a token embeds its
 * own scheme, the token itself dictates its own transport — a stored username on that same credential
 * would be a leftover from before the scheme was recognized, not a signal to prefer Basic instead. No
 * saved credential exercises this combination as of this writing (fly.io's own saved credential has
 * no username), so this is a forward-looking precedence decision, not a fix for a live conflict.
 *
 * Neither function reinterprets or hides the provider's own response: {@link makeCredentialedRequest}'s
 * `bodyText` is unaffected by this addition, and this diagnostic is additive alongside it, never a
 * replacement for it. And as with every other value this module touches, the diagnostic never
 * carries the token, the Authorization header, or any part of either — it is built from
 * `connection.username`'s mere PRESENCE, never its value, let alone the token's.
 *
 * {@link AuthFailureDiagnostic} is an INSTANCE of the general `ToolFailureDiagnostic` contract
 * (`contracts/core/tool-failure-diagnostics.ts`, 2026-09-01 second pass) rather than a parallel shape
 * that happens to look similar: it `extends` that interface, and its `hint` is that contract's own
 * hedged-hypothesis-plus-remedy field, unchanged in wording and behavior from the paragraph above. The
 * one thing this pass actually ADDS is `remedyToolId` — that contract's facet 4, "whether a registered
 * tool can supply it" — which names `custom_credential_set_username` exactly when `hint` fires, so a
 * generic ask-fix-retry loop can find the fix tool from the diagnostic itself instead of a human
 * having to already know it exists. See that file's own header for the full four-facet contract and
 * the one-cycle guard `remedyToolId` (a bare pointer, never a callback) is designed to preserve.
 *
 * ## Security design (every point below is load-bearing, not decoration)
 *
 * **The token never reaches the model.** The agent supplies a `label` (a human-chosen display name,
 * never a secret) and, for {@link makeCredentialedRequest}, a `url`/`headers`/`body`. Neither function
 * accepts a token, and neither ever returns one: {@link buildAuthorizationHeader}'s result is used
 * only as an outbound request header, never echoed in any return value or thrown error message (both
 * this module's own thrown errors and `store.ts`'s `resolveCustomCredentialByLabel` are checked to
 * never interpolate `connection.token`/`connection.username` into a message). This also covers the
 * PROVIDER's own response, not just this module's: {@link makeCredentialedRequest} sends the
 * response through {@link redactResponseHeaders}/{@link resolveRedactedResponseBody} before returning
 * it, so a reflecting/echo endpoint that hands back the injected `Authorization` value, the raw
 * token, or — for a Basic-auth connection — the bare base64 `username:token` payload on its own (no
 * `Basic ` scheme prefix; 2026-09-03 addition — see {@link buildBasicAuthPayload}) cannot leak it
 * back through the model that way either, in a response header OR body.
 * `Authorization`/`Proxy-Authorization`/`Set-Cookie`/`Cookie` response headers are always stripped
 * outright regardless of value or secret length; every other header passes through unless its value
 * CONTAINS one of those secret values as a SUBSTRING — not exact equality; a header that merely
 * embeds a secret inside a larger value (e.g. a diagnostic string like `"sent-auth=Bearer <token>;
 * region=us-east"`) is still dropped in full — in which case the whole header is dropped — dropping
 * a header has no partial-mangling failure mode, so headers apply no length floor.
 * The body is different: a substring-scrub can only work in place, so a token shorter than
 * {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH} is too ambiguous to scrub safely (it could match
 * ordinary legitimate content by coincidence) and the ENTIRE body is withheld with
 * {@link BODY_WITHHELD_SHORT_TOKEN_MARKER} instead of guessing; at or above that length, only the
 * matched substring is replaced with a fixed marker and everything else the provider actually said
 * still reaches the model unchanged.
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
 *  caller-supplied on a request already pinned to one of the credential's own saved hosts.
 *  `User-Agent` is deliberately NOT in this set (2026-09-03 decision): unlike these four, it carries
 *  no secret and has no bearing on the per-credential host binding (this file's header, "Per-credential
 *  host binding") or any other security boundary this module enforces — it is exactly the header a
 *  human already controls for free when calling the same API with `curl -A`, and this tool's own
 *  stated goal is parity with what a human operating this credential could already do (this file's
 *  header, `makeCredentialedRequest`'s own bullet). A caller that supplies its own `User-Agent` here
 *  reaches `deps.httpClient.send()` unmodified, and `platform/http/client.ts`'s default (see its own
 *  `DEFAULT_USER_AGENT` doc) never overrides an already-present one. */
const FORBIDDEN_REQUEST_HEADER_NAMES: ReadonlySet<string> = new Set(["authorization", "cookie", "host", "proxy-authorization"]);

/** Response header names that must never reach the model, regardless of value — the credential's
 *  own injected `Authorization`/`Proxy-Authorization` if a reflecting endpoint echoes the request
 *  back, and any `Set-Cookie`/`Cookie` the provider sends. Response-side counterpart to
 *  {@link FORBIDDEN_REQUEST_HEADER_NAMES}; see this file's header, "The token never reaches the
 *  model". */
const FORBIDDEN_RESPONSE_HEADER_NAMES: ReadonlySet<string> = new Set(["authorization", "proxy-authorization", "set-cookie", "cookie"]);

/** Fixed marker substituted for a matched secret inside a response body — keeps the rest of the
 *  body legible while making unambiguous that something was removed, rather than silently
 *  splicing bytes out. */
const REDACTED_MARKER = "[REDACTED]";

/** Below this length, a raw token is short/common enough that scrubbing every occurrence of it out
 *  of a response body risks matching ordinary legitimate content by coincidence (a 2-character
 *  token can match inside an unrelated word or number) rather than an actual reflection of the
 *  credential — see `"ab"` mangling `"abacus"` into `"[REDACTED]acus"` in
 *  `__tests__/credentialed-request.unit.test.ts`'s own regression test for exactly this failure
 *  mode. 8 is NIST SP 800-63B's own baseline minimum secret length; a real API token/secret is
 *  almost always far longer than that, so this floor costs nothing for the tokens this tool
 *  actually expects to see, while still catching the pathological case. Response HEADER redaction
 *  has no equivalent floor: dropping a whole header that contains the secret has no
 *  partial-mangling failure mode, regardless of how short the secret is — only body substring
 *  scrubbing needs this gate. */
const MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH = 8;

/** Returned as `bodyText` in place of the real response body whenever the credential's raw token is
 *  shorter than {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH} — failing safe by withholding legitimate
 *  content instead of either leaking the token or silently mangling unrelated body content around
 *  it. A caller seeing this marker can act on it (the credential itself still works; only this
 *  tool's ability to show its response body safely is limited); a caller seeing a body with, say,
 *  every "1" replaced could not tell redaction had even happened. */
const BODY_WITHHELD_SHORT_TOKEN_MARKER = "[body withheld: credential too short to redact safely]";

/**
 * Strips every response header this module must never hand back to the model: the always-forbidden
 * names in {@link FORBIDDEN_RESPONSE_HEADER_NAMES}, plus any header whose value CONTAINS one of
 * `secrets` as a substring — SUBSTRING match, not exact equality, so a header that merely embeds a
 * secret inside a larger value (a diagnostic/debug string, say) is dropped too, not only a header
 * value that equals a secret verbatim. This is the shape a reflecting/echo endpoint takes when it
 * hands the request's own `Authorization` value, or the credential's raw token, back in a response
 * header. A header with no secret material passes through unchanged; see this file's header, "The
 * token never reaches the model".
 *
 * @complexity O(n * m): n response headers, each checked against m (small, fixed) secrets.
 */
function redactResponseHeaders(headers: Readonly<Record<string, string>>, secrets: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (FORBIDDEN_RESPONSE_HEADER_NAMES.has(key.trim().toLowerCase())) continue;
    if (secrets.some((secret) => secret !== "" && value.includes(secret))) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Replaces every occurrence of a secret in `text` with {@link REDACTED_MARKER} — applied to the
 * response body so a reflecting/echo endpoint cannot hand the injected credential back through the
 * model inside body content, while every other byte of the body reaches it unchanged.
 *
 * @complexity O(n * m): n secrets, each a linear scan/replace over `text`.
 */
function redactSecretSubstrings(text: string, secrets: readonly string[]): string {
  return secrets.reduce((acc, secret) => (secret === "" ? acc : acc.split(secret).join(REDACTED_MARKER)), text);
}

/**
 * Decides what {@link makeCredentialedRequest} returns as `bodyText`: the real response body with
 * {@link redactSecretSubstrings} applied when `token` is long enough that matching it is unambiguous,
 * or {@link BODY_WITHHELD_SHORT_TOKEN_MARKER} when it is not — see
 * {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH}'s own doc for why. Gates on `token`'s own length only
 * (not the full `secrets` list): the built Authorization header is always at least as long as the
 * token plus its scheme prefix, so the token is the shorter, harder-to-scrub-safely secret of the two.
 *
 * @complexity O(1) below the length floor; {@link redactSecretSubstrings}'s own O(n * m) above it.
 */
function resolveRedactedResponseBody(bodyText: string, token: string, secrets: readonly string[]): string {
  if (token.length < MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH) return BODY_WITHHELD_SHORT_TOKEN_MARKER;
  return redactSecretSubstrings(bodyText, secrets);
}

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
  if (FORBIDDEN_REQUEST_HEADER_NAMES.has(key.trim().toLowerCase())) {
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

/** The three shapes {@link buildAuthorizationHeader} can send for one connection — see
 *  {@link resolveAuthorizationScheme}'s own doc for the precedence order this discriminates.
 *  `"self-describing"`'s `scheme` is a plain `string`, not a closed literal union: it is whatever
 *  scheme word the matching entry in {@link CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS} returned, and
 *  that registry is meant to grow without this file changing — see `./providers/index.ts`'s header. */
type ResolvedAuthorizationScheme =
  | { readonly kind: "self-describing"; readonly scheme: string; readonly value: string }
  | { readonly kind: "basic"; readonly username: string; readonly token: string }
  | { readonly kind: "bearer"; readonly token: string };

/**
 * Resolves which of the three shapes {@link buildAuthorizationHeader} sends for one connection, in
 * the exact precedence this module applies: (1) a self-describing scheme when
 * {@link detectSelfDescribingAuthScheme} (the `./providers/` registry — see this file's header,
 * "Self-describing token schemes") recognizes the token itself — the token dictates its own
 * transport, so this wins even over a saved username; (2) HTTP Basic (`username:token`, base64) when
 * the connection carries a `username` — the same convention `store.ts`'s own
 * `CustomProviderConnectionInput.username` doc documents ("only needed if this provider authenticates
 * a token against a username"); (3) Bearer otherwise. Extracted so
 * {@link buildAuthFailureDiagnostic} can report the scheme it ACTUALLY sent by calling this SAME
 * function, rather than re-deriving the precedence a second time and risking it drifting from what
 * {@link buildAuthorizationHeader} really does.
 *
 * @complexity O(1) beyond {@link detectSelfDescribingAuthScheme}'s own cost.
 */
function resolveAuthorizationScheme(connection: CustomProviderConnectionInput): ResolvedAuthorizationScheme {
  const selfDescribing = detectSelfDescribingAuthScheme(connection.token);
  if (selfDescribing) {
    return { kind: "self-describing", scheme: selfDescribing.scheme, value: selfDescribing.value };
  }
  if (connection.username) {
    return { kind: "basic", username: connection.username, token: connection.token };
  }
  return { kind: "bearer", token: connection.token };
}

/** Builds the outbound `Authorization` header value for one connection, per
 *  {@link resolveAuthorizationScheme}'s precedence: a self-describing scheme when the token embeds
 *  one, HTTP Basic when a `username` is saved, Bearer otherwise. Never logged, and never returned
 *  from this module — used only as an outbound request header value.
 *
 * @complexity O(1) beyond {@link resolveAuthorizationScheme}'s own cost.
 */
function buildAuthorizationHeader(connection: CustomProviderConnectionInput): string {
  const resolved = resolveAuthorizationScheme(connection);
  if (resolved.kind === "self-describing") return `${resolved.scheme} ${resolved.value}`;
  if (resolved.kind === "basic") return `Basic ${buildBasicAuthPayload(resolved.username, resolved.token)}`;
  return `Bearer ${resolved.token}`;
}

/** The bare base64 payload {@link buildAuthorizationHeader} wraps in `Basic <payload>` for a
 *  username-bearing connection — split out (2026-09-03) so a caller that must redact the PAYLOAD
 *  itself, separately from the full `Basic <payload>` header string (see
 *  {@link makeCredentialedRequest}'s `responseSecrets`), derives it from this exact same encoding
 *  instead of duplicating — and risking drift from — the logic {@link buildAuthorizationHeader}
 *  already has. A reflecting/echo endpoint that hands back only this bare payload, with no `Basic `
 *  scheme prefix, is a real leak shape this split closes: before this addition, `responseSecrets`
 *  only ever contained the FULL header value and the raw token, neither of which the bare payload is
 *  a substring match against.
 *
 * @complexity O(1).
 */
function buildBasicAuthPayload(username: string, token: string): string {
  return Buffer.from(`${username}:${token}`, "utf8").toString("base64");
}

/** The already-registered tool that can supply the one missing piece of state
 *  {@link buildAuthFailureDiagnostic}'s hint ever names — a saved username. Kept here as this
 *  module's own literal (`agent-tools.ts` has no exported id constant, only inline string literals
 *  for each tool's own `name`) and cross-checked against it by
 *  `__tests__/auth-failure-diagnostic.unit.test.ts`. */
const SET_USERNAME_TOOL_ID = "custom_credential_set_username";

/** A 401/403 outcome's structured explanation — see this file's header, "Authentication-failure
 *  diagnostics", for the honesty contract every field here is held to, and for why this interface
 *  `extends` the general {@link ToolFailureDiagnostic} contract rather than merely resembling it. */
export interface AuthFailureDiagnostic extends ToolFailureDiagnostic {
  /** Which scheme {@link buildAuthorizationHeader} actually sent for this call — never the header's
   *  own value, only which of the three shapes it took: a saved token's own self-describing scheme
   *  word (e.g. `"FlyV1"` — see this file's header, "Self-describing token schemes"), `"Basic"`, or
   *  `"Bearer"`. Typed as a plain `string`, not a closed literal union, because the self-describing
   *  case is driven by `./providers/index.ts`'s open-ended vendor registry — see
   *  {@link ResolvedAuthorizationScheme}'s own doc. This module's own "what failed" fact (facet 1 of
   *  the general contract — see that file's header for why facts are not modeled there). */
  readonly schemeSent: string;
  /** Whether this credential has a saved `username` at all — never the username's own value. This
   *  module's other "what failed" fact. */
  readonly usernameStored: boolean;
  /** Present ONLY for the one narrow, honestly-inferable case this module will ever suggest a fix
   *  for: a 401 with `schemeSent === "Bearer"` (no saved username, and no self-describing scheme
   *  matched). Absent for every other 401/403 shape — a credential that already has a stored
   *  username, or whose token embeds its own scheme, hit a DIFFERENT wall this module has no way to
   *  diagnose (wrong username, expired/revoked token, missing scopes, provider policy, or a bad
   *  credential sent with the correct scheme), and repeating "add a username" there would be a false
   *  lead, not merely an unhelpful one. Also absent on a 403 REGARDLESS of scheme/username
   *  (2026-09-03): 403 Forbidden covers causes that have nothing to do with auth scheme (scopes,
   *  policy, a missing standard header), and offering the scheme hypothesis there was confirmed
   *  live-wrong for GitHub — see this file's header, "401 vs 403". Deliberately hedged wording
   *  ("may"/"might") when present — this is a hypothesis for a human or agent to try, never an
   *  assertion of the actual cause. */
  readonly hint?: string;
  /** Present exactly when `hint` is: {@link SET_USERNAME_TOOL_ID}, the one already-registered tool
   *  that can save the missing username `hint` describes. A pointer only — this module never calls
   *  it; see the general contract's own doc, "The one-cycle guard". */
  readonly remedyToolId?: string;
}

/**
 * Builds {@link AuthFailureDiagnostic} for one 401/403 outcome by calling
 * {@link resolveAuthorizationScheme} on the SAME `connection` object {@link buildAuthorizationHeader}
 * used to build the request that got rejected — so `schemeSent` is always the scheme that was
 * actually sent, never re-derived by a second, possibly-drifting copy of the precedence logic. The
 * two structured facts (`schemeSent`, `usernameStored`) are always returned; `hint` + `remedyToolId`
 * are added only for the one case this module can honestly diagnose: a 401 sent as Bearer (no saved
 * username, and no self-describing scheme matched — see this file's header, "Self-describing token
 * schemes"). See this file's header, "401 vs 403", for why `status` gates the hint at all and why a
 * 403 never gets one, regardless of scheme.
 *
 * @complexity O(1) beyond {@link resolveAuthorizationScheme}'s own cost.
 */
function buildAuthFailureDiagnostic(connection: CustomProviderConnectionInput, status: 401 | 403): AuthFailureDiagnostic {
  const usernameStored = connection.username !== undefined;
  const resolved = resolveAuthorizationScheme(connection);
  const schemeSent = resolved.kind === "self-describing" ? resolved.scheme : resolved.kind === "basic" ? "Basic" : "Bearer";
  if (resolved.kind !== "bearer" || status !== 401) {
    // Either a different, un-guessable failure (a username IS already saved, or the token embeds its
    // own scheme and was sent correctly), or a 403 — Forbidden covers causes unrelated to auth scheme
    // (scopes, provider policy, a missing standard header), so offering the scheme hypothesis here
    // would be a false lead, not a hedge.
    return { schemeSent, usernameStored };
  }
  return {
    schemeSent,
    usernameStored,
    hint:
      "This request was sent with a Bearer token and no saved username. Some providers (e.g. ones that " +
      "authenticate a token against an account username via HTTP Basic) may reject a Bearer-only request " +
      "for that reason — this credential has no username saved. If that's the cause, saving one may fix it.",
    remedyToolId: SET_USERNAME_TOOL_ID,
  };
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
  /** Present ONLY when `status === "invalid"` (an affirmative 401/403 rejection) — see this file's
   *  header, "Authentication-failure diagnostics". Absent for `"valid"`/`"unreachable"`: neither is an
   *  auth-scheme rejection, so there is nothing to diagnose. */
  readonly authDiagnostic?: AuthFailureDiagnostic;
}

/**
 * Checks one saved custom credential against its own real provider, live: resolves the credential
 * (decrypts), makes one bounded GET to its own saved base URL's root with the real Authorization
 * header, and classifies the result. Never throws on a network failure — that classifies as
 * `"unreachable"`, matching every other verification surface in this codebase (see this file's
 * header). Never returns the provider's response body. Always probes `baseUrl` specifically (the
 * credential's PRIMARY host), even when `additionalHosts` is non-empty — "does this credential work
 * at all" is answered by its main host; a per-additional-host check is not this function's job. An
 * `"invalid"` (401/403) outcome carries `authDiagnostic` — see this file's header,
 * "Authentication-failure diagnostics".
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
  const authDiagnostic = outcome === "invalid" ? buildAuthFailureDiagnostic(connection, status as 401 | 403) : undefined;
  return { status: outcome, message: buildVerificationMessage(label, status, outcome), checkedAt, ...(authDiagnostic ? { authDiagnostic } : {}) };
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
  /** Present ONLY when `status` is 401 or 403 — see this file's header, "Authentication-failure
   *  diagnostics". Additive alongside `bodyText`, which still carries the provider's own response
   *  body unsuppressed and unchanged; this field never replaces or reinterprets it. */
  readonly authDiagnostic?: AuthFailureDiagnostic;
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
/**
 * Everything a reflecting/echo endpoint could hand back that must never reach the model — the exact
 * Authorization value this call sent, the credential's own raw token, and — for a Basic-auth
 * connection (one with a saved `username`, AND no self-describing scheme that took priority over it
 * — see this file's header, "Self-describing token schemes") — the bare base64 `username:token`
 * payload ON ITS OWN, with no "Basic " scheme prefix.
 *
 * That third value is NOT a substring of either of the first two: it is a substring of
 * `authorizationHeader` only when the "Basic " prefix is also present, and it is not
 * `connection.token` at all (it is the base64 encoding of `username:token` together) — so without
 * listing it explicitly, an endpoint that echoes just the bare payload back would slip past both
 * {@link redactResponseHeaders} and {@link resolveRedactedResponseBody} undetected.
 *
 * Gated on the RESOLVED scheme being `basic` rather than the looser `connection.username`
 * truthiness check, so this list only ever contains a payload that was actually sent — a credential
 * carrying both a self-describing token AND a leftover saved username never sends Basic, so there
 * is no such payload to leak or to list. See this file's header, "The token never reaches the
 * model", and {@link buildBasicAuthPayload}'s own doc for why this is derived rather than
 * duplicated.
 *
 * Extracted from {@link makeCredentialedRequest} (2026-09-03) so that function stays under the
 * repo's 9/9 complexity ceiling — the Basic-payload branch was its tenth.
 *
 * Every entry is matched as a SUBSTRING (see {@link redactResponseHeaders}), never by exact
 * equality.
 *
 * @complexity O(1).
 */
function buildResponseSecrets(connection: CustomProviderConnectionInput, authorizationHeader: string): readonly string[] {
  const resolvedScheme = resolveAuthorizationScheme(connection);
  if (resolvedScheme.kind !== "basic") return [authorizationHeader, connection.token];
  return [authorizationHeader, connection.token, buildBasicAuthPayload(resolvedScheme.username, resolvedScheme.token)];
}

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
  const authorizationHeader = buildAuthorizationHeader(connection);
  const responseSecrets = buildResponseSecrets(connection, authorizationHeader);

  let response;
  try {
    response = await deps.httpClient.send({
      method,
      url: url.toString(),
      headers: { ...extraHeaders, Authorization: authorizationHeader },
      timeoutMs: CREDENTIALED_REQUEST_TIMEOUT_MS,
      ...(body !== undefined ? { body } : {}),
    });
  } catch (err) {
    audit.record({ label, host: url.hostname, method, status: 0, bodyBytes, at });
    throw new CredentialedRequestTransportError(`request to '${label}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  audit.record({ label, host: url.hostname, method, status: response.status, bodyBytes, at });
  const authDiagnostic =
    response.status === 401 || response.status === 403 ? buildAuthFailureDiagnostic(connection, response.status) : undefined;
  return {
    executed: true,
    status: response.status,
    headers: redactResponseHeaders(response.headers, responseSecrets),
    bodyText: resolveRedactedResponseBody(response.bodyText, connection.token, responseSecrets),
    ...(authDiagnostic ? { authDiagnostic } : {}),
  };
}
