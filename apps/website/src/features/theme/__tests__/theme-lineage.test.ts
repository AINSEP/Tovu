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

test("writeThemeLineageFile then readThemeLineageFile round-trips the lineage object", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writeThemeLineageFile({ themeDir: dir, lineage: SAMPLE });
  assert.ok(fs.existsSync(path.join(dir, THEME_LINEAGE_FILENAME)));

  const read = readThemeLineageFile({ themeDir: dir });
  assert.deepEqual(read, SAMPLE);
  for (const tier of ["declarative", "templated", "handlebars", "static", "code"] as const) {
    writeThemeLineageFile({ themeDir: dir, lineage: { ...SAMPLE, tier } });
    assert.deepEqual(readThemeLineageFile({ themeDir: dir }), { ...SAMPLE, tier });
  }
});

test("readThemeLineageFile returns null when a theme has no lineage sidecar (every hand-authored theme)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-none-"));
  assert.equal(readThemeLineageFile({ themeDir: dir }), null);
});

test("readThemeLineageFile returns null rather than throwing on a corrupt sidecar file", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-corrupt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const invalid = ["{not json", "[]", "{}", '{"from":1}', "null", JSON.stringify({ ...SAMPLE, from: 1 }), JSON.stringify({ ...SAMPLE, tier: "unknown" }),
    ...["version", "catalog", "marketplaceId", "name"].map((key) => JSON.stringify({ ...SAMPLE, [key]: 1 }))];
  for (const raw of invalid) {
    fs.writeFileSync(path.join(dir, THEME_LINEAGE_FILENAME), raw, "utf8");
    assert.equal(readThemeLineageFile({ themeDir: dir }), null, raw);
  }
});

test("writeThemeLineageFile never touches theme.json — the sidecar is a separate file", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lineage-manifest-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const original = '{  "id": "basic-1" }\n';
  fs.writeFileSync(path.join(dir, "theme.json"), original, "utf8");
  writeThemeLineageFile({ themeDir: dir, lineage: SAMPLE });

  const bytes = fs.readFileSync(path.join(dir, "theme.json"), "utf8");
  assert.equal(bytes, original, "the complete manifest bytes must be untouched");
  const manifest = JSON.parse(bytes) as Record<string, unknown>;
  assert.equal(manifest.lineage, undefined, "theme.json must not gain a lineage key");
  assert.deepEqual(Object.keys(manifest), ["id"], "theme.json's own content must be untouched");
});
