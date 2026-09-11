/**
 * @file Shared `EgressPolicy` values (ADR-038) for outbound HTTPS calls this process does not fully
 * control the far end of (a mail provider's API host, an operator-typed custom-credential base
 * URL, an assistant-supplied image URL). {@link SINGLE_HOP_HTTPS_EGRESS_POLICY} is the original,
 * narrowest shape — a fixed-method call with no legitimate reason to ever follow a redirect.
 * {@link MEDIA_IMPORT_EGRESS_POLICY} and {@link CUSTOM_CREDENTIALS_EGRESS_POLICY} both widen exactly
 * one property of it (redirects) for a call shape that turned out to need them — see each policy's
 * own doc for why its consumer could not simply keep using the shared one.
 *
 * Before 2026-09-06 the shape now named {@link SINGLE_HOP_HTTPS_EGRESS_POLICY} was hand-copied at
 * three independent call sites — `server/runtime/composition/deps.ts`'s `mailHttpClientPolicy` and
 * `customCredentialsHttpClientPolicy`, and `server/runtime/composition/app.ts`'s inline literal
 * backing its own hermetic `customCredentialsHttpClient` — and `deps.ts`'s own comment already named
 * the risk ("Identical policy shape") without closing it: a future hardening (a shorter timeout, a
 * lower response cap) landing in one copy would silently miss the other two, on the exact egress
 * path (`custom_credential_make_request`) that accepts an arbitrary operator-typed base URL. One
 * named export, one place to change it. (`custom_credential_make_request` has since moved to its own
 * {@link CUSTOM_CREDENTIALS_EGRESS_POLICY}, 2026-09-10 — the mailer is this export's one remaining
 * consumer.)
 *
 * NOT a claim that every outbound-call site in this codebase should use one shared policy — a
 * consumer with genuinely different needs still authors its own `EgressPolicy` literal, as all three
 * exports below demonstrate. This module exists only for a shape multiple real call sites converge
 * on, not as a place every call site is expected to fit.
 *
 * Exported directly (not through `index.ts`'s barrel, which is deliberately types-only — see that
 * file's own header) because this is a concrete value only a composition root should reach for, the
 * same way `client.ts`'s `createDefaultHttpClient` is itself imported directly rather than through
 * the barrel.
 *
 * Architectural role: `platform/http` Tier-2 library, composition-root-facing. No dependencies
 * beyond its own package's `EgressPolicy` type.
 */
import type { EgressPolicy } from "./ports.js";

/**
 * A single, fixed-method HTTPS call to a specific endpoint with no legitimate reason to redirect:
 * denies private/loopback addresses, follows zero redirects, and bounds connect time and response
 * size. Used today for outbound mail-API calls (Resend) — see this file's own header for why this
 * used to be a hand-copied literal.
 *
 * `custom_credential_verify`/`custom_credential_make_request` used this same policy until
 * 2026-09-10, when a live GitHub-Actions-log-diagnosis incident showed a fixed-method,
 * zero-redirect policy does not fit every "operator-typed base URL" call after all: GitHub's own
 * Actions job-logs endpoint answers with a 302 to a signed, short-lived Azure Blob URL, and
 * `maxRedirects: 0` made that log structurally unreadable through this tool. That domain now has
 * its own {@link CUSTOM_CREDENTIALS_EGRESS_POLICY} below — see that policy's own doc for why it is
 * a separate export rather than a widening of this one (the same "a consumer with genuinely
 * different needs authors its own literal" rule {@link MEDIA_IMPORT_EGRESS_POLICY} already
 * follows, restated in this file's own header).
 */
export const SINGLE_HOP_HTTPS_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"],
  denyPrivateAddresses: true,
  devHostAllowlist: [],
  maxRedirects: 0,
  connectTimeoutMs: 10_000,
  maxResponseBytes: 1_000_000,
  maxDecompressedBytes: 1_000_000,
};

