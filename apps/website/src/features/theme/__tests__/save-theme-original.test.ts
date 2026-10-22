import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { saveThemeAsOriginal } from "../save-theme-original.js";
import { loadTheme, THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file Explore's "Save as original": the current files become the stored original, at the
 * seeded-theme location, unless an original already exists or the theme is not a site theme.
 */

function makeRoot(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "save-original-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeTheme(dir: string, id = "plain"): void {
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id, name: "Plain", version: "1.0.0", tier: "static" }));
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<!doctype html><html><body>Home</body></html>");
}

test("writes the theme's current files as its original under the catalog folder", t => {
  const themesRoot = makeRoot(t);
  const dir = path.join(themesRoot, "plain");
  writeTheme(dir);
  const theme = loadTheme({ themeDir: dir, id: "plain", source: "site" });
  const result = saveThemeAsOriginal({ theme, themesRoot, packageThemesRoot: undefined });
  const originalDir = path.join(themesRoot, THEME_CATALOG_DIR, "static", "plain");
  assert.deepEqual(result, { ok: true, originalDir });
  assert.equal(fs.readFileSync(path.join(originalDir, "pages", "index.html"), "utf8"), "<!doctype html><html><body>Home</body></html>");
});

test("refuses when the site already stores an original, writing nothing", t => {
  const themesRoot = makeRoot(t);
  const dir = path.join(themesRoot, "plain");
  writeTheme(dir);
  const existing = path.join(themesRoot, THEME_CATALOG_DIR, "static", "plain");
  fs.mkdirSync(existing, { recursive: true });
  const theme = loadTheme({ themeDir: dir, id: "plain", source: "site" });
  assert.deepEqual(saveThemeAsOriginal({ theme, themesRoot, packageThemesRoot: undefined }), {
    ok: false, code: "ORIGINAL_EXISTS", message: "theme 'plain' already has a stored original",
  });
  assert.deepEqual(fs.readdirSync(existing), []);
});

test("refuses when only the package ships an original (the read-only fallback Reset uses)", t => {
  const themesRoot = makeRoot(t);
  const packageThemesRoot = makeRoot(t);
  const dir = path.join(themesRoot, "plain");
  writeTheme(dir);
  fs.mkdirSync(path.join(packageThemesRoot, THEME_CATALOG_DIR, "static", "plain"), { recursive: true });
  const theme = loadTheme({ themeDir: dir, id: "plain", source: "site" });
  const result = saveThemeAsOriginal({ theme, themesRoot, packageThemesRoot });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "ORIGINAL_EXISTS");
  assert.equal(fs.existsSync(path.join(themesRoot, THEME_CATALOG_DIR)), false);
});

test("refuses a theme folder outside, or equal to, the site's themes root", t => {
  const themesRoot = makeRoot(t);
  const elsewhere = makeRoot(t);
  const outside = path.join(elsewhere, "plain");
  writeTheme(outside);
  const outsideTheme = loadTheme({ themeDir: outside, id: "plain", source: "site" });
  assert.deepEqual(saveThemeAsOriginal({ theme: outsideTheme, themesRoot, packageThemesRoot: undefined }), {
    ok: false, code: "NOT_A_SITE_THEME", message: "theme 'plain' is not inside this site's themes folder",
  });
  writeTheme(themesRoot, "root");
  const rootTheme = loadTheme({ themeDir: themesRoot, id: "root", source: "site" });
  const atRoot = saveThemeAsOriginal({ theme: rootTheme, themesRoot, packageThemesRoot: undefined });
  assert.equal(atRoot.ok === false && atRoot.code, "NOT_A_SITE_THEME");
  assert.equal(fs.existsSync(path.join(themesRoot, THEME_CATALOG_DIR)), false);
});
