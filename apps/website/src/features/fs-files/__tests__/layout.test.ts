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
 * for the given `workspaceId` — `undefined` until an operator sets one (or no `workspaceId` is given
 * at all), the real directory afterward.
 *
 * `siteDir` is set through `env.TOVU_SITE_DIR` in every test that touches `custom`, so
 * `resolveFsRoots`'s own `resolveSiteRoot({ cwd, env })` call — and therefore
 * `custom-root-store.ts`'s persistence file — lands in a temp directory, never the real site.
 */

const WORKSPACE_ID = "workspace-a";

function freshSiteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-site-"));
}

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

test("resolveFsRoots reports custom as undefined when no workspaceId is given at all", () => {
  const roots = resolveFsRoots();
  assert.equal(roots.custom, undefined);
});

test("resolveFsRoots reports custom as undefined when no operator folder has been set for that workspace", () => {
  const siteDir = freshSiteDir();
  const roots = resolveFsRoots({ env: { TOVU_SITE_DIR: siteDir }, workspaceId: WORKSPACE_ID });
  assert.equal(roots.custom, undefined);
});

test("resolveFsRoots reflects a custom root the moment it is set — no caching across calls", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-custom-"));
  const env = { TOVU_SITE_DIR: siteDir };

  assert.equal(resolveFsRoots({ env, workspaceId: WORKSPACE_ID }).custom, undefined);
  setCustomFsRoot(WORKSPACE_ID, dir, { siteDir });
  assert.equal(resolveFsRoots({ env, workspaceId: WORKSPACE_ID }).custom, fs.realpathSync(dir));
});

test("resolveFsRoots reflects clearing the custom root back to undefined", () => {
  const siteDir = freshSiteDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-custom-"));
  const env = { TOVU_SITE_DIR: siteDir };

  setCustomFsRoot(WORKSPACE_ID, dir, { siteDir });
  assert.notEqual(resolveFsRoots({ env, workspaceId: WORKSPACE_ID }).custom, undefined);
  setCustomFsRoot(WORKSPACE_ID, null, { siteDir });
  assert.equal(resolveFsRoots({ env, workspaceId: WORKSPACE_ID }).custom, undefined);
});

test("resolveFsRoots keeps two workspaces' custom roots independent", () => {
  const siteDir = freshSiteDir();
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-layout-custom-a-"));
  const env = { TOVU_SITE_DIR: siteDir };

  setCustomFsRoot(WORKSPACE_ID, dirA, { siteDir });
  assert.equal(resolveFsRoots({ env, workspaceId: "workspace-b" }).custom, undefined);
  assert.equal(resolveFsRoots({ env, workspaceId: WORKSPACE_ID }).custom, fs.realpathSync(dirA));

  resetCustomFsRootForTests({ siteDir });
});
