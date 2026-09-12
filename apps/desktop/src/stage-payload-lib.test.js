/**
 * @file Direct tests for `stage-payload-lib.js`'s `newestMtime` (and, transitively, its private
 * `isWalkable` filter). Real directories and real mtimes throughout — `newestMtime`'s whole job is
 * to walk a real filesystem tree and compare real timestamps, and only the filesystem can produce
 * those honestly (see `project-delete-guard.test.js`'s header for the same reasoning).
 *
 * `touch()` returns the mtime the filesystem actually stored rather than the millisecond value it
 * was asked to set: `fs.utimesSync` round-trips some millisecond values through a lossy
 * seconds-as-a-double conversion (verified empirically — 555555 came back as 555554.999, 9999999 as
 * 9999998.999, while 8888888 and every whole-second value came back exact, with no predictable
 * pattern across those). Comparing against the actually-stored value keeps every assertion an EXACT
 * equality — never "greater than 0" or "changed" — without depending on which millisecond values
 * happen to survive the round trip on this filesystem.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { newestMtime } from "./stage-payload-lib.js";

function tempDir() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-stage-payload-lib-")));
}

/** Writes a file (creating parent directories), stamps it with `mtimeMs`, and returns the mtime the
 *  filesystem actually stored — see the file header for why that can differ from `mtimeMs`. */
function touch(filePath, mtimeMs) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "x");
  fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
  return fs.statSync(filePath).mtimeMs;
}

test("returns 0 for a path that does not exist", () => {
  const dir = tempDir();
  assert.equal(newestMtime(path.join(dir, "nope")), 0);
});

test("returns a bundle-input file's own mtime when given a plain file directly", () => {
  const dir = tempDir();
  const file = path.join(dir, "shell.tsx");
  const stored = touch(file, 1_700_000_010_000);
  assert.equal(newestMtime(file), stored);
});

test("returns 0 for a single file that is not a bundle input (a .test.js file)", () => {
  const dir = tempDir();
  const file = path.join(dir, "shell.test.js");
  touch(file, 1_700_000_010_000);
  assert.equal(newestMtime(file), 0);
});

test("returns the newest mtime among sibling files in a flat directory", () => {
  const dir = tempDir();
  touch(path.join(dir, "older.ts"), 1_000_000);
  const newer = touch(path.join(dir, "newer.ts"), 2_000_000);
  assert.equal(newestMtime(dir), newer);
});

test("excludes an entire node_modules subtree, even when it is the newest thing present", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "node_modules", "pkg", "index.js"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes dotfile entries and dot-directories, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, ".git", "HEAD"), 9_999_999);
  touch(path.join(dir, ".env"), 8_888_888);
  assert.equal(newestMtime(dir), source);
});

test("excludes a __tests__ directory's contents entirely, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "__tests__", "unit", "source.unit.test.ts"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes a __measurements__ directory's contents entirely, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "__measurements__", "run.json"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes a stray *.test.js file sitting directly in a walked directory (not inside __tests__)", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "source.test.ts"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("recurses into nested directories to find the newest mtime several levels deep", () => {
  const dir = tempDir();
  touch(path.join(dir, "shallow.ts"), 1_000);
  const deep = touch(path.join(dir, "a", "b", "c", "deep.ts"), 3_000_000);
  assert.equal(newestMtime(dir), deep);
});

test("returns 0 for an empty directory", () => {
  const dir = tempDir();
  fs.mkdirSync(dir, { recursive: true });
  assert.equal(newestMtime(dir), 0);
});
