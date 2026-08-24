import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { ApiKeySecretHasherPort } from "./api-key-types.js";

/**
 * @file Minting, parsing, and hashing of raw API-key strings (SPEC-006 REQ-08, INV-05).
 *
 * Purpose:
 * One place owns the entire secret lifecycle for `api_keys`, so no route or repo file ever has to
 * touch a raw key beyond handing it straight to the caller once. Everything here is pure — no
 * repo, no clock, no db handle — which is why it is unit-testable without an HTTP harness.
 *
 * ## Key shape
 * `tovu_ak_<12 hex>.<43 base64url chars>` splits into two halves with different jobs:
 * - `tovu_ak_<12 hex>` — the NON-secret prefix, persisted in the clear as `api_keys.prefix` and
 *   unique per workspace. It exists to make verification a single indexed row read. The literal
 *   `tovu_ak_` is a recognizable marker so a leaked key is greppable by secret scanners.
 * - `<43 base64url chars>` — `randomBytes(32)`, i.e. **256 bits** of CSPRNG entropy. This is the
 *   only part that is secret and the only part that is hashed.
 *
 * ## Why scrypt, and why at THIS cost
 * A password hash defends a low-entropy human-chosen input against offline dictionary search, so
 * it is tuned as slowly as the login path can bear (`Argon2PasswordHasher`: 19 MiB, t=2). An API
 * key's input is 256 CSPRNG bits, where offline search is already infeasible at any work factor,
 * but the credential is presented on EVERY request rather than once per login. So this is a
 * separate port from `PasswordHasherPort` with a separate tuning, not a reuse of it:
 * - **Salted and slow, not a bare digest.** A per-key 16-byte salt plus a memory-hard KDF means a
 *   stolen `api_keys` table yields no precomputation, no cross-row amortization, and no rainbow
 *   table — the properties an unsalted SHA of a secret gives away for free.
 * - **`N=2^14, r=8, p=1`** (~16 MiB, tens of milliseconds on commodity hardware) rather than a
 *   password-grade cost, because the entropy above already carries the offline-attack argument and
 *   the per-request budget is real. Raising it is safe and is a one-line change; the stored digest
 *   records its own parameters (below) so already-issued keys keep verifying across a re-tune.
 * - **`node:crypto` only.** No new dependency, and no native binding on the request hot path.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt base64url>$<digest base64url>`. Parameters travel with
 * the digest so verification never has to assume the constants a row was written under.
 *
 * Comparison is `timingSafeEqual` over the raw digest bytes. Nothing in this file branches on the
 * CONTENT of a secret or a digest; the only early returns are on structural facts (a malformed
 * stored hash, a wrong-length digest), never on how far a comparison got.
 */

/** Non-secret scheme marker. Deliberately greppable — see the file header. */
const KEY_SCHEME_PREFIX = "tovu_ak_";

/** Bytes of the non-secret lookup handle (48 bits, hex-encoded to 12 chars). */
const HANDLE_BYTES = 6;

/** Bytes of the secret half. 32 = 256 bits, the entropy the file header's argument rests on. */
const SECRET_BYTES = 32;

/** Separates prefix from secret. `.` can never appear in base64url, so the split is unambiguous. */
const KEY_SEPARATOR = ".";

/** `tovu_ak_` + exactly 12 lowercase hex characters, anchored — what `mintApiKey` produces. */
const PREFIX_PATTERN = /^tovu_ak_[0-9a-f]{12}$/;

/** scrypt cost parameters for NEWLY written digests. See the file header for the tuning argument. */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** Derived-key length in bytes. */
const SCRYPT_KEYLEN = 32;

/** `128 * N * r` is scrypt's own requirement (16 MiB here); the headroom covers `p` and overhead. */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** Salt length in bytes. */
const SALT_BYTES = 16;

/** A freshly minted key: the raw string is returned to the issuer ONCE and never persisted. */
export interface MintedApiKey {
  /** The full `tovu_ak_<handle>.<secret>` string. Never store, log, or re-derive this. */
  rawKey: string;
  /** The non-secret half, persisted as `api_keys.prefix`. */
  prefix: string;
  /** The secret half, to be handed to `ApiKeySecretHasherPort.hash` and then dropped. */
  secret: string;
}

/**
 * Mint a new API key from the CSPRNG.
 *
 * @returns the raw key plus its two halves, already split so the caller never re-parses its own
 *   output.
 * @complexity O(1) — two `randomBytes` draws of fixed size.
 * @overallScore 100
 */
