import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MAX_THEME_FILE_BYTES, themeOriginalResetRefusal } from "../theme-files.js";

/**
 * @file `themeOriginalResetRefusal`, the guard both per-file resets and the Explore listing share: a
 * catalog original may stand in for the live theme file by file only when its `theme.json` is readable
 * and resolves the same layout as the live one. An unreadable LIVE manifest never refuses, so a broken
 * `theme.json` can still be reset from the original. The route and tool suites
 * (`explore-file-reset-layout-mismatch.test.ts`, `tool-registrations.themes-reset-copy.test.ts`) cover
 * the wiring; this file covers every branch of the reading and comparing.
 */

const REFUSAL = {
  code: "ORIGINAL_LAYOUT_MISMATCH",
  message: "this theme's saved original does not match its current layout, so its files cannot be reset",
};

/** What to put at `<dir>/theme.json`: a JSON value to serialize, raw text, a directory, or nothing. */
type ManifestOnDisk = { json: unknown } | { text: string } | "directory" | "missing";

function writeManifest(dir: string, manifest: ManifestOnDisk): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "theme.json");
  if (manifest === "missing") return;
  if (manifest === "directory") {
    fs.mkdirSync(target);
    return;
  }
  fs.writeFileSync(target, "json" in manifest ? JSON.stringify(manifest.json) : manifest.text, "utf8");
}

function refusalFor(original: ManifestOnDisk, live: ManifestOnDisk): ReturnType<typeof themeOriginalResetRefusal> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-original-reset-refusal-"));
  const originalDir = path.join(root, "original");
  const themeDir = path.join(root, "live");
  writeManifest(originalDir, original);
  writeManifest(themeDir, live);
  return themeOriginalResetRefusal({ themeDir, originalDir });
}

const V1 = { json: { id: "t", tier: "static" } };
const V2 = { json: { apiVersion: 2, id: "t", tier: "static" } };

const CASES: ReadonlyArray<{ name: string; original: ManifestOnDisk; live: ManifestOnDisk; refused: boolean }> = [
  { name: "v1 original, v1 live", original: V1, live: V1, refused: false },
  { name: "v2 original, v2 live", original: V2, live: V2, refused: false },
  { name: "v1 original, v2 live (basic on 2026-09-14)", original: V1, live: V2, refused: true },
  { name: "v2 original, v1 live", original: V2, live: V1, refused: true },
  // `loadTheme` reads any apiVersion other than 2 as v1, so the layouts match.
  { name: "an apiVersion other than 2 in the original reads as v1", original: { json: { apiVersion: 3 } }, live: V1, refused: false },
  { name: "the original has no theme.json", original: "missing", live: V2, refused: true },
  { name: "the original's theme.json is not JSON", original: { text: "{ not json" }, live: V2, refused: true },
  { name: "the original's theme.json is a JSON array", original: { json: [2] }, live: V1, refused: true },
  { name: "the original's theme.json is JSON null", original: { text: "null" }, live: V1, refused: true },
  { name: "the original's theme.json is a directory", original: "directory", live: V1, refused: true },
  {
    name: "the original's theme.json is past the read limit",
    original: { text: `{"apiVersion":2,"pad":"${"x".repeat(MAX_THEME_FILE_BYTES)}"}` },
    live: V2,
    refused: true,
  },
  { name: "the live theme.json is not JSON, so a repair from the original is allowed", original: V2, live: { text: "{ broken" }, refused: false },
  { name: "the live theme.json is missing, so a repair from the original is allowed", original: V1, live: "missing", refused: false },
];

for (const { name, original, live, refused } of CASES) {
  test(`themeOriginalResetRefusal: ${name} -> ${refused ? "refused" : "allowed"}`, () => {
    assert.deepEqual(refusalFor(original, live), refused ? REFUSAL : null);
  });
}
