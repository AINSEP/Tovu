import { assertSafeProviderEndpoint } from "./endpoint-safety.js";
import { OAuthError } from "./errors.js";
import type { PendingAuthorizationStore } from "./pending-authorizations.js";
import { assertValidCodeVerifier, createPkcePair } from "./pkce.js";
import type { OAuthClient, OAuthProviderDescriptor, OAuthRandomBytes, OAuthTokenSet } from "./ports.js";
import { requestOAuthToken, type TokenRequestDeps } from "./token-endpoint.js";

/**
 * @file The authorization-code grant with PKCE (RFC 6749 §4.1 + RFC 7636) — the primary path.
 *
 * Two functions, deliberately split across the browser round trip they straddle:
 * {@link beginAuthorizationCode} is synchronous and performs no I/O (nothing has been asked of the
 * provider yet — the operator's browser does the asking), and
 * {@link completeAuthorizationCode} performs exactly one bounded POST.
 *
 * ## What arrives at `complete` is untrusted
 *
 * Every argument to {@link completeAuthorizationCode} comes off a redirect issued by a third party
 * into a PUBLIC route that no session cookie can reach (a `SameSite=Strict` cookie does not survive
 * a cross-site top-level navigation — the argument `routes/connectors/composio-callback.ts` records
 * for the same reason). So they are validated as hostile input before anything else happens:
 * bounded lengths, expected charsets, and the `state` redeemed through a single-use, owner-bound
 * store. An `error` parameter is honored — a provider saying "the user declined" must not be
 * retried as if it were a network blip.
 */

/** RFC 6749 puts no length on `code`, but every real one is far below this. The cap exists so a
 *  multi-megabyte query parameter is refused before it is put in a form body. */
const MAX_CODE_LENGTH = 2048;
/** `state` here is always this module's own 24-byte base64url mint (32 chars). The range tolerates
 *  a provider that round-trips it with padding rather than assuming an exact length. */
const MAX_STATE_LENGTH = 256;
/** RFC 6749 §5.2 / §4.1.2.1 error codes are short lowercase tokens. */
const PROVIDER_ERROR_PATTERN = /^[a-z_]{1,64}$/;

export interface BeginAuthorizationCodeDeps {
  readonly provider: OAuthProviderDescriptor;
  readonly pending: PendingAuthorizationStore;
  readonly randomBytesFn?: OAuthRandomBytes;
}

export interface BeginAuthorizationCodeInput {
  /** The binding key the callback must present. See `PendingAuthorization.ownerKey`. */
  readonly ownerKey: string;
  readonly client: OAuthClient;
  /** Absolute; must be registered with the provider and is replayed verbatim on the exchange. */
  readonly redirectUri: string;
  /** Falls back to the descriptor's defaults when omitted. */
  readonly scopes?: readonly string[];
  /** Extra authorization-request parameters a provider requires (`audience`, `prompt`, …). Reserved
   *  OAuth parameter names are refused rather than silently overwritten. */
  readonly extraAuthorizationParams?: Readonly<Record<string, string>>;
}

export interface BeginAuthorizationCodeResult {
  /** Where the operator's browser is sent. Safe to render as a link; contains no secret. */
  readonly authorizationUrl: string;
  readonly state: string;
  /** When this pending authorization stops being redeemable. */
  readonly expiresAt: string;
}

/** Parameters this module owns. An `extraAuthorizationParams` entry colliding with one of these
 *  would silently change the grant's security properties, so it is refused instead. */
const RESERVED_AUTHORIZATION_PARAMS: ReadonlySet<string> = new Set([
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
]);

function assertGrantSupported(provider: OAuthProviderDescriptor, grant: "authorization_code" | "device_code"): void {
  if (!provider.supportedGrants.includes(grant)) {
    throw new OAuthError("OAUTH_UNSUPPORTED_GRANT", `provider '${provider.providerId}' does not support the ${grant} grant`, {
      operatorAction: "Choose a different connection method for this provider.",
    });
  }
}

