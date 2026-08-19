import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { restoreBuiltThemeGeneratedTree } from "../theme-files.js";
import { ThemePathError } from "../theme-files.js";
import { THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file ADR-020 §5's "restored atomically" half: `restoreBuiltThemeGeneratedTree` overwrites a built
 * theme's entire generated tree from its catalog original in one operation, leaving `theme.json` and
 * `build.sourceDir` completely untouched. Route-level wiring (the reset endpoint choosing this over a
 * per-file restore) is covered in `theme-write-file-built-gate.test.ts`'s sibling for `explore.ts`.
 */

function makeLayout(root: string): { themesRoot: string; live: string; catalog: string } {
  const themesRoot = path.join(root, "themes");
  const live = path.join(themesRoot, "static", "compiled");
  const catalog = path.join(themesRoot, THEME_CATALOG_DIR, "static", "compiled");
  return { themesRoot, live, catalog };
}

const MANIFEST = { id: "compiled", tier: "static" as const, build: { source: "compiled" as const, sourceDir: "src" } };

test("restores every generated file from the catalog, leaving sourceDir and theme.json untouched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-tree-"));
  const { themesRoot, live, catalog } = makeLayout(root);

  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.mkdirSync(path.join(live, "src"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "src"), { recursive: true });

  fs.writeFileSync(path.join(live, "pages", "index.html"), "LIVE (edited by mistake)", "utf8");
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "CATALOG original", "utf8");
  fs.writeFileSync(path.join(live, "theme.json"), '{"live":"json"}', "utf8");
  fs.writeFileSync(path.join(catalog, "theme.json"), '{"catalog":"json"}', "utf8");
  fs.writeFileSync(path.join(live, "src", "Header.tsx"), "LIVE source edit", "utf8");
  fs.writeFileSync(path.join(catalog, "src", "Header.tsx"), "CATALOG source", "utf8");

  const result = restoreBuiltThemeGeneratedTree({ themeDir: live, themesRoot, manifest: MANIFEST });

  assert.deepEqual(result.restoredFiles, ["pages/index.html"]);
  assert.equal(fs.readFileSync(path.join(live, "pages", "index.html"), "utf8"), "CATALOG original");
  // theme.json is never touched by this operation -- it always resets per-file, unchanged.
  assert.equal(fs.readFileSync(path.join(live, "theme.json"), "utf8"), '{"live":"json"}');
  // build.sourceDir is never touched either -- the author's live edit survives a generated-tree restore.
  assert.equal(fs.readFileSync(path.join(live, "src", "Header.tsx"), "utf8"), "LIVE source edit");
});

test("a live-only generated file with no catalog counterpart is removed, not left behind", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-tree-"));
  const { themesRoot, live, catalog } = makeLayout(root);

  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.mkdirSync(path.join(live, "js"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });

  fs.writeFileSync(path.join(live, "pages", "index.html"), "live", "utf8");
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "catalog", "utf8");
  // A generated file that only exists on the live copy -- e.g. left over from before this gate
  // existed. The restored tree must be an EXACT copy of the catalog's generated output, not a merge.
  fs.writeFileSync(path.join(live, "js", "stray.js"), "should be removed", "utf8");

  restoreBuiltThemeGeneratedTree({ themeDir: live, themesRoot, manifest: MANIFEST });

  assert.equal(fs.existsSync(path.join(live, "js", "stray.js")), false);
});

test("throws when the theme has no catalog original at all", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-tree-"));
  const { themesRoot, live } = makeLayout(root);
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.writeFileSync(path.join(live, "pages", "index.html"), "live", "utf8");

  assert.throws(
    () => restoreBuiltThemeGeneratedTree({ themeDir: live, themesRoot, manifest: MANIFEST }),
    (err: unknown) => err instanceof ThemePathError && /no stored original/.test(err.message)
  );
});

test("throws for a theme that isn't a compiled build at all -- nothing to restore", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-tree-"));
  const { themesRoot, live } = makeLayout(root);
  fs.mkdirSync(live, { recursive: true });

  assert.throws(
    () => restoreBuiltThemeGeneratedTree({ themeDir: live, themesRoot, manifest: { id: "compiled", tier: "static" } }),
    (err: unknown) => err instanceof ThemePathError && /not a built release/.test(err.message)
  );
});

test("a compiled theme with an empty generated tree (only source + theme.json) restores nothing, without erroring", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-tree-"));
  const { themesRoot, live, catalog } = makeLayout(root);
  fs.mkdirSync(path.join(live, "src"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "src"), { recursive: true });
  fs.writeFileSync(path.join(live, "theme.json"), "{}", "utf8");
  fs.writeFileSync(path.join(catalog, "theme.json"), "{}", "utf8");
  fs.writeFileSync(path.join(live, "src", "a.tsx"), "x", "utf8");
  fs.writeFileSync(path.join(catalog, "src", "a.tsx"), "y", "utf8");

  const result = restoreBuiltThemeGeneratedTree({ themeDir: live, themesRoot, manifest: MANIFEST });

  assert.deepEqual(result.restoredFiles, []);
  // Source stays exactly as the live copy had it -- restore never touches build.sourceDir.
  assert.equal(fs.readFileSync(path.join(live, "src", "a.tsx"), "utf8"), "x");
});
