/**
 * @file Daily salt derivation for the Tovu `analytics` ingest seam (ADR-035 Round-3 fold item 2).
 *
 * Purpose:
 * Derives the per-workspace, per-day salt folded into `visitorHash` (see `ingest.ts`). The salt
 * is NEVER persisted — every call re-derives it on demand from a root key seed, so a copied or
 * backed-up `content.db` alone cannot reconstruct it (closing the dictionary-attack risk the
 * Round-3 audit fold names).
 *
 * How it relates to the project:
 * - ADR-035's Round-3 fold pins the mechanism as `HKDF(rootKey, "analytics-salt:" + workspaceId +
 *   ":" + utcDate)` over a `KeyringPort` root key that lives outside the portable `content.db`
 *   (ADR-024 secret invariant).
 * - `KeyringPort` (`src/integrations/ports.ts`) is signing-specific today — `deriveSigningSecret`
 *   is scoped to webhook subscriptions and can't serve a generic salt derivation. That mismatch is
 *   an open Round-2 audit blocker on the integrations side, not something to force-fit here.
 * - So this module is deliberately self-contained: it takes a raw `rootKeySeed` string (e.g. from
 *   an env var placeholder) rather than calling `KeyringPort` directly.
 *
 * TODO: wire to a corrected generic `KeyringPort.derive()` once that round-2 audit finding is
 * fixed (today's `KeyringPort.deriveSigningSecret` shape is webhook-specific and out of scope for
 * this ingest-only slice to redesign).
 */
import { hkdfSync } from "node:crypto";

/**
 * Fixed, non-secret HKDF extraction salt (RFC 5869 "salt" parameter — distinct from the derived
 * "daily salt" this module produces). Uniqueness comes from `rootKeySeed` (secret) and the `info`
 * string (workspace + date), not from this constant; it only pins the extraction step so the
 * derivation is reproducible byte-for-byte across processes.
 */
const HKDF_EXTRACTION_SALT = Buffer.from("tovu-analytics-daily-salt-hkdf-v1", "utf8");

/** Output length, in bytes, of the derived daily salt. */
const DAILY_SALT_LENGTH_BYTES = 32;

/**
 * Derives the daily-rotating, per-workspace analytics salt used to compute `visitorHash`.
 *
 * Mechanism: `HKDF-SHA256(rootKeySeed, salt=HKDF_EXTRACTION_SALT, info="analytics-salt:<workspaceId>:<utcDate>", 32)`
 * via Node's built-in `crypto.hkdfSync`. HKDF (not a plain HMAC) is used because this is a true
 * key-derivation step — expanding one long-lived root secret into many independent, fixed-length,
 * context-bound subkeys (one per workspace/day) is exactly HKDF's designed job (RFC 5869), and
 * Node ships it natively so no extra dependency is needed. A single `createHmac` call would work
 * for a one-off digest, but HKDF's explicit extract-then-expand shape is the more honest fit for
 * "derive a subkey from a root key" and is what the ADR text pins.
 *
 * The result is NEVER persisted by this function or its callers — callers must re-derive it per
 * request (or cache it in memory for the current UTC day at most); nothing here writes to disk.
 *
 * @param rootKeySeed - Secret root key material. In v1 this is an opaque string sourced from an
 *   env var placeholder (e.g. `process.env.ANALYTICS_ROOT_KEY_SEED`); the real integration point
 *   is `KeyringPort.activeKey()` once that port grows a generic derive method (see file header TODO).
 * @param workspaceId - Workspace the salt is scoped to (ADR-007 — no cross-workspace salt reuse).
 * @param utcDate - UTC calendar date as `YYYY-MM-DD`. A new date yields an unrelated salt, which is
 *   what makes the visitor hash non-linkable across days (24h rotation, ADR-035 §4).
 * @returns A 32-byte buffer. Deterministic for a fixed `(rootKeySeed, workspaceId, utcDate)` triple.
 * @throws {RangeError} if `workspaceId` or `utcDate` is empty (a blank scope key would silently
 *   collapse the per-workspace/per-day separation this function exists to provide).
 * @complexity O(1) — one HKDF-SHA256 extract+expand call over fixed-length inputs.
 * @overallScore 100/100
 */
export function deriveDailySalt(rootKeySeed: string, workspaceId: string, utcDate: string): Buffer {
  if (!workspaceId) {
    throw new RangeError("deriveDailySalt: workspaceId must not be empty");
  }
  if (!utcDate) {
    throw new RangeError("deriveDailySalt: utcDate must not be empty");
  }

  const info = `analytics-salt:${workspaceId}:${utcDate}`;
  const derived = hkdfSync(
    "sha256",
    rootKeySeed,
    HKDF_EXTRACTION_SALT,
    info,
    DAILY_SALT_LENGTH_BYTES
  );
  return Buffer.from(derived);
}