/**
 * Mints PKCE + `state`, records the pending authorization, and builds the URL to send the browser to.
 *
 * Performs NO I/O: at this point the provider has not been contacted, so there is nothing to time
 * out and nothing to fail slowly. That is why connect-time provider downtime surfaces at
 * {@link completeAuthorizationCode} rather than here.
 *
 * @throws {OAuthError} `OAUTH_UNSUPPORTED_GRANT`, `OAUTH_UNSAFE_ENDPOINT`, or
 *   `OAUTH_INVALID_REQUEST` for a reserved extra parameter or an unusable redirect URI.
 * @complexity O(1) plus the store's bounded prune.
 */
export function beginAuthorizationCode(
  deps: BeginAuthorizationCodeDeps,
  input: BeginAuthorizationCodeInput,
): BeginAuthorizationCodeResult {
  const { provider } = deps;
  assertGrantSupported(provider, "authorization_code");
  if (!provider.authorizationEndpoint) {
    throw new OAuthError("OAUTH_UNSUPPORTED_GRANT", `provider '${provider.providerId}' declares no authorization endpoint`, {
      operatorAction: "Configure this provider's authorization endpoint, or connect it with the device grant instead.",
    });
  }

  const authorizationUrl = assertSafeProviderEndpoint(provider.authorizationEndpoint, "authorization endpoint");
  // Validated with the same rule as the provider's own endpoints: this is where the provider will
  // send the operator's browser back with a `code`, so an http:// or internal-address redirect
  // target is the same class of mistake.
  const redirectUri = assertSafeProviderEndpoint(input.redirectUri, "redirect URI");

  const scopes = input.scopes ?? provider.defaultScopes;
  const pkce = provider.usesPkce ? createPkcePair(deps.randomBytesFn) : undefined;
  const entry = deps.pending.put({
    ownerKey: input.ownerKey,
    providerId: provider.providerId,
    // Recorded even when PKCE is off so the stored shape is uniform; `complete` sends it only when
    // the descriptor says the provider uses PKCE.
    codeVerifier: pkce?.codeVerifier ?? "",
    redirectUri: redirectUri.toString(),
    scopes: [...scopes],
  });

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", input.client.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri.toString());
  if (scopes.length > 0) authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("state", entry.state);
  if (pkce) {
    authorizationUrl.searchParams.set("code_challenge", pkce.codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);
  }
  for (const [key, value] of Object.entries(input.extraAuthorizationParams ?? {})) {
    if (RESERVED_AUTHORIZATION_PARAMS.has(key)) {
      throw new OAuthError("OAUTH_INVALID_REQUEST", `'${key}' is set by Tovu and cannot be overridden for this provider`, {
        operatorAction: "Remove that parameter from the provider's extra authorization parameters.",
      });
    }
    authorizationUrl.searchParams.set(key, value);
  }

  return { authorizationUrl: authorizationUrl.toString(), state: entry.state, expiresAt: entry.expiresAt };
}

export interface CompleteAuthorizationCodeDeps extends TokenRequestDeps {
  readonly provider: OAuthProviderDescriptor;
  readonly pending: PendingAuthorizationStore;
}

/** Exactly the callback's query parameters this module reads, already narrowed to strings by the
 *  route. Anything else on the query string is ignored rather than rejected — providers append
 *  their own bookkeeping parameters and refusing them would break real handshakes. */
export interface AuthorizationCallbackParams {
  readonly state: string;
  readonly code?: string;
  readonly error?: string;
}

export interface CompleteAuthorizationCodeInput {
  readonly ownerKey: string;
  readonly client: OAuthClient;
  readonly params: AuthorizationCallbackParams;
  readonly timeoutMs?: number;
}

