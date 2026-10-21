import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { nestedSitesCompat, SITES_SETTINGS_NOTICES, type NestedSitesFolders } from "../../nested-sites-root.js";
import { createSitesWorkspace } from "../../sites-home.js";

test("an unlistable nested folder leaves the workspace roots unchanged", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-nested-root-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "Documents", "Tovu", "sites"), { recursive: true });
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, platform: "linux", sourceRoots: [] });
  const folders: NestedSitesFolders = {
    readdirSync: (dir) => { throw Object.assign(new Error(`EACCES: permission denied, scandir '${dir}'`), { code: "EACCES" }); },
    existsSync: (file) => fs.existsSync(file),
    lstatSync: (file) => fs.lstatSync(file),
  };
  const compat = nestedSitesCompat({ workspace }, { folders });
  assert.equal(compat.nestedSitesRoot({}), path.join(root, "Documents", "Tovu", "sites"));
  assert.deepEqual(compat.roots({}), workspace.roots({}));
});

test("the sites settings store names itself and reports a lock timeout as locked settings", () => {
  assert.equal(SITES_SETTINGS_NOTICES.prefix, "Tovu sites");
  assert.equal(SITES_SETTINGS_NOTICES.lockTimeout({ lockPath: "/home/.tovu/sites-home.json.lock", waitMs: 5000 }), "Tovu sites settings are locked.");
});
