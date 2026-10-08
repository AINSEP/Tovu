import type { Clock } from "@jini-ai/core/primitives";
// Request validation and secret scrubbing live in Jini packages/integrations/src/credentialed-http/credentialed-request.ts.
/** Tovu's credential-store, audit and diagnostic policy adapter over Jini's guarded requests.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * @file Closes the "the agent can SAVE a custom credential but can never USE one" gap:
 * `custom_credential_sets` (the Access Tokens page's "Add custom provider" rows — an operator-typed
 * label, API base URL, and token, e.g. "name.com", "example-host") had a write path
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
 *   guarded `HttpClientPort` (ADR-038) instead, the same reason the hosted mail
 *   adapters (`server/runtime/boot/resolve-mailer.ts`) do for the identical shape of
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
 * **Self-describing token schemes (2026-09-03 — the live incident this addition fixes).** Every
 * case above assumes {@link buildAuthorizationHeader} always sends either `Bearer <token>` or
 * `Basic <username:token>` — an assumption some vendors' tokens break: the token string is
 * self-describing, e.g. `<Scheme>fm2_...` (a macaroon), and the leading scheme word is not incidental
 * content — it IS the correct `Authorization` HTTP scheme name, with the rest of the token string as
 * the value. The live verification is recorded with the rule itself, in the `deploy` plugin's
 * `tovu-credential-schemes.json` (`note`).
 *
 * {@link resolveAuthorizationScheme} is the one place THIS module decides which of the three shapes
 * (self-describing, Basic, Bearer) to send; {@link buildAuthorizationHeader} and
 * {@link buildAuthFailureDiagnostic} both call it rather than each re-deriving the precedence, so the
 * scheme a 401/403 diagnostic REPORTS can never drift from the scheme that was actually SENT.
 * RECOGNIZING a self-describing scheme, however, is deliberately NOT this module's own logic, and
 * core names no vendor: the scheme rules are data that bundled Agent Plugins ship
 * (`tovu-credential-schemes.json`), loaded once per call at each entry point
 * ({@link verifyCustomCredential}, {@link makeCredentialedRequest}) through
 * `CredentialedRequestDeps.loadAuthSchemes` and passed down to {@link detectSelfDescribingAuthScheme}
 * (`./auth-schemes.ts`). See that file's header for the rule format, the trust gates, and why
 * dispatch is try-each-in-turn (recognize by the token's own content) rather than keyed by the
 * credential's saved host. This module's job stays exactly "apply the loaded rules, then the fixed
 * three-way precedence below," never "know which vendors exist."
 *
 * A self-describing scheme takes priority over a saved `username` (Basic auth): if a token embeds its
 * own scheme, the token itself dictates its own transport — a stored username on that same credential
 * would be a leftover from before the scheme was recognized, not a signal to prefer Basic instead. No
 * saved credential exercises this combination as of this writing (the one known self-describing
 * credential has no username), so this is a forward-looking precedence decision, not a fix for a live conflict.
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
 * **Per-credential host binding — the control that stops "send my hosting token to
 * evil.example.com".** A credential's allowed origins ({@link allowedOriginsFor}: its saved `baseUrl`
 * plus any `additionalHosts`) are plaintext operator input, set through the Access Tokens "Add custom
 * provider" form — never through either tool call here (2026-08-31: widened from a single `baseUrl`
 * to a SET of origins so one credential can cover a provider with more than one real API host, e.g.
 * a hosting vendor's separate GraphQL and REST API hosts — a real functional gap
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
 * **This allowlist governs the ORIGINAL `url` only — not a redirect target (2026-09-10).**
 * {@link resolveAllowedRequestUrl} runs exactly once, before any network call; a redirect hop
 * `deps.httpClient.send()` may follow past that point is never re-checked against it. That is
 * intentional, not a gap `custom_credential_make_request`'s own request could smuggle a URL through:
 * a redirect is a value the ALREADY-allowlisted host chose to hand back, not one the caller supplied,
 * and by the time it is followed the credential's own `Authorization` header has already been
 * stripped for any cross-origin hop (`client.ts`'s `withStrippedSensitiveHeaders`) — the target
 * receives neither a secret nor an attacker-chosen destination. See
 * `platform/http/egress-policies.ts`'s `CUSTOM_CREDENTIALS_EGRESS_POLICY` doc for the full argument
 * this rests on, including why the alternative (widening the GLOBAL scheme/address allowlist to the
 * redirect target's host) was rejected.
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
 * link-local/reserved, including `169.254.169.254`) on the first hop AND on every re-verified
 * redirect hop, pins each connection to the checked address, and strips auth on any cross-origin
 * hop. Whether a redirect is followed at all is `client.ts`'s own call, not this module's: gated to
 * GET only (`sendWithPolicy`'s `canFollowRedirect`) and bounded by the injected policy's own
 * `maxRedirects` (`CUSTOM_CREDENTIALS_EGRESS_POLICY`, set by the composition root). This module's
 * only NEW responsibility is the per-credential host binding above, which `EgressPolicy` has no
 * concept of on its own.
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
 * body itself, never the token. An egress refusal adds `egressRefusal`, the refusal's FULL message
 * (2026-09-16): the resolved address it names is withheld from the model (see
 * `platform/http/errors.ts`), so this server-side trail is where it is kept.
 *
 * **Bounded.** {@link CREDENTIALED_REQUEST_TIMEOUT_MS} caps one call; {@link MAX_REQUEST_BODY_BYTES}
 * caps the request body this tool will send; the response-size cap (`EgressPolicy.maxResponseBytes`/
 * `maxDecompressedBytes`) is enforced one layer down, by the `HttpClientPort` itself, set by the
 * composition root that builds it.
 *
 * Architectural role: `features/custom-credentials` domain logic (agent-tool layer). See
 * `agent-tools.ts`/`tool-registrations.ts` in this directory for the tool surface built on top.
 *
 * Every rejection this module raises for a caller-shape or security-boundary problem — separate
 *  from `store.ts`'s own `CustomCredentialValidationError` (which validates a credential's stored
 *  fields at save time): this class validates a REQUEST against an already-saved credential.
 *
 * A DNS failure, connect timeout, or other transport-level error while sending the request —
 *  distinct from a request the provider itself answered (any real HTTP status, including an error
 *  one, resolves normally instead of throwing; see {@link makeCredentialedRequest}'s own doc).
 *
 *  Deliberately NOT an `EgressPolicy` refusal (2026-09-10 — before this date it was: this class's
 *  own doc used to list "or an `EgressPolicy` refusal" as a third cause). `makeCredentialedRequest`'s
 *  catch block now rethrows `platform/http/errors.ts`'s `EgressRefusedError` UNCHANGED rather than
 *  wrapping it here, so its `instanceof` identity survives to `tool-registrations.ts`'s
 *  `isCredentialedRequestShapeRejection` — the property that lets an egress refusal (an off-allowlist
 *  redirect target, an SSRF-denied address) reach the caller as a specific, actionable message
 *  instead of collapsing into the same redacted `INTERNAL_ERROR` a genuine DNS/timeout failure gets.
 *  See that predicate's own doc for the live incident this closes. The audit row `status: 0` this
 *  module records is unchanged either way — a refusal stays distinguishable through the error TYPE
 *  a caller catches, not through a new audit field.
 *
 * Bounds one credentialed call — same order of magnitude as every other "an agent is waiting on
 *  this synchronously" bounded probe in this codebase (`static-publish/verify.ts`'s
 *  `VERIFY_TIMEOUT_MS`, `vendor-credentials/store.ts`'s `ACCOUNT_LABEL_PROBE_TIMEOUT_MS`). The
 *  composition root's own `EgressPolicy.connectTimeoutMs` is a CEILING on this value, never a
 *  replacement for it — see `platform/http/client.ts`'s `sendWithPolicy`.
 *
 * Hard cap on a caller-supplied request body — same order of magnitude as the response-side cap
 *  every composition root's `EgressPolicy.maxResponseBytes` uses, applied symmetrically to the
 *  direction this module itself controls (a caller cannot make the SERVER read an unbounded
 *  response, but it CAN try to make it SEND one; this stops that).
 *
 * Header names the caller may never set directly — the server injects the real credential's
 *  `Authorization` itself, and none of the other three have any legitimate reason to be
 *  caller-supplied on a request already pinned to one of the credential's own saved hosts.
 *  `User-Agent` is deliberately NOT in this set (2026-09-03 decision): unlike these four, it carries
 *  no secret and has no bearing on the per-credential host binding (this file's header, "Per-credential
 *  host binding") or any other security boundary this module enforces — it is exactly the header a
 *  human already controls for free when calling the same API with `curl -A`, and this tool's own
 *  stated goal is parity with what a human operating this credential could already do (this file's
 *  header, `makeCredentialedRequest`'s own bullet). A caller that supplies its own `User-Agent` here
 *  reaches `deps.httpClient.send()` unmodified, and `platform/http/client.ts`'s default (see its own
 *  `DEFAULT_USER_AGENT` doc) never overrides an already-present one.
 *
 * Response header names that must never reach the model, regardless of value — the credential's
 *  own injected `Authorization`/`Proxy-Authorization` if a reflecting endpoint echoes the request
 *  back, and any `Set-Cookie`/`Cookie` the provider sends. Response-side counterpart to
 *  {@link FORBIDDEN_REQUEST_HEADER_NAMES}; see this file's header, "The token never reaches the
 *  model".
 *
 * Fixed marker substituted for a matched secret inside a response body — keeps the rest of the
 *  body legible while making unambiguous that something was removed, rather than silently
 *  splicing bytes out.
 *
 * Below this length, a raw token is short/common enough that scrubbing every occurrence of it out
 *  of a response body risks matching ordinary legitimate content by coincidence (a 2-character
 *  token can match inside an unrelated word or number) rather than an actual reflection of the
 *  credential — see `"ab"` mangling `"abacus"` into `"[REDACTED]acus"` in
 *  `__tests__/credentialed-request.unit.test.ts`'s own regression test for exactly this failure
 *  mode. 8 is NIST SP 800-63B's own baseline minimum secret length; a real API token/secret is
 *  almost always far longer than that, so this floor costs nothing for the tokens this tool
 *  actually expects to see, while still catching the pathological case. Response HEADER redaction
 *  has no equivalent floor: dropping a whole header that contains the secret has no
 *  partial-mangling failure mode, regardless of how short the secret is — only body substring
 *  scrubbing needs this gate.
 *
 * Returned as `bodyText` in place of the real response body whenever the credential's raw token is
 *  shorter than {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH} — failing safe by withholding legitimate
 *  content instead of either leaking the token or silently mangling unrelated body content around
 *  it. A caller seeing this marker can act on it (the credential itself still works; only this
 *  tool's ability to show its response body safely is limited); a caller seeing a body with, say,
 *  every "1" replaced could not tell redaction had even happened.
 *
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
 *
 * Replaces every occurrence of a secret in `text` with {@link REDACTED_MARKER} — applied to the
 * response body so a reflecting/echo endpoint cannot hand the injected credential back through the
 * model inside body content, while every other byte of the body reaches it unchanged.
 *
 * @complexity O(n * m): n secrets, each a linear scan/replace over `text`.
 *
 * Below this length, a partial-secret TAIL is as ambiguous as a full short token is for
 *  {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH} — a 1-3 character tail match is coincidence, not
 *  evidence of a cut-off secret. Deliberately the same floor value, for the same reason; kept as its
 *  own constant because it gates a different thing (a SUFFIX of `body`, not `token`'s own length).
 *
 * Catches the one leak {@link redactSecretSubstrings} cannot: a response body the egress size cap
 * cut off mid-secret. `redactSecretSubstrings` only matches a secret's FULL text, so a body truncated
 * partway through one leaves a dangling prefix fragment — e.g. a token's first 12 characters — sitting
 * in `body` unredacted, because the complete secret never occurs in a body that was cut short before
 * it finished. Only ever meaningful on a body {@link makeCredentialedRequest} already knows is
 * truncated (its callers gate the call on that); a complete body has no dangling fragment to catch,
 * and running this against one risks false-positively matching an unrelated tail that merely happens
 * to share a short prefix with some secret.
 *
 * Finds the LONGEST prefix (across every secret, down to
 * {@link MIN_SAFE_TRUNCATED_TAIL_PREFIX_LENGTH}) that `body` ends with, and replaces exactly that
 * suffix with {@link REDACTED_MARKER} — the longest match is used so the fragment is removed cleanly,
 * not partially, when more than one secret's prefix would otherwise match different tail lengths.
 * `body` is otherwise returned unchanged: a body with no such tail is not touched at all.
 *
 * @complexity O(n * m): n secrets, each checked against `body`'s tail for every prefix length down to
 *   the floor (m, a secret's own length — small and fixed).
 *
 * Decides what {@link makeCredentialedRequest} returns as `bodyText`: the real response body with
 * {@link redactSecretSubstrings} applied when `token` is long enough that matching it is unambiguous,
 * or {@link BODY_WITHHELD_SHORT_TOKEN_MARKER} when it is not — see
 * {@link MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH}'s own doc for why. Gates on `token`'s own length only
 * (not the full `secrets` list): the built Authorization header is always at least as long as the
 * token plus its scheme prefix, so the token is the shorter, harder-to-scrub-safely secret of the two.
 *
 * When `bodyTruncated` is true, {@link redactTruncatedTail} runs on top of the normal redaction pass
 * — the egress size cap can cut the body off mid-secret, and a partial-secret tail like that never
 * matches {@link redactSecretSubstrings}'s whole-secret comparison. Never runs on a complete body:
 * there is no cut-off fragment to find, only a chance of matching something unrelated.
 *
 * @complexity O(1) below the length floor; {@link redactSecretSubstrings}'s own O(n * m) above it, plus
 *   {@link redactTruncatedTail}'s own cost when `bodyTruncated`.
 *
 * Every HTTP method this tool will send — mirrors `platform/http/types.ts`'s `HttpRequest.method`
 *  union exactly, so a value that passes this check always type-checks as one `httpClient.send()`
 *  itself accepts.
 *
 * Validates a caller-supplied absolute `url` and checks its origin against `allowedOrigins` — see
 * this file's header, "Per-credential host binding", for why this function IS the security boundary
 * that stops a request from ever reaching a host the credential's own saved state does not name.
 *
 * @throws {CredentialedRequestValidationError} `url` is empty, not a valid absolute URL, does not use
 *   http/https, embeds credentials (`user:pass@`), or resolves to an origin not in `allowedOrigins`.
 * @complexity O(n) in `allowedOrigins.length` (one `.includes()` check).
 *
 * One header entry's own validation — split out of {@link validateExtraHeaders} so that function's
 *  loop body stays a single call.
 *
 * Validates the optional caller-supplied extra headers. `undefined` (the field was omitted) is not
 * an error — it degrades to no extra headers.
 *
 * @throws {CredentialedRequestValidationError} `raw` is not a plain object of string values, or
 *   names a forbidden header (see {@link FORBIDDEN_REQUEST_HEADER_NAMES}).
 * @complexity O(n) in the number of supplied header entries.
 *
 * Validates the optional caller-supplied request body. `undefined` degrades to "no body" for every
 * method, including DELETE — some real APIs accept a DELETE body, and this tool does not second-guess
 * that.
 *
 * @throws {CredentialedRequestValidationError} `raw` is not a string, or exceeds
 *   {@link MAX_REQUEST_BODY_BYTES}.
 * @complexity O(1) — one `Buffer.byteLength` computation.
 *
 * The three shapes {@link buildAuthorizationHeader} can send for one connection — see
 *  {@link resolveAuthorizationScheme}'s own doc for the precedence order this discriminates.
 *  `"self-describing"`'s `scheme` is a plain `string`, not a closed literal union: it is whatever
 *  scheme word the matching plugin-declared rule names, and that rule set is meant to grow without
 *  this file changing — see `./auth-schemes.ts`'s header.
 *
 * Resolves which of the three shapes {@link buildAuthorizationHeader} sends for one connection, in
 * the exact precedence this module applies: (1) a self-describing scheme when
 * {@link detectSelfDescribingAuthScheme} (with the plugin-declared `schemes` — see this file's header,
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
 *
 * Builds the outbound `Authorization` header value for one connection, per
 *  {@link resolveAuthorizationScheme}'s precedence: a self-describing scheme when the token embeds
 *  one, HTTP Basic when a `username` is saved, Bearer otherwise. Never logged, and never returned
 *  from this module — used only as an outbound request header value.
 *
 *  Exported (2026-09-09) for the write-files tool's git-host calls (now the plugin provider's, which core hands this header) —
 *  the same per-credential auth-scheme precedence a `custom_credential_write_files` call must use,
 *  reused rather than re-derived so the scheme a future 401/403 there could report can never drift
 *  from the scheme this module actually sends.
 *
 *  `schemes` are the plugin-declared self-describing scheme rules (`./auth-schemes.ts`). This
 *  module's own entry points always pass the loaded set; an external caller that omits it (the
 *  git-host callers, whose tokens never embed a scheme word) gets Basic/Bearer only.
 *
 * @complexity O(r) scheme rules beyond {@link resolveAuthorizationScheme}'s own cost.
 *
 * The bare base64 payload {@link buildAuthorizationHeader} wraps in `Basic <payload>` for a
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
 *
 * The already-registered tool that can supply the one missing piece of state
 *  {@link buildAuthFailureDiagnostic}'s hint ever names — a saved username. Kept here as this
 *  module's own literal (`agent-tools.ts` has no exported id constant, only inline string literals
 *  for each tool's own `name`) and cross-checked against it by
 *  `__tests__/auth-failure-diagnostic.unit.test.ts`.
 *
 * A 401/403 outcome's structured explanation — see this file's header, "Authentication-failure
 *  diagnostics", for the honesty contract every field here is held to, and for why this interface
 *  `extends` the general {@link ToolFailureDiagnostic} contract rather than merely resembling it.
 *
 * Which scheme {@link buildAuthorizationHeader} actually sent for this call — never the header's
 *  own value, only which of the three shapes it took: a saved token's own self-describing scheme
 *  word (see this file's header, "Self-describing token schemes"), `"Basic"`, or
 *  `"Bearer"`. Typed as a plain `string`, not a closed literal union, because the self-describing
 *  case is driven by plugin-declared scheme rules (`./auth-schemes.ts`) — see
 *  {@link ResolvedAuthorizationScheme}'s own doc. This module's own "what failed" fact (facet 1 of
 *  the general contract — see that file's header for why facts are not modeled there).
 *
 * Whether this credential has a saved `username` at all — never the username's own value. This
 *  module's other "what failed" fact.
 *
 * Present ONLY for the one narrow, honestly-inferable case this module will ever suggest a fix
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
 *  assertion of the actual cause.
 *
 * Present exactly when `hint` is: {@link SET_USERNAME_TOOL_ID}, the one already-registered tool
 *  that can save the missing username `hint` describes. A pointer only — this module never calls
 *  it; see the general contract's own doc, "The one-cycle guard".
 *
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
 *
 * One audited call outcome — see this file's header, "Audit, never the secret", for exactly why
 *  these fields and no others.
 *
 * `0` means the request never got a response at all (DNS failure, timeout, or an `EgressPolicy`
 *  refusal) — distinct from any real HTTP status a provider could return.
 *
 * Byte length of the request body sent, `0` when none — a SIZE only, never the body itself.
 *
 * Present only when the guarded client refused the target: `EgressRefusedError.message` in full,
 *  including the resolved address the model is never shown. Hostname, address, and classification
 *  only — no URL path or query, no header, no token.
 *
 * Records exactly {@link CredentialedRequestAuditEntry}'s six fields — never the token, the
 *  Authorization header, or the request/response body.
 *
 * Default production audit sink: one structured line per call via an injected logger (defaults to
 * `console.log`), so every install gets a real, grep-able audit trail with zero additional wiring. A
 * durable/queryable store (a DB table, an admin UI) is a disclosed future improvement, not built in
 * this slice — see this file's header.
 *
 * @complexity O(1) per `record` call.
 *
 * Test double: keeps every recorded entry in memory, in order — lets a test assert on exactly what
 *  was audited without parsing log lines.
 *
 * The guarded outbound-HTTP seam (ADR-038) both functions in this module call through — built
 *  ONLY by a composition root; see this file's header, "This module never constructs an
 *  `HttpClientPort` itself."
 *
 * Defaults to {@link ConsoleCredentialedRequestAuditLog}.
 *
 * The self-describing token scheme rules for this workspace (see this file's header,
 *  "Self-describing token schemes"). Defaults to the workspace's installed, bundled-digest-trusted
 *  plugins (`loadCredentialSchemeRegistry`); the hermetic root and tests pass the bundled plugin's
 *  source rules instead.
 *
 * The scheme rules one call applies, loaded once at the entry point and passed down.
 *  @complexity One registry read (see `./auth-schemes.ts`).
 *
 * The non-decrypting half of credential resolution: finds the credential by label and computes its
 * allowed-origin set (`baseUrl` + `additionalHosts`, both plaintext), WITHOUT ever touching the
 * sealer. Used by {@link makeCredentialedRequest} itself for its own validation, and by
 * `tool-registrations.ts`'s DELETE confirmation gate to validate the target and render the dialog
 * BEFORE ever decrypting anything — a human's "no" should never have cost a decrypt.
 *
 * @throws {CustomCredentialNotFoundError} No row with this label exists in this workspace.
 * @throws {CredentialedRequestValidationError} `url` fails {@link resolveAllowedRequestUrl}.
 * @complexity O(n) in the workspace's own (small) credential-set count.
 *
 * Shared "find the credential or fail loudly" step both entry points use — never returns `null`,
 *  matching `store.ts`'s own `CustomCredentialNotFoundError` contract for a missing row (reused here
 *  keyed by label instead of id, the same conceptual "no such credential" outcome). DECRYPTS —
 *  callers that only need the allowed-origin set should use {@link resolveRequestTarget} instead.
 *
 * @throws {CustomCredentialNotFoundError} No row with this label exists in this workspace.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row exists but could not be decrypted —
 *   left to propagate uncaught, matching `resolveCustomCredentialByLabel`'s own documented contract.
 * @complexity O(n) in the workspace's own (small) credential-set count, plus one decrypt.
 *
 * {@link classifyCustomCredentialStatus}/{@link CustomCredentialVerificationResult}'s shared
 *  tri-state — never a plain boolean, same "unreachable must stay distinguishable from invalid"
 *  discipline `features/deployments/static-publish/verify.ts`'s own
 *  `PublishCredentialVerificationResult.status` doc establishes.
 *
 * Same three-way classification `features/deployments/static-publish/verify.ts`'s own
 *  `classifyProviderResponse` establishes for this codebase (see this file's header for why it is
 *  reused as logic, not imported): 2xx accepted, 401/403 affirmatively rejected, everything else —
 *  including a 3xx this module's policy deliberately never follows — folds into "unreachable".
 *
 * @complexity O(1).
 *
 * Builds {@link verifyCustomCredential}'s human-facing message for one classified outcome — kept
 *  separate from the classifier itself so wording changes never touch the classification logic.
 *
 * Present ONLY when `status === "invalid"` (an affirmative 401/403 rejection) — see this file's
 *  header, "Authentication-failure diagnostics". Absent for `"valid"`/`"unreachable"`: neither is an
 *  auth-scheme rejection, so there is nothing to diagnose.
 *
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
 *
 * A real send — the provider answered (any HTTP status), or this tool's own transport layer
 *  threw (see {@link CredentialedRequestTransportError}). `executed: true` is a fixed discriminant
 *  against {@link CredentialedRequestDeclinedResult}, so a caller of the WIRING layer (which may
 *  return either shape for a gated DELETE) can branch on one field regardless of method.
 *
 * Present ONLY when `status` is 401 or 403 — see this file's header, "Authentication-failure
 *  diagnostics". Additive alongside `bodyText`, which still carries the provider's own response
 *  body unsuppressed and unchanged; this field never replaces or reinterprets it.
 *
 * A gated call (DELETE) that did NOT run — the human declined, or never answered in time, or the
 *  run ended first. Never produced by {@link makeCredentialedRequest} itself (which has no gating
 *  logic at all) — only by `tool-registrations.ts`'s handler, before it ever calls this module.
 *
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
 * @throws {CredentialedRequestTransportError} The request could not be sent for a reason unrelated
 *   to the target (a DNS failure or connect timeout) — a real HTTP response, even an error one,
 *   resolves normally instead.
 * @throws {EgressRefusedError} The shared `HttpClientPort` (ADR-038) refused the target before ever
 *   connecting — a non-public resolved address on the first hop or any re-verified redirect hop, a
 *   disallowed scheme, or credentials embedded in the URL. Rethrown with its own identity intact
 *   (2026-09-10) rather than folded into {@link CredentialedRequestTransportError} — see that class's
 *   own doc for why the distinction is load-bearing at this function's caller.
 * @complexity O(1) beyond the credential resolution's own O(n) (see {@link resolveCredentialOrThrow})
 *   and the header validation's own O(n) in header count.
 *
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
 * A self-describing scheme (e.g. `<Scheme><macaroon>`) has the identical shape of gap, for the
 * identical reason: `connection.token` is the WHOLE stored string, scheme word and all (that is what
 * "self-describing" means — see this file's header, "Self-describing token schemes"), so it is
 * exactly as prefixed as `authorizationHeader` and never matches a response that reflects only the
 * bare value with no scheme word. {@link resolveAuthorizationScheme}'s own `value` field — the same
 * bare value {@link buildAuthorizationHeader} appends the scheme word to — is the one form this list
 * was missing (2026-09-05 fix; caught because a reflecting endpoint that hands back only the bare
 * macaroon is a completely ordinary error-body shape, not a hypothetical).
 *
 * Both additions are gated on the RESOLVED scheme (`basic`/`self-describing`), never on
 * `connection.username`'s truthiness or `connection.token`'s own content, so this list only ever
 * contains a form that was actually sent — a credential carrying both a self-describing token AND a
 * leftover saved username never sends Basic, so there is no Basic payload to leak or to list. See
 * this file's header, "The token never reaches the model", and {@link buildBasicAuthPayload}'s own
 * doc for why the Basic payload is derived rather than duplicated; the self-describing `value` is
 * read straight off {@link resolveAuthorizationScheme}'s own result for the same reason — never
 * re-parsed or string-sliced out of `connection.token` a second time.
 *
 * Extracted from {@link makeCredentialedRequest} (2026-09-03) so that function stays under the
 * repo's 9/9 complexity ceiling — the Basic-payload branch was its tenth.
 *
 * Every entry is matched as a SUBSTRING (see {@link redactResponseHeaders}), never by exact
 * equality.
 *
 * Written as an exhaustive three-way match on `resolvedScheme.kind`, not the earlier `!== "basic"`
 * shortcut: that shortcut is exactly what let the self-describing case silently fall through with
 * `bearer`'s (wrong) two-secret list for over a day — grouping two kinds under "not this one kind"
 * reads as "nothing extra needed" even when only one of the two actually has nothing extra to add.
 *
 * @complexity O(1).
 *
 * The audit-only detail a failed send adds: an egress refusal's FULL message, resolved address
 * included — the one place that address is kept once the model-facing copy drops it. Any other
 * failure adds nothing; its raw transport text is not audit material.
 *
 * @complexity O(1).
 */
