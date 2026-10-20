import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { desktopProfileDir, ownerStorageOverrides } from "../../sites-workspace-options.js";

/** Pure option resolution; the win32 branch cannot run through a live workspace off Windows (registry probes). */
const cwd = path.join(path.sep, "checkout");

test("desktopProfileDir resolves a win32 desktop profile with win32 path rules", () => {
  assert.equal(desktopProfileDir({ env: { TOVU_DESKTOP_USER_DATA_DIR: " profile " }, cwd }, { platform: "win32" }), path.win32.resolve(cwd, "profile"));
});

test("desktopProfileDir prefers an explicit appDataDir, even an empty one", () => {
  assert.equal(desktopProfileDir({ env: { TOVU_DESKTOP_USER_DATA_DIR: "profile" }, cwd }, { appDataDir: "" }), "");
});

test("desktopProfileDir leaves the platform default when no profile is configured", () => {
  assert.equal(desktopProfileDir({ env: {}, cwd }), undefined);
});

test("ownerStorageOverrides appends Tovu to app-data env roots and drops blank values", () => {
  assert.deepEqual(ownerStorageOverrides({ env: { APPDATA: "/a", XDG_DATA_HOME: "", XDG_CONFIG_HOME: "/c", TOVU_SITES_HOME: " " }, cwd }), ["/a/Tovu", "/c/Tovu"]);
});

test("ownerStorageOverrides resolves explicit and TOVU_SITE_ROOTS roots against cwd", () => {
  assert.deepEqual(ownerStorageOverrides({ env: { TOVU_SITE_ROOTS: " one ,, two" }, cwd }, { appDataDir: "profile", sourceRoots: ["three"] }),
    ["profile", "one", "two", "three"].map((name) => path.join(cwd, name)));
});
