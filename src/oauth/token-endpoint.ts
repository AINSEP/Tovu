import type { ISODateTime } from "@jini-ai/cms/core";

import { assertSafeProviderEndpoint } from "./endpoint-safety.js";
import { mapProviderErrorCode, OAuthError } from "./errors.js";
import type { OAuthClient, OAuthClock, OAuthFetch, OAuthTokenSet } from "./ports.js";

/**
 * @file The single POST every grant in this module ends at — authorization-code exchange, device-code
 * polling, and refresh all funnel through {@link requestOAuthToken}.
 *
 * One function rather than three because RFC 6749 §5.1/§5.2 defines ONE response shape and ONE
 * error shape for all of them, and three copies of that parser would be three places for a
 * `expires_in`-handling bug to hide. What differs between the grants is only the form body, which
 * the callers own.
 *
 * ## Bounded, and non-retrying, by construction
 *
 * - The request carries an `AbortSignal.timeout`. A slow or unreachable provider fails the
 *   operator's foreground action fast rather than hanging a spinner — the debate's Q3-e position,
 *   and the opposite of `mcp-federation/bootstrap.ts`'s deliberate boot-time fail-open, because
 *   nobody asked for a federated server at boot whereas somebody is watching this one.
 * - The response body is read through a BYTE-BOUNDED reader. `response.json()` on a hostile or
 *   broken endpoint will happily buffer until the process dies; a token response is a few hundred
 *   bytes, so anything past {@link MAX_RESPONSE_BYTES} is a malformed response, not a big one.
 * - Redirects are refused. A 302 from a token endpoint would carry the client credentials in the
 *   form body to a host that was never validated.
 * - Nothing here retries. See `errors.ts` for why a code exchange is not safely repeatable.
 */

/** Generous for a JSON token response, small enough that a hostile stream cannot exhaust memory. */
const MAX_RESPONSE_BYTES = 64 * 1024;
/** A human is waiting on this. Long enough for a slow but working provider, short enough that a
 *  dead one is reported while the operator still has the tab open. */
export const DEFAULT_TOKEN_REQUEST_TIMEOUT_MS = 15_000;

export interface TokenRequestDeps {
  readonly clock: OAuthClock;
  /** Defaults to global `fetch`, matching `composio-key-probe.ts`'s injection shape. */
  readonly fetchFn?: OAuthFetch;
}