import {
  ConsoleCredentialedRequestAuditLog as JiniConsoleAuditLog,
  InMemoryCredentialedRequestAuditLog as JiniMemoryAuditLog,
  CredentialNotFoundError,
  CredentialedRequestValidationError,
  makeCredentialedRequest as requestWithCredential,
  resolveRequestTarget as resolveCredentialTarget,
  verifyCustomCredential as verifyCredential,
  type AuthFailureDiagnostic,
  type CredentialedRequestAuditEntry,
  type CredentialedRequestDeps as JiniRequestDeps,
  type CredentialedRequestOptions,
  type CredentialedRequestExecutedResult,
  type CustomCredentialVerificationResult,
  type MakeCredentialedRequestInput as JiniRequestInput,
  type CredentialSchemeRule,
} from "@jini-ai/integrations/credentialed-http";
import { issueToolFailureDiagnostic } from "../../contracts/core/tool-failure-diagnostics.js";
// EgressRefusedError is a runtime import so REQUEST_POLICY preserves refusal identity; the barrel
// otherwise supplies types, and feature code must receive its guarded client from composition.
import { EgressRefusedError, type HttpClientPort } from "../../platform/http/index.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import { loadCredentialSchemeRegistry } from "./auth-schemes.js";
import { CustomCredentialNotFoundError, describeCredentialByLabel, resolveCustomCredentialByLabel } from "./store.js";
import type { CustomCredentialSetRepoPort } from "./types.js";

