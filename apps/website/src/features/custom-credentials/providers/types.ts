/**
 * @file The per-vendor self-describing-token-scheme port — see `./index.ts`'s header for why this
 * extension point exists and why dispatch is try-each-in-turn rather than keyed by a stored
 * provider id.
 *
 * Architectural role: `features/custom-credentials/providers` domain types. `./index.ts` is the one
 * registry that assembles every {@link CustomCredentialAuthSchemeProvider} implementation; each
 * vendor file (`./fly-io.ts`, and later others) implements this port once.
 */

/** One recognized self-describing token match: the literal `scheme` word to send as the outbound
 *  `Authorization` HTTP scheme (e.g. `"FlyV1"`), and the credential `value` that follows it in the
 *  token — everything after the scheme word, unmodified. */
export interface SelfDescribingTokenMatch {
  readonly scheme: string;
  readonly value: string;
}

/** One vendor's own recognizer for its self-describing token format. `id` is a human-readable label
 *  for this provider (used only in test names/registry bookkeeping, never sent anywhere) —
 *  independent of `credential.label`, the operator-typed Access Tokens row name this has no
 *  relationship to. `detect` must be a PURE, side-effect-free predicate/transform over the token
 *  string alone: no I/O, no dependency on the credential's saved `baseUrl`/`username`/other fields —
 *  see `./index.ts`'s header for why recognition is deliberately token-content-only. */
export interface CustomCredentialAuthSchemeProvider {
  readonly id: string;
  /**
   * Returns this provider's own parsed `{scheme, value}` when `token` matches its format, or `null`
   * otherwise. Implementations must match only a genuine, verified PREFIX of the token — never a
   * substring appearing later in it, and never a loose heuristic — a false positive here corrupts an
   * otherwise-working Bearer request, which is worse than leaving an unrecognized token as Bearer.
   */
  detect(token: string): SelfDescribingTokenMatch | null;
}