/**
 * {@link MEDIA_IMPORT_EGRESS_POLICY}'s response cap — the transport-level BACKSTOP, deliberately set
 * above `features/media-import`'s own accept limit (`@jini-ai/cms/media`'s `DEFAULT_MAX_UPLOAD_BYTES`,
 * 10 MiB, the same cap `uploadMedia` itself enforces) so the feature's own error message is the one a
 * caller normally sees, and this cap only fires for a response so far over the line that reading it
 * to the feature's own check would be wasted bandwidth.
 *
 * The two are NOT required to stay in lockstep and this file deliberately does not import the
 * feature's value to keep them so — `platform/**` is a Tier-2 library and may not depend on
 * `features/**` (`.dependency-cruiser.mjs`). Drift in either direction is harmless by construction:
 * the two caps only ever change WHICH of two rejections a caller gets, never whether an over-cap
 * response is accepted. A body whose BYTES this cap clips arrives flagged `bodyBytesTruncated`
 * (`client.ts`'s `capResponse`), and the feature refuses that outright rather than persisting a
 * corrupt image — so neither an equal, larger, nor smaller value here can produce a silently
 * truncated asset. The byte half's own flag, not the shared `bodyTruncated`: that one is the OR of
 * both body shapes, and this cap is crossed by the LOSSY text decode of any large image long before
 * the bytes reach it (2026-09-06, MI-01).
 */
const MEDIA_IMPORT_MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

/**
 * A single HTTPS GET fetching an IMAGE FILE from a URL the ASSISTANT supplied — today only
 * `features/media-import`'s `media_import_from_url`. Deliberately its own policy rather than a reuse
 * of {@link SINGLE_HOP_HTTPS_EGRESS_POLICY}, because this call shape differs from that one on three
 * axes that all matter, and this module's own header says a consumer with genuinely different needs
 * authors its own literal rather than widening the shared one (widening
 * `SINGLE_HOP_HTTPS_EGRESS_POLICY`'s caps would silently relax the mailer and
 * `custom_credential_make_request` paths too — the exact coupling that file exists to prevent):
 *
 * 1. **Redirects are expected, not suspicious.** A generated-image URL from an external MCP server
 *    is a CDN/object-store link (CloudFront, S3, a signed vendor URL), and those redirect as a
 *    matter of course. `maxRedirects: 0` would simply not work. Following up to three is safe here
 *    specifically because `client.ts`'s `sendWithPolicy` re-runs the FULL guard on every hop —
 *    scheme check, DNS resolution, address classification, re-pinning — so hop 3 is checked exactly
 *    as hop 0 was; a redirect to `169.254.169.254` or `127.0.0.1` is rejected at the hop that
 *    introduces it, not merely at the URL the caller typed. This is the property that makes an
 *    agent-supplied URL safe to follow at all.
 * 2. **The response is a file, not a JSON envelope.** 1 MB would reject the overwhelming majority of
 *    real images (the incident that motivated this tool involved a 3.29 MB 2048x1152 PNG). The cap
 *    here is `features/media-import`'s own {@link MEDIA_IMPORT_MAX_RESPONSE_BYTES} — slightly above
 *    what that feature will itself accept, so the feature's own cap is what a caller hits first and
 *    the policy cap only ever fires as a backstop. Either way the bytes are never silently
 *    truncated into a corrupt image: `client.ts` flags `bodyBytesTruncated`, and the feature refuses
 *    a byte-truncated response outright.
 * 3. **A file download is slower than an API call.** 10 s is a realistic timeout for a JSON endpoint
 *    and an unrealistic one for a multi-megabyte transfer from a cold CDN edge.
 *
 * Everything that makes the shared policy safe is unchanged and non-negotiable here: HTTPS only, and
 * `denyPrivateAddresses` with an EMPTY `devHostAllowlist` — no loopback, no RFC1918, no CGNAT, no
 * link-local, no cloud metadata, on any hop.
 */
export const MEDIA_IMPORT_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"],
  denyPrivateAddresses: true,
  devHostAllowlist: [],
  maxRedirects: 3,
  connectTimeoutMs: 20_000,
  maxResponseBytes: MEDIA_IMPORT_MAX_RESPONSE_BYTES,
  maxDecompressedBytes: MEDIA_IMPORT_MAX_RESPONSE_BYTES,
};

