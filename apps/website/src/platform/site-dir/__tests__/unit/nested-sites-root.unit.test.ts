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

// L11 Stryker: `nested && holdsSites(...)` (L25), the explicit-home / saved-setting refusals and the
// "a site named sites" guard survived or were uncovered. Fake folders + a fake workspace (DI) pin
// each branch; only the settings file is real, read through the production durable-JSON ports.
function fakeWorkspace(t: import("node:test").TestContext, { override, settings, roots = ["/r"] }: { override?: string; settings?: string; roots?: string[] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-nested-cfg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, "sites-home.json");
  if (settings !== undefined) fs.writeFileSync(configPath, settings);
  return {
    config: () => ({ overrides: override ? { sitesHome: override } : {}, configPath }),
    home: () => "/home/u/Documents/Tovu",
    roots: () => roots,
  } as never;
}
function fakeFolders({ dirs = ["/home/u/Documents/Tovu/sites"], files = [] as string[], children = { "/home/u/Documents/Tovu/sites": ["a", "b"] } as Record<string, string[]> } = {}): NestedSitesFolders {
  return {
    readdirSync: (dir) => { if (!children[dir]) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return children[dir]!; },
    existsSync: (file) => files.includes(file),
    lstatSync: (file) => {
      if (dirs.includes(file)) return { isDirectory: () => true };
      if (files.includes(file)) return { isDirectory: () => false };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  };
}
const NESTED = "/home/u/Documents/Tovu/sites";

test("a nested folder holding a site is added to the roots once; one without a site is not", (t) => {
  const withSite = fakeFolders({ files: [`${NESTED}/b/.site-meta.json`] });
  assert.deepEqual(nestedSitesCompat({ workspace: fakeWorkspace(t) }, { folders: withSite }).roots({}), ["/r", NESTED]);
  assert.deepEqual(nestedSitesCompat({ workspace: fakeWorkspace(t, { roots: ["/r", NESTED] }) }, { folders: withSite }).roots({}), ["/r", NESTED], "no duplicate");
  const noSite = fakeFolders({ files: [`${NESTED}/b/readme.md`] });
  const compat = nestedSitesCompat({ workspace: fakeWorkspace(t) }, { folders: noSite });
  assert.equal(compat.nestedSitesRoot({}), NESTED);
  assert.deepEqual(compat.roots({}), ["/r"]);
});

test("an explicit or saved home, or an unreadable setting, never qualifies", (t) => {
  const folders = fakeFolders({ files: [`${NESTED}/a/.site-meta.json`] });
  for (const options of [{ override: "/custom" }, { settings: JSON.stringify({ sitesHome: "/saved" }) }, { settings: JSON.stringify({ sitesHome: null }) }, { settings: "{not json" }]) {
    const compat = nestedSitesCompat({ workspace: fakeWorkspace(t, options) }, { folders });
    assert.equal(compat.nestedSitesRoot({}), undefined, JSON.stringify(options));
    assert.deepEqual(compat.roots({}), ["/r"]);
  }
  const unrelated = nestedSitesCompat({ workspace: fakeWorkspace(t, { settings: JSON.stringify({ other: 1 }) }) }, { folders });
  assert.equal(unrelated.nestedSitesRoot({}), NESTED, "a saved setting without sitesHome still qualifies");
});

test("the nested root must be a real folder that is not itself a site", (t) => {
  for (const folders of [
    fakeFolders({ dirs: [] }),
    fakeFolders({ dirs: [], files: [NESTED] }),
    fakeFolders({ files: [`${NESTED}/.site-meta.json`, `${NESTED}/a/.site-meta.json`] }),
  ]) {
    const compat = nestedSitesCompat({ workspace: fakeWorkspace(t) }, { folders });
    assert.equal(compat.nestedSitesRoot({}), undefined);
    assert.deepEqual(compat.roots({}), ["/r"]);
  }
});
