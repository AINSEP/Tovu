/**
 * @file The structured error taxonomy for `src/oauth/`.
 *
 * The load-bearing field is {@link OAuthError.retryable}, and it is `false` for all but two codes.
 * That asymmetry is the whole point of this file:
 *
 * - An authorization-code exchange is NOT safely repeatable. The `code` is single-use and the first
 *   response may have been lost *after* the provider already redeemed it, so a blind retry can
 *   burn a code that actually succeeded and leave the operator staring at a failure for a
 *   connection that exists. Every code-exchange failure is therefore terminal here, and the retry
 *   decision is handed back to the human, who can re-authorize with one click.
 * - Device-grant polling is the one place where retrying is not just safe but REQUIRED by the spec
 *   (RFC 8628 §3.5): `authorization_pending` and `slow_down` mean "keep polling". Those two, and
 *   only those two, carry `retryable: true`.
 *
 * The second load-bearing field is {@link OAuthError.operatorAction}. These errors reach two
 * audiences that cannot act on the same text: an admin looking at a form, and a language model
 * deciding whether to call a tool again. `operatorAction` is the sentence written for the human;
 * `message` is what a model sees, and for the terminal codes it says *do not retry* in words,
 * because a model that reads "authorization expired" without that instruction will loop.
 *
 * Provider response bodies are NEVER carried in `message`. A token endpoint's error body can echo
 * request detail, and these strings reach a browser and a model. The provider's own RFC 6749 §5.2
 * error *code* is kept in {@link OAuthError.providerErrorCode} for logs, because that field is a
 * closed vocabulary rather than free text.
 */

/** Closed vocabulary. A caller switching on this must stay exhaustive — new codes are a deliberate
 *  contract change, not a place to add a catch-all. */
export type OAuthErrorCode =
  /** The authorization server could not be reached, or did not answer inside the bounded timeout. */
  | "OAUTH_PROVIDER_UNREACHABLE"
  /** The server answered and refused. Configuration is wrong; waiting will not help. */
  | "OAUTH_PROVIDER_REJECTED"
  /** The `state` was absent, unknown, expired, replayed, or bound to a different connection. */
  | "OAUTH_INVALID_STATE"
  /** RFC 6749 `invalid_grant` — the refresh token is dead. The only path forward is re-authorizing. */
  | "OAUTH_INVALID_GRANT"
  /** RFC 8628 §3.5 `authorization_pending` — the operator has not approved yet. Keep polling. */
  | "OAUTH_AUTHORIZATION_PENDING"
  /** RFC 8628 §3.5 `slow_down` — polling too fast. Keep polling, with a longer interval. */
  | "OAUTH_SLOW_DOWN"
  /** The operator declined, or the provider denied the grant. */
  | "OAUTH_ACCESS_DENIED"
  /** RFC 8628 §3.5 `expired_token` — the device code aged out before approval. */
  | "OAUTH_EXPIRED_TOKEN"
  /** The requested grant is not one this provider descriptor declares. */
  | "OAUTH_UNSUPPORTED_GRANT"
  /** The server answered with something that is not a usable token response. */
  | "OAUTH_MALFORMED_RESPONSE"
  /** An endpoint or a provider-supplied URL failed the outbound-safety check (scheme/SSRF). */
  | "OAUTH_UNSAFE_ENDPOINT"
  /** Operator-supplied input to a flow was not usable. */
  | "OAUTH_INVALID_REQUEST";

/** The two codes that mean "call again" — see this file's header. Everything else is terminal. */
const RETRYABLE_CODES: ReadonlySet<OAuthErrorCode> = new Set<OAuthErrorCode>([
  "OAUTH_AUTHORIZATION_PENDING",
  "OAUTH_SLOW_DOWN",
]);

export interface OAuthErrorOptions {
  /** The human-facing next step. Rendered in the admin UI; never contains provider response text. */
  readonly operatorAction: string;
  /** RFC 6749 §5.2 / RFC 8628 §3.5 code, when the server sent a recognizable one. Logs only. */
  readonly providerErrorCode?: string;
  /** RFC 8628 §3.5 — the interval the server asked for, in seconds, when it supplied one. */
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;
}

/**
 * A structured, audience-aware OAuth failure.
 *
 * @complexity O(1).
 */
export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  /** `true` only for the two device-polling codes. See this file's header. */
  readonly retryable: boolean;
  readonly operatorAction: string;
  readonly providerErrorCode: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: OAuthErrorCode, message: string, options: OAuthErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OAuthError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.operatorAction = options.operatorAction;
    this.providerErrorCode = options.providerErrorCode;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Narrowing helper, so a caller does not have to import the class just to check a caught value. */
export function isOAuthError(value: unknown): value is OAuthError {
  return value instanceof OAuthError;
}

/**
 * Maps an RFC 6749 §5.2 / RFC 8628 §3.5 error code onto this module's taxonomy.
 *
 * Anything unrecognized becomes `OAUTH_PROVIDER_REJECTED` rather than being passed through: an
 * unknown error string is not evidence that retrying is safe, and the safe direction for an
 * unrecognized failure of a non-idempotent exchange is terminal.
 *
 * @param providerErrorCode - The `error` member of the server's response, already known to be a string.
 * @complexity O(1).
 */
export function mapProviderErrorCode(providerErrorCode: string): OAuthErrorCode {
  switch (providerErrorCode) {
    case "authorization_pending":
      return "OAUTH_AUTHORIZATION_PENDING";
    case "slow_down":
      return "OAUTH_SLOW_DOWN";
    case "access_denied":
      return "OAUTH_ACCESS_DENIED";
    case "expired_token":
      return "OAUTH_EXPIRED_TOKEN";
    case "invalid_grant":
      return "OAUTH_INVALID_GRANT";
    case "unsupported_grant_type":
      return "OAUTH_UNSUPPORTED_GRANT";
    default:
      return "OAUTH_PROVIDER_REJECTED";
  }
}
