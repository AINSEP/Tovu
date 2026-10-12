import assert from "node:assert/strict";
import test from "node:test";
import { desktopProjectPaths, relocateDesktopProjects } from "../../sites-project-references.js";

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
