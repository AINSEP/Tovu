/**
 * @file Unit tests for the structured-result half of `model-facing-tool-errors.ts` (2026-09-16):
 * `callerSafeErrorMessage` (the allowlist a RETURNED failure message goes through) and
 * `describeErrorForLog` (what a log line may say about an error whose message is not known to be
 * safe). Every planted secret starts with `LEAK-` and must never come back out.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { callerSafeErrorMessage, describeErrorForLog, type CallerSafeErrorRule } from "../../model-facing-tool-errors.js";

class SafeValidationError extends Error {}
class WrapsInnerTextError extends Error {}
class UnlistedError extends Error {}

const RULES: readonly CallerSafeErrorRule[] = [
  { error: SafeValidationError },
  { error: WrapsInnerTextError, message: "the secret store is unavailable" },
];
const FALLBACK = "internal error";

test("a listed class without a fixed message publishes its own message", () => {
  assert.equal(callerSafeErrorMessage(new SafeValidationError("label must be a non-empty string"), { rules: RULES, fallback: FALLBACK }), "label must be a non-empty string");
});

test("a listed class with a fixed message publishes the fixed message, never its own text", () => {
  const message = callerSafeErrorMessage(new WrapsInnerTextError(`unconfigured: "LEAK-TOKEN" is not valid JSON`), { rules: RULES, fallback: FALLBACK });
  assert.equal(message, "the secret store is unavailable");
});

test("unknown means redacted: an unlisted class, a plain Error, a subclass of nothing listed, and a non-Error throw all get the fallback", () => {
  for (const thrown of [new UnlistedError("LEAK-A"), new Error("LEAK-B"), new TypeError("LEAK-C"), "LEAK-D", { message: "LEAK-E" }, undefined]) {
    assert.equal(callerSafeErrorMessage(thrown, { rules: RULES, fallback: FALLBACK }), FALLBACK, String(thrown));
  }
});

test("a subclass of a listed class matches that rule", () => {
  class NarrowerValidationError extends SafeValidationError {}
  assert.equal(callerSafeErrorMessage(new NarrowerValidationError("branch is required"), { rules: RULES, fallback: FALLBACK }), "branch is required");
});

test("describeErrorForLog names the class and a constant-token code, never the message", () => {
  const driverError = Object.assign(new Error("SQLITE_READONLY: attempt to write (/srv/LEAK-path/content.db)"), { code: "SQLITE_READONLY" });
  assert.equal(describeErrorForLog(driverError), "Error(SQLITE_READONLY)");
  assert.equal(describeErrorForLog(new UnlistedError("LEAK-TOKEN")), "UnlistedError");
});

test("describeErrorForLog drops a code that is free text rather than a constant token", () => {
  const error = Object.assign(new Error("boom"), { code: "LEAK-TOKEN value" });
  assert.equal(describeErrorForLog(error), "Error");
});

test("describeErrorForLog describes a direct cause the same way", () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.4.7:443 LEAK-X"), { code: "ECONNREFUSED" });
  assert.equal(describeErrorForLog(new TypeError("fetch failed LEAK-Y", { cause })), "TypeError cause=Error(ECONNREFUSED)");
});

test("describeErrorForLog never stringifies a non-Error throw", () => {
  assert.equal(describeErrorForLog("LEAK-TOKEN"), "string");
  assert.equal(describeErrorForLog({ token: "LEAK-TOKEN" }), "object");
});
