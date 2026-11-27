import assert from "node:assert/strict";
import test from "node:test";

import { MemberLoginError } from "@jini-ai/user-management/server";
import { memberCompletionCredential } from "@jini-ai/cms/public-http/routes/members/complete-sign-in";
import { readOidcEmailProof } from "@jini-ai/user-management/member-login/oidc-request";
import { memberStringBody } from "../deps.js";

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
    if (accepted) assert.deepEqual(readOidcEmailProof({ body: { ...VALID, code } }), { ...VALID, code });
    else assert.throws(() => readOidcEmailProof({ body: { ...VALID, code } }), invalidLogin);
  });
  test(`sign-in completion: code ${label} is ${accepted ? "accepted" : "refused"}`, () => {
    const credential = memberCompletionCredential({ body: { challengeId: "ch-1", code } });
    assert.deepEqual(credential, accepted ? { challengeId: "ch-1", code } : null);
  });
}

for (const [label, body] of [
  ["null", null], ["an array", [VALID]], ["a string", "x"], ["a missing key", { continuation: "c", challengeId: "ch-1" }],
  ["an extra key", { ...VALID, email: "a@b.example" }], ["a swapped unknown key", { continuation: "c", challengeId: "ch-1", codes: "123456" }],
  ["an empty continuation", { ...VALID, continuation: "" }], ["an 8193-char continuation", { ...VALID, continuation: "c".repeat(8193) }],
  ["a numeric challengeId", { ...VALID, challengeId: 7 }], ["a 256-char challengeId", { ...VALID, challengeId: "h".repeat(256) }],
] as const) {
  test(`verify-email proof refuses ${label}`, () => {
    assert.throws(() => readOidcEmailProof({ body }), invalidLogin);
  });
}

test("verify-email proof accepts handles exactly at their caps", () => {
  const body = { continuation: "c".repeat(8192), challengeId: "h".repeat(255), code: "654321" };
  assert.deepEqual(readOidcEmailProof({ body }), body);
});

test("sign-in completion prefers a link token, and refuses a code without a challenge id", () => {
  assert.deepEqual(memberCompletionCredential({ body: { token: "t" } }), { token: "t" });
  assert.equal(memberCompletionCredential({ body: { token: "" } }), null);
  assert.equal(memberCompletionCredential({ body: { challengeId: "", code: "123456" } }), null);
  assert.equal(memberCompletionCredential({ body: { code: "123456" } }), null);
});

test("the member sign-in DTO accepts just email and the optional string return path", () => {
  const email = "reader@example.test";
  assert.deepEqual(memberStringBody({ kind: "signIn", body: { email } }), { email });
  assert.deepEqual(memberStringBody({ kind: "signIn", body: { email, redirectPath: "/account" } }), {
    email, redirectPath: "/account",
  });
});

test("the member sign-in DTO refuses non-record bodies", () => {
  for (const body of [null, "reader@example.test", [{ email: "reader@example.test" }]]) {
    assert.equal(memberStringBody({ kind: "signIn", body }), null);
  }
});

test("the member sign-in DTO refuses missing, non-string or unrecognized fields", () => {
  const email = "reader@example.test";
  for (const [label, body] of [
    ["missing email", { redirectPath: "/account" }],
    ["non-string email", { email: 17 }],
    ["non-string optional return path", { email, redirectPath: 17 }],
    ["unrecognized field", { email, workspaceId: "other" }],
  ] as const) {
    assert.equal(memberStringBody({ kind: "signIn", body }), null, label);
  }
});
