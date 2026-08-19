import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookSubscriptionRecord } from "./types.js";

/**
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
 * - The secret itself is a plain `Buffer` parameter here, NOT derived from a real root key.
 *   ADR-036 §5 specifies `HKDF(rootKey, info) via KeyringPort.deriveSigningSecret` as the
 *   production source of the secret bytes; that port's shape is still being corrected
 *   upstream (ADR-036 Round-3 fold notes `KeyringPort` needs a dedicated home/ADR-041). Wiring
 *   `WebhookSigner` to `KeyringPort.deriveSigningSecret()` is the follow-up once that lands —
 *   `createFixedSecretSigner` below is a stand-in that resolves secrets from a plain in-memory
 *   map, for local dev and tests only.
 *
 * Architectural role:
 * Pure signing/verification functions + one small DI seam (`WebhookSigner`) the delivery worker
 * depends on. No repo/HTTP/keyring imports here — this file has zero I/O.
 */

/** Unix-seconds tolerance a receiver would reasonably apply; exported as a suggested default —
 * `verifySignature` still requires callers to pass `toleranceSeconds` explicitly (no hidden
 * default) so a caller can't silently skip choosing a replay window. */
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface SignPayloadInput {
  /** Raw signing-secret bytes (ADR-036 §5: derived, never persisted — see the file header). */
  secret: Buffer;
  /** The exact bytes about to be sent on the wire. Must not be re-serialized after signing. */
  rawBody: string;
  /** Unix seconds to stamp into `t=`. Defaults to now; tests pass a fixed value for determinism. */
  timestampSeconds?: number;
}

/**
 * Produce one `Tovu-Signature` header value for a single secret generation.
 *
 * @complexity O(rawBody length) — one HMAC-SHA256 pass over `${t}.${rawBody}`.
 * @overallScore 100
 */
export function signPayload(input: SignPayloadInput): string {
  const timestamp = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signedContent = `${timestamp}.${input.rawBody}`;
  const digest = createHmac("sha256", input.secret).update(signedContent).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export interface VerifySignatureInput {
  /** The single secret generation to verify against (a receiver tries each generation it knows). */
  secret: Buffer;
  rawBody: string;
  /** The full `Tovu-Signature` header value, e.g. `t=1720000000,v1=abcd…` (may carry >1 `v1=`). */
  header: string;
  /** Replay window in seconds; a header whose `t=` is farther from "now" than this is rejected. */
  toleranceSeconds: number;
}

/**
 * Verify a `Tovu-Signature` header against one known secret. Accepts a header carrying multiple
 * `v1=` entries (the rotation-overlap case, ADR-036 §5) and succeeds if ANY entry matches — this
 * mirrors how a receiver is expected to check during a rotation window.
 *
 * @complexity O(rawBody length + number of `v1=` entries in the header, normally 1-2).
 * @overallScore 100
 */
export function verifySignature(input: VerifySignatureInput): boolean {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > input.toleranceSeconds) return false;

  const expectedHex = createHmac("sha256", input.secret)
    .update(`${parsed.timestamp}.${input.rawBody}`)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");

  return parsed.signatures.some((candidateHex) => {
    // Reject malformed (non-hex / wrong-length) candidates before the constant-time compare —
    // timingSafeEqual throws on a buffer-length mismatch rather than returning false.
    if (!/^[0-9a-f]+$/i.test(candidateHex)) return false;
    const candidate = Buffer.from(candidateHex, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

/** Parsed `t=`/`v1=` pairs from a `Tovu-Signature` header. `null` when the header is malformed. */
function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const rawPart of header.split(",")) {
    const part = rawPart.trim();
    const eq = part.indexOf("=");
    if (eq === -1) continue;

    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();

    if (key === "t") {
      const parsedTimestamp = Number(value);
      if (!Number.isFinite(parsedTimestamp)) return null;
      timestamp = parsedTimestamp;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === undefined || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * The delivery worker's signing seam (`./delivery.ts` depends on this, not on `KeyringPort`
 * directly, so swapping in the real derive-not-store implementation is a pure DI change).
 */
export interface WebhookSigner {
  /** Produce the `Tovu-Signature` header value for one delivery attempt's exact raw body. */
  signForSubscription(input: {
    subscription: WebhookSubscriptionRecord;
    rawBody: string;
    timestampSeconds: number;
  }): Promise<string>;
}

/**
 * Stand-in `WebhookSigner` backed by a plain `subscriptionId -> secret` map, for local dev and
 * tests. Production wiring replaces this with an adapter that calls
 * `KeyringPort.deriveSigningSecret({ workspaceId, subscriptionId, version })` per ADR-036 §5 —
 * that port's shape is accepted but its home is still being corrected upstream (see file header).
 *
 * @overallScore 100
 */
export function createFixedSecretSigner(secrets: ReadonlyMap<string, Buffer>): WebhookSigner {
  return {
    async signForSubscription({ subscription, rawBody, timestampSeconds }) {
      const secret = secrets.get(subscription.id);
      if (!secret) {
        throw new Error(`no signing secret configured for subscription '${subscription.id}'`);
      }
      return signPayload({ secret, rawBody, timestampSeconds });
    },
  };
}
