import assert from "node:assert/strict";
import test from "node:test";

import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { readShareJobId } from "../site-shares.js";

/**
 * @file F6 fix wave (L12 Stryker top-10, site-shares.ts:14 regex anchors). The share-job body accepts
 * only an optional `jobId` that is exactly a 36-character lower-case UUID shape.
 */

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const refused = (error: unknown) => error instanceof SiteShareRefusal && error.code === "INVALID_INPUT";

test("an absent body, an empty body and a UUID-shaped jobId are accepted", () => {
  assert.equal(readShareJobId({ body: undefined }), undefined);
  assert.equal(readShareJobId({ body: {} }), undefined);
  assert.equal(readShareJobId({ body: { jobId: ID } }), ID);
});

for (const [label, body] of [
  ["a leading-junk id", { jobId: `x${ID}` }], ["a trailing-junk id", { jobId: `${ID}x` }], ["a trailing newline", { jobId: `${ID}\n` }],
  ["an upper-case id", { jobId: ID.toUpperCase() }], ["a 35-char id", { jobId: ID.slice(1) }], ["a numeric id", { jobId: 7 }],
  ["an extra key", { jobId: ID, share: true }], ["an array body", [ID]], ["a string body", ID],
] as const) {
  test(`the share-job body refuses ${label} as INVALID_INPUT`, () => {
    assert.throws(() => readShareJobId({ body }), refused);
  });
}
