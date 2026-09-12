import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { THEME_CATALOG_DIR } from "../theme.js";
import { ThemePathError, themeFileDiffersFromOriginal } from "../theme-files.js";

/**
 * @file `themeFileDiffersFromOriginal` — the byte comparison behind Explore's per-file `modified`
 * flag. Both resets' no-op on an already-pristine file (`resetThemeFileToOriginal`) uses the same
 * `filesHaveSameBytes` compare. Every "same" answer here has to
 * come from comparing bytes: never mtime, never size alone, and no line-ending normalization.
 */

/** A themes root laid out like the real one: the live theme at `static/plain`, its catalog
 *  original at `__original-themes__/static/plain`. Files are written by each test. */
function makeRoot(): { themesRoot: string; themeDir: string; originalsRoot: string; originalDir: string } {
  const themesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-differs-"));
  const themeDir = path.join(themesRoot, "static", "plain");
  const originalsRoot = path.join(themesRoot, THEME_CATALOG_DIR);
  const originalDir = path.join(originalsRoot, "static", "plain");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.mkdirSync(originalDir, { recursive: true });
  return { themesRoot, themeDir, originalsRoot, originalDir };
}

function writeBoth(root: ReturnType<typeof makeRoot>, relativePath: string, live: string | Buffer, original: string | Buffer): void {
  for (const [dir, content] of [[root.themeDir, live], [root.originalDir, original]] as const) {
    fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(dir, relativePath), content);
  }
}

function differs(root: ReturnType<typeof makeRoot>, relativePath: string): boolean | null {
  return themeFileDiffersFromOriginal({
    themeDir: root.themeDir,
    themesRoot: root.themesRoot,
    originalDir: root.originalDir,
    originalsRoot: root.originalsRoot,
    relativePath,
  });
}

test("identical bytes: false", () => {
  const root = makeRoot();
  writeBoth(root, "css/styles.css", "body{color:red}", "body{color:red}");
  assert.equal(differs(root, "css/styles.css"), false);
});

test("same size, different bytes: true", () => {
  const root = makeRoot();
  writeBoth(root, "css/styles.css", "body{color:red}", "body{color:tan}");
  assert.equal(differs(root, "css/styles.css"), true);
});

test("different size: true", () => {
  const root = makeRoot();
  writeBoth(root, "css/styles.css", "body{color:red;margin:0}", "body{color:red}");
  assert.equal(differs(root, "css/styles.css"), true);
});

test("CRLF against LF counts as modified — no line-ending normalization", () => {
  const root = makeRoot();
  writeBoth(root, "pages/index.html", "<p>a</p>\r\n<p>b</p>\r\n", "<p>a</p>\n<p>b</p>\n");
  assert.equal(differs(root, "pages/index.html"), true);
});

test("a same-size swap of LF for a space is still modified", () => {
  const root = makeRoot();
  writeBoth(root, "pages/index.html", "<p>a</p> <p>b</p>", "<p>a</p>\n<p>b</p>");
  assert.equal(differs(root, "pages/index.html"), true);
});

test("the catalog has no copy of this file: null, not false", () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root.themeDir, "author-added.css"), "x");
  assert.equal(differs(root, "author-added.css"), null);
});

test("the theme has no catalog directory at all: null", () => {
  const root = makeRoot();
  fs.rmSync(root.originalDir, { recursive: true });
  fs.writeFileSync(path.join(root.themeDir, "tokens.json"), "{}");
  assert.equal(differs(root, "tokens.json"), null);
});

test("the catalog path is a directory, not a regular file: null", () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root.themeDir, "assets"), "a file here");
  fs.mkdirSync(path.join(root.originalDir, "assets"));
  assert.equal(differs(root, "assets"), null);
});

test("the live file is gone but the catalog has it: true", () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root.originalDir, "tokens.json"), "{}");
  assert.equal(differs(root, "tokens.json"), true);
});

test("a ../ path escaping the live theme folder throws ThemePathError", () => {
  const root = makeRoot();
  assert.throws(
    () => differs(root, "../other/theme.json"),
    (err: unknown) => err instanceof ThemePathError && err.message === "path '../other/theme.json' resolves outside the theme folder"
  );
});

test("large identical files spanning many read chunks: false", () => {
  const root = makeRoot();
  const bytes = Buffer.alloc(200_001, 0x61);
  writeBoth(root, "big.css", bytes, Buffer.from(bytes));
  assert.equal(differs(root, "big.css"), false);
});

test("large equal-size files differing only in the LAST byte: true", () => {
  const root = makeRoot();
  const live = Buffer.alloc(200_001, 0x61);
  const original = Buffer.from(live);
  original[original.length - 1] = 0x62;
  writeBoth(root, "big.css", live, original);
  assert.equal(differs(root, "big.css"), true);
});

test("large equal-size files differing only at byte 70,000 (past the first chunk): true", () => {
  const root = makeRoot();
  const live = Buffer.alloc(200_001, 0x61);
  const original = Buffer.from(live);
  original[70_000] = 0x62;
  writeBoth(root, "big.css", live, original);
  assert.equal(differs(root, "big.css"), true);
});

// A file mode of 000 makes any open() fail for a non-root user, so these two tests tell "decided
// from the stat" apart from "opened and read the bytes". Root ignores the mode, so skip there.
const runsAsRoot = typeof process.getuid === "function" && process.getuid() === 0;

test("different sizes short-circuit: an unreadable live file is still reported modified without being opened", { skip: runsAsRoot }, () => {
  const root = makeRoot();
  writeBoth(root, "css/styles.css", "body{color:red;margin:0}", "body{color:red}");
  const livePath = path.join(root.themeDir, "css/styles.css");
  fs.chmodSync(livePath, 0o000);
  try {
    assert.equal(differs(root, "css/styles.css"), true);
  } finally {
    fs.chmodSync(livePath, 0o644);
  }
});

test("equal sizes are never trusted: an unreadable same-size live file is opened, and the open fails", { skip: runsAsRoot }, () => {
  const root = makeRoot();
  writeBoth(root, "css/styles.css", "body{color:red}", "body{color:red}");
  const livePath = path.join(root.themeDir, "css/styles.css");
  fs.chmodSync(livePath, 0o000);
  try {
    assert.throws(() => differs(root, "css/styles.css"), (err: unknown) => (err as NodeJS.ErrnoException).code === "EACCES");
  } finally {
    fs.chmodSync(livePath, 0o644);
  }
});
