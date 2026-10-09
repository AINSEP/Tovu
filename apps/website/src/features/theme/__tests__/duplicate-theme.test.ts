import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DuplicateThemeError, duplicateDiscoveredTheme, duplicateTheme, MAX_DUPLICATE_THEME_BYTES, themeIdFromName } from "../duplicate-theme.js";
import { discoverAllBuiltInThemes, MIGRATION_STAGING_DIR_PREFIX, THEME_CATALOG_DIR, type DiscoveredTheme } from "../theme.js";
import { resolveThemeOriginalSource } from "../theme-files.js";

/**
 * @file `duplicateTheme` / `duplicateDiscoveredTheme` — the one runtime "make a new theme" service
 * behind both the `theme_duplicate` tool and the admin Duplicate route. Runs against a scratch themes
 * root holding a COPY of a real stock theme, so "the duplicate loads valid" is checked against a
 * theme that really renders, not a hand-built stub.
 */

const REPO_THEMES = path.resolve(import.meta.dirname, "../../../../../../content/themes");
const STOCK_TIER = "declarative";
const STOCK_ID = "basic-declarative";

/** Scratch themes root with one real stock theme copied in, discovered the way the server does. */
function makeSite(): { root: string; themes: DiscoveredTheme[]; source: DiscoveredTheme } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-theme-"));
  fs.cpSync(path.join(REPO_THEMES, STOCK_TIER, STOCK_ID), path.join(root, STOCK_TIER, STOCK_ID), { recursive: true });
  const themes = discoverAllBuiltInThemes({ dir: root, source: "built-in" });
  const source = themes.find((t) => t.manifest.id === STOCK_ID);
  assert.ok(source, "fixture stock theme must be discovered");
  assert.equal(source.status, "valid", `fixture stock theme must load valid: ${source.errors.join("; ")}`);
  return { root, themes, source };
}

/** Relative path -> sha256 of every regular file under `dir`. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (abs: string, rel: string): void => {
    for (const name of fs.readdirSync(abs).sort()) {
      const full = path.join(abs, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) walk(full, relPath);
      else out.set(relPath, createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
    }
  };
  walk(dir, "");
  return out;
}

/** Entries in a tier folder — used to prove a refusal left nothing (no copy, no staging scratch). */
function tierEntries(root: string): string[] {
  return fs.readdirSync(path.join(root, STOCK_TIER)).sort();
}

function assertRefused(fn: () => unknown, code: DuplicateThemeError["code"]): void {
  assert.throws(fn, (err: unknown) => err instanceof DuplicateThemeError && err.code === code);
}

