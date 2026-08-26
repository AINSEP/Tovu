import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPendingAuthorizationStore } from "../pending-authorizations.js";
import { assertValidCodeVerifier, createPkcePair, deriveCodeChallenge } from "../pkce.js";
import { assertOAuthThrows, createTestClock } from "./helpers.js";

/**
 * @file PKCE (RFC 7636) and the single-use `state` ledger — the two mechanisms that make a PUBLIC
 * callback route safe to expose.
 *
 * The assertions here are the ones that would actually catch a regression that matters: that the
 * challenge is a real S256 digest rather than the verifier echoed back, that a state cannot be
 * replayed, that it cannot be redeemed against a connection it was not issued for, and that a
 * failed owner check still consumes it.
 */

test("the PKCE challenge is the S256 digest of the verifier, not the verifier", () => {
  const pair = createPkcePair();

  assert.notEqual(pair.codeChallenge, pair.codeVerifier);
  assert.equal(pair.codeChallengeMethod, "S256");
  assert.equal(pair.codeChallenge, createHash("sha256").update(pair.codeVerifier, "ascii").digest("base64url"));
});

test("a minted verifier satisfies RFC 7636's length and charset rules", () => {
  for (let i = 0; i < 32; i += 1) {
    const { codeVerifier } = createPkcePair();
    assert.ok(codeVerifier.length >= 43 && codeVerifier.length <= 128, `length ${codeVerifier.length} out of range`);
    assert.match(codeVerifier, /^[A-Za-z0-9\-._~]+$/);
  }
});

test("two mints never collide", () => {
  const verifiers = new Set(Array.from({ length: 64 }, () => createPkcePair().codeVerifier));
  assert.equal(verifiers.size, 64);
});

test("a too-short verifier is refused with the RFC's own bounds in the message", () => {
  const error = assertOAuthThrows(() => assertValidCodeVerifier("a".repeat(42)), "OAUTH_INVALID_REQUEST");
  assert.equal(error.message, "PKCE code verifier must be 43–128 characters (RFC 7636 §4.1)");
  assert.equal(error.retryable, false);
});

test("a too-long verifier is refused", () => {
  assertOAuthThrows(() => assertValidCodeVerifier("a".repeat(129)), "OAUTH_INVALID_REQUEST");
});

test("a verifier outside the unreserved charset is refused rather than silently hashed", () => {
  const error = assertOAuthThrows(() => deriveCodeChallenge(`${"a".repeat(42)}/`), "OAUTH_INVALID_REQUEST");
  assert.equal(error.message, "PKCE code verifier contains characters outside RFC 7636's unreserved set");
});

test("a state is single use — the second redemption fails", () => {
  const clock = createTestClock();
  const store = createPendingAuthorizationStore({ clock });
  const entry = store.put({ ownerKey: "ws:server", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  assert.equal(store.take({ state: entry.state, ownerKey: "ws:server" }).state, entry.state);
  const error = assertOAuthThrows(() => store.take({ state: entry.state, ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(error.message, "the authorization request could not be matched — it may have expired or already been used");
});

test("a state cannot be redeemed against a different connection", () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const entry = store.put({ ownerKey: "ws:server-a", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  assertOAuthThrows(() => store.take({ state: entry.state, ownerKey: "ws:server-b" }), "OAUTH_INVALID_STATE");
});

test("a failed owner check still consumes the state, so it cannot be used as a retry oracle", () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const entry = store.put({ ownerKey: "ws:server-a", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });

  assertOAuthThrows(() => store.take({ state: entry.state, ownerKey: "ws:server-b" }), "OAUTH_INVALID_STATE");
  // The CORRECT owner must now also fail: the entry is gone.
  assertOAuthThrows(() => store.take({ state: entry.state, ownerKey: "ws:server-a" }), "OAUTH_INVALID_STATE");
});

test("a state expires and is pruned rather than lingering redeemable", () => {
  const clock = createTestClock();
  const store = createPendingAuthorizationStore({ clock, ttlMs: 60_000 });
  const entry = store.put({ ownerKey: "ws:server", providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] });
  assert.equal(store.size(), 1);

  clock.advance(60_001);
  assertOAuthThrows(() => store.take({ state: entry.state, ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(store.size(), 0);
});

test("the store is bounded — at the cap the oldest entry is evicted, never the newest refused", () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock(), maxEntries: 3 });
  const entries = Array.from({ length: 4 }, (_unused, index) =>
    store.put({ ownerKey: `ws:server-${index}`, providerId: "p", codeVerifier: "v".repeat(43), redirectUri: "https://tovu.example/cb", scopes: [] }),
  );

  const [oldest, , , newest] = entries;
  assert.ok(oldest && newest);
  assert.equal(store.size(), 3);
  // Oldest gone...
  assertOAuthThrows(() => store.take({ state: oldest.state, ownerKey: "ws:server-0" }), "OAUTH_INVALID_STATE");
  // ...newest still redeemable, which is the property that keeps one caller from wedging the flow.
  assert.equal(store.take({ state: newest.state, ownerKey: "ws:server-3" }).ownerKey, "ws:server-3");
});

test("an unknown state is refused with the same message as an expired one", () => {
  const store = createPendingAuthorizationStore({ clock: createTestClock() });
  const error = assertOAuthThrows(() => store.take({ state: "not-a-real-state", ownerKey: "ws:server" }), "OAUTH_INVALID_STATE");
  assert.equal(error.message, "the authorization request could not be matched — it may have expired or already been used");
});
