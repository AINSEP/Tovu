import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readThemeLineageFile, writeThemeLineageFile, THEME_LINEAGE_FILENAME, type ThemeLineage } from "../theme-lineage.js";

/**
 * @file Schema v2 decision (2026-08-18): `lineage` lives in its own install-local sidecar file, never
 * inside `theme.json` — see `theme-lineage.ts`'s own file header. This certifies the sidecar's own
 * read/write contract in isolation; `marketplace-download-route.integration.test.ts` certifies it is
 * actually wired into the download flow.
 */

const SAMPLE: ThemeLineage = {
  from: "marketplace",
  tier: "static",
  version: "1.0.0",
  catalog: "__original-themes__/static/basic-1",
  marketplaceId: "basic",
  name: "Basic",
};

test("writeThemeLineageFile then readThemeLineageFile round-trips the lineage object", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-"));
  writeThemeLineageFile({ themeDir: dir, lineage: SAMPLE });
  assert.ok(fs.existsSync(path.join(dir, THEME_LINEAGE_FILENAME)));

  const read = readThemeLineageFile({ themeDir: dir });
  assert.deepEqual(read, SAMPLE);
});

test("readThemeLineageFile returns null when a theme has no lineage sidecar (every hand-authored theme)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-none-"));
  assert.equal(readThemeLineageFile({ themeDir: dir }), null);
});

test("readThemeLineageFile returns null rather than throwing on a corrupt sidecar file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-corrupt-"));
  fs.writeFileSync(path.join(dir, THEME_LINEAGE_FILENAME), "{not json", "utf8");
  assert.equal(readThemeLineageFile({ themeDir: dir }), null);
});

test("writeThemeLineageFile never touches theme.json — the sidecar is a separate file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-manifest-"));
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "basic-1" }), "utf8");
  writeThemeLineageFile({ themeDir: dir, lineage: SAMPLE });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8")) as Record<string, unknown>;
  assert.equal(manifest.lineage, undefined, "theme.json must not gain a lineage key");
  assert.deepEqual(Object.keys(manifest), ["id"], "theme.json's own content must be untouched");
});
