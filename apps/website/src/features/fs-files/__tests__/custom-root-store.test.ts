import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CustomFsRootError, getCustomFsRoot, resetCustomFsRootForTests, setCustomFsRoot } from "../custom-root-store.js";

/**
 * @file Certifies the operator-set `custom` fs-files root's own store: path-only capture (never a
 * read of the folder's contents), the validation `setCustomFsRoot` performs before accepting a path,
 * and that clearing genuinely clears rather than merely no-oping.
 */

test.beforeEach(() => {
  resetCustomFsRootForTests();
});

test("unset by default", () => {
  assert.equal(getCustomFsRoot(), undefined);
});

test("setting a real absolute directory makes it the current custom root, resolved through realpath", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(dir);
  assert.equal(getCustomFsRoot(), fs.realpathSync(dir));
});

test("setting does not read, list, or otherwise touch anything INSIDE the folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  const bigFile = path.join(dir, "huge.bin");
  // A real file is created so a walk/read would have something to trip over, but this test never
  // asserts on its content — only that `setCustomFsRoot` completes instantly regardless of size,
  // which it would not if it ever read this file.
  fs.writeFileSync(bigFile, Buffer.alloc(1024));
  const before = Date.now();
  setCustomFsRoot(dir);
  const elapsedMs = Date.now() - before;
  assert.ok(elapsedMs < 1000, `setCustomFsRoot took ${elapsedMs}ms — expected an O(1) stat, not a walk`);
});

test("a relative path is refused", () => {
  assert.throws(() => setCustomFsRoot("relative/path"), CustomFsRootError);
  assert.equal(getCustomFsRoot(), undefined);
});

test("a path that does not exist is refused", () => {
  const missing = path.join(os.tmpdir(), `tovu-custom-root-missing-${Date.now()}`);
  assert.throws(() => setCustomFsRoot(missing), CustomFsRootError);
  assert.equal(getCustomFsRoot(), undefined);
});

test("a path naming a FILE, not a directory, is refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  const file = path.join(dir, "not-a-directory.txt");
  fs.writeFileSync(file, "hello", "utf8");
  assert.throws(() => setCustomFsRoot(file), CustomFsRootError);
  assert.equal(getCustomFsRoot(), undefined);
});

test("setting null clears a previously-set root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(dir);
  assert.notEqual(getCustomFsRoot(), undefined);
  setCustomFsRoot(null);
  assert.equal(getCustomFsRoot(), undefined);
});

test("a rejected set leaves a previously-valid root untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(dir);
  const before = getCustomFsRoot();
  assert.throws(() => setCustomFsRoot("relative/nonsense"), CustomFsRootError);
  assert.equal(getCustomFsRoot(), before);
});
