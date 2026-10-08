import { assertSafeUserFacingUrl as assertJiniUserFacingUrl, createOAuthUrlGuard, defaultOAuthMessages, OAuthError as JiniOAuthError, type OAuthDiscoveryPolicy, type OAuthUrlGuard } from "@jini-ai/oauth";
import { isBlockedExternalApiHostname, isLoopbackApiHost } from "@jini-ai/platform/net";

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
 * The block-list itself is not reimplemented. `@jini-ai/platform/net`
 * already owns loopback/RFC1918/link-local/CGNAT/multicast classification and is exercised by its
 * own parity tests; a second copy here would be a second thing to keep correct.
 *
 * The legacy testing/DB seam below checks URL syntax and literal host classification.
 * Jini consumers use createTovuOAuthHttpPorts instead: r01's guarded HTTP port validates and pins
 * DNS at connection time, closing the rebinding gap without hiding transport policy in OAuth.
 */

/** `http` is permitted ONLY for loopback, so an operator can develop against a local authorization
 *  server without the module offering a plaintext-token path to anywhere else. */
function assertSafeUrl(raw: string, kind: "provider endpoint" | "provider-supplied link"): URL {
  // The legacy testing/DB seam permits loopback explicitly; production gets the default-closed factory below.
  const guard = createTovuOAuthGuard({}, { allowLoopbackHttp: true });
  try {
    return kind === "provider-supplied link"
      ? assertJiniUserFacingUrl({ raw, guard })
      : guard.assertSafeUrl({ raw, label: "provider endpoint" });
  } catch (error) {
    if (!(error instanceof JiniOAuthError)) throw error;
    // Legacy wrappers name their own subject. Strip only the fixed duplicate subject prefixes.
    const message = error.message.replace("provider endpoint: provider endpoint", "provider endpoint")
      .replace("provider-supplied link: provider endpoint", "provider-supplied link");
    throw new OAuthError({ code: error.code, message, operatorAction: error.operatorAction }, { cause: error.cause });
  }
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
      throw new OAuthError({ code: error.code, message: `${label}: ${error.message}`,
        operatorAction: error.operatorAction }, { cause: error });
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
  return assertSafeUrl(raw, "provider-supplied link");
}

/** Tovu endpoint policy for Jini OAuth. The guard and pinned transport are separate ports because
 * a synchronous hostname check cannot prevent DNS rebinding at connection time.
 * Local plaintext OAuth is an explicit development choice, never a library fallback.
 * @complexity O(n) in URL length; no I/O.
 */
export function createTovuOAuthGuard(_required: Record<string, never>, optional: { allowLoopbackHttp?: boolean } = {}): import("@jini-ai/oauth").OAuthUrlGuard {
  return createOAuthUrlGuard({
    assertAllowed({ url, label }) {
      const hostname = url.hostname.toLowerCase();
      if (!isLoopbackApiHost({ hostname }) && isBlockedExternalApiHostname({ hostname })) {
        throw new JiniOAuthError({ code: "OAUTH_UNSAFE_ENDPOINT",
          message: `${label}: provider endpoint resolves to an internal address, which is not allowed`,
          operatorAction: "Point this provider at a publicly reachable authorization server." });
      }
    },
  }, { allowLoopbackHttp: optional.allowLoopbackHttp === true });
}

/** Adapts r01's canonical guarded HTTP port to OAuth's fetch ABI. Redirects fail before credentials
 * cross origins; caller cancellation and the 15-second idle budget cover the complete body read.
 * A clipped body is refused rather than parsed as a complete token or metadata response.
 * The transport and response bounds rationale lives in Jini/packages/platform/src/http/guarded/.
 * @complexity O(n) in the bounded response body; one guarded outbound request.
 */