export {
  CredentialedRequestValidationError,
  CredentialedRequestTransportError,
} from "@jini-ai/integrations/credentialed-http";
export type {
  AuthFailureDiagnostic,
  CredentialedRequestAuditEntry,
  CredentialedRequestDeclinedResult,
  CredentialedRequestExecutedResult,
  CredentialedRequestOutcome,
  CustomCredentialCheckStatus,
  CustomCredentialVerificationResult,
} from "@jini-ai/integrations/credentialed-http";

/** Existing host audit port; entries contain metadata and safe refusal diagnostics only. */
export interface CredentialedRequestAuditPort {
  record(entry: CredentialedRequestAuditEntry): void;
}

/** Supply Tovu's log prefix while adapting the host logger to Jini's object arguments. */
export class ConsoleCredentialedRequestAuditLog implements CredentialedRequestAuditPort {
  private readonly audit: JiniConsoleAuditLog;

  constructor(log: (line: string) => void = (line) => console.log(line)) {
    this.audit = new JiniConsoleAuditLog({ prefix: "[custom-credentials]", log: ({ line }) => log(line) });
  }

  record(entry: CredentialedRequestAuditEntry): void {
    this.audit.record({ entry });
  }
}

/** Keep the existing composition/test audit port while Jini owns entry storage. */
export class InMemoryCredentialedRequestAuditLog implements CredentialedRequestAuditPort {
  private readonly audit = new JiniMemoryAuditLog();

