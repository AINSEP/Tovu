import assert from "node:assert/strict";
import test from "node:test";

import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { readShareInput } from "../site-shares.js";

/**
 * @file P11 ST-12a: the create body may carry the owner's link expiry. Absent or null is Never (the
 * default); only 7, 30 or 90 days are accepted, and every other value is refused, never coerced.
 */
const refusedInPlainWords = (error: unknown) => error instanceof SiteShareRefusal && error.code === "INVALID_INPUT"
  && error.message === "A share link can expire after 7, 30 or 90 days, or never.";

test("an absent expiry stays absent and null is Never", () => {
  assert.deepEqual(readShareInput({ body: {} }), {});
  assert.deepEqual(readShareInput({ body: { expiresInDays: null } }), { expiresInDays: null });
});

for (const days of [7, 30, 90]) {
  test(`${days} days is accepted beside a jobId`, () => {
    const jobId = "0f8fad5b-d9cb-469f-a165-70867728950e";
    assert.deepEqual(readShareInput({ body: { jobId, expiresInDays: days } }), { jobId, expiresInDays: days });
  });
}

for (const days of [0, 14, "7", 7.5, -30, true]) {
  test(`expiresInDays ${JSON.stringify(days)} is refused`, () => {
    assert.throws(() => readShareInput({ body: { expiresInDays: days } }), refusedInPlainWords);
  });
}
