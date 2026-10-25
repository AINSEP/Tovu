import assert from "node:assert/strict";
import test from "node:test";

import { MemberLoginError } from "#src/features/member-login/index";
import { completionCredential } from "../complete-sign-in.js";
import { proofBody } from "../oidc-verify-email.js";

/**
 * @file F6 fix wave (L12 Stryker top-5): the emailed six-digit code and the strict proof DTO, one
 * table per validator — the code regex is anchored at both ends, the DTO has exactly three known
 * string keys, and each handle has a length cap. Refusals are the fixed LOGIN_INVALID code.
 */

const CODES: readonly [string, unknown, boolean][] = [
  ["six digits", "123456", true], ["all zeros", "000000", true], ["five digits", "12345", false], ["seven digits", "1234567", false],
  ["letters", "abc123", false], ["trailing newline", "123456\n", false], ["leading space", " 123456", false],
  ["trailing junk", "123456x", false], ["leading junk", "x123456", false], ["empty", "", false], ["a number", 123456, false],
  ["full-width digits", "１２３４５６", false],
];
const invalidLogin = (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_INVALID";
const VALID = { continuation: "c", challengeId: "ch-1", code: "123456" };

for (const [label, code, accepted] of CODES) {
  test(`verify-email proof: code ${label} is ${accepted ? "accepted" : "refused"}`, () => {
    if (accepted) assert.deepEqual(proofBody({ body: { ...VALID, code } }), { ...VALID, code });
    else assert.throws(() => proofBody({ body: { ...VALID, code } }), invalidLogin);
  });
  test(`sign-in completion: code ${label} is ${accepted ? "accepted" : "refused"}`, () => {
    const credential = completionCredential({ body: { challengeId: "ch-1", code }, workspaceId: "ws" });
    assert.deepEqual(credential, accepted ? { workspaceId: "ws", challengeId: "ch-1", code } : null);
  });
}

for (const [label, body] of [
  ["null", null], ["an array", [VALID]], ["a string", "x"], ["a missing key", { continuation: "c", challengeId: "ch-1" }],
  ["an extra key", { ...VALID, email: "a@b.example" }], ["a swapped unknown key", { continuation: "c", challengeId: "ch-1", codes: "123456" }],
  ["an empty continuation", { ...VALID, continuation: "" }], ["an 8193-char continuation", { ...VALID, continuation: "c".repeat(8193) }],
  ["a numeric challengeId", { ...VALID, challengeId: 7 }], ["a 256-char challengeId", { ...VALID, challengeId: "h".repeat(256) }],
] as const) {
  test(`verify-email proof refuses ${label}`, () => {
    assert.throws(() => proofBody({ body }), invalidLogin);
  });
}

test("verify-email proof accepts handles exactly at their caps", () => {
  const body = { continuation: "c".repeat(8192), challengeId: "h".repeat(255), code: "654321" };
  assert.deepEqual(proofBody({ body }), body);
});

test("sign-in completion prefers a link token, and refuses a code without a challenge id", () => {
  assert.deepEqual(completionCredential({ body: { token: "t" }, workspaceId: "ws" }), { workspaceId: "ws", token: "t" });
  assert.equal(completionCredential({ body: { token: "" }, workspaceId: "ws" }), null);
  assert.equal(completionCredential({ body: { challengeId: "", code: "123456" }, workspaceId: "ws" }), null);
  assert.equal(completionCredential({ body: { code: "123456" }, workspaceId: "ws" }), null);
});