  get entries(): CredentialedRequestAuditEntry[] { return this.audit.entries; }

  record(entry: CredentialedRequestAuditEntry): void {
    this.audit.record({ entry });
  }
}

export interface CredentialedRequestDeps {
  readonly repo: CustomCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly httpClient: HttpClientPort;
  readonly clock: Clock;
  readonly audit?: CredentialedRequestAuditPort;
  readonly loadAuthSchemes?: (ctx: { readonly workspaceId: string }) => Promise<readonly CredentialSchemeRule[]>;
}

export interface MakeCredentialedRequestInput extends JiniRequestInput {
  readonly headers?: unknown;
  readonly body?: unknown;
}

/** The describe path never decrypts; resolve uses the existing host AAD/store boundary. */
function adaptCredentialResolver(deps: Pick<CredentialedRequestDeps, "repo" | "sealer">) {
  return {
    describe: (input: { workspaceId: string; label: string }) => describeCredentialByLabel({ repo: deps.repo }, input),
    resolve: (input: { workspaceId: string; label: string }) => resolveCustomCredentialByLabel({ repo: deps.repo, sealer: deps.sealer }, input),
  };
}

/** Translate body/audit arguments without changing the guarded transport or plugin trust gates. */
function adaptRequestDeps(deps: CredentialedRequestDeps): JiniRequestDeps {
  const audit = deps.audit ?? new ConsoleCredentialedRequestAuditLog();
  return {
    resolver: adaptCredentialResolver(deps),
    // The host port keeps its request-only ABI; Jini's body already lives inside request.
    // Redirect policy comes from host composition. Refuse unsupported per-call overrides
    // rather than silently dropping an explicit error/manual directive at this security seam.
    httpClient: { send: ({ request }, optional = {}) => {
      if (optional.redirect !== undefined) throw new Error("credentialed HTTP adapter does not support per-request redirect controls");
      return deps.httpClient.send(request);
    } },
    clock: deps.clock,
    audit: { record: ({ entry }) => audit.record(entry) },
    // Keep installed-plugin digest trust checks in the host; generic scheme precedence needs no
    // provider catalog. One loaded rule set is shared by header building and failure diagnostics.
    schemeRegistry: {
      load: async (input) => deps.loadAuthSchemes
        ? deps.loadAuthSchemes(input)
        : (await loadCredentialSchemeRegistry(input)).rules,
    },
  };
}

