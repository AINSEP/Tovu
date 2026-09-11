import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resetCustomFsRootForTests, setCustomFsRoot } from "../custom-root-store.js";
import { FS_ROOT_DESCRIPTORS, FS_ROOT_IDS, resolveFsRoots } from "../layout.js";

/**
 * @file Certifies `resolveFsRoots` folds all three roots consistently: `repo`/`site` behave exactly
 * as before `custom` existed, and `custom` reflects whatever `custom-root-store.ts` currently holds
 * — `undefined` until an operator sets one, the real directory afterward.
 */

test.beforeEach(() => {
  resetCustomFsRootForTests();
});

test("FS_ROOT_IDS lists exactly repo, site, and custom — in that order", () => {
  assert.deepEqual(FS_ROOT_IDS, ["repo", "site", "custom"]);
});

test("FS_ROOT_DESCRIPTORS has one entry per FS_ROOT_IDS id, none blank", () => {
  const ids = FS_ROOT_DESCRIPTORS.map((d) => d.id);
  assert.deepEqual(ids, [...FS_ROOT_IDS]);
  for (const descriptor of FS_ROOT_DESCRIPTORS) {
    assert.ok(descriptor.description.length > 0, `'${descriptor.id}' has an empty description`);
  }
});

test("resolveFsRoots resolves repo and site exactly as before custom existed", () => {
  const roots = resolveFsRoots();
  assert.equal(typeof roots.repo, "string");
  assert.ok(roots.repo.length > 0);
  assert.equal(typeof roots.site, "string");
  assert.ok(roots.site.length > 0);
});

test("resolveFsRoots reports custom as undefined when no operator folder has been set", () => {
  const roots = resolveFsRoots();
  assert.equal(roots.custom, undefined);
});

test("resolveFsRoots reflects a custom root the moment it is set — no caching across calls", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-custom-"));
  assert.equal(resolveFsRoots().custom, undefined);
  setCustomFsRoot(dir);
  assert.equal(resolveFsRoots().custom, fs.realpathSync(dir));
});

test("resolveFsRoots reflects clearing the custom root back to undefined", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-custom-"));
  setCustomFsRoot(dir);
  assert.notEqual(resolveFsRoots().custom, undefined);
  setCustomFsRoot(null);
  assert.equal(resolveFsRoots().custom, undefined);
});
