import type { ISODateTime } from "@jini-ai/cms/core";

import { assertSafeProviderEndpoint, assertSafeUserFacingUrl } from "./endpoint-safety.js";
import { mapProviderErrorCode, OAuthError } from "./errors.js";
import type { OAuthClient, OAuthClock, OAuthFetch, OAuthProviderDescriptor, OAuthTokenSet } from "./ports.js";
import { DEFAULT_TOKEN_REQUEST_TIMEOUT_MS, requestOAuthToken, type TokenRequestDeps } from "./token-endpoint.js";

/**
 * @file The Device Authorization Grant (RFC 8628) — a FIRST-CLASS path, not a fallback.
 *
 * Tovu is self-hosted. A large share of installs run behind a router, on a laptop, or on an
 * internal network with no publicly reachable callback URL, and for those the authorization-code
 * grant cannot work at all — there is nowhere for the provider to redirect to. The device grant
 * needs no callback route, no public origin, and no cross-origin return leg: the operator gets a
 * short code and a URL, opens it anywhere (including on their phone), and this process polls.
 *
 * It is also the only mechanism that is safe to surface inside a chat surface. Tovu's MCP-UI
 * surface is a sandboxed iframe whose return leg cannot carry an OAuth redirect, which is why an
 * in-chat authorization-code flow is rejected outright. A user code and a link have no return leg
 * to carry, so rendering them is not a boundary question.
 *
 * ## Polling is the one retryable thing in this module
 *
 * {@link pollDeviceAuthorizationOnce} performs exactly ONE poll and reports the outcome. It does
 * not loop, and it does not sleep. RFC 8628 §3.5's `authorization_pending` and `slow_down` come
 * back as `OAuthError` with `retryable: true` and a suggested interval; everything else is
 * terminal. Keeping the loop out of this module is what lets the caller decide whether polling is
 * driven by an admin UI's timer, by a route the browser calls, or by a test — and it keeps the
 * "never retry a terminal OAuth failure" rule enforceable in one place instead of hidden inside a
 * loop's catch block.
 */

/** RFC 8628 §3.2 default when the server sends no `interval`. */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
/** A server asking us to poll less often than this is treated as asking for the ceiling. Bounds the
 *  worst case where a hostile or broken server returns an enormous interval and wedges the flow. */
const MAX_POLL_INTERVAL_SECONDS = 60;
/** Ceiling on `expires_in` for the device code itself, in case a server omits or inflates it. */
const MAX_DEVICE_CODE_LIFETIME_SECONDS = 30 * 60;
const MAX_RESPONSE_BYTES = 16 * 1024;

/** One started device authorization. `deviceCode` is the secret half; everything else is safe to
 *  render to an operator. */
export interface DeviceAuthorization {
  /** SECRET. Sent on every poll, never rendered, never logged. */
  readonly deviceCode: string;
  /** The short code the operator types on the provider's page. */
  readonly userCode: string;
  /** Where the operator goes. Validated by {@link assertSafeUserFacingUrl} before it is returned. */
  readonly verificationUri: string;
  /** RFC 8628 §3.2's optional pre-filled variant, or `null`. Also safety-validated. */
  readonly verificationUriComplete: string | null;
  readonly expiresAt: ISODateTime;
  /** Seconds the caller should wait between polls, already clamped. */
  readonly intervalSeconds: number;
}

export interface DeviceAuthorizationDeps {
  readonly provider: OAuthProviderDescriptor;
  readonly clock: OAuthClock;
  readonly fetchFn?: OAuthFetch;
}

export interface BeginDeviceAuthorizationInput {
  readonly client: OAuthClient;
  readonly scopes?: readonly string[];
  readonly timeoutMs?: number;
}

interface RawDeviceAuthorizationResponse {
  device_code?: unknown;
  user_code?: unknown;
  verification_uri?: unknown;
  verification_url?: unknown;
  verification_uri_complete?: unknown;
  expires_in?: unknown;
  interval?: unknown;
  error?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", `the device authorization response is missing '${field}'`, {
      operatorAction: "This provider's device-authorization endpoint is not RFC 8628 compliant.",
    });
  }
  return value;
}

/** Clamps a server-supplied seconds value into `[min, max]`, defaulting a non-numeric one. */
function clampSeconds(raw: unknown, fallback: number, min: number, max: number): number {
  const seconds = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(Math.max(Math.ceil(seconds), min), max);
}

/**
 * Starts a device authorization (RFC 8628 §3.1–3.2).
 *
 * @returns The user code, verification URL, poll interval, and the secret device code.
 * @throws {OAuthError} `OAUTH_UNSUPPORTED_GRANT` when the descriptor declares no device endpoint,
 *   `OAUTH_PROVIDER_UNREACHABLE` on a timeout or transport failure (bounded, never retried),
 *   `OAUTH_MALFORMED_RESPONSE` on a non-compliant body, `OAUTH_UNSAFE_ENDPOINT` when the server's
 *   own `verification_uri` fails the user-facing-link check.
 * @complexity O(1) — one bounded outbound request.
 */
