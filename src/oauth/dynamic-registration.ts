import { MAX_OAUTH_RESPONSE_BYTES, readBoundedOAuthJson, readOptionalString } from "./bounded-json.js";
import { assertSafeProviderEndpoint } from "./endpoint-safety.js";
import { OAuthError } from "./errors.js";
import type { OAuthClientAuthMethod, OAuthFetch } from "./ports.js";

/**
 * @file RFC 7591 dynamic client registration — how Tovu obtains a `client_id` from an authorization
 * server that offers no way for a human to obtain one.
 *
 * ## Why this is not an optional convenience
 *
 * `ports.ts` describes the client id as something the operator supplies, and for a provider with a
 * developer console that is right. A growing share of hosted MCP servers have no console at all:
 * they advertise a `registration_endpoint` and expect clients to self-register, which is the
 * MCP-standard path. For those there is no human route to a client id, so without this module the
 * connection cannot be made at any amount of operator effort.
 *
 * ## What is deliberately NOT done here
 *
 * - **No retry.** Registration is not idempotent. A server that received the request and lost the
 *   response has already minted a client; retrying mints a second one that nothing will ever use and
 *   that nothing will ever clean up. One attempt, terminal either way. This is the same rule
 *   `errors.ts` argues for the code exchange, for the same reason.
 * - **No provider error is treated as retryable.** RFC 7591 §3.2.2 defines its own error codes and
 *   none of them means "call again", so unlike the token endpoint this module does not run the
 *   server's error string through `mapProviderErrorCode` — a server that answered `slow_down` to a
 *   registration must not be able to talk this client into a loop.
 * - **No registration access token is stored.** RFC 7592 management (`registration_access_token`,
 *   `registration_client_uri`) is out of scope; the URI is returned for diagnosis and the token is
 *   not read at all, because storing a credential nothing uses is a liability with no benefit.
 *
 * ## The secret
 *
 * Tovu asks to be a PUBLIC client (`token_endpoint_auth_method: "none"`, PKCE instead of a secret).
 * Some servers issue a `client_secret` regardless. That secret is returned to the caller so it can be
 * SEALED through the existing path — it is never logged, and the caller is responsible for keeping it
 * out of read models.
 */

/** A human is waiting on the connect click this sits inside. */
const DEFAULT_REGISTRATION_TIMEOUT_MS = 15_000;

const REGISTRATION_MESSAGES = {
  overflowMessage: `the client registration response exceeded ${MAX_OAUTH_RESPONSE_BYTES} bytes`,
  overflowOperatorAction: "This server's dynamic client registration endpoint is not behaving like an RFC 7591 endpoint.",
  notJsonMessage: "the client registration endpoint did not return a JSON object",
  notJsonOperatorAction: "This server's dynamic client registration endpoint is not behaving like an RFC 7591 endpoint.",
} as const;

/** RFC 6749 §2.3 methods this client can actually perform. A server echoing anything else has named
 *  a mechanism Tovu cannot execute, so the requested method stands instead. */
const SUPPORTED_AUTH_METHODS: readonly OAuthClientAuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];

export interface DynamicClientRegistrationDeps {
  /** Injected so tests never touch the network. Defaults to global `fetch`. */
  readonly fetchFn?: OAuthFetch;
}

export interface DynamicClientRegistrationInput {
  /** Usually discovered. Validated here regardless of where it came from. */
  readonly registrationEndpoint: string;
  /** Shown to the operator by the authorization server on its consent screen. */
  readonly clientName: string;
  /** Must contain every callback URL this client will actually use — a server that pins them will
   *  reject an authorization whose `redirect_uri` was not registered. */
  readonly redirectUris: readonly string[];
  readonly scopes: readonly string[];
  /** Defaults to `["authorization_code", "refresh_token"]`. Registering `refresh_token` is what makes
   *  a long-lived connection possible; a server that does not support it ignores the entry. */
  readonly grantTypes?: readonly string[];
  /** Defaults to `["code"]`. */
  readonly responseTypes?: readonly string[];
  /** Defaults to `none` — a self-hosted install is a public client and PKCE replaces the secret. */
  readonly tokenEndpointAuthMethod?: OAuthClientAuthMethod;
  /** RFC 7591 §3 open registration needs none; supplied when a server gates registration. */
  readonly initialAccessToken?: string;
  readonly timeoutMs?: number;
}

/**
 * One minted client.
 *
 * `clientSecret` is `null`, never `undefined`, so "this server issued no secret" is a value the
 * caller must handle rather than a field it can forget to read — the same rule
 * {@link OAuthTokenSet.refreshToken} follows.
 */
export interface RegisteredOAuthClient {
  readonly clientId: string;
  /** SECRET when present. Seal it; never log it; never return it from a read model. */
  readonly clientSecret: string | null;
  /** What the server said to authenticate with, which is not always what was asked for. */
  readonly tokenEndpointAuthMethod: OAuthClientAuthMethod;
  /** RFC 7592 management URI, for diagnosis only — nothing here calls it. */
  readonly registrationClientUri: string | null;
  readonly clientIdIssuedAt: number | null;
  /** RFC 7591 §3.2.1: `0` means the secret never expires. */
  readonly clientSecretExpiresAt: number | null;
}

/** The RFC 7591 §2 client-metadata document Tovu sends. Built in one place so the three defaults
 *  that decide whether the connection can refresh, redirect, and authenticate cannot drift apart.
 *  @complexity O(n) in scopes and redirect URIs. */
