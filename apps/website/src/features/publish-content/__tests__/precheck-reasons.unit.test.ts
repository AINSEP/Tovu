import assert from "node:assert/strict";
import test from "node:test";

import {
  addressHeldByOther,
  addressHeldInTrash,
  changedSincePlan,
  malformedKey,
  missingDependency,
  notWired,
  tombstonedAtDestination,
  trashedAtDestination,
} from "../precheck-reasons.js";
import { friendlyPublishReason } from "../ui/report-rows.js";

/**
 * @file Exact-sentence pins for every `precheck-reasons.ts` builder (Stryker lane L14: 12.5 %). The
 * sentences are a wire contract with `ui/report-rows.ts`'s `REASON_REWRITES`; a wording drift would
 * leak raw ids to the owner, so each one is pinned verbatim AND shown to be rewritten.
 */

const CASES: ReadonlyArray<readonly [string, string]> = [
  [notWired("media", "m-1", "media ports"), "media entity 'm-1' cannot be prechecked — no media ports wired for this deps bag"],
  [addressHeldByOther("post", "slug", "hello", "p-2"), "slug 'hello' is already held by a different post ('p-2')"],
  [
    addressHeldInTrash("post", "slug", "hello", "p-2"),
    "post 'p-2' is in the trash at this destination and still holds slug 'hello' — restore it, or delete it permanently from the Trash, before publishing",
  ],
  [
    trashedAtDestination("page", "pg-1"),
    "page 'pg-1' is in the trash at this destination — restore it before publishing over it, or publishing would resurrect it as live content",
  ],
  [changedSincePlan("media", "m-1", "version moved"), "media 'm-1' changed on the destination during apply: version moved"],
  [missingDependency("entry", "e-1", "content-type", "recipe"), "entry 'e-1' depends on content-type 'recipe', which is missing at this destination"],
  [malformedKey("redirect", "x", "<from>|<to>"), "redirect entity 'x' has a malformed natural key (expected '<from>|<to>')"],
  [tombstonedAtDestination("widget", "w-1"), "widget 'w-1' is permanently removed at this destination and cannot be republished over"],
];

test("every precheck-reason builder produces its exact pinned sentence", () => {
  for (const [actual, expected] of CASES) assert.equal(actual, expected);
});

test("every builder's sentence is rewritten by report-rows (never passed through raw to the owner)", () => {
  for (const [reason] of CASES) {
    const friendly = friendlyPublishReason(reason);
    assert.notEqual(friendly, reason, `not rewritten: ${reason}`);
    for (const id of ["m-1", "p-2", "pg-1", "e-1", "w-1", "recipe", "hello"]) {
      assert.equal(friendly.includes(`'${id}'`), false, `friendly text leaks the quoted id ${id}: ${friendly}`);
    }
  }
});
