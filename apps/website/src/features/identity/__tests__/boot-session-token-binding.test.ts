import assert from "node:assert/strict";
import test from "node:test";

import { mintBootSessionToken, redeemBootSessionToken } from "../boot-session-token-binding.js";

/**
 * @file The process binding of Jini's boot-session token store: mint and redeem must be ONE store.
 *
 * `serve-listen.ts` mints through this binding and `dev-auth.ts`'s boot-session route redeems through
 * it. If the binding ever handed those two sides different stores, every launcher token would be
 * refused and desktop sign-in would fail closed with nothing pointing at the cause. The end-to-end
 * halves are pinned by `serve-command-wiring.unit.test.ts` (serve's emitted token redeems here) and
 * `admin-boot-session-route.test.ts` (a token minted here signs in through the real route).
 */

test("the binding's mint and redeem share one armed, single-use store", () => {
  const token = mintBootSessionToken();
  assert.equal(redeemBootSessionToken({ rawToken: "wrong-token" }), false);
  assert.equal(redeemBootSessionToken({ rawToken: token }), true);
  assert.equal(redeemBootSessionToken({ rawToken: token }), false);
  assert.equal(redeemBootSessionToken({ rawToken: "" }), false);
});
