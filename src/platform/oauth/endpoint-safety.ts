import { isBlockedExternalApiHostname, isLoopbackApiHost } from "@jini-ai/agent-runtime";

import { OAuthError } from "./errors.js";

/**
 * @file Outbound-URL safety for `src/platform/oauth/`.
 *
 * Two different trust levels meet in this module and they get two different functions, because
 * collapsing them would apply the weaker rule to the more dangerous input:
 *
 * - {@link assertSafeProviderEndpoint} guards an endpoint an OPERATOR configured. That is a
 *   privileged, authenticated act, so the bar is "don't let a mis-typed or hostile provider
 *   descriptor turn Tovu into an SSRF proxy into its own network".
 * - {@link assertSafeUserFacingUrl} guards a URL the PROVIDER sent back — RFC 8628's
 *   `verification_uri` and `verification_uri_complete`. That string is rendered to an operator as
 *   something to click. It is attacker-controlled the moment a provider is compromised or
 *   impersonated, so `javascript:`, `data:` and friends must never survive this function.
 *
 * The block-list itself is not reimplemented. `@jini-ai/agent-runtime`'s `connection-guard.ts`
 * already owns loopback/RFC1918/link-local/CGNAT/multicast classification and is exercised by its
 * own parity tests; a second copy here would be a second thing to keep correct.
 *
 * DNS-level pinning (`validateBaseUrlResolved` + `pinnedFetch`) is deliberately NOT applied. It
 * would close a rebinding gap, but it also replaces `fetch` with a raw `node:http` client, and an
 * OAuth token endpoint is an operator-configured origin rather than request-body input — the same
 * reasoning `connectors/composio-key-probe.ts` records for not importing the SSRF guard it does not
 * need. This is written down so a future reviewer sees a decision rather than an omission.
 */

/** `http` is permitted ONLY for loopback, so an operator can develop against a local authorization
 *  server without the module offering a plaintext-token path to anywhere else. */
function assertSafeUrl(raw: string, kind: "provider endpoint" | "provider-supplied link"): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new OAuthError("OAUTH_UNSAFE_ENDPOINT", `${kind} is not a valid absolute URL`, {
      operatorAction: "Check the OAuth endpoints configured for this provider.",
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  const loopback = isLoopbackApiHost(hostname);

  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new OAuthError("OAUTH_UNSAFE_ENDPOINT", `${kind} must use https (http is permitted only for loopback)`, {
      operatorAction: "Use an https:// URL for this provider.",
    });
  }
  if (!loopback && isBlockedExternalApiHostname(hostname)) {
    throw new OAuthError("OAUTH_UNSAFE_ENDPOINT", `${kind} resolves to an internal address, which is not allowed`, {
      operatorAction: "Point this provider at a publicly reachable authorization server.",
    });
  }
  return parsed;
}

/**
 * Validates an operator-configured OAuth endpoint before Tovu sends anything to it.
 *
 * @param raw - The configured absolute URL.
 * @param label - Which endpoint, for the message (`"token endpoint"`, `"authorization endpoint"`).
 * @returns The parsed URL, so the caller uses the value that was validated rather than re-parsing.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` on a non-absolute, non-https, or internal-address URL.
 * @complexity O(n) in the URL length.
 */
export function assertSafeProviderEndpoint(raw: string, label: string): URL {
  try {
    return assertSafeUrl(raw, "provider endpoint");
  } catch (error) {
    if (error instanceof OAuthError) {
      throw new OAuthError(error.code, `${label}: ${error.message}`, {
        operatorAction: error.operatorAction,
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Validates a URL the PROVIDER supplied that will be shown to an operator as a link.
 *
 * Stricter than {@link assertSafeProviderEndpoint} in one way that matters: credentials embedded in
 * the URL (`https://user:pass@host/...`) are refused. A device-flow verification link is pasted or
 * clicked by a human, and an embedded userinfo component is both a phishing primitive and a way to
 * make a hostile host look like a trusted one in a truncated UI.
 *
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT`.
 * @complexity O(n) in the URL length.
 */
export function assertSafeUserFacingUrl(raw: string): URL {
  const parsed = assertSafeUrl(raw, "provider-supplied link");
  if (parsed.username !== "" || parsed.password !== "") {
    throw new OAuthError("OAUTH_UNSAFE_ENDPOINT", "provider-supplied link embeds credentials in the URL", {
      operatorAction: "This provider's device-authorization response is malformed — do not open the link.",
    });
  }
  return parsed;
}
