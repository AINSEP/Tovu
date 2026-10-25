import assert from "node:assert/strict";
import test from "node:test";

import { isSafeSiteKeyId } from "../site-key-sources.js";

/**
 * @file Regex table for `isSafeSiteKeyId` (Stryker lane L14: `site-key-sources.ts` L105 survivors,
 * AP4). The id is joined into `~/.tovu/site-keys/<id>.hex` from a `.site-meta.json` an imported site
 * controls, so every separator, drive prefix, dot-only name and length bound is refused.
 */

test("isSafeSiteKeyId: UUID-like ids pass; separators, dot-only names, junk and over-length ids are refused", () => {
  const cases: Array<[string, boolean]> = [
    ["3f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f", true], ["a", true], ["A.b_c-1", true], ["...", true], [".a", true], ["a".repeat(128), true],
    ["", false], [".", false], ["..", false], ["a".repeat(129), false], ["a/b", false], ["../x", false], ["a\\b", false],
    ["C:", false], ["a b", false], ["a\n", false], ["\na", false], ["é", false], ["a\0", false],
  ];
  for (const [id, ok] of cases) assert.equal(isSafeSiteKeyId(id), ok, JSON.stringify(id));
});
