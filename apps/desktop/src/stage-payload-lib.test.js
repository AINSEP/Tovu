/**
 * @file Direct tests for `stage-payload-lib.js`. Real directories throughout — `newestMtime` and
 * `stageTransitiveDependencies` each walk a real filesystem tree, and only the filesystem can
 * produce that honestly (see `project-delete-guard.test.js`'s header for the same reasoning).
 * Every fixture lives under a fresh `fs.mkdtempSync` directory; nothing here ever touches the real
 * `apps/desktop/staging/tovu-payload` tree `scripts/stage-payload.mjs` uses.
 *
 * `newestMtime` section: `touch()` returns the mtime the filesystem actually stored rather than the
 * millisecond value it was asked to set. `fs.utimesSync` round-trips some millisecond values through
 * a lossy seconds-as-a-double conversion (verified empirically — 555555 came back as 555554.999,
 * 9999999 as 9999998.999, while 8888888 and every whole-second value came back exact, with no
 * predictable pattern across those). Comparing against the actually-stored value keeps every
 * assertion an EXACT equality — never "greater than 0" or "changed" — without depending on which
 * millisecond values happen to survive the round trip on this filesystem.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { newestMtime, stageTransitiveDependencies } from "./stage-payload-lib.js";

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

/** Writes a real `package.json` naming `dependencies`, the shape `declaredDependencies` reads. */
function writePackage(dir, dependencies = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: path.basename(dir), dependencies }));
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

test("stageTransitiveDependencies: stages nothing and returns 0 when a root declares no dependencies", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules")), false);
});

test("stageTransitiveDependencies: stages a single declared dependency found one node_modules level down", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1.0.0" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, {});
  fs.writeFileSync(path.join(fooDir, "marker.txt"), "real-foo");
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 1);
  const stagedFoo = path.join(outDir, "node_modules", "foo");
  assert.equal(fs.existsSync(path.join(stagedFoo, "package.json")), true);
  assert.equal(fs.readFileSync(path.join(stagedFoo, "marker.txt"), "utf8"), "real-foo");
});

test("stageTransitiveDependencies: follows a multi-level dependency chain, staging every link", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  const barDir = path.join(fooDir, "node_modules", "bar");
  writePackage(barDir, {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 2);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "foo", "package.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "bar", "package.json")), true);
});

test("stageTransitiveDependencies: does not loop on a dependency cycle, staging each package exactly once", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  const barDir = path.join(fooDir, "node_modules", "bar");
  writePackage(barDir, { foo: "^1" }); // cycles back to foo, already visited
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 2); // foo + bar, each staged exactly once despite the cycle
});

test("stageTransitiveDependencies: skips an excluded package before ever resolving it", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { playwright: "^1" });
  // A REAL, resolvable playwright package sits right where findPackageDir would find it — proving
  // the skip happens at the exclusion check, not merely because resolution failed.
  writePackage(path.join(pkgA, "node_modules", "playwright"), {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "playwright")), false);
});

test("stageTransitiveDependencies: does not re-copy a dependency whose staged destination already exists, but still walks its own dependencies", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  fs.writeFileSync(path.join(fooDir, "marker.txt"), "real-foo");
  writePackage(path.join(fooDir, "node_modules", "bar"), {});
  const outDir = path.join(tmp, "out");

  // Pre-stage a STUB foo at the destination — proves the real foo is never copied over it.
  const stagedFoo = path.join(outDir, "node_modules", "foo");
  fs.mkdirSync(stagedFoo, { recursive: true });
  fs.writeFileSync(path.join(stagedFoo, "marker.txt"), "stub-foo");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 1); // only bar counted; foo's destination already existed
  assert.equal(fs.readFileSync(path.join(stagedFoo, "marker.txt"), "utf8"), "stub-foo"); // untouched
  // foo's own dependency (bar) was still walked and staged, despite foo itself being skipped.
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "bar", "package.json")), true);
});

test("stageTransitiveDependencies: does not stage a dependency that resolves to one of the roots itself", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  const pkgB = path.join(tmp, "pkgB");
  writePackage(pkgB, {});
  writePackage(pkgA, { pkgB: "^1" });
  fs.mkdirSync(path.join(pkgA, "node_modules"), { recursive: true });
  fs.symlinkSync(pkgB, path.join(pkgA, "node_modules", "pkgB"));
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA, pkgB], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "pkgB")), false);
});
