import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mintApiKey, parseApiKey, ScryptApiKeySecretHasher } from "#src/features/identity/api-key-secret";

/**
 * @file P3 + P4 (S0): the API key wire format and the stored-hash format, N-1. Installed sites hold
 * issued keys (the raw string lives only with their holders) and `api_keys` rows (prefix + stored
 * hash); a moved or re-tuned implementation must keep both readable. Fixtures are literals made up for
 * this test (a made-up secret class, never a real key) and were produced once by running the code
 * that is pinned; a test never regenerates its own fixture.
 */

const FROZEN_SECRET = "lane-su-fixture-secret-0123456789abcdefABCDEF_-xyz";
/** Written by `ScryptApiKeySecretHasher.hash` for FROZEN_SECRET: N=2^14, r=8, p=1. */
const FROZEN_STORED_HASH = "scrypt$16384$8$1$GBylIK2yWzKrYxiq394BgA$orx8gHcfTPfMz73SDaFnGrbMwr82EEUbOj0PhqJ8wlI";
/** Correct digest of FROZEN_SECRET but with N=2^17 (128 MiB): above the 64 MiB ceiling, so refused. */
const OVER_CEILING_STORED_HASH = "scrypt$131072$8$1$bGFuZS1zdS1zYWx0LTE2YiE$h_ZIKpLyY9LAQgNW9FqIFZxDuyZ7fJWp_gXQpzIlcSY";

const [FROZEN_SCHEME, , , , FROZEN_SALT, FROZEN_DIGEST] = FROZEN_STORED_HASH.split("$");

describe("P3 API key wire format", () => {
  test("mintApiKey produces tovu_ak_<12 hex>.<43 base64url chars> with prefix and secret split", () => {
    const minted = mintApiKey();
    assert.match(minted.prefix, /^tovu_ak_[0-9a-f]{12}$/);
    assert.match(minted.secret, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(minted.rawKey, `${minted.prefix}.${minted.secret}`);
    assert.match(minted.rawKey, /^tovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);
  });

  test("parseApiKey accepts a frozen literal and splits it at the first separator", () => {
    assert.deepEqual(parseApiKey({ rawKey: "tovu_ak_0123456789ab.AbCdEf_-0123" }), { prefix: "tovu_ak_0123456789ab", secret: "AbCdEf_-0123" });
  });

  test("parseApiKey rejects a wrong scheme, a wrong handle length, a missing separator and an empty secret", () => {
    for (const rawKey of [
      "other_ak_0123456789ab.secret", "tovu_ak_0123456789a.secret", "tovu_ak_0123456789abc.secret",
      "tovu_ak_0123456789AB.secret", "tovu_ak_0123456789absecret", ".secret", "tovu_ak_0123456789ab.", "",
    ]) {
      assert.equal(parseApiKey({ rawKey }), null, rawKey);
    }
  });
});

describe("P4 API key stored hash, N-1", () => {
  const hasher = new ScryptApiKeySecretHasher();

  test("a frozen stored hash verifies its secret and refuses a one-character-different secret", async () => {
    assert.equal(await hasher.verify({ storedHash: FROZEN_STORED_HASH, secret: FROZEN_SECRET }), true);
    assert.equal(await hasher.verify({ storedHash: FROZEN_STORED_HASH, secret: `${FROZEN_SECRET.slice(0, -1)}X` }), false);
  });

  test("new hashes keep the frozen layout and verify under the frozen parameters", async () => {
    const stored = await hasher.hash({ secret: FROZEN_SECRET });
    assert.match(stored, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    assert.equal(await hasher.verify({ storedHash: stored, secret: FROZEN_SECRET }), true);
  });

  test("out-of-bounds or malformed stored hashes are refused without throwing", async () => {
    const withParts = (parts: string[]) => parts.join("$");
    for (const storedHash of [
      OVER_CEILING_STORED_HASH,
      withParts([FROZEN_SCHEME, "16384", "8", "1", FROZEN_SALT]),
      withParts([FROZEN_SCHEME, "16384", "8", "1", FROZEN_SALT, FROZEN_DIGEST, "extra"]),
      withParts([FROZEN_SCHEME, "1", "8", "1", FROZEN_SALT, FROZEN_DIGEST]),
      withParts([FROZEN_SCHEME, "1.5", "8", "1", FROZEN_SALT, FROZEN_DIGEST]),
      withParts([FROZEN_SCHEME, "16384", "0", "1", FROZEN_SALT, FROZEN_DIGEST]),
      withParts([FROZEN_SCHEME, "16384", "8", "0", FROZEN_SALT, FROZEN_DIGEST]),
      withParts(["bcrypt", "16384", "8", "1", FROZEN_SALT, FROZEN_DIGEST]),
      withParts([FROZEN_SCHEME, "16384", "8", "1", "", FROZEN_DIGEST]),
      "",
    ]) {
      assert.equal(await hasher.verify({ storedHash, secret: FROZEN_SECRET }), false, storedHash);
    }
  });
});
