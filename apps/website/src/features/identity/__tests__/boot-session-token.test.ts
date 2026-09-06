import assert from "node:assert/strict";
import test from "node:test";

import { createBootSessionTokenStore } from "../boot-session-token.js";

/**
 * @file Coverage for the boot-session token store.
 *
 * Every assertion here is a negative one about authorization, because that is where this module can
 * actually hurt someone: a store that answers `true` when it should not turns every `tovu serve`
 * into an open admin. The unarmed case is tested against the inputs a naive `===` would let
 * through, and the single-use property is tested by replaying a token that genuinely worked once.
 */

test("an unarmed store refuses EVERYTHING — there is no permissive arm", () => {
  const store = createBootSessionTokenStore();
  assert.equal(store.isArmed(), false);

  for (const candidate of ["", "anything", "null", null, undefined, 0, {}, [], true]) {
    assert.equal(store.redeem(candidate), false, `unarmed store accepted ${JSON.stringify(candidate)}`);
  }
});

test("mints a 256-bit token and redeems it exactly once", () => {
  const store = createBootSessionTokenStore();
  const token = store.mint();

  assert.equal(typeof token, "string");
  // 32 random bytes as base64url.
  assert.ok(token.length >= 43, `expected a 256-bit token, got ${token.length} chars`);
  assert.equal(store.isArmed(), true);

  assert.equal(store.redeem(token), true);
  assert.equal(store.isArmed(), false, "a redeemed token must not stay armed");
});

test("a REPLAY of a token that already worked fails", () => {
  const store = createBootSessionTokenStore();
  const token = store.mint();
  assert.equal(store.redeem(token), true);
  assert.equal(store.redeem(token), false, "the same token was accepted twice");
});

test("a wrong token does NOT burn the real one", () => {
  // Burning on a bad guess would let any local process disarm the launcher's one redemption.
  const store = createBootSessionTokenStore();
  const token = store.mint();

  assert.equal(store.redeem("not-the-token"), false);
  assert.equal(store.redeem(`${token}x`), false);
  assert.equal(store.redeem(token.slice(0, -1)), false);
  assert.equal(store.isArmed(), true, "a failed guess must leave the real token usable");
  assert.equal(store.redeem(token), true);
});

test("two stores never accept each other's tokens", () => {
  const a = createBootSessionTokenStore();
  const b = createBootSessionTokenStore();
  const tokenA = a.mint();
  b.mint();

  assert.equal(b.redeem(tokenA), false);
  assert.equal(a.redeem(tokenA), true);
});

test("minting again replaces the previous token rather than accumulating", () => {
  const store = createBootSessionTokenStore();
  const first = store.mint();
  const second = store.mint();

  assert.notEqual(first, second);
  assert.equal(store.redeem(first), false, "a superseded token must not be redeemable");
  assert.equal(store.redeem(second), true);
});

test("a short input does not throw — timingSafeEqual would, on unequal lengths", () => {
  const store = createBootSessionTokenStore();
  store.mint();
  assert.doesNotThrow(() => store.redeem("x"));
  assert.equal(store.redeem("x"), false);
});
