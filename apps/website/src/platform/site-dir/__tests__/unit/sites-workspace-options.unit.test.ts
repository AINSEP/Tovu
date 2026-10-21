import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultSourceRoots, desktopProfileDir, ownerStorageOverrides } from "../../sites-workspace-options.js";

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

test("desktopProfileDir resolves a trimmed desktop profile against cwd with posix path rules off win32", () => {
  assert.equal(desktopProfileDir({ env: { TOVU_DESKTOP_USER_DATA_DIR: " profile " }, cwd }, { platform: "linux" }), path.resolve(cwd, "profile"));
});

test("desktopProfileDir treats a blank desktop profile as unset", () => {
  assert.equal(desktopProfileDir({ env: { TOVU_DESKTOP_USER_DATA_DIR: "   " }, cwd }), undefined);
});

test("defaultSourceRoots keeps a Tovu checkout's legacy sites folder discoverable", (t) => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-checkout-"));
  t.after(() => fs.rmSync(checkout, { recursive: true, force: true }));
  fs.mkdirSync(path.join(checkout, "apps", "website", "src"), { recursive: true });
  assert.deepEqual(defaultSourceRoots({ cwd: checkout }), [path.join(checkout, "sites")]);
});

test("defaultSourceRoots adds no source root for a cwd that is not a Tovu checkout", (t) => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "not-tovu-"));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  assert.deepEqual(defaultSourceRoots({ cwd: elsewhere }), []);
});
