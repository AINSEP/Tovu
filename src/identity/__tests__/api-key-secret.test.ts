import assert from "node:assert/strict";
import test from "node:test";

import { ScryptApiKeySecretHasher, decoyKeyHash, mintApiKey, parseApiKey } from "../api-key-secret.js";

/**
 * @file Unit proof of the api-key secret lifecycle (SPEC-006 REQ-08 / INV-05) — the half of the
 * feature that has nothing to do with HTTP: what a minted key looks like, what an untrusted string
 * parses to, and what the stored digest does and does not reveal.
 *
 * The route-level counterpart is `server/__tests__/api-key-routes.test.ts`.
 */

test("mintApiKey produces a prefixed key with a 256-bit secret, and never repeats", () => {
  const minted = Array.from({ length: 32 }, () => mintApiKey());

  for (const key of minted) {
    assert.match(key.rawKey, /^tovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);
    assert.equal(key.rawKey, `${key.prefix}.${key.secret}`);
    // 43 base64url characters decode to exactly 32 bytes — the entropy the design rests on.
    assert.equal(Buffer.from(key.secret, "base64url").length, 32);
  }

  assert.equal(new Set(minted.map((key) => key.rawKey)).size, minted.length);
  assert.equal(new Set(minted.map((key) => key.prefix)).size, minted.length);
});

test("parseApiKey round-trips a minted key and rejects everything else", () => {
  const minted = mintApiKey();
  assert.deepEqual(parseApiKey(minted.rawKey), { prefix: minted.prefix, secret: minted.secret });

  const rejected = [
    "",
    "garbage",
    minted.prefix, // prefix with no secret
    `${minted.prefix}.`, // empty secret
    `.${minted.secret}`, // empty prefix
    `tovu_ak_TOOSHORT.${minted.secret}`, // handle is not 12 hex chars
    `tovu_ak_${"0".repeat(13)}.${minted.secret}`, // handle is too long
    `tovu_sk_000000000000.${minted.secret}`, // wrong scheme marker
    `prefixtovu_ak_000000000000.${minted.secret}`, // unanchored match attempt
  ];
  for (const candidate of rejected) {
    assert.equal(parseApiKey(candidate), null, `rejected: ${JSON.stringify(candidate)}`);
  }
});

test("the stored digest verifies the right secret, rejects a wrong one, and leaks neither", async () => {
  const hasher = new ScryptApiKeySecretHasher();
  const minted = mintApiKey();
  const stored = await hasher.hash(minted.secret);

  assert.equal(await hasher.verify(stored, minted.secret), true);
  assert.equal(await hasher.verify(stored, mintApiKey().secret), false);
  assert.equal(await hasher.verify(stored, ""), false);
  assert.equal(await hasher.verify(stored, `${minted.secret}x`), false);

  // INV-05: the digest is not the secret, and does not contain it.
  assert.ok(!stored.includes(minted.secret));
  assert.match(stored, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
});

test("hashing the same secret twice produces different digests (per-key salt)", async () => {
  const hasher = new ScryptApiKeySecretHasher();
  const minted = mintApiKey();

  const [first, second] = await Promise.all([hasher.hash(minted.secret), hasher.hash(minted.secret)]);
  assert.notEqual(first, second, "two hashes of one secret must not collide — no shared salt");
  assert.equal(await hasher.verify(first, minted.secret), true);
  assert.equal(await hasher.verify(second, minted.secret), true);
});

test("verify fails closed on a malformed, foreign, or hostile stored hash instead of throwing", async () => {
  const hasher = new ScryptApiKeySecretHasher();
  const secret = mintApiKey().secret;

  const malformed = [
    "",
    "not-a-hash",
    "scrypt$16384$8$1$onlyfourfields",
    "scrypt$16384$8$1$c2FsdA$", // empty digest
    "scrypt$16384$8$1$$ZGlnZXN0", // empty salt
    "argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZGlnZXN0", // a password hash, not one of ours
    "scrypt$notanumber$8$1$c2FsdA$ZGlnZXN0",
    "scrypt$0$8$1$c2FsdA$ZGlnZXN0",
    // A parameter set large enough to be a memory-exhaustion lever if it were honored.
    "scrypt$1048576$8$1$c2FsdA$ZGlnZXN0",
  ];
  for (const stored of malformed) {
    assert.equal(await hasher.verify(stored, secret), false, `rejected: ${JSON.stringify(stored)}`);
  }
});

test("decoyKeyHash is a real, verifiable-shaped digest that no secret matches, memoized per hasher", async () => {
  const hasher = new ScryptApiKeySecretHasher();

  const first = await decoyKeyHash(hasher);
  const second = await decoyKeyHash(hasher);
  assert.equal(first, second, "memoized: one derivation per hasher per process");
  assert.match(first, /^scrypt\$/);
  // It must be well-formed enough that `verify` actually does the work — a digest that parsed to
  // null would return instantly and defeat the timing defence it exists to provide.
  assert.equal(await hasher.verify(first, mintApiKey().secret), false);

  const other = await decoyKeyHash(new ScryptApiKeySecretHasher());
  assert.notEqual(first, other, "not a shared constant across hashers");
});
