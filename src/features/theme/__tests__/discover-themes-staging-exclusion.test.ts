import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, discoverThemes, ENGINE_SUBFOLDERS, MIGRATION_STAGING_DIR_PREFIX } from "../theme.js";

/**
 * @file ARCH-001 (2026-08-19, Terra round-2 architecture audit) — `migrate-theme.ts`'s
 * `createStagingDir` deliberately leaves `.tovu-migrate-staging-<id>-<hex>` scratch directories on
 * disk, as siblings of the real theme folder, for dry-run/failure inspection. Two such directories
 * (each with a `theme.json` declaring `"id": "basic"`, copied straight from the real `basic` theme
 * they were migrating) were accidentally swept into a commit and, before this fix, were discovered
 * as two ADDITIONAL "basic" theme entries — three total for one real theme.
 *
 * Reproduces that exact shape (a real theme folder plus staging-prefixed siblings claiming the same
 * manifest id) and asserts the EXACT resulting theme-id list, not just a count.
 */

function writeThemeJson(dir: string, id: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id, name: "Basic", version: "0.1.0", tier: "static" }),
    "utf8"
  );
}

test("discoverThemes: excludes .tovu-migrate-staging-* siblings, even though they declare the same manifest id as the real theme", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-discover-staging-"));
  try {
    writeThemeJson(path.join(dir, "basic"), "basic");
    writeThemeJson(path.join(dir, `${MIGRATION_STAGING_DIR_PREFIX}basic-14cece79e115`), "basic");
    writeThemeJson(path.join(dir, `${MIGRATION_STAGING_DIR_PREFIX}basic-44b2198fd799`), "basic");

    const themes = discoverThemes({ dir, source: "built-in" });

    assert.deepEqual(
      themes.map((t) => t.manifest.id),
      ["basic"],
      `expected exactly one discovered theme id ["basic"], got ${JSON.stringify(themes.map((t) => t.manifest.id))}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverThemes: a staging-prefixed directory that fails to parse is still excluded (exclusion happens before loadTheme, not because it errors)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-discover-staging-broken-"));
  try {
    // No theme.json at all inside the staging dir — if exclusion ever regressed to rely on
    // loadTheme() erroring rather than filtering the name up front, this would still show up as an
    // "invalid" discovered theme rather than being absent from the list entirely.
    fs.mkdirSync(path.join(dir, `${MIGRATION_STAGING_DIR_PREFIX}basic-000000000000`), { recursive: true });
    writeThemeJson(path.join(dir, "basic"), "basic");

    const themes = discoverThemes({ dir, source: "built-in" });

    assert.deepEqual(themes.map((t) => t.manifest.id), ["basic"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAllBuiltInThemes: staging siblings under an engine subfolder (the real on-disk shape under themes/static) are excluded from the combined list", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-discover-all-staging-"));
  try {
    assert.ok(ENGINE_SUBFOLDERS.includes("static"), "test assumes 'static' is a real engine subfolder");
    const staticDir = path.join(dir, "static");
    writeThemeJson(path.join(staticDir, "basic"), "basic");
    writeThemeJson(path.join(staticDir, `${MIGRATION_STAGING_DIR_PREFIX}basic-14cece79e115`), "basic");
    writeThemeJson(path.join(staticDir, `${MIGRATION_STAGING_DIR_PREFIX}basic-44b2198fd799`), "basic");

    const themes = discoverAllBuiltInThemes({ dir, source: "built-in" });

    assert.deepEqual(
      themes.map((t) => t.manifest.id),
      ["basic"],
      `expected exactly one discovered theme id ["basic"], got ${JSON.stringify(themes.map((t) => t.manifest.id))}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
