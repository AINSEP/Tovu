import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isGeneratedPreviewPath, listMarketplaceThemes } from "../marketplace.js";

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

test("a file named 'previewer.js' is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "previewer.js")), false);
});

test("an ordinary file elsewhere in the fixture is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, join(FIXTURE_DIR, "tokens.json")), false);
});

test("the fixture root itself is NOT excluded", () => {
  assert.equal(isGeneratedPreviewPath(FIXTURE_DIR, FIXTURE_DIR), false);
});

test("catalog listing distinguishes free, installed-only and original-only IDs", (t) => {
  const themesRoot = mkdtempSync(join(tmpdir(), "tovu-marketplace-list-"));
  t.after(() => rmSync(themesRoot, { recursive: true, force: true }));
  for (const id of ["original-only", "free", "installed-only"]) {
    const dir = join(themesRoot, "__marketplace__", "static", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "theme.json"), JSON.stringify({
      id, name: `Catalog ${id}`, tier: "static", version: "1.0.0",
      description: `Description ${id}`, tags: [id, "catalog"],
    }));
  }
  mkdirSync(join(themesRoot, "static", "installed-only"), { recursive: true });
  mkdirSync(join(themesRoot, "__original-themes__", "static", "original-only"), { recursive: true });
  assert.deepEqual(listMarketplaceThemes({ themesRoot }), [
    { id: "free", name: "Catalog free", tier: "static", description: "Description free", tags: ["free", "catalog"], idTaken: false },
    { id: "installed-only", name: "Catalog installed-only", tier: "static", description: "Description installed-only", tags: ["installed-only", "catalog"], idTaken: true },
    { id: "original-only", name: "Catalog original-only", tier: "static", description: "Description original-only", tags: ["original-only", "catalog"], idTaken: true },
  ]);
});