/** Preserve the registered remedy pointer and in-process issuance identity for the recovery loop. */
// The remedy id is a pointer, never a callback: issuance uses the shared Jini owner so the recovery loop's
// one-cycle guard recognizes diagnostics it created rather than trusting provider response text.
function mapDiagnostic({ diagnostic }: { diagnostic: AuthFailureDiagnostic }): AuthFailureDiagnostic {
  return diagnostic.hint === undefined ? diagnostic : issueToolFailureDiagnostic({ diagnostic: {
    ...diagnostic,
    remedyToolId: "custom_credential_set_username",
  } }, {});
}

// An egress refusal is a caller-fixable target rejection, not a DNS/timeout crash. Preserve its
// instanceof identity so the tool layer can publish the safe reason instead of INTERNAL_ERROR.
const REQUEST_POLICY: CredentialedRequestOptions = {
  errorPolicy: {
    isEgressRefusal: ({ error }) => error instanceof EgressRefusedError,
    describeEgressRefusal: ({ error }) => error instanceof EgressRefusedError ? error.message : "",
  },
  diagnosticMapper: mapDiagnostic,
};

/** Keep host not-found identity and the Access Tokens remedy wording at the adapter boundary. */
function rethrowHostError(error: unknown): never {
  if (error instanceof CredentialNotFoundError) throw new CustomCredentialNotFoundError(error.message);
  if (error instanceof CredentialedRequestValidationError && error.message.includes("which is not one of this credential's saved hosts (")) {
    throw new CredentialedRequestValidationError({ message: `${error.message} — add it to this credential in the Access Tokens form first` });
  }
  throw error;
}

