import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSitesWorkspace } from "../../sites-home.js";
import { desktopProjectPaths, relocateDesktopProjects, sitesProjectReferences } from "../../sites-project-references.js";

test("desktop catalog paths cover OS profile conventions and isolate an explicit custom profile", () => {
  assert.deepEqual(desktopProjectPaths({ homeDir: "/users/a", appData: "/users/a/Library/Application Support/Tovu", platform: "darwin", env: {} }), [
    "/users/a/Library/Application Support/Tovu/desktop-projects.json", "/users/a/Library/Application Support/tovu-desktop/desktop-projects.json",
  ]);
  assert.deepEqual(desktopProjectPaths({ homeDir: "C:\\Users\\a", appData: "D:\\Roaming\\Tovu", platform: "win32", env: {} }), [
    "D:\\Roaming\\Tovu\\desktop-projects.json", "D:\\Roaming\\tovu-desktop\\desktop-projects.json",
  ]);
  assert.deepEqual(desktopProjectPaths({ homeDir: "/users/a", appData: "/custom", platform: "linux", env: { XDG_CONFIG_HOME: "/config", TOVU_DESKTOP_USER_DATA_DIR: "/custom" } }), [
    "/custom/desktop-projects.json",
  ]);
});
test("desktop migration preserves every unrelated field and rejects target collisions or invalid catalogs", () => {
  const value = { projects: [{ siteDir: "/old", createdAt: "date", origin: "created", siteId: "id", displayNameAlias: "Alias" }], dismissed: ["/old", "/other"], metadata: 1 };
  const moved = relocateDesktopProjects({ value, from: "/old", to: "/new" });
  assert.deepEqual(moved, { ...value, projects: [{ ...value.projects[0], siteDir: "/new" }], dismissed: ["/new", "/other"] });
  assert.equal(value.projects[0].siteDir, "/old");
  assert.deepEqual(relocateDesktopProjects({ value: moved, from: "/old", to: "/new" }), moved);
  assert.equal(relocateDesktopProjects({ value: undefined, from: "/old", to: "/new" }), undefined);
  assert.throws(() => relocateDesktopProjects({ value: { projects: [...value.projects, { siteDir: "/new", createdAt: "date" }] }, from: "/old", to: "/new" }), /already tracked/);
  for (const bad of [null, [], { projects: "invalid" }, { projects: [], dismissed: [null] }]) assert.throws(() => relocateDesktopProjects({ value: bad, from: "/old", to: "/new" }), /catalog is invalid/);
});

test("desktop migration moves valid rows while preserving unusable rows exactly", () => {
  const invalid = [null, "garbage", {}, { siteDir: "/old" }, { createdAt: "date" }, { siteDir: "/new" }];
  const valid = { siteDir: "/old", createdAt: "date", origin: "created", siteId: "id" };
  const value = { projects: [...invalid, valid], dismissed: [] };
  assert.deepEqual(relocateDesktopProjects({ value, from: "/old", to: "/new" }), {
    ...value, projects: [...invalid, { ...valid, siteDir: "/new" }],
  });
  assert.equal(valid.siteDir, "/old");
});

test("a catalog without dismissals gains none when its rows move", () => {
  assert.deepEqual(relocateDesktopProjects({ value: { projects: [{ siteDir: "/old", createdAt: "date" }] }, from: "/old", to: "/new" }), { projects: [{ siteDir: "/new", createdAt: "date" }] });
});

test("dismissals that are not a list make the catalog invalid", () => {
  assert.throws(() => relocateDesktopProjects({ value: { projects: [], dismissed: "/old" }, from: "/old", to: "/new" }), { message: "Desktop projects catalog is invalid." });
});

test("Linux desktop profiles follow XDG_CONFIG_HOME when it is set", () => {
  assert.deepEqual(desktopProjectPaths({ homeDir: "/home/a", appData: "/data/Tovu", env: { XDG_CONFIG_HOME: "/xdg" }, platform: "linux" }),
    ["/data/Tovu/desktop-projects.json", "/xdg/Tovu/desktop-projects.json", "/xdg/tovu-desktop/desktop-projects.json"]);
});

test("reference participants default to the workspace's desktop profiles, once each, and relocate rows", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-references-"));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, platform: "linux" });
    const changes = sitesProjectReferences({ workspace: { ...workspace, projectsPaths: ["/p/a.json", "/p/a.json", "/p/b.json"] }, from: "/old", to: "/new" });
    assert.deepEqual(changes.map((change) => change.filePath), ["/p/a.json", "/p/b.json"]);
    assert.deepEqual(changes[0]?.transform({ projects: [{ siteDir: "/old", createdAt: "date" }] }), { projects: [{ siteDir: "/new", createdAt: "date" }] });
    assert.deepEqual(sitesProjectReferences({ workspace, from: "/old", to: "/new" }, { projectsPaths: ["/only.json"] }).map((change) => change.filePath), ["/only.json"]);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
