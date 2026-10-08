import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPendingAuthorizationStore } from "../pending-authorizations.js";
import { assertValidCodeVerifier, createPkcePair, deriveCodeChallenge } from "@jini-ai/oauth";
import { assertOAuthRejects, assertOAuthThrows, createTestClock } from "./helpers.js";

/**
 * @file PKCE (RFC 7636) and the single-use `state` ledger — the two mechanisms that make a PUBLIC
 * callback route safe to expose.
 *
 * The assertions here are the ones that would actually catch a regression that matters: that the
 * challenge is a real S256 digest rather than the verifier echoed back, that a state cannot be
 * replayed, that it cannot be redeemed against a connection it was not issued for, and that a
 * failed owner check still consumes it.

 *
 * Design history from the retired Tovu pkce module. The implementation now lives in
 * Jini/packages/oauth/src/pkce.ts; these assertions retain its security argument.
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
 * RFC 7636 §4.1: 43–128 characters from the unreserved set. 32 random bytes base64url-encode to
 *  exactly 43, the minimum, which is also the recommended entropy floor.
 * RFC 7636 §4.1's `unreserved` production, verbatim.
 * The secret half. Persisted server-side with the pending authorization; never sent to the browser.
 * The public half, sent on the authorization request.
 * Rejects a code verifier that RFC 7636 would not accept.
 *
 * Exported because the verifier survives a round trip through a store between `begin` and
 * `complete`, and a value that was tampered with in that gap must fail loudly at use rather than be
 * sent to a token endpoint that will reject it with a less useful message.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when the verifier is the wrong length or charset.
 * @complexity O(n) in the verifier length, which is capped at 128.
 * Derives the `S256` challenge for a verifier.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` via {@link assertValidCodeVerifier}.
 * @complexity O(n) — one SHA-256 over at most 128 bytes.
 * Mints a fresh PKCE pair.
 *
 * @param randomBytesFn - Explicitly injected so tests can pin the verifier. Tovu supplies
 *   `node:crypto`'s CSPRNG; `Math.random` would be a real vulnerability here, not a style choice.
 * @complexity O(1).
 */

test("the PKCE challenge is the S256 digest of the verifier, not the verifier", () => {
  const pair = createPkcePair({ randomBytesFn: ({ byteLength }) => randomBytes(byteLength) });

  assert.notEqual(pair.codeChallenge, pair.codeVerifier);
  assert.equal(pair.codeChallengeMethod, "S256");
  assert.equal(pair.codeChallenge, createHash("sha256").update(pair.codeVerifier, "ascii").digest("base64url"));
});

test("a minted verifier satisfies RFC 7636's length and charset rules", () => {
  for (let i = 0; i < 32; i += 1) {
    const { codeVerifier } = createPkcePair({ randomBytesFn: ({ byteLength }) => randomBytes(byteLength) });
    assert.ok(codeVerifier.length >= 43 && codeVerifier.length <= 128, `length ${codeVerifier.length} out of range`);
    assert.match(codeVerifier, /^[A-Za-z0-9\-._~]+$/);
  }
});

test("two mints never collide", () => {
  const verifiers = new Set(Array.from({ length: 64 }, () => createPkcePair({ randomBytesFn: ({ byteLength }) => randomBytes(byteLength) }).codeVerifier));
  assert.equal(verifiers.size, 64);
});

test("a too-short verifier is refused with the RFC's own bounds in the message", () => {
  const error = assertOAuthThrows(() => assertValidCodeVerifier({ codeVerifier: "a".repeat(42) }), "OAUTH_INVALID_REQUEST");
  assert.equal(error.message, "PKCE code verifier must be 43–128 characters (RFC 7636 §4.1)");
  assert.equal(error.retryable, false);
});

test("a too-long verifier is refused", () => {
  assertOAuthThrows(() => assertValidCodeVerifier({ codeVerifier: "a".repeat(129) }), "OAUTH_INVALID_REQUEST");
});

