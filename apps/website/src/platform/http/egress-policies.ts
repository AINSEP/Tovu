/**
 * @file Shared `EgressPolicy` values (ADR-038) for a specific, common outbound-call shape: a
 * fixed-method HTTPS request to an endpoint this process does not fully control (a mail provider's
 * API host, or an operator-typed custom-credential base URL), where there is no legitimate reason to
 * ever follow a redirect.
 *
 * Before 2026-09-06 this exact 7-field object was hand-copied at three independent call sites —
 * `server/runtime/composition/deps.ts`'s `mailHttpClientPolicy` and
 * `customCredentialsHttpClientPolicy`, and `server/runtime/composition/app.ts`'s inline literal
 * backing its own hermetic `customCredentialsHttpClient` — and `deps.ts`'s own comment already named
 * the risk ("Identical policy shape") without closing it: a future hardening (a shorter timeout, a
 * lower response cap) landing in one copy would silently miss the other two, on the exact egress
 * path (`custom_credential_make_request`) that accepts an arbitrary operator-typed base URL. One
 * named export, one place to change it.
 *
 * NOT a claim that every outbound-call site in this codebase should use this policy — a consumer
 * with genuinely different needs (a longer timeout, redirects actually expected) still authors its
 * own `EgressPolicy` literal. This module exists only for the specific shape multiple real call
 * sites already converged on independently.
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
 * size. Used today for outbound mail-API calls (Resend) and for `custom_credential_verify`/
 * `custom_credential_make_request`'s calls against an operator-typed base URL — see this file's own
 * header for why those independently converged on the identical shape.
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