export interface TokenRequestInput {
  readonly tokenEndpoint: string;
  readonly client: OAuthClient;
  /** The grant-specific form body. `client_id`/`client_secret` are added here per `client.authMethod`. */
  readonly params: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

/**
 * Reads at most `maxBytes` of a response body as UTF-8, aborting the stream past that.
 *
 * @throws {OAuthError} `OAUTH_MALFORMED_RESPONSE` when the body exceeds the cap.
 * @complexity O(n) in bytes read, hard-capped at `maxBytes`.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OAuthError("OAUTH_MALFORMED_RESPONSE", `the authorization server's response exceeded ${maxBytes} bytes`, {
          operatorAction: "This provider's token endpoint is not behaving like an OAuth 2.0 endpoint.",
        });
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

/** Builds the form body and headers for `client.authMethod`. Kept separate so the three grants
 *  cannot each get client authentication subtly different. */
function applyClientAuth(
  client: OAuthClient,
  params: Record<string, string>,
  headers: Record<string, string>,
): void {
  if (client.authMethod === "client_secret_basic") {
    const encoded = Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret ?? "")}`).toString("base64");
    headers.authorization = `Basic ${encoded}`;
    return;
  }
  params.client_id = client.clientId;
  if (client.authMethod === "client_secret_post" && client.clientSecret) {
    params.client_secret = client.clientSecret;
  }
}

/** The subset of RFC 6749 §5.1 this module consumes, after `JSON.parse` and before validation. */
interface RawTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
  interval?: unknown;
}

function parseJsonBody(text: string): RawTokenResponse {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as RawTokenResponse;
  } catch (cause) {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", "the authorization server did not return a JSON object", {
      operatorAction: "Check that the token endpoint URL points at an OAuth 2.0 token endpoint.",
      cause,
    });
  }
}

/**
 * Turns an RFC 6749 §5.2 error body into an {@link OAuthError}.
 *
 * `error_description` is read for its `interval` sibling only and is never placed in `message`: it
 * is free text from a third party that this codebase renders into a browser and hands to a model.
 * The closed-vocabulary `error` code is preserved in `providerErrorCode` for logs.
 */
function toProviderError(body: RawTokenResponse, httpStatus: number): OAuthError {
  const providerErrorCode = typeof body.error === "string" ? body.error : undefined;
  const code = providerErrorCode ? mapProviderErrorCode(providerErrorCode) : "OAUTH_PROVIDER_REJECTED";
  const retryAfterSeconds = typeof body.interval === "number" && Number.isFinite(body.interval) ? body.interval : undefined;

  return new OAuthError(code, `the authorization server refused the request (HTTP ${httpStatus}${providerErrorCode ? `, ${providerErrorCode}` : ""})`, {
    operatorAction:
      code === "OAUTH_INVALID_GRANT"
        ? "This connection's authorization is no longer valid — reconnect it in Settings → External MCP."
        : "Check this provider's client id, secret, scopes and redirect URI, then try connecting again.",
    ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
}

/** RFC 6749 §5.1's `expires_in` is a relative lifetime; this module persists an absolute instant.
 *  A non-numeric or non-positive value yields `null` — "unknown expiry" — rather than a fabricated
 *  one, because a wrong `expiresAt` is worse than none: it schedules a refresh that will not help. */
function resolveExpiresAt(expiresIn: unknown, nowIso: ISODateTime): ISODateTime | null {
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.parse(nowIso) + seconds * 1000).toISOString();
}

/** RFC 6749 §3.3: space-delimited. Providers also emit comma-delimited in the wild, so both split. */
function parseScopes(scope: unknown): string[] {
  return typeof scope === "string" ? scope.split(/[\s,]+/).filter((part) => part.length > 0) : [];
}

/**
 * Posts one grant to a token endpoint and normalizes the result.
 *
 * @param deps.clock - Supplies the instant `expiresAt` is computed from.
 * @param input.params - The grant-specific form fields; client authentication is added here.
 * @returns The normalized token set. `refreshToken` is `null` when the provider issued none.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT`, `OAUTH_PROVIDER_UNREACHABLE`,
 *   `OAUTH_MALFORMED_RESPONSE`, or whatever {@link toProviderError} maps the server's own error to.
 *   Every one of them is terminal except the two device-polling codes.
 * @complexity O(1) — one bounded outbound request, response capped at {@link MAX_RESPONSE_BYTES}.
 */
export async function requestOAuthToken(deps: TokenRequestDeps, input: TokenRequestInput): Promise<OAuthTokenSet> {
  const endpoint = assertSafeProviderEndpoint(input.tokenEndpoint, "token endpoint");
  const fetchFn = deps.fetchFn ?? fetch;

  const params: Record<string, string> = { ...input.params };
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  applyClientAuth(input.client, params, headers);

  let response: Response;
  try {
    response = await fetchFn(endpoint.toString(), {
      method: "POST",
      headers,
      body: new URLSearchParams(params).toString(),
      // A token endpoint that 302s would carry the client secret to an unvalidated host.
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new OAuthError("OAUTH_PROVIDER_UNREACHABLE", `could not reach the authorization server at ${endpoint.host}`, {
      operatorAction: "Check network access to this provider, then try connecting again. Nothing was retried automatically.",
      cause,
    });
  }

  const body = parseJsonBody(await readBoundedText(response, MAX_RESPONSE_BYTES));
  // Checked before the status, because RFC 8628 §3.5's `authorization_pending` arrives as a 400
  // and is a normal, expected state rather than a failure.
  if (typeof body.error === "string" || !response.ok) throw toProviderError(body, response.status);

  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", "the authorization server's response contained no access token", {
      operatorAction: "Check that the token endpoint URL points at an OAuth 2.0 token endpoint.",
    });
  }

  const nowIso = deps.clock.nowIso();
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token !== "" ? body.refresh_token : null,
    tokenType: typeof body.token_type === "string" && body.token_type !== "" ? body.token_type : "Bearer",
    scopes: parseScopes(body.scope),
    expiresAt: resolveExpiresAt(body.expires_in, nowIso),
  };
}
