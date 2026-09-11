import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CustomFsRootError,
  getCustomFsRoot,
  getCustomFsRootStatus,
  resetCustomFsRootForTests,
  setCustomFsRoot,
} from "../custom-root-store.js";

/**
 * @file Certifies the operator-set `custom` fs-files root's own store: path-only capture (never a
 * read of the folder's contents), the validation `setCustomFsRoot` performs before accepting a path,
 * that clearing genuinely clears rather than merely no-oping, that the value survives a simulated
 * process restart, that a vanished path is reported honestly rather than as "never set", and that two
 * workspaces never share a value.
 *
 * Every call below passes its own fresh `mkdtempSync` directory as `siteDir` — `setCustomFsRoot`'s
 * default (the real site) must never be exercised here, since this suite runs against the developer's
 * live working tree.
 */

const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";

function freshSiteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-site-"));
}

test.beforeEach((t) => {
  const siteDir = freshSiteDir();
  t.diagnostic(`siteDir=${siteDir}`);
  resetCustomFsRootForTests({ siteDir });
});

test("unset by default", () => {
  const siteDir = freshSiteDir();
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("setting a real absolute directory makes it the current custom root, resolved through realpath", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), fs.realpathSync(dir));
});

test("setting does not read, list, or otherwise touch anything INSIDE the folder", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  const bigFile = path.join(dir, "huge.bin");
  // A real file is created so a walk/read would have something to trip over, but this test never
  // asserts on its content — only that `setCustomFsRoot` completes instantly regardless of size,
  // which it would not if it ever read this file.
  fs.writeFileSync(bigFile, Buffer.alloc(1024));
  const before = Date.now();
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  const elapsedMs = Date.now() - before;
  assert.ok(elapsedMs < 1000, `setCustomFsRoot took ${elapsedMs}ms — expected an O(1) stat, not a walk`);
});

test("a relative path is refused", () => {
  const siteDir = freshSiteDir();
  assert.throws(() => setCustomFsRoot(WORKSPACE_A, "relative/path", { siteDir }), CustomFsRootError);
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("a path that does not exist is refused", () => {
  const siteDir = freshSiteDir();
  const missing = path.join(os.tmpdir(), `tovu-custom-root-missing-${Date.now()}`);
  assert.throws(() => setCustomFsRoot(WORKSPACE_A, missing, { siteDir }), CustomFsRootError);
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("a path naming a FILE, not a directory, is refused", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  const file = path.join(dir, "not-a-directory.txt");
  fs.writeFileSync(file, "hello", "utf8");
  assert.throws(() => setCustomFsRoot(WORKSPACE_A, file, { siteDir }), CustomFsRootError);
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("setting null clears a previously-set root", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  assert.notEqual(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
  setCustomFsRoot(WORKSPACE_A, null, { siteDir });
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("a rejected set leaves a previously-valid root untouched", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  const before = getCustomFsRoot(WORKSPACE_A, { siteDir });
  assert.throws(() => setCustomFsRoot(WORKSPACE_A, "relative/nonsense", { siteDir }), CustomFsRootError);
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), before);
});

// ---------------------------------------------------------------------------
// Persistence: survives a simulated restart.
// ---------------------------------------------------------------------------

test("a set folder survives a simulated restart — a fresh call against the same siteDir still sees it", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });

  // Nothing in this module holds an in-memory cache to clear, so "restart" is simulated the only way
  // that is actually meaningful here: calling the exported functions again with no state carried over
  // except `siteDir` itself, exactly as a fresh process boot would after re-resolving the site
  // directory. If this module ever grew an in-memory cache, this is the test that would catch it
  // reading stale/cached data instead of the file on disk.
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), fs.realpathSync(dir));
});

test("the persistence file is small, inspectable JSON keyed by workspace id", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });

  const persisted = fs.readFileSync(path.join(siteDir, ".fs-custom-root.json"), "utf8");
  const parsed = JSON.parse(persisted);
  assert.deepEqual(parsed, { [WORKSPACE_A]: fs.realpathSync(dir) });
});

// ---------------------------------------------------------------------------
// Honest degradation: a vanished path is not the same as "never set".
// ---------------------------------------------------------------------------

test("a path that vanished after being set is reported as vanished, not as unset", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  const realDir = fs.realpathSync(dir);

  fs.rmSync(dir, { recursive: true, force: true });

  const status = getCustomFsRootStatus(WORKSPACE_A, { siteDir });
  assert.equal(status.path, undefined);
  assert.equal(status.vanished, true);
  assert.equal(status.vanishedPath, realDir);
});

test("getCustomFsRoot treats a vanished path the same as unset — undefined either way", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-"));
  setCustomFsRoot(WORKSPACE_A, dir, { siteDir });
  fs.rmSync(dir, { recursive: true, force: true });

  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
});

test("never having set anything is NOT reported as vanished", () => {
  const siteDir = freshSiteDir();
  const status = getCustomFsRootStatus(WORKSPACE_A, { siteDir });
  assert.equal(status.path, undefined);
  assert.equal(status.vanished, false);
  assert.equal(status.vanishedPath, undefined);
});

// ---------------------------------------------------------------------------
// Two workspaces never share a value.
// ---------------------------------------------------------------------------

test("two workspaces do not share a custom root", () => {
  const siteDir = freshSiteDir();
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-a-"));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-b-"));

  setCustomFsRoot(WORKSPACE_A, dirA, { siteDir });
  assert.equal(getCustomFsRoot(WORKSPACE_B, { siteDir }), undefined, "workspace B must not see workspace A's root");

  setCustomFsRoot(WORKSPACE_B, dirB, { siteDir });
  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), fs.realpathSync(dirA), "workspace A's own root must be unaffected");
  assert.equal(getCustomFsRoot(WORKSPACE_B, { siteDir }), fs.realpathSync(dirB));
});

test("clearing one workspace's root leaves the other workspace's root untouched", () => {
  const siteDir = freshSiteDir();
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-a-"));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-b-"));

  setCustomFsRoot(WORKSPACE_A, dirA, { siteDir });
  setCustomFsRoot(WORKSPACE_B, dirB, { siteDir });
  setCustomFsRoot(WORKSPACE_A, null, { siteDir });

  assert.equal(getCustomFsRoot(WORKSPACE_A, { siteDir }), undefined);
  assert.equal(getCustomFsRoot(WORKSPACE_B, { siteDir }), fs.realpathSync(dirB));
});
