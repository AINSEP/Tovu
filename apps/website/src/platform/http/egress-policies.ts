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
