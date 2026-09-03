import type { CustomCredentialAuthSchemeProvider, SelfDescribingTokenMatch } from "./types.js";

/**
 * @file fly.io's own self-describing Authorization scheme — the FIRST vendor recognizer in this
 * registry, and the motivating, verified case for the whole per-vendor extension point (see
 * `./index.ts`'s header for how a new vendor plugs in without ever touching the shared
 * `credentialed-request.ts`).
 *
 * **The live incident (2026-09-03).** Tovu's outbound credentialed requests always sent
 * `Authorization: Bearer <token>`. A saved fly.io credential's token starts with a literal scheme
 * word, `FlyV1fm2_...` (a macaroon) — and `FlyV1` is not incidental content, it IS the correct
 * `Authorization` HTTP scheme name, with the rest of the token string as the value. Verified live
 * against `https://api.machines.dev/v1/apps/tovu/machines` with two independently generated tokens:
 *
 * | header sent | result |
 * |---|---|
 * | `Authorization: Bearer FlyV1fm2_...` (the whole token, unmodified) | 401 `{"error":"Authenticate: token validation error"}` |
 * | `Authorization: FlyV1 fm2_...` (`FlyV1` moved to the scheme, remainder as the value) | 200, real machine data |
 *
 * Both tokens failed identically under `Bearer` and succeeded identically under `FlyV1 <rest>` — not
 * a scope or expiry problem, a scheme problem. fly.io's own `WWW-Authenticate` response header on
 * that 401 is actively misleading here (`Basic realm="api.machines.dev"`) — it does NOT name the
 * real required scheme, so this cannot be derived dynamically from the server's own challenge; it
 * has to be encoded as knowledge somewhere, which is this file.
 */

/** fly.io's own scheme word, verified live above. */
const FLY_TOKEN_SCHEME = "FlyV1";

export const FLY_IO_AUTH_SCHEME_PROVIDER_ID = "fly.io";

/**
 * Recognizes a fly.io token by its own leading scheme word — a genuine PREFIX match
 * (`token.startsWith(FLY_TOKEN_SCHEME)`), never a substring appearing later in the token, and
 * requires at least one character to remain after the prefix: a token that IS exactly `"FlyV1"`,
 * with nothing following it, has no credential value left to send, and is left to fall through to
 * this feature's ordinary Bearer handling instead of matching here.
 *
 * @complexity O(1).
 */
function detect(token: string): SelfDescribingTokenMatch | null {
  if (!token.startsWith(FLY_TOKEN_SCHEME) || token.length <= FLY_TOKEN_SCHEME.length) return null;
  return { scheme: FLY_TOKEN_SCHEME, value: token.slice(FLY_TOKEN_SCHEME.length) };
}

/** This vendor's `CustomCredentialAuthSchemeProvider` implementation — registered in `./index.ts`. */
export const flyIoAuthSchemeProvider: CustomCredentialAuthSchemeProvider = {
  id: FLY_IO_AUTH_SCHEME_PROVIDER_ID,
  detect,
};