test("a verifier outside the unreserved charset is refused rather than silently hashed", () => {
  const error = assertOAuthThrows(() => deriveCodeChallenge({ codeVerifier: `${"a".repeat(42)}/` }), "OAUTH_INVALID_REQUEST");
  assert.equal(error.message, "PKCE code verifier contains characters outside RFC 7636's unreserved set");
});

test("a state is single use — the second redemption fails", async () => {
  const clock = createTestClock();
  const store = createPendingAuthorizationStore({ clock });
  const entry = await store.put({ ownerKey: "ws:server", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  assert.equal((await store.take({ state: entry.state, ownerKey: "ws:server" })).state, entry.state);
  const error = await assertOAuthRejects(() => store.take({ state: entry.state, ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(error.message, "the authorization request could not be matched — it may have expired or already been used");
});

test("a state cannot be redeemed against a different connection", async () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const entry = await store.put({ ownerKey: "ws:server-a", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  await assertOAuthRejects(() => store.take({ state: entry.state, ownerKey: "ws:server-b" }), "OAUTH_INVALID_STATE");
});

test("a failed owner check still consumes the state, so it cannot be used as a retry oracle", async () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const entry = await store.put({ ownerKey: "ws:server-a", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  await assertOAuthRejects(() => store.take({ state: entry.state, ownerKey: "ws:server-b" }), "OAUTH_INVALID_STATE");
  // The CORRECT owner must now also fail: the entry is gone.
  await assertOAuthRejects(() => store.take({ state: entry.state, ownerKey: "ws:server-a" }), "OAUTH_INVALID_STATE");
});

test("a state expires and is pruned rather than lingering redeemable", async () => {
  const clock = createTestClock();
  const store = createPendingAuthorizationStore({ clock }, { ttlMs: 60_000 });
  const entry = await store.put({ ownerKey: "ws:server", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });
  assert.equal(await store.size({}), 1);

  clock.advance(60_001);
  await assertOAuthRejects(() => store.take({ state: entry.state, ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(await store.size({}), 0);
});

test("the store is bounded — at the cap the oldest entry is evicted, never the newest refused", async () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() }, { maxEntries: 3 });
  // Sequential `await`s, not `Promise.all` — insertion order is what "oldest" below depends on.
  const entries = [];
  for (let index = 0; index < 4; index += 1) {
    entries.push(
      await store.put({ ownerKey: `ws:server-${index}`, providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] }),
    );
  }

  const [oldest, , , newest] = entries;
  assert.ok(oldest && newest);
  assert.equal(await store.size({}), 3);
  // Oldest gone...
  await assertOAuthRejects(() => store.take({ state: oldest.state, ownerKey: "ws:server-0" }), "OAUTH_INVALID_STATE");
  // ...newest still redeemable, which is the property that keeps one caller from wedging the flow.
  assert.equal((await store.take({ state: newest.state, ownerKey: "ws:server-3" })).ownerKey, "ws:server-3");
});

test("an unknown state is refused with the same message as an expired one", async () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const error = await assertOAuthRejects(() => store.take({ state: "not-a-real-state", ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(error.message, "the authorization request could not be matched — it may have expired or already been used");
});

// REGRESSION: fails if the store adapter returns its mutable internal scopes array.
test("pending authorization cannot be rewritten through the returned scopes", async () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const scopes = ["read"];
  const entry = await store.put({ ownerKey: "ws:server", providerId: "p", codeVerifier: "v", redirectUri: "https://tovu.example.com/cb", scopes });
  scopes.push("write");
  const redeemed = await store.take({ state: entry.state, ownerKey: "ws:server" });
  assert.deepEqual(redeemed.scopes, ["read"]);
});

// REGRESSION: fails if invalid capacity falls through to the old permissive Map implementation.
test("pending authorization rejects invalid limits at construction", () => {
  for (const maxEntries of [0, -1, NaN])
    assert.throws(() => createPendingAuthorizationStore({ clock: createTestClock() }, { maxEntries }));
});