/**
 * `features/custom-credentials`'s own policy (2026-09-10) for `custom_credential_verify`/
 * `custom_credential_make_request` — an authenticated call through a saved credential
 * (`fly.io`, `github`, ...) to its own operator-typed `baseUrl`. Differs from
 * {@link SINGLE_HOP_HTTPS_EGRESS_POLICY} on exactly ONE axis, `maxRedirects` (everything else about
 * the call shape — a small JSON/text response, API-call-speed timeout — is unchanged, which is why
 * this is not a variant of {@link MEDIA_IMPORT_EGRESS_POLICY} either: that policy differs on THREE
 * axes because it fetches a multi-megabyte file, this one fetches neither more nor slower data than
 * before, only from one extra hop).
 *
 * **The live incident this closes.** GitHub's own Actions job-logs REST endpoint — a perfectly
 * ordinary, already-allowlisted API call — answers with a 302 to a signed, short-lived Azure Blob
 * Storage URL (`*.blob.core.windows.net`); this is simply how that endpoint is documented to work,
 * not an edge case. `maxRedirects: 0` made that response structurally unreadable through
 * `custom_credential_make_request`: the assistant received a naked 302 it could not act on and had
 * no allowlisted way to complete the fetch (the blob host is neither `github`'s own saved host nor
 * something an operator could sensibly be asked to add — a fresh, single-use signed URL is minted
 * per call). See `client.ts`'s own `canFollowRedirect` doc for why raising `maxRedirects` here is
 * safe to do WITHOUT widening the allowlist:
 *
 * 1. **GET only, enforced in `client.ts`, not by this policy.** `EgressPolicy` has no method axis —
 *    `sendWithPolicy` gates redirect-following to `request.method === "GET"` unconditionally, so
 *    raising `maxRedirects` here cannot let a POST/PUT/PATCH/DELETE `custom_credential_make_request`
 *    call auto-replay its body against a redirect target. A non-GET call that hits a 3xx gets the
 *    raw response back, exactly as it did before this policy existed.
 * 2. **Every hop is re-verified from scratch.** `sendWithPolicy` re-runs the FULL guard — scheme,
 *    DNS resolution, address classification, re-pinning — on the redirect target before connecting,
 *    the same property {@link MEDIA_IMPORT_EGRESS_POLICY}'s own doc explains: a redirect to
 *    `169.254.169.254` or a loopback address is rejected at the hop that introduces it, never
 *    merely at the URL this tool's caller typed.
 * 3. **`Authorization` is stripped on any cross-origin hop** (`client.ts`'s `SENSITIVE_HEADERS`,
 *    matched case-insensitively) — the credential's own injected header never reaches a host other
 *    than the one this process originally authenticated to.
 * 4. **The redirect target does NOT need to be on the credential's own saved-host allowlist, and
 *    that is intentional, not a gap.** `credentialed-request.ts`'s `resolveAllowedRequestUrl` checks
 *    only the ORIGINAL caller-supplied `url` against the credential's `baseUrl`/`additionalHosts`
 *    before any request is sent — it is never consulted again for a redirect hop, and this policy
 *    must not widen the GLOBAL scheme/address allowlist to `*.blob.core.windows.net` (that would
 *    grant read access to the whole of Azure Blob Storage, considered and rejected). The security
 *    argument for skipping BOTH allowlists on the redirect hop is (1) + (3) above together: the
 *    target carries no credential (auth was already stripped), and the URL itself was not
 *    attacker-supplied — it was minted by the API this credential was already trusted to call, in
 *    direct response to a request this tool already allowlist-checked. A host that never receives
 *    the secret and was never reachable except as this API's own answer needs no allowlist entry of
 *    its own.
 *
 * `maxResponseBytes`/`maxDecompressedBytes`/`connectTimeoutMs` are left at
 * {@link SINGLE_HOP_HTTPS_EGRESS_POLICY}'s own values on purpose: this tool's call shape (an API
 * response, not a file download) has not changed, only whether one extra, already-trusted hop may
 * be followed to reach it.
 */
export const CUSTOM_CREDENTIALS_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"],
  denyPrivateAddresses: true,
  devHostAllowlist: [],
  maxRedirects: 3,
  connectTimeoutMs: 10_000,
  maxResponseBytes: 1_000_000,
  maxDecompressedBytes: 1_000_000,
};