/** Validate a DELETE target before confirmation without opening the saved secret.
 * @throws Host not-found or package validation errors; no I/O beyond the workspace repo read.
 * @complexity O(workspace credentials) in the existing host store.
 */
// DELETE confirmation validates and renders its target without decryption: a human's "no" must not
// cost a secret read. The persisted base URL/additional hosts alone define what can be requested.
export async function resolveRequestTarget(
  deps: Pick<CredentialedRequestDeps, "repo">,
  input: { workspaceId: string; label: string; url: unknown }
): Promise<{ label: string; url: URL }> {
  try {
    return await resolveCredentialTarget({ resolver: {
      describe: (required) => describeCredentialByLabel({ repo: deps.repo }, required),
    }, input });
  } catch (error) { return rethrowHostError(error); }
}

/** Probe through the guarded port, retaining Tovu's diagnostic policy and host error identity.
 * @complexity O(workspace credentials) plus one bounded HTTP request.
 */
export async function verifyCustomCredential(
  deps: CredentialedRequestDeps,
  input: { workspaceId: string; label: unknown }
): Promise<CustomCredentialVerificationResult> {
  try { return await verifyCredential({ deps: adaptRequestDeps(deps), input }, REQUEST_POLICY); }
  catch (error) { return rethrowHostError(error); }
}

/** Execute an authorized request; Jini owns validation, header injection and response redaction.
 * @throws Validation/transport errors or the unchanged guarded egress refusal.
 * @complexity O(workspace credentials + bounded request/response bytes).
 */
// Tovu gates DELETE in tool-registrations.ts with MCP-UI confirmation; GET/POST/PUT/PATCH retain
// parity with site operations without a plan/confirm/execute ceremony. This adapter executes only
// after its caller's policy allows it and deliberately has no independent confirmation state.
export async function makeCredentialedRequest(
  deps: CredentialedRequestDeps,
  input: MakeCredentialedRequestInput
): Promise<CredentialedRequestExecutedResult> {
  const { headers, body, ...requiredInput } = input;
  try {
    return await requestWithCredential({ deps: adaptRequestDeps(deps), input: requiredInput }, { ...REQUEST_POLICY, headers, body });
  } catch (error) { return rethrowHostError(error); }
}