/**
 * Validates the callback and exchanges the code for tokens.
 *
 * The `state` is redeemed FIRST, before the `code` is even looked at. That ordering is deliberate:
 * redemption is what consumes the single-use entry, so a caller replaying a callback burns the
 * state on the first attempt regardless of what else is wrong with the request.
 *
 * @throws {OAuthError} `OAUTH_INVALID_STATE` (unknown, expired, replayed, or wrong owner),
 *   `OAUTH_ACCESS_DENIED` / `OAUTH_PROVIDER_REJECTED` (the provider reported a failure),
 *   `OAUTH_INVALID_REQUEST` (malformed `code`), or anything {@link requestOAuthToken} raises.
 *   All terminal — the caller must not retry; see `errors.ts`.
 * @complexity O(1) plus one bounded outbound request.
 */
export async function completeAuthorizationCode(
  deps: CompleteAuthorizationCodeDeps,
  input: CompleteAuthorizationCodeInput,
): Promise<OAuthTokenSet> {
  assertGrantSupported(deps.provider, "authorization_code");
  assertCallbackShape(input.params);

  const entry = deps.pending.take({ state: input.params.state, ownerKey: input.ownerKey });
  if (entry.providerId !== deps.provider.providerId) {
    // The state was minted against a different provider descriptor. Treat exactly as an unknown
    // state: the caller must not learn that a valid state exists for something else.
    throw new OAuthError("OAUTH_INVALID_STATE", "the authorization request could not be matched — it may have expired or already been used", {
      operatorAction: "Start the connection again from Settings → External MCP.",
    });
  }

  if (input.params.error !== undefined) throw toCallbackError(input.params.error);
  const code = input.params.code;
  if (code === undefined || code === "") {
    throw new OAuthError("OAUTH_INVALID_REQUEST", "the authorization server returned neither a code nor an error", {
      operatorAction: "Start the connection again from Settings → External MCP.",
    });
  }

  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: entry.redirectUri,
  };
  if (deps.provider.usesPkce) {
    // Re-validated after the store round trip rather than trusted: a verifier that was tampered
    // with must fail here, not at a provider that will answer with a less useful error.
    assertValidCodeVerifier(entry.codeVerifier);
    params.code_verifier = entry.codeVerifier;
  }

  return requestOAuthToken(deps, {
    tokenEndpoint: deps.provider.tokenEndpoint,
    client: input.client,
    params,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

/** Length and charset gates on the two attacker-controlled strings, applied before either is used.
 *  @throws {OAuthError} `OAUTH_INVALID_STATE` / `OAUTH_INVALID_REQUEST`. */
function assertCallbackShape(params: AuthorizationCallbackParams): void {
  if (params.state === "" || params.state.length > MAX_STATE_LENGTH) {
    throw new OAuthError("OAUTH_INVALID_STATE", "the authorization request could not be matched — it may have expired or already been used", {
      operatorAction: "Start the connection again from Settings → External MCP.",
    });
  }
  if (params.code !== undefined && params.code.length > MAX_CODE_LENGTH) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `the authorization code exceeded ${MAX_CODE_LENGTH} characters`, {
      operatorAction: "Start the connection again from Settings → External MCP.",
    });
  }
}

/** Maps an RFC 6749 §4.1.2.1 redirect-borne `error` onto the taxonomy. An unrecognized or
 *  oddly-shaped value becomes a generic rejection rather than being echoed anywhere. */
function toCallbackError(rawError: string): OAuthError {
  const providerErrorCode = PROVIDER_ERROR_PATTERN.test(rawError) ? rawError : undefined;
  if (providerErrorCode === "access_denied") {
    return new OAuthError("OAUTH_ACCESS_DENIED", "authorization was declined", {
      operatorAction: "Approve the request on the provider's consent screen, then connect again.",
      providerErrorCode,
    });
  }
  return new OAuthError("OAUTH_PROVIDER_REJECTED", "the authorization server refused the authorization request", {
    operatorAction: "Check this provider's client id, scopes and redirect URI, then try connecting again.",
    ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
  });
}
