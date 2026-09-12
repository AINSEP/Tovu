import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { THEME_CATALOG_DIR } from "../theme.js";
import { resetThemeFileToOriginal, ThemePathError } from "../theme-files.js";

/**
 * @file `resetThemeFileToOriginal` — the byte copy behind Explore's per-file reset route and
 * `theme_reset_file`. Those suites cover binary bytes, files past the 1 MB text-read limit, and the
 * unmodified no-op end to end. This file covers the function's own contract: its `null` answers, the
 * refusal of a non-regular live path, parent-folder creation, file modes, and failures leaving the
 * live file and its folder as they were.
 */

/** A themes root laid out like the real one: the live theme at `static/plain`, its catalog
 *  original at `__original-themes__/static/plain`. Files are written by each test. */
function makeRoot(): { themesRoot: string; themeDir: string; originalsRoot: string; originalDir: string } {
  const themesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-reset-"));
  const themeDir = path.join(themesRoot, "static", "plain");
  const originalsRoot = path.join(themesRoot, THEME_CATALOG_DIR);
  const originalDir = path.join(originalsRoot, "static", "plain");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.mkdirSync(originalDir, { recursive: true });
  return { themesRoot, themeDir, originalsRoot, originalDir };
}

function write(dir: string, relativePath: string, content: string | Buffer): string {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function reset(root: ReturnType<typeof makeRoot>, relativePath: string): { wasModified: boolean; bytes: number } | null {
  return resetThemeFileToOriginal({
    themeDir: root.themeDir,
    themesRoot: root.themesRoot,
    originalDir: root.originalDir,
    originalsRoot: root.originalsRoot,
    relativePath,
  });
}

const RUNNING_AS_ROOT = process.getuid?.() === 0;

test("no file in the catalog at the path: null, and the live file is untouched", () => {
  const root = makeRoot();
  const live = write(root.themeDir, "author-added.txt", "mine");

  assert.equal(reset(root, "author-added.txt"), null);
  assert.equal(fs.readFileSync(live, "utf8"), "mine");
});

test("a catalog directory at the path is not an original: null", () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root.originalDir, "assets"), { recursive: true });

  assert.equal(reset(root, "assets"), null);
});

test("a path escaping the catalog folder is null even when it lands on a real catalog file, and nothing is created live", () => {
  const root = makeRoot();
  write(path.join(root.originalsRoot, "static", "other"), "theme.json", "{}");

  assert.equal(reset(root, "../other/theme.json"), null);
  assert.equal(fs.existsSync(path.join(root.themesRoot, "static", "other")), false);
});

test("a live directory at the path: ThemePathError, and the directory stays", () => {
  const root = makeRoot();
  write(root.originalDir, "assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const liveDir = path.join(root.themeDir, "assets", "logo.png");
  fs.mkdirSync(liveDir, { recursive: true });

  assert.throws(
    () => reset(root, "assets/logo.png"),
    (err: unknown) => err instanceof ThemePathError && err.message === "path 'assets/logo.png' exists and is not a regular file"
  );
  assert.equal(fs.statSync(liveDir).isDirectory(), true);
});

test("identical bytes: wasModified false with the original's size, and the live inode is unchanged", () => {
  const root = makeRoot();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
  write(root.originalDir, "assets/logo.png", bytes);
  const live = write(root.themeDir, "assets/logo.png", bytes);
  const inodeBefore = fs.statSync(live).ino;

  assert.deepEqual(reset(root, "assets/logo.png"), { wasModified: false, bytes: bytes.length });
  assert.equal(fs.statSync(live).ino, inodeBefore);
});

test("a missing live file is recreated with its missing parent folders, the original's bytes, and the original's mode", () => {
  const root = makeRoot();
  const bytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe, 0x00, 0x80]);
  fs.chmodSync(write(root.originalDir, "fonts/sub/face.woff2", bytes), 0o640);

  assert.deepEqual(reset(root, "fonts/sub/face.woff2"), { wasModified: true, bytes: bytes.length });
  const live = path.join(root.themeDir, "fonts", "sub", "face.woff2");
  assert.ok(fs.readFileSync(live).equals(bytes));
  assert.equal(fs.statSync(live).mode & 0o777, 0o640);
});

test("an existing live file keeps its own mode when its bytes are replaced", () => {
  const root = makeRoot();
  fs.chmodSync(write(root.originalDir, "css/site.css", "a{}"), 0o644);
  const live = write(root.themeDir, "css/site.css", "b{}");
  fs.chmodSync(live, 0o600);

  assert.deepEqual(reset(root, "css/site.css"), { wasModified: true, bytes: 3 });
  assert.ok(fs.readFileSync(live).equals(Buffer.from("a{}")));
  assert.equal(fs.statSync(live).mode & 0o777, 0o600);
});

test("a read-only live file: EACCES, its bytes are unchanged, and no temp file is left in its folder", (t) => {
  if (RUNNING_AS_ROOT) {
    t.skip("running as root: chmod 444 does not deny root a write");
    return;
  }
  const root = makeRoot();
  write(root.originalDir, "css/site.css", "a{}");
  const live = write(root.themeDir, "css/site.css", "edited");
  fs.chmodSync(live, 0o444);

  assert.throws(() => reset(root, "css/site.css"), { code: "EACCES" });
  assert.equal(fs.readFileSync(live, "utf8"), "edited");
  assert.deepEqual(fs.readdirSync(path.dirname(live)), ["site.css"]);
});

test("an unreadable original of a different size: EACCES from the copy, the live bytes are unchanged, and no temp file is left", (t) => {
  if (RUNNING_AS_ROOT) {
    t.skip("running as root: chmod 000 does not deny root a read");
    return;
  }
  const root = makeRoot();
  const original = write(root.originalDir, "css/site.css", "a much longer original{}");
  fs.chmodSync(original, 0o000);
  t.after(() => fs.chmodSync(original, 0o644));
  const live = write(root.themeDir, "css/site.css", "edited");

  assert.throws(() => reset(root, "css/site.css"), { code: "EACCES" });
  assert.equal(fs.readFileSync(live, "utf8"), "edited");
  assert.deepEqual(fs.readdirSync(path.dirname(live)), ["site.css"]);
});
