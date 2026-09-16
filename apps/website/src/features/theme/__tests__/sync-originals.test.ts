import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { diffThemeFolders, relativeFilePaths, syncThemeOriginals, writeGeneratedThemeOriginal } from "../sync-originals.js";
import { THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file `syncThemeOriginals()`/`writeGeneratedThemeOriginal()` — the generator that replaces a
 * hand-maintained `__original-themes__` with one derived from the shipped tree it mirrors.
 *
 * Regression surface for the bug this exists to fix: a shipped theme's stored original used to be
 * copied in by hand once and never revisited, so an edit to the live theme (a fix, an asset change,
 * an added file) had no automated path into the original at all. `497c9d35`/`c7ef123d` is the
 * concrete incident (see `shipped-theme-original-drift.canary.test.ts`'s header); this generator is
 * the fix for the CAUSE, not another hand patch of the DATA.
 *
 * Every case runs against a throwaway themes root under `os.tmpdir()`, never `content/themes/`.
 */

const tempRoots: string[] = [];

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

function makeThemesRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-sync-originals-"));
  tempRoots.push(root);
  return root;
}

/** A minimal, valid `static`-tier theme: a manifest whose declared `tier` matches its own folder,
 * plus one real file, one `preview/` generated dir, and one generated root `index.html` — so a
 * single fixture exercises tier routing and both {@link GENERATED_THEME_ROOT_FILES}/{@link
 * GENERATED_THEME_DIRS} exclusions at once. */
function makeStaticThemeFixture(themesRoot: string, id: string): string {
  const themeDir = join(themesRoot, "static", id);
  mkdirSync(join(themeDir, "css"), { recursive: true });
  writeFileSync(join(themeDir, "theme.json"), JSON.stringify({ id, tier: "static", version: "0.1.0" }));
  writeFileSync(join(themeDir, "css", "theme.css"), "body{color:live}");
  mkdirSync(join(themeDir, "preview", "dark"), { recursive: true });
  writeFileSync(join(themeDir, "preview", "dark", "index.html"), "<html>generated preview</html>");
  writeFileSync(join(themeDir, "index.html"), "<html>generated portability index</html>");
  return themeDir;
}

/** A minimal, valid `templated`-tier theme — proves tier routing isn't hardcoded to `static`. */
function makeTemplatedThemeFixture(themesRoot: string, id: string): string {
  const themeDir = join(themesRoot, "templated", id);
  mkdirSync(themeDir, { recursive: true });
  writeFileSync(join(themeDir, "theme.json"), JSON.stringify({ id, tier: "templated", version: "1.0.0" }));
  writeFileSync(join(themeDir, "styles.css"), "body{color:templated}");
  return themeDir;
}

test("relativeFilePaths: sorted, `/`-separated, [] for a folder that does not exist", () => {
  const root = makeThemesRoot();
  mkdirSync(join(root, "b"), { recursive: true });
  writeFileSync(join(root, "b", "two.txt"), "2");
  mkdirSync(join(root, "a"), { recursive: true });
  writeFileSync(join(root, "a", "one.txt"), "1");

  assert.deepEqual(relativeFilePaths(root), ["a/one.txt", "b/two.txt"]);
  assert.deepEqual(relativeFilePaths(join(root, "does-not-exist")), []);
});

test("diffThemeFolders: reports added/removed/changed independently", () => {
  const root = makeThemesRoot();
  const aDir = join(root, "a");
  const bDir = join(root, "b");
  mkdirSync(aDir, { recursive: true });
  mkdirSync(bDir, { recursive: true });
  writeFileSync(join(aDir, "same.txt"), "same");
  writeFileSync(join(bDir, "same.txt"), "same");
  writeFileSync(join(aDir, "only-in-a.txt"), "a");
  writeFileSync(join(bDir, "only-in-b.txt"), "b");
  writeFileSync(join(aDir, "changed.txt"), "new bytes");
  writeFileSync(join(bDir, "changed.txt"), "old bytes");

  assert.deepEqual(diffThemeFolders(aDir, bDir), {
    added: ["only-in-a.txt"],
    removed: ["only-in-b.txt"],
    changed: ["changed.txt"],
  });
});

test("writeGeneratedThemeOriginal: mirrors the live folder, excluding generated paths", () => {
  const root = makeThemesRoot();
  const liveDir = makeStaticThemeFixture(root, "theme-a");
  const targetDir = join(root, "target");

  writeGeneratedThemeOriginal({ liveDir, targetDir });

  assert.equal(readFileSync(join(targetDir, "css", "theme.css"), "utf8"), "body{color:live}");
  assert.equal(existsSync(join(targetDir, "preview")), false);
  assert.equal(existsSync(join(targetDir, "index.html")), false);
  assert.deepEqual(diffThemeFolders(targetDir, liveDir), {
    added: [],
    removed: ["index.html", "preview/dark/index.html"],
    changed: [],
  });
});

test("writeGeneratedThemeOriginal: regenerating mirrors an updated live folder exactly, dropping a file the live copy no longer has", () => {
  const root = makeThemesRoot();
  const liveDir = makeStaticThemeFixture(root, "theme-a");
  const targetDir = join(root, THEME_CATALOG_DIR, "static", "theme-a");
  writeGeneratedThemeOriginal({ liveDir, targetDir });
  assert.ok(existsSync(join(targetDir, "css", "theme.css")));

  // The live theme sheds a whole file and changes another — a real edit, not a generated-output change.
  rmSync(join(liveDir, "css"), { recursive: true, force: true });
  writeFileSync(join(liveDir, "theme.json"), JSON.stringify({ id: "theme-a", tier: "static", version: "0.2.0" }));

  writeGeneratedThemeOriginal({ liveDir, targetDir });

  assert.equal(existsSync(join(targetDir, "css")), false, "a stale file the live theme no longer has must not survive regeneration");
  assert.equal(JSON.parse(readFileSync(join(targetDir, "theme.json"), "utf8")).version, "0.2.0");
});

test("writeGeneratedThemeOriginal: a leftover staging dir from an interrupted run does not block the next write", () => {
  const root = makeThemesRoot();
  const liveDir = makeStaticThemeFixture(root, "theme-a");
  const targetDir = join(root, "target");
  mkdirSync(join(root, ".theme-original-sync-staging-target", "junk"), { recursive: true });

  writeGeneratedThemeOriginal({ liveDir, targetDir });

  assert.ok(existsSync(join(targetDir, "css", "theme.css")));
});

test("writeGeneratedThemeOriginal: leaves no staging directory behind after a successful write", () => {
  const root = makeThemesRoot();
  const liveDir = makeStaticThemeFixture(root, "theme-a");
  const targetDir = join(root, "target");

  writeGeneratedThemeOriginal({ liveDir, targetDir });

  assert.deepEqual(
    readdirSync(root).filter((entry) => entry !== "static" && entry !== "target"),
    []
  );
});

test("syncThemeOriginals: generates an original for every shipped theme, routed by its declared tier", () => {
  const root = makeThemesRoot();
  makeStaticThemeFixture(root, "theme-a");
  makeTemplatedThemeFixture(root, "theme-b");

  const result = syncThemeOriginals({ themesRoot: root });

  assert.deepEqual(
    result.themes.map((t) => `${t.tier}/${t.id}`).sort(),
    ["static/theme-a", "templated/theme-b"]
  );
  assert.equal(readFileSync(join(root, THEME_CATALOG_DIR, "static", "theme-a", "css", "theme.css"), "utf8"), "body{color:live}");
  assert.equal(readFileSync(join(root, THEME_CATALOG_DIR, "templated", "theme-b", "styles.css"), "utf8"), "body{color:templated}");
});

test("syncThemeOriginals: never reaches into __original-themes__ or __marketplace__ as if they were shipped themes", () => {
  const root = makeThemesRoot();
  makeStaticThemeFixture(root, "theme-a");
  mkdirSync(join(root, THEME_CATALOG_DIR, "static", "theme-a"), { recursive: true });
  mkdirSync(join(root, "__marketplace__", "static", "fixture-only"), { recursive: true });
  writeFileSync(join(root, "__marketplace__", "static", "fixture-only", "theme.json"), JSON.stringify({ tier: "static" }));

  const result = syncThemeOriginals({ themesRoot: root });

  assert.deepEqual(result.themes.map((t) => `${t.tier}/${t.id}`), ["static/theme-a"]);
});

test("syncThemeOriginals: is idempotent — a second run over an unchanged tree produces byte-identical output", () => {
  const root = makeThemesRoot();
  makeStaticThemeFixture(root, "theme-a");

  syncThemeOriginals({ themesRoot: root });
  const originalDir = join(root, THEME_CATALOG_DIR, "static", "theme-a");
  const firstRunFiles = relativeFilePaths(originalDir);

  syncThemeOriginals({ themesRoot: root });

  assert.deepEqual(relativeFilePaths(originalDir), firstRunFiles);
  assert.deepEqual(diffThemeFolders(originalDir, join(root, "static", "theme-a")), {
    added: [],
    removed: ["index.html", "preview/dark/index.html"],
    changed: [],
  });
});