test("copies every file; only theme.json changes, to the new identity with lineage", () => {
  const { root, themes, source } = makeSite();
  const before = snapshot(source.dir);

  const result = duplicateTheme({ source, themesRoot: root, newName: "Roastery", takenIds: new Set(themes.map((t) => t.manifest.id)) });

  assert.equal(result.id, "roastery");
  assert.equal(result.dir, path.join(root, STOCK_TIER, "roastery"));
  assert.equal(result.files, before.size);
  const copied = snapshot(result.dir);
  assert.deepEqual([...copied.keys()], [...before.keys()]);
  for (const [rel, hash] of before) {
    if (rel !== "theme.json") assert.equal(copied.get(rel), hash, `${rel} must be byte-identical`);
  }
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(source.dir, "theme.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(result.dir, "theme.json"), "utf8"));
  assert.deepEqual(manifest, {
    ...sourceManifest,
    id: "roastery",
    name: "Roastery",
    version: "1.0.0",
    lineage: { from: STOCK_ID, tier: STOCK_TIER, version: sourceManifest.version },
  });
});

test("the source theme is never modified", () => {
  const { root, themes, source } = makeSite();
  const before = snapshot(source.dir);
  duplicateTheme({ source, themesRoot: root, newName: "Copy", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  assert.deepEqual(snapshot(source.dir), before);
});

test("duplicateDiscoveredTheme rescans: the copy is in the live themes array and loads valid", () => {
  const { root, themes } = makeSite();
  const { result, theme } = duplicateDiscoveredTheme({ themes, themesDir: root, sourceThemeId: STOCK_ID, newName: "Roastery" });
  assert.ok(theme, "the copy must be discovered");
  assert.equal(theme.status, "valid", theme.errors.join("; "));
  assert.equal(theme.manifest.name, "Roastery");
  assert.ok(themes.some((t) => t.manifest.id === result.id), "rescan must refill the caller's array in place");
});

test("an unknown source id is refused with the discovered ids listed", () => {
  const { root, themes } = makeSite();
  assert.throws(
    () => duplicateDiscoveredTheme({ themes, themesDir: root, sourceThemeId: "nope", newName: "X" }),
    (err: unknown) => err instanceof DuplicateThemeError && err.code === "SOURCE_NOT_FOUND" && err.message.includes(STOCK_ID)
  );
});

test("a derived id is suffixed past every collision: discovered ids, folders, and the catalog", () => {
  const { root, themes, source } = makeSite();
  // `basic-declarative` is discovered; `basic-declarative-1` exists only in the catalog.
  fs.mkdirSync(path.join(root, THEME_CATALOG_DIR, STOCK_TIER, "basic-declarative-1"), { recursive: true });
  const result = duplicateTheme({ source, themesRoot: root, newName: "Basic Declarative", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  assert.equal(result.id, "basic-declarative-2");
});

test("an id discovered in ANOTHER tier still counts as taken", () => {
  const { root, source } = makeSite();
  const result = duplicateTheme({ source, themesRoot: root, newName: "Nordic", takenIds: new Set([STOCK_ID, "nordic"]) });
  assert.equal(result.id, "nordic-1");
});

test("an explicit newId that is taken is refused, not suffixed, and nothing is written", () => {
  const { root, themes, source } = makeSite();
  const before = tierEntries(root);
  assertRefused(() => duplicateTheme({ source, themesRoot: root, newName: "X", takenIds: new Set(themes.map((t) => t.manifest.id)) }, { newId: STOCK_ID }), "ID_TAKEN");
  assert.deepEqual(tierEntries(root), before);
});

test("path traversal and malformed ids are refused before anything is written", () => {
  const { root, themes, source } = makeSite();
  const takenIds = new Set(themes.map((t) => t.manifest.id));
  const parentBefore = fs.readdirSync(root).sort();
  for (const newId of ["../escape", "..", "a/b", "/abs", "Upper", "-lead", "trail-", "__catalog", ".hidden", "x".repeat(65)]) {
    assertRefused(() => duplicateTheme({ source, themesRoot: root, newName: "X", takenIds }, { newId }), "INVALID_ID");
  }
  assert.deepEqual(fs.readdirSync(root).sort(), parentBefore);
  assert.deepEqual(tierEntries(root), [STOCK_ID]);
});

test("a name full of path characters only ever becomes a folder-safe id", () => {
  const { root, themes, source } = makeSite();
  const result = duplicateTheme({ source, themesRoot: root, newName: "../../etc/Passwd", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  assert.equal(result.id, "etc-passwd");
  assert.equal(path.dirname(result.dir), path.join(root, STOCK_TIER));
});

test("a name with no Latin letters falls back to '<source>-copy'", () => {
  const { root, themes, source } = makeSite();
  const result = duplicateTheme({ source, themesRoot: root, newName: "咖啡", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  assert.equal(result.id, `${STOCK_ID}-copy`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.dir, "theme.json"), "utf8")).name, "咖啡");
});

test("empty, overlong, and control-character names are refused", () => {
  const { root, themes, source } = makeSite();
  const takenIds = new Set(themes.map((t) => t.manifest.id));
  for (const newName of ["", "   ", "x".repeat(121), "bad\nname"]) {
    assertRefused(() => duplicateTheme({ source, themesRoot: root, newName, takenIds }), "INVALID_NAME");
  }
});

test("a symlink anywhere in the source refuses the whole duplicate and leaves no staging folder", () => {
  const { root, themes, source } = makeSite();
  fs.symlinkSync("/etc/hosts", path.join(source.dir, "leak.txt"));
  assertRefused(() => duplicateTheme({ source, themesRoot: root, newName: "Leak", takenIds: new Set(themes.map((t) => t.manifest.id)) }), "SYMLINK");
  assert.deepEqual(tierEntries(root), [STOCK_ID]);
});

test("a source over the total size limit is refused before any copy", () => {
  const { root, themes, source } = makeSite();
  // Sparse: reports the size without writing the bytes.
  const fd = fs.openSync(path.join(source.dir, "huge.bin"), "w");
  fs.ftruncateSync(fd, MAX_DUPLICATE_THEME_BYTES + 1);
  fs.closeSync(fd);
  assertRefused(() => duplicateTheme({ source, themesRoot: root, newName: "Huge", takenIds: new Set(themes.map((t) => t.manifest.id)) }), "TOO_LARGE");
  assert.deepEqual(tierEntries(root), [STOCK_ID]);
});

test("the source's .trash/ folder is not copied", () => {
  const { root, themes, source } = makeSite();
  fs.mkdirSync(path.join(source.dir, ".trash"));
  fs.writeFileSync(path.join(source.dir, ".trash", "old.css"), "body{}");
  const result = duplicateTheme({ source, themesRoot: root, newName: "Clean", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  assert.equal(fs.existsSync(path.join(result.dir, ".trash")), false);
});

test("a failure after staging removes the staging folder (unreadable manifest)", () => {
  const { root, themes, source } = makeSite();
  fs.writeFileSync(path.join(source.dir, "theme.json"), "[]");
  assertRefused(
    () => duplicateTheme({ source, themesRoot: root, newName: "Broken", takenIds: new Set(themes.map((t) => t.manifest.id)) }, { stagingSuffix: () => "fixed" }),
    "BAD_MANIFEST"
  );
  assert.deepEqual(tierEntries(root), [STOCK_ID]);
  assert.equal(fs.existsSync(path.join(root, STOCK_TIER, `${MIGRATION_STAGING_DIR_PREFIX}duplicate-broken-fixed`)), false);
});

test("a folder that appears at the destination mid-copy is refused, never merged into", () => {
  const { root, themes, source } = makeSite();
  // The suffix seam runs after id assignment and before the copy — the race window.
  const stagingSuffix = (): string => {
    fs.mkdirSync(path.join(root, STOCK_TIER, "racer"));
    return "race";
  };
  assertRefused(() => duplicateTheme({ source, themesRoot: root, newName: "Racer", takenIds: new Set(themes.map((t) => t.manifest.id)) }, { stagingSuffix }), "ID_TAKEN");
  assert.deepEqual(fs.readdirSync(path.join(root, STOCK_TIER, "racer")), [], "the racing folder is left exactly as it was");
  assert.deepEqual(tierEntries(root), [STOCK_ID, "racer"]);
});

test("a source outside the themes root is refused", () => {
  const { themes, source } = makeSite();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-elsewhere-"));
  assertRefused(() => duplicateTheme({ source, themesRoot: elsewhere, newName: "X", takenIds: new Set(themes.map((t) => t.manifest.id)) }), "SOURCE_NOT_COPYABLE");
});

test("a real static stock theme duplicates and loads valid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-static-"));
  fs.cpSync(path.join(REPO_THEMES, "static", "tovu-starter"), path.join(root, "static", "tovu-starter"), { recursive: true });
  const themes = discoverAllBuiltInThemes({ dir: root, source: "built-in" });
  const { theme } = duplicateDiscoveredTheme({ themes, themesDir: root, sourceThemeId: "tovu-starter", newName: "Starter Copy" });
  assert.ok(theme);
  assert.equal(theme.manifest.id, "starter-copy");
  assert.equal(theme.status, "valid", theme.errors.join("; "));
});

test("the copy gets its own stored original, byte-identical to the copy, so Reset has something to restore", () => {
  const { root, themes, source } = makeSite();
  const result = duplicateTheme({ source, themesRoot: root, newName: "Roastery", takenIds: new Set(themes.map((t) => t.manifest.id)) });
  const originalDir = path.join(root, THEME_CATALOG_DIR, STOCK_TIER, "roastery");
  assert.deepEqual(snapshot(originalDir), snapshot(result.dir));
  assert.deepEqual(resolveThemeOriginalSource({ manifest: { tier: STOCK_TIER, id: "roastery" }, siteThemesRoot: root, packageThemesRoot: undefined }), {
    source: "site",
    originalDir,
    originalsRoot: path.join(root, THEME_CATALOG_DIR),
  });
  assert.deepEqual(fs.readdirSync(path.join(root, THEME_CATALOG_DIR, STOCK_TIER)), ["roastery"], "no staging folder is left in the catalog");
});

test("a failure writing the stored original removes the copy too — never a copy that cannot be reset", () => {
  const { root, themes, source } = makeSite();
  // A FILE where the catalog folder should be: creating the original's parent fails.
  fs.writeFileSync(path.join(root, THEME_CATALOG_DIR), "");
  assert.throws(() => duplicateTheme({ source, themesRoot: root, newName: "Roastery", takenIds: new Set(themes.map((t) => t.manifest.id)) }));
  assert.deepEqual(tierEntries(root), [STOCK_ID]);
});

test("themeIdFromName folds diacritics and punctuation into single hyphens", () => {
  assert.equal(themeIdFromName("  Café — Noir!! "), "cafe-noir");
  assert.equal(themeIdFromName("***"), "");
  assert.equal(themeIdFromName("a".repeat(60)).length, 48);
});