function buildClientMetadata(input: DynamicClientRegistrationInput): Record<string, unknown> {
  const scope = input.scopes.join(" ");
  return {
    client_name: input.clientName,
    redirect_uris: [...input.redirectUris],
    grant_types: [...(input.grantTypes ?? ["authorization_code", "refresh_token"])],
    response_types: [...(input.responseTypes ?? ["code"])],
    token_endpoint_auth_method: input.tokenEndpointAuthMethod ?? "none",
    // Declared because a server that defaults an unspecified client to `native` will then refuse an
    // https redirect URI, which reads as a redirect-URI bug rather than an application-type one.
    application_type: "web",
    ...(scope === "" ? {} : { scope }),
  };
}

/** A whole number from a JSON member, or `null`. `0` is meaningful (RFC 7591 §3.2.1's "never
 *  expires") so it must survive, which rules out a truthiness check. @complexity O(1). */
function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The server's echoed auth method when Tovu can perform it, otherwise the requested one.
 *
 *  The echo WINS when it is supported, and that matters: a server that issued a secret and expects
 *  `client_secret_post` will answer `invalid_client` to every token request from a client that keeps
 *  authenticating as `none`, which surfaces long after registration as an unexplained connect
 *  failure. @complexity O(1). */
function resolveAuthMethod(document: Record<string, unknown>, requested: OAuthClientAuthMethod): OAuthClientAuthMethod {
  const echoed = readOptionalString(document.token_endpoint_auth_method);
  return SUPPORTED_AUTH_METHODS.includes(echoed as OAuthClientAuthMethod) ? (echoed as OAuthClientAuthMethod) : requested;
}

/**
 * Turns an RFC 7591 §3.2.2 error body into an {@link OAuthError}.
 *
 * `error_description` is free text from a third party that this codebase renders into a browser and
 * hands to a model, so it never reaches `message` — the same rule `token-endpoint.ts` states. The
 * closed-vocabulary `error` code is preserved in `providerErrorCode` for logs.
 *
 * Always `OAUTH_PROVIDER_REJECTED`, never a mapped code: see this file's header on why no
 * registration failure may be retryable. @complexity O(1).
 */
function toRegistrationError(document: Record<string, unknown>, httpStatus: number): OAuthError {
  const providerErrorCode = readOptionalString(document.error);
  return new OAuthError(
    "OAUTH_PROVIDER_REJECTED",
    `the authorization server refused the client registration (HTTP ${httpStatus}${providerErrorCode === null ? "" : `, ${providerErrorCode}`})`,
    {
      operatorAction: "This server refused to register Tovu as a client — check its OAuth requirements, or supply a client id by hand.",
      ...(providerErrorCode === null ? {} : { providerErrorCode }),
    },
  );
}

/**
 * Registers Tovu as a client at an RFC 7591 registration endpoint.
 *
 * @param deps.fetchFn - Outbound HTTP seam; defaults to the global.
 * @param input.registrationEndpoint - Validated through {@link assertSafeProviderEndpoint} before
 *   anything is sent, because in practice this URL was discovered from a remote document.
 * @returns The minted client. `clientSecret` is a SECRET when non-null — seal it.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT`, `OAUTH_PROVIDER_UNREACHABLE`,
 *   `OAUTH_PROVIDER_REJECTED`, or `OAUTH_MALFORMED_RESPONSE`. Every one is terminal; nothing here
 *   retries, and nothing here is marked retryable.
 * @complexity O(1) — one bounded outbound request, response capped at {@link MAX_OAUTH_RESPONSE_BYTES}.
 */
export async function registerOAuthClientDynamically(
  deps: DynamicClientRegistrationDeps,
  input: DynamicClientRegistrationInput,
): Promise<RegisteredOAuthClient> {
  const endpoint = assertSafeProviderEndpoint(input.registrationEndpoint, "registration endpoint");
  const fetchFn = deps.fetchFn ?? fetch;
  const requestedAuthMethod = input.tokenEndpointAuthMethod ?? "none";

  let response: Response;
  try {
    response = await fetchFn(endpoint.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(input.initialAccessToken === undefined ? {} : { authorization: `Bearer ${input.initialAccessToken}` }),
      },
      body: JSON.stringify(buildClientMetadata(input)),
      // A 3xx here would carry Tovu's callback URL — and any initial access token — to a host that
      // was never validated.
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_REGISTRATION_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new OAuthError("OAUTH_PROVIDER_UNREACHABLE", `could not reach the client registration endpoint at ${endpoint.host}`, {
      operatorAction: "Check network access to this server, then try connecting again. Nothing was retried automatically.",
      cause,
    });
  }

  const document = await readBoundedOAuthJson(response, REGISTRATION_MESSAGES);
  // Checked before the status for the same reason `token-endpoint.ts` does it: an `error` member is
  // the authoritative signal, and servers disagree about which 4xx carries it.
  if (typeof document.error === "string" || !response.ok) throw toRegistrationError(document, response.status);

  const clientId = readOptionalString(document.client_id);
  if (clientId === null) {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", "the client registration response contained no client id", {
      operatorAction: "This server's dynamic client registration endpoint is not behaving like an RFC 7591 endpoint.",
    });
  }

  return {
    clientId,
    clientSecret: readOptionalString(document.client_secret),
    tokenEndpointAuthMethod: resolveAuthMethod(document, requestedAuthMethod),
    registrationClientUri: readOptionalString(document.registration_client_uri),
    clientIdIssuedAt: readOptionalNumber(document.client_id_issued_at),
    clientSecretExpiresAt: readOptionalNumber(document.client_secret_expires_at),
  };
}
