import assert from "node:assert/strict";
import test from "node:test";

import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { readShareInput, readStaticShareInput } from "../site-shares.js";

/**
 * @file P11 ST-12a: the create bodies (backup and static) may carry the owner's link expiry. Absent
 * is left absent and null is Never (the default); only 7, 30 or 90 days are accepted, and every other
 * value is refused in plain words, never coerced. Whether the destination may expire is the backend's
 * check, before any job.
 */
const refusedInPlainWords = (error: unknown) => error instanceof SiteShareRefusal && error.code === "INVALID_INPUT"
  && error.message === "A share link can expire after 7, 30 or 90 days, or never.";
const JOB = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("an absent expiry stays absent and null is Never", () => {
  assert.deepEqual(readShareInput({ body: {} }), {});
  assert.deepEqual(readShareInput({ body: { expiresInDays: null } }), { expiresInDays: null });
  assert.deepEqual(readStaticShareInput({ body: undefined }), {});
  assert.deepEqual(readStaticShareInput({ body: { expiresInDays: null } }), { expiresInDays: null });
});

for (const days of [7, 30, 90] as const) {
  test(`${days} days is accepted beside a jobId and beside a static selection`, () => {
    assert.deepEqual(readShareInput({ body: { jobId: JOB, expiresInDays: days } }), { jobId: JOB, expiresInDays: days });
    assert.deepEqual(readStaticShareInput({ body: { jobId: JOB, expiresInDays: days } }), { jobId: JOB, expiresInDays: days });
  });
}

for (const days of [0, 14, "7", 7.5, -30, true, {}]) {
  test(`expiresInDays ${JSON.stringify(days)} is refused`, () => {
    assert.throws(() => readShareInput({ body: { expiresInDays: days } }), refusedInPlainWords);
    assert.throws(() => readStaticShareInput({ body: { expiresInDays: days } }), refusedInPlainWords);
  });
}

test("other unknown keys are still refused beside an expiry", () => {
  assert.throws(() => readShareInput({ body: { expiresInDays: 7, share: true } }), { code: "INVALID_INPUT" });
  assert.throws(() => readStaticShareInput({ body: { expiresInDays: 7, share: true } }), { code: "INVALID_INPUT" });
});
