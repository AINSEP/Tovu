import assert from "node:assert/strict";
import test from "node:test";

import { MemberLoginError } from "#src/features/member-login/index";
import { callbackParams } from "../oidc-callback.js";
import { MemberOidcCancelled } from "../oidc-deps.js";

/**
 * @file F6 fix wave (L12 Stryker top-6, oidc-callback.ts:18-19): the provider callback's code/state
 * are non-empty single strings with hard caps (4096 / 16384), tested at cap and cap+1; a provider
 * error is refused, and only `access_denied` is the kinder "cancelled" outcome.
 */

const read = (query: Record<string, unknown>) => callbackParams({ req: { query } as never });
const invalidLogin = (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_INVALID";

test("a code and state exactly at their caps are accepted", () => {
  const query = { code: "c".repeat(4096), state: "s".repeat(16384) };
  assert.deepEqual(read(query), query);
});

for (const [label, query] of [
  ["a 4097-char code", { code: "c".repeat(4097), state: "s" }], ["a 16385-char state", { code: "c", state: "s".repeat(16385) }],
  ["an empty code", { code: "", state: "s" }], ["an empty state", { code: "c", state: "" }],
  ["a missing state", { code: "c" }], ["a missing code", { state: "s" }],
  ["a repeated code", { code: ["c", "d"], state: "s" }], ["an object state", { code: "c", state: { a: "s" } }],
  ["a provider error with valid params", { code: "c", state: "s", error: "server_error" }],
] as const) {
  test(`the callback refuses ${label} as LOGIN_INVALID`, () => {
    assert.throws(() => read(query), invalidLogin);
  });
}

test("access_denied is the cancelled outcome even without a code", () => {
  assert.throws(() => read({ error: "access_denied" }), (error: unknown) => error instanceof MemberOidcCancelled);
});