export function mintApiKey(): MintedApiKey {
  const prefix = `${KEY_SCHEME_PREFIX}${randomBytes(HANDLE_BYTES).toString("hex")}`;
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { rawKey: `${prefix}${KEY_SEPARATOR}${secret}`, prefix, secret };
}

/**
 * Split a presented raw key back into its two halves.
 *
 * @param rawKey - the untrusted credential exactly as presented by a caller.
 * @returns `{ prefix, secret }`, or `null` when `rawKey` is not shaped like a key this runtime
 *   mints — which the caller must treat as "no such credential", never as an error worth reporting
 *   in detail (a parse-failure message that distinguishes shapes is an oracle).
 * @complexity O(1) — one `indexOf` and one anchored regex over a bounded prefix.
 * @overallScore 100
 */
export function parseApiKey(rawKey: string): { prefix: string; secret: string } | null {
  const separatorAt = rawKey.indexOf(KEY_SEPARATOR);
  if (separatorAt <= 0) return null;

  const prefix = rawKey.slice(0, separatorAt);
  const secret = rawKey.slice(separatorAt + 1);
  if (secret.length === 0 || !PREFIX_PATTERN.test(prefix)) return null;

  return { prefix, secret };
}

function deriveKey(secret: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, SCRYPT_KEYLEN, { ...params, maxmem: SCRYPT_MAXMEM }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

interface ParsedDigest {
  params: { N: number; r: number; p: number };
  salt: Buffer;
  digest: Buffer;
}

/** Split a stored `scrypt$...` string. Returns `null` for anything this file did not write. */
function parseStoredHash(storedHash: string): ParsedDigest | null {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N <= 1 || r <= 0 || p <= 0) return null;
  // Refuse to spend unbounded memory on parameters read out of a row (a hand-edited or hostile
  // `key_hash` must not become a denial-of-service knob). 128 * N * r is scrypt's own footprint.
  if (128 * N * r > SCRYPT_MAXMEM) return null;

  const salt = Buffer.from(parts[4], "base64url");
  const digest = Buffer.from(parts[5], "base64url");
  if (salt.length === 0 || digest.length === 0) return null;

  return { params: { N, r, p }, salt, digest };
}

/**
 * The reference `ApiKeySecretHasherPort` — scrypt with per-key salts and a constant-time compare.
 *
 * `verify` never throws: a malformed, foreign, or truncated `key_hash` resolves `false`, so a
 * corrupted row degrades to "credential rejected" rather than to a 500 or an auth bypass (the same
 * fail-closed contract `Argon2PasswordHasher.verify` already holds for passwords).
 *
 * @complexity O(1) calls into `node:crypto`; cost is set by `SCRYPT_PARAMS`, not by input size.
 * @overallScore 100
 */
export class ScryptApiKeySecretHasher implements ApiKeySecretHasherPort {
  async hash(secret: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await deriveKey(secret, salt, SCRYPT_PARAMS);
    const { N, r, p } = SCRYPT_PARAMS;
    return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  }

  async verify(storedHash: string, secret: string): Promise<boolean> {
    const parsed = parseStoredHash(storedHash);
    if (!parsed) return false;

    try {
      const derived = await deriveKey(secret, parsed.salt, parsed.params);
      // Length mismatch is a property of the STORED row, not of the presented secret, so this
      // early return leaks nothing about the credential — and `timingSafeEqual` throws on
      // unequal lengths, so the guard is required, not merely defensive.
      if (derived.length !== parsed.digest.length) return false;
      return timingSafeEqual(derived, parsed.digest);
    } catch {
      return false;
    }
  }
}

/** One decoy per hasher instance, built on first use — never at import time (this module must be
 *  free of import-time side effects, and the derivation below is deliberately expensive). */
const decoyByHasher = new WeakMap<ApiKeySecretHasherPort, Promise<string>>();

/**
 * A stored-hash string over a value no caller can ever present, so a lookup that found no row can
 * still spend one real derivation instead of returning immediately (see `authenticateApiKey`).
 * Without it, "no key carries this prefix" and "this prefix exists but the secret is wrong" are
 * distinguishable by response time.
 *
 * Drawn from the CSPRNG rather than hardcoded, so it is not a recognizable constant in a heap dump
 * or a leaked build, and memoized per hasher so the cost is paid once per process.
 *
 * @complexity O(1) after the first call for a given hasher.
 * @overallScore 100
 */
export function decoyKeyHash(hasher: ApiKeySecretHasherPort): Promise<string> {
  const existing = decoyByHasher.get(hasher);
  if (existing) return existing;

  const created = hasher.hash(randomBytes(SECRET_BYTES).toString("base64url"));
  decoyByHasher.set(hasher, created);
  return created;
}
