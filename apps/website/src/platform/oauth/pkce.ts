import { createHash, randomBytes } from "node:crypto";

import { OAuthError } from "./errors.js";
import type { OAuthRandomBytes } from "./ports.js";

/**
 * @file PKCE (RFC 7636) — the `S256` challenge pair that replaces a client secret.
 *
 * PKCE is not optional here even though several providers still treat it as such. A self-hosted
 * Tovu install is a PUBLIC OAuth client: the `clientId` is visible in the authorization URL the
 * operator's browser follows, and the deployment cannot keep a secret that every install shares.
 * Without PKCE, an attacker who intercepts the `code` on the redirect leg can redeem it; with it,
 * the code is worthless without the verifier, which never leaves this process.
 *
 * `plain` is not implemented. RFC 7636 §4.2 permits it only where SHA-256 is unavailable, which is
 * never true on Node, and offering it would create a downgrade a hostile authorization server could
 * request.
 */

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. 32 random bytes base64url-encode to
 *  exactly 43, the minimum, which is also the recommended entropy floor. */
const VERIFIER_BYTES = 32;
const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;
/** RFC 7636 §4.1's `unreserved` production, verbatim. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/;

export interface PkcePair {
  /** The secret half. Persisted server-side with the pending authorization; never sent to the browser. */
  readonly codeVerifier: string;
  /** The public half, sent on the authorization request. */
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}

/**
 * Rejects a code verifier that RFC 7636 would not accept.
 *
 * Exported because the verifier survives a round trip through a store between `begin` and
 * `complete`, and a value that was tampered with in that gap must fail loudly at use rather than be
 * sent to a token endpoint that will reject it with a less useful message.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when the verifier is the wrong length or charset.
 * @complexity O(n) in the verifier length, which is capped at 128.
 */
export function assertValidCodeVerifier(codeVerifier: string): void {
  if (codeVerifier.length < MIN_VERIFIER_LENGTH || codeVerifier.length > MAX_VERIFIER_LENGTH) {
    throw new OAuthError(
      "OAUTH_INVALID_REQUEST",
      `PKCE code verifier must be ${MIN_VERIFIER_LENGTH}–${MAX_VERIFIER_LENGTH} characters (RFC 7636 §4.1)`,
      { operatorAction: "Start the connection again — the stored authorization request is unusable." },
    );
  }
  if (!VERIFIER_PATTERN.test(codeVerifier)) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", "PKCE code verifier contains characters outside RFC 7636's unreserved set", {
      operatorAction: "Start the connection again — the stored authorization request is unusable.",
    });
  }
}

/**
 * Derives the `S256` challenge for a verifier.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` via {@link assertValidCodeVerifier}.
 * @complexity O(n) — one SHA-256 over at most 128 bytes.
 */
export function deriveCodeChallenge(codeVerifier: string): string {
  assertValidCodeVerifier(codeVerifier);
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

/**
 * Mints a fresh PKCE pair.
 *
 * @param randomBytesFn - Injected only so tests can pin the verifier. Defaults to
 *   `node:crypto`'s CSPRNG; `Math.random` would be a real vulnerability here, not a style choice.
 * @complexity O(1).
 */
export function createPkcePair(randomBytesFn: OAuthRandomBytes = (n) => randomBytes(n)): PkcePair {
  const codeVerifier = Buffer.from(randomBytesFn(VERIFIER_BYTES)).toString("base64url");
  return { codeVerifier, codeChallenge: deriveCodeChallenge(codeVerifier), codeChallengeMethod: "S256" };
}
