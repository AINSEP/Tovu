import assert from "node:assert/strict";
import test from "node:test";

import { Argon2PasswordHasher } from "@jini-ai/cms/identity/hasher";

/**
 * @file argon2id password hashing (INV-05).
 *
 * Fast cost params here (still real argon2id, not a mock/stub) so the suite
 * stays quick; production uses the OWASP-minimum defaults (see `hasher.ts`).
 */

test("hash/verify round-trip: the correct password verifies, a wrong one does not", async () => {
  const hasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const hash = await hasher.hash("correct-horse-battery-staple");

  assert.ok(hash.startsWith("$argon2id$"));
  assert.equal(await hasher.verify(hash, "correct-horse-battery-staple"), true);
  assert.equal(await hasher.verify(hash, "wrong-password"), false);
});

test("verify never throws on a malformed/foreign hash — fails closed instead", async () => {
  const hasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });

  assert.equal(await hasher.verify("not-a-real-hash", "anything"), false);
  assert.equal(await hasher.verify("", "anything"), false);
});

test("two hashes of the same password are not identical (salted)", async () => {
  const hasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const a = await hasher.hash("same-password");
  const b = await hasher.hash("same-password");

  assert.notEqual(a, b);
  assert.equal(await hasher.verify(a, "same-password"), true);
  assert.equal(await hasher.verify(b, "same-password"), true);
});

test("default cost parameters (OWASP minimum) still produce a working hash", async () => {
  const hasher = new Argon2PasswordHasher();
  const hash = await hasher.hash("default-cost-password");
  assert.equal(await hasher.verify(hash, "default-cost-password"), true);
});