export async function beginDeviceAuthorization(
  deps: DeviceAuthorizationDeps,
  input: BeginDeviceAuthorizationInput,
): Promise<DeviceAuthorization> {
  if (!deps.provider.supportedGrants.includes("device_code") || !deps.provider.deviceAuthorizationEndpoint) {
    throw new OAuthError("OAUTH_UNSUPPORTED_GRANT", `provider '${deps.provider.providerId}' does not support the device grant`, {
      operatorAction: "Connect this provider from Settings using the browser redirect flow instead.",
    });
  }

  const endpoint = assertSafeProviderEndpoint(deps.provider.deviceAuthorizationEndpoint, "device authorization endpoint");
  const scopes = input.scopes ?? deps.provider.defaultScopes;
  const params: Record<string, string> = { client_id: input.client.clientId };
  if (scopes.length > 0) params.scope = scopes.join(" ");
  if (input.client.authMethod === "client_secret_post" && input.client.clientSecret) {
    params.client_secret = input.client.clientSecret;
  }

  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(endpoint.toString(), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new OAuthError("OAUTH_PROVIDER_UNREACHABLE", `could not reach the device authorization endpoint at ${endpoint.host}`, {
      operatorAction: "Check network access to this provider, then start the connection again. Nothing was retried automatically.",
      cause,
    });
  }

  const body = parseDeviceResponse(await readBounded(response));
  if (!response.ok || typeof body.error === "string") {
    const providerErrorCode = typeof body.error === "string" ? body.error : undefined;
    throw new OAuthError(providerErrorCode ? mapProviderErrorCode(providerErrorCode) : "OAUTH_PROVIDER_REJECTED", `the authorization server refused the device authorization request (HTTP ${response.status})`, {
      operatorAction: "Check this provider's client id and scopes, then start the connection again.",
      ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
    });
  }

  // `verification_url` is Google's long-standing pre-RFC spelling and is still emitted by several
  // providers; accepted for the same reason `composio-callback.ts` accepts four spellings of its
  // connection id — silently dropping it would fail with a confusing "missing field".
  const verificationUri = assertSafeUserFacingUrl(
    requiredString(body.verification_uri ?? body.verification_url, "verification_uri"),
  ).toString();
  const completeRaw = body.verification_uri_complete;
  const verificationUriComplete =
    typeof completeRaw === "string" && completeRaw !== "" ? assertSafeUserFacingUrl(completeRaw).toString() : null;

  const lifetimeSeconds = clampSeconds(body.expires_in, MAX_DEVICE_CODE_LIFETIME_SECONDS, 30, MAX_DEVICE_CODE_LIFETIME_SECONDS);
  return {
    deviceCode: requiredString(body.device_code, "device_code"),
    userCode: requiredString(body.user_code, "user_code"),
    verificationUri,
    verificationUriComplete,
    expiresAt: new Date(Date.parse(deps.clock.nowIso()) + lifetimeSeconds * 1000).toISOString(),
    intervalSeconds: clampSeconds(body.interval, DEFAULT_POLL_INTERVAL_SECONDS, 1, MAX_POLL_INTERVAL_SECONDS),
  };
}

export interface PollDeviceAuthorizationInput {
  readonly client: OAuthClient;
  readonly deviceCode: string;
  /** The authorization's own deadline, from {@link DeviceAuthorization.expiresAt}. Checked locally
   *  so an abandoned flow stops costing outbound requests even if the provider keeps answering. */
  readonly expiresAt: ISODateTime;
  readonly timeoutMs?: number;
}

/**
 * Performs ONE poll of the token endpoint for a device authorization (RFC 8628 §3.4).
 *
 * Does not loop and does not sleep — see this file's header for why the loop belongs to the caller.
 *
 * @returns The token set once the operator has approved.
 * @throws {OAuthError} `retryable: true` for `OAUTH_AUTHORIZATION_PENDING` and `OAUTH_SLOW_DOWN`
 *   (with `retryAfterSeconds` when the server supplied one); terminal for `OAUTH_EXPIRED_TOKEN`,
 *   `OAUTH_ACCESS_DENIED`, and everything {@link requestOAuthToken} raises.
 * @complexity O(1) — one bounded outbound request, or none when already expired.
 */
export async function pollDeviceAuthorizationOnce(
  deps: DeviceAuthorizationDeps & TokenRequestDeps,
  input: PollDeviceAuthorizationInput,
): Promise<OAuthTokenSet> {
  if (Date.parse(deps.clock.nowIso()) >= Date.parse(input.expiresAt)) {
    throw new OAuthError("OAUTH_EXPIRED_TOKEN", "the device authorization expired before it was approved", {
      operatorAction: "Start the connection again to get a fresh code.",
      providerErrorCode: "expired_token",
    });
  }

  return requestOAuthToken(deps, {
    tokenEndpoint: deps.provider.tokenEndpoint,
    client: input.client,
    params: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: input.deviceCode },
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

/** Byte-bounded body read, same reasoning as `token-endpoint.ts`'s. */
async function readBounded(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new OAuthError("OAUTH_MALFORMED_RESPONSE", `the device authorization response exceeded ${MAX_RESPONSE_BYTES} bytes`, {
          operatorAction: "This provider's device-authorization endpoint is not behaving like an RFC 8628 endpoint.",
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseDeviceResponse(text: string): RawDeviceAuthorizationResponse {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as RawDeviceAuthorizationResponse;
  } catch (cause) {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", "the device authorization endpoint did not return a JSON object", {
      operatorAction: "Check that the device authorization endpoint URL is correct.",
      cause,
    });
  }
}