export function createTovuOAuthHttpPorts(
  { http }: { http: import("@jini-ai/core/primitives").HttpClientPort },
  optional: { allowLoopbackHttp?: boolean } = {},
): import("@jini-ai/oauth").OAuthHttpPorts {
  return {
    guard: createTovuOAuthGuard({}, optional),
    async fetchFn({ url }, init = {}) {
      // OAuth emits only GET/POST and string form/JSON bodies. Refuse unsupported requests so an
      // accidental new caller cannot silently drop a method or credential-bearing body.
      const method = init.method ?? "GET";
      if (method !== "GET" && method !== "POST") throw new TypeError("unsupported OAuth request method");
      if (init.body !== undefined && typeof init.body !== "string") throw new TypeError("OAuth request body must be a string");
      if (url instanceof Request) throw new TypeError("OAuth URL must be an explicit URL");
      const response = await http.send({ request: {
        url: String(url), method, headers: Object.fromEntries(new Headers(init.headers).entries()),
        idleTimeoutMs: 15_000, maxResponseBytes: 64 * 1024,
        ...(init.body === undefined ? {} : { body: init.body }),
        ...(init.signal == null ? {} : { signal: init.signal }),
      } }, { redirect: "error" });
      if (response.bodyTruncated) throw new JiniOAuthError({ code: "OAUTH_MALFORMED_RESPONSE",
        message: "the OAuth response exceeded the outbound response limit",
        operatorAction: "This provider's OAuth endpoint returned an oversized response." });
      // Fetch forbids bodies on 204/205/304, even when the native port returns an empty string.
      return new Response([204, 205, 304].includes(response.status) ? null : response.bodyText,
        { status: response.status, headers: { ...response.headers } });
    },
  };
}

/** Tovu copy; the protocol and reserved-parameter protections live in Jini's OAuth package. */
export const tovuOAuthMessages = {
  ...defaultOAuthMessages,
  reservedAuthorizationParameter: ({ parameter }: { readonly parameter: string }) =>
    `'${parameter}' is set by Tovu and cannot be overridden for this provider`,
  registrationRejectedAction: "This server refused to register Tovu as a client — check its OAuth requirements, or supply a client id by hand.",
};

/** Bind discovered endpoints to the exact issuer while retaining the host's explicit loopback
 * development exception. Safe URL syntax alone cannot prevent credential exfiltration to a
 * different public origin. The scheme and private-host decisions still belong to the guard. */
export function createTovuIssuerBoundDiscoveryPolicy({ guard }: { readonly guard: OAuthUrlGuard }): OAuthDiscoveryPolicy {
  return {
    assertMetadata({ issuer, document }) {
      const reject = (message: string): never => {
        throw new JiniOAuthError({ code: "OAUTH_UNSAFE_ENDPOINT", message,
          operatorAction: "Check the authorization server issuer and discovery endpoints before connecting." });
      };
      if (document.issuer !== undefined && document.issuer !== issuer)
        reject("OAuth metadata issuer does not equal the requested issuer");
      const origin = guard.assertSafeUrl({ raw: issuer, label: "authorization server issuer" }).origin;
      for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "device_authorization_endpoint"]) {
        const raw = document[key];
        if (raw === undefined || raw === null) continue;
        if (typeof raw !== "string") { reject(`OAuth metadata ${key} is not an absolute URL`); continue; }
        const endpoint = guard.assertSafeUrl({ raw, label: `discovered ${key.replace(/_/g, " ")}` });
        if (endpoint.origin !== origin || endpoint.username || endpoint.password)
          reject(`OAuth metadata ${key} does not share the issuer's origin`);
      }
    },
  };
}

/** Keep Tovu's Settings route wording while retaining Jini's typed terminal/retryable errors.
 * Provider bodies are never copied into an operator action; only fixed library copy is adapted. */
export async function withTovuOAuthCopy<T>({ call }: { readonly call: () => Promise<T> }): Promise<T> {
  try { return await call(); }
  catch (caught) {
    // Guarded transport clipping is already a structured protocol error. Jini wraps fetch
    // failures as unreachable, so retain the bounded-response verdict rather than its wrapper.
    const error = caught instanceof JiniOAuthError && caught.code === "OAUTH_PROVIDER_UNREACHABLE"
      && caught.cause instanceof JiniOAuthError && caught.cause.code === "OAUTH_MALFORMED_RESPONSE"
      ? caught.cause : caught;
    if (!(error instanceof JiniOAuthError)) throw error;
    const operatorAction = error.operatorAction.replace("the connection settings", "Settings → External MCP");
    if (operatorAction === error.operatorAction) throw error;
    throw new JiniOAuthError({ code: error.code, message: error.message, operatorAction }, {
      cause: error.cause, providerErrorCode: error.providerErrorCode, retryAfterSeconds: error.retryAfterSeconds,
    });
  }
}
