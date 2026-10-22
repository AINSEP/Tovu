import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import {
  copyThemeFile,
  isPackageShippedTheme,
  listThemeFiles,
  MAX_LISTED_FILES,
  MAX_WALK_DEPTH,
  resolveThemeFilePath,
  themeFileDiffersFromOriginal,
  ThemePathError,
  writeThemeFile,
} from "../theme-files.js";
import { THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file Boundary cases of the theme file service: listing bounds and refusals, deep not-yet-existing
 * write paths, multi-chunk byte comparison, non-file targets and sources, and the package-shipped probe.
 */

function themesRoot(t: TestContext): { root: string; themeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "theme-files-edge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const themeDir = path.join(root, "plain");
  fs.mkdirSync(themeDir);
  fs.writeFileSync(path.join(themeDir, "theme.json"), "{}");
  return { root, themeDir };
}

test("listThemeFiles refuses a folder outside a recognized root and lists nothing for an absent folder", (t) => {
  const { root } = themesRoot(t);
  const stray = path.join(root, "nested", "deeper", "stray");
  assert.throws(() => listThemeFiles({ themeDir: stray, themesRoot: root }), (error: unknown) =>
    error instanceof ThemePathError && error.message === `theme folder '${stray}' is not under a recognized theme root`);
  assert.deepEqual(listThemeFiles({ themeDir: path.join(root, "not-created-yet"), themesRoot: root }), []);
});

test("listThemeFiles stops descending past MAX_WALK_DEPTH", (t) => {
  const { root, themeDir } = themesRoot(t);
  const segments = Array.from({ length: MAX_WALK_DEPTH + 2 }, (_, i) => `d${i}`);
  let dir = themeDir;
  const expected = ["theme.json"];
  segments.forEach((segment, depth) => {
    dir = path.join(dir, segment);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "f.txt"), "x");
    // Files in directories at walk depth <= MAX_WALK_DEPTH are listed; the deeper ones are not.
    if (depth + 1 <= MAX_WALK_DEPTH) expected.push([...segments.slice(0, depth + 1), "f.txt"].join("/"));
  });
  assert.deepEqual(listThemeFiles({ themeDir, themesRoot: root }), expected.sort());
});

test("listThemeFiles stops at MAX_LISTED_FILES, including inside a subdirectory", (t) => {
  const { root, themeDir } = themesRoot(t);
  const sub = path.join(themeDir, "a-sub");
  fs.mkdirSync(sub);
  for (let i = 0; i < MAX_LISTED_FILES + 5; i += 1) fs.writeFileSync(path.join(sub, `f${i}.txt`), "");
  fs.mkdirSync(path.join(themeDir, "z-later"));
  fs.writeFileSync(path.join(themeDir, "z-later", "never.txt"), "");
  const listed = listThemeFiles({ themeDir, themesRoot: root });
  assert.equal(listed.length, MAX_LISTED_FILES);
  assert.equal(listed.includes("z-later/never.txt"), false);
});

test("a write path deeper than the ancestor probe's bound still resolves inside the theme", (t) => {
  const { root, themeDir } = themesRoot(t);
  const relativePath = `${"n/".repeat(MAX_WALK_DEPTH * 4 + 2)}leaf.css`;
  assert.equal(resolveThemeFilePath({ themeDir, themesRoot: root, relativePath }), path.join(fs.realpathSync(themeDir), relativePath));
});

test("themeFileDiffersFromOriginal compares files larger than one chunk across every chunk", (t) => {
  const { root, themeDir } = themesRoot(t);
  const originalsRoot = path.join(root, THEME_CATALOG_DIR);
  const originalDir = path.join(originalsRoot, "static", "plain");
  fs.mkdirSync(originalDir, { recursive: true });
  const bytes = Buffer.alloc(64 * 1024 * 2 + 10, 97);
  fs.writeFileSync(path.join(themeDir, "big.css"), bytes);
  fs.writeFileSync(path.join(originalDir, "big.css"), bytes);
  const required = { themeDir, themesRoot: root, originalDir, originalsRoot, relativePath: "big.css" };
  assert.equal(themeFileDiffersFromOriginal(required), false);
  const changedLate = Buffer.from(bytes);
  changedLate[changedLate.length - 1] = 98;
  fs.writeFileSync(path.join(themeDir, "big.css"), changedLate);
  assert.equal(themeFileDiffersFromOriginal(required), true);
});

test("writeThemeFile refuses to replace a directory", (t) => {
  const { root, themeDir } = themesRoot(t);
  fs.mkdirSync(path.join(themeDir, "css"));
  assert.throws(() => writeThemeFile({ themeDir, themesRoot: root, relativePath: "css", content: "x" }), (error: unknown) =>
    error instanceof ThemePathError && error.message === "path 'css' exists and is not a regular file");
  assert.equal(fs.statSync(path.join(themeDir, "css")).isDirectory(), true);
});

test("copyThemeFile refuses a missing source and a directory source, writing nothing", (t) => {
  const { root, themeDir } = themesRoot(t);
  fs.mkdirSync(path.join(themeDir, "pages"));
  assert.throws(() => copyThemeFile({ themeDir, themesRoot: root, sourcePath: "absent.html", destPath: "copy.html" }), (error: unknown) =>
    error instanceof ThemePathError && error.message === "file 'absent.html' does not exist in this theme");
  assert.throws(() => copyThemeFile({ themeDir, themesRoot: root, sourcePath: "pages", destPath: "copy.html" }), (error: unknown) =>
    error instanceof ThemePathError && error.message === "path 'pages' is not a regular file");
  assert.equal(fs.existsSync(path.join(themeDir, "copy.html")), false);
});

test("isPackageShippedTheme: false without a package root, true only when the package catalog has the tier/id folder", (t) => {
  const { root } = themesRoot(t);
  const manifest = { tier: "static" as const, id: "plain" };
  assert.equal(isPackageShippedTheme({ manifest, packageThemesRoot: undefined }), false);
  assert.equal(isPackageShippedTheme({ manifest, packageThemesRoot: root }), false);
  fs.mkdirSync(path.join(root, THEME_CATALOG_DIR, "static", "plain"), { recursive: true });
  assert.equal(isPackageShippedTheme({ manifest, packageThemesRoot: root }), true);
});

test("copyThemeFile maps a lost exclusive-create race to ThemePathError and rethrows any other copy failure", (t) => {
  const { root, themeDir } = themesRoot(t);
  fs.writeFileSync(path.join(themeDir, "about.html"), "<p>About</p>");
  const required = { themeDir, themesRoot: root, sourcePath: "about.html", destPath: "about-1.html" };
  const lostRace: typeof fs.copyFileSync = () => { throw Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" }); };
  assert.throws(() => copyThemeFile(required, { copyFile: lostRace }), (error: unknown) =>
    error instanceof ThemePathError && error.message === "path 'about-1.html' already exists in this theme");
  const ioFault = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
  assert.throws(() => copyThemeFile(required, { copyFile: () => { throw ioFault; } }), (error: unknown) => error === ioFault);
  assert.equal(copyThemeFile(required), path.join(fs.realpathSync(themeDir), "about-1.html"));
  assert.equal(fs.readFileSync(path.join(themeDir, "about-1.html"), "utf8"), "<p>About</p>");
});
