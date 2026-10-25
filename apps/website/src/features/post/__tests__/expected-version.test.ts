import assert from "node:assert/strict";
import test from "node:test";
import { parseExpectedVersion } from "../expected-version.js";
import { PostValidationError } from "../post.js";

// F4.4/F6.2: zero is a valid OCC basis, distinct from an omitted basis.
test("version parsing preserves zero and positive integers while omission remains opt-in", () => {
  assert.equal(parseExpectedVersion(0), 0);
  assert.equal(parseExpectedVersion(7), 7);
  assert.equal(parseExpectedVersion(undefined), undefined);
});

for (const raw of [NaN, Infinity, -Infinity]) {
  test(`version parsing rejects ${String(raw)} with the validation contract`, () => {
    assert.throws(() => parseExpectedVersion(raw), {
      constructor: PostValidationError,
      message: "'expectedVersion' must be a non-negative integer when present",
    });
  });
}

// Stryker lane L14 (expected-version.ts 73.7 %, versionConflictEnvelope never ran in its own suite).
test("versionConflictEnvelope carries the message, the stable code and BOTH versions as structured fields", async () => {
  const { versionConflictEnvelope, VERSION_CONFLICT_CODE } = await import("../expected-version.js");
  const { PostVersionConflictError } = await import("../post.js");
  assert.equal(VERSION_CONFLICT_CODE, "VERSION_CONFLICT");
  assert.deepEqual(versionConflictEnvelope(new PostVersionConflictError("post 'p' changed", 3, 5)), {
    error: "post 'p' changed", code: "VERSION_CONFLICT", details: { expectedVersion: 3, currentVersion: 5 },
  });
  assert.deepEqual(versionConflictEnvelope(new PostVersionConflictError("m", 0, 0)).details, { expectedVersion: 0, currentVersion: 0 });
});
