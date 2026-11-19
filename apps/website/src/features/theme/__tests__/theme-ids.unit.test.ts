import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_THEME_ID, RENAMED_THEME_IDS, themeIdCandidates } from "#src/contracts/core/theme-ids";

/** @file Value pins for the theme ids every reader shares, so a move can never change them. */

test("NO_THEME_ID is the stored 'theme off' value", () => {
  assert.equal(NO_THEME_ID, "none");
});

test("a renamed theme resolves current-first from either name; other ids stand alone", () => {
  assert.deepEqual(RENAMED_THEME_IDS, { basic: "tovu-theme" });
  assert.deepEqual(themeIdCandidates({ id: "basic" }), ["tovu-theme", "basic"]);
  assert.deepEqual(themeIdCandidates({ id: "tovu-theme" }), ["tovu-theme", "basic"]);
  assert.deepEqual(themeIdCandidates({ id: "other" }), ["other"]);
});
