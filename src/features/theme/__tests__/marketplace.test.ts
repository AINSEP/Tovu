import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { isGeneratedPreviewPath } from "../marketplace";

/**
 * @file `isGeneratedPreviewPath` — the predicate `downloadMarketplaceTheme`'s `cpSync` filter uses to
 * exclude `build-preview.mjs`'s generated output from both the catalog and editable copies it writes.
 *
 * Direct unit coverage for the one edge case the download route's own integration test cannot exercise
 * cheaply: a sibling merely PREFIXED with "preview" (`preview-notes/`) must not be excluded — only the
 * exact `preview` directory and its contents. A naive `startsWith("preview")` (no separator) would
 * wrongly exclude that sibling too; this pins the separator-aware check that avoids it.
 */

const FIXTURE_DIR = "/themes/__marketplace__/static/basic";

test("the preview directory itself is excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "preview")), true);
});

test("a file nested inside preview/ is excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "preview", "dark", "index.html")), true);
});

test("a sibling directory merely PREFIXED with 'preview' is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "preview-notes", "todo.md")), false);
});

test("a file literally named 'preview' with no directory separator is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "previewer.js")), false);
});

test("an ordinary file elsewhere in the fixture is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "tokens.json")), false);
});

test("the fixture root itself is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, FIXTURE_DIR), false);
});
