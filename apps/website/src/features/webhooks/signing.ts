/** Tovu wire vocabulary and clock defaults; signing/verification algorithms live in Jini.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * @file HMAC request signing for outbound webhook deliveries (ADR-036 §5).
 *
 * Purpose:
 * Implements the exact Stripe-shaped, timestamped signature scheme:
 * `Tovu-Signature: t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, `${t}.${rawBody}`))>`. The
 * timestamp bounds replay (a receiver — and our own `verifySignature`, used for tests/parity —
 * rejects a signature outside a tolerance window).
 *
 * How it relates to the project:
 * - `./delivery.ts`'s `processDueDeliveries` calls a `WebhookSigner` (defined here) to produce
 *   the header for the exact raw bytes it is about to POST — no re-serialization between sign
 *   and send (ADR-036 §4).
 * - The secret itself is a plain `Buffer` parameter here, NOT derived from a real site key.
 *   ADR-036 §5 specifies `HKDF(siteKey, info) via KeyringPort.deriveSigningSecret` as the
 *   production source of the secret bytes; that port's shape is still being corrected
 *   upstream (ADR-036 Round-3 fold notes `KeyringPort` needs a dedicated home/ADR-041). Wiring
 *   `WebhookSigner` to `KeyringPort.deriveSigningSecret()` is the follow-up once that lands —
 *   `createFixedSecretSigner` below is a stand-in that resolves secrets from a plain in-memory
 *   map, for local dev and tests only.
 *
 * Architectural role:
 * Pure signing/verification functions + one small DI seam (`WebhookSigner`) the delivery worker
 * depends on. No repo/HTTP/keyring imports here — this file has zero I/O.
 *
 * Unix-seconds tolerance a receiver would reasonably apply; exported as a suggested default —
 * `verifySignature` still requires callers to pass `toleranceSeconds` explicitly (no hidden
 * default) so a caller can't silently skip choosing a replay window.
 *
 * Raw signing-secret bytes (ADR-036 §5: derived, never persisted — see the file header).
 *
 * The exact bytes about to be sent on the wire. Must not be re-serialized after signing.
 *
 * Unix seconds to stamp into `t=`. Defaults to now; tests pass a fixed value for determinism.
 *
 * Produce one `Tovu-Signature` header value for a single secret generation.
 *
 * @complexity O(rawBody length) — one HMAC-SHA256 pass over `${t}.${rawBody}`.
 * @overallScore 100
 *
 * The single secret generation to verify against (a receiver tries each generation it knows).
 *
 * The full `Tovu-Signature` header value, e.g. `t=1720000000,v1=abcd…` (may carry >1 `v1=`).
 *
 * Replay window in seconds; a header whose `t=` is farther from "now" than this is rejected.
 *
 * Verify a `Tovu-Signature` header against one known secret. Accepts a header carrying multiple
 * `v1=` entries (the rotation-overlap case, ADR-036 §5) and succeeds if ANY entry matches — this
 * mirrors how a receiver is expected to check during a rotation window.
 *
 * @complexity O(rawBody length + number of `v1=` entries in the header, normally 1-2).
 * @overallScore 100
 *
 * Splits `t=1,v1=a,v1=b` into `{key,value}` parts, skipping any segment with no `=`.
 *
 * Applies one `key=value` header part to the running accumulator. Returns `false` when this part
 *  makes the whole header malformed and parsing must stop immediately — matches the original
 *  single-pass parser's fail-fast behavior: an unparseable `t=` value fails the header right away
 *  (regardless of ordering relative to other parts), while multiple valid `t=` parts let the LAST
 *  one win (each overwrites `acc.timestamp` in encounter order).
 *
 * Parsed `t=`/`v1=` pairs from a `Tovu-Signature` header. `null` when the header is malformed.
 *
 * The delivery worker's signing seam (`./delivery.ts` depends on this, not on `KeyringPort`
 * directly, so swapping in the real derive-not-store implementation is a pure DI change).
 *
 * Produce the `Tovu-Signature` header value for one delivery attempt's exact raw body.
 *
 * Stand-in `WebhookSigner` backed by a plain `subscriptionId -> secret` map, for local dev and
 * tests. Production wiring replaces this with an adapter that calls
 * `KeyringPort.deriveSigningSecret({ workspaceId, subscriptionId, version })` per ADR-036 §5 —
 * that port's shape is accepted but its home is still being corrected upstream (see file header).
 *
 * @overallScore 100
 */
import {
  signPayload as signWebhookPayload,
  verifySignature as verifyWebhookSignature,
  createFixedSecretSigner as createWebhookFixedSigner,
  type SignPayloadInput as JiniSignPayloadInput,
  type VerifySignatureInput as JiniVerifySignatureInput,
  type WebhookSigner,
} from "@jini-ai/integrations/webhooks";

export type { WebhookSigner } from "@jini-ai/integrations/webhooks";
export { DEFAULT_SIGNATURE_TOLERANCE_SECONDS } from "@jini-ai/integrations/webhooks";

export const SIGNATURE_VOCABULARY = { timestampField: "t", signatureField: "v1" } as const;
// Protocol rationale: Jini/packages/integrations/src/webhooks/signing.ts. ADR-036 preserves the
// Tovu-Signature t/v1 wire format; the timestamp limits replay and delivery must send the signed body.
export interface SignPayloadInput extends Omit<JiniSignPayloadInput, "vocabulary" | "timestampSeconds"> {
  timestampSeconds?: number;
}
export type VerifySignatureInput = Omit<JiniVerifySignatureInput, "vocabulary" | "nowSeconds">;

/** Supply the historical t/v1 protocol and wall-clock default for existing host callers.
 * @complexity O(raw body bytes), delegated to Jini HMAC-SHA256.
 */
export function signPayload(input: SignPayloadInput): string {
  return signWebhookPayload({ ...input, vocabulary: SIGNATURE_VOCABULARY,
    timestampSeconds: input.timestampSeconds ?? Math.floor(Date.now() / 1000),
  });
}

/** Keep the receiver's Tovu vocabulary and current replay-window clock.
 * @complexity O(raw body bytes + signature entries).
 */
export function verifySignature(input: VerifySignatureInput): boolean {
  return verifyWebhookSignature({ ...input, vocabulary: SIGNATURE_VOCABULARY, nowSeconds: Math.floor(Date.now() / 1000) });
}

/** Fixed-map host signer supplies protocol policy; production uses a keyring-backed signer. */
export function createFixedSecretSigner(secrets: ReadonlyMap<string, Buffer>): WebhookSigner {
  return createWebhookFixedSigner({ secrets, vocabulary: SIGNATURE_VOCABULARY });
}
