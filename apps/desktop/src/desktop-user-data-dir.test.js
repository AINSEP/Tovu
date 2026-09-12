/**
 * @file Coverage for `desktop-user-data-dir.js` — the CLI's answer to "where is the app's data?".
 *
 * This module mirrors Electron rather than asking it, so the tests that matter are the ones that
 * catch DRIFT: the app name pinned to the manifest Electron actually reads, and the macOS path
 * pinned to the literal string verified against the live signed app. A wrong answer here is silent —
 * the CLI writes a row into a directory nothing reads — so it is checked against a second source
 * rather than against itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DESKTOP_APP_NAME, resolveDesktopUserDataDir } from "./desktop-user-data-dir.js";

const PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

test("DESKTOP_APP_NAME is package.json's own name, which is what Electron reads", () => {
  const manifest = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));

  // Electron's `app.getName()` reads the manifest, and `userData` is `<appData>/<appName>`. The
  // packaged bundle is called `Tovu` (`electron-builder.yml`'s `productName`) but that names the
  // .app, NOT this directory — verified against the live signed app, whose every helper process
  // carries `--user-data-dir=.../tovu-desktop`. Pinned to the manifest so renaming the package
  // cannot leave this constant behind pointing at an orphaned directory.
  assert.equal(DESKTOP_APP_NAME, manifest.name);
  assert.equal(manifest.productName, undefined, "a productName in package.json would change app.getName()");
});

test("resolveDesktopUserDataDir returns the verified macOS location", () => {
  const resolved = resolveDesktopUserDataDir({ env: {}, platform: "darwin", homedir: "/Users/someone" });

  // The literal, not a re-derivation: this exact path was confirmed to hold the real
  // `desktop-projects.json` on the developer machine.
  assert.equal(resolved, "/Users/someone/Library/Application Support/tovu-desktop");
});

test("TOVU_DESKTOP_USER_DATA_DIR wins over the platform default", () => {
  const env = { TOVU_DESKTOP_USER_DATA_DIR: "/tmp/elsewhere" };

  // The same override `main.js:139-141` applies through `app.setPath`. Reused rather than
  // reinvented so one environment cannot point the app and the CLI at two different directories.
  assert.equal(resolveDesktopUserDataDir({ env, platform: "darwin", homedir: "/Users/someone" }), "/tmp/elsewhere");
});

test("a blank override is ignored rather than resolving to the process cwd", () => {
  const resolved = resolveDesktopUserDataDir({
    env: { TOVU_DESKTOP_USER_DATA_DIR: "   " },
    platform: "darwin",
    homedir: "/Users/someone",
  });

  // `path.resolve("")` is the cwd, so treating a blank value as set would silently target whatever
  // directory the CLI happened to be run from.
  assert.equal(resolved, "/Users/someone/Library/Application Support/tovu-desktop");
});

test("linux honours XDG_CONFIG_HOME and falls back to ~/.config", () => {
  assert.equal(
    resolveDesktopUserDataDir({ env: { XDG_CONFIG_HOME: "/xdg" }, platform: "linux", homedir: "/home/u" }),
    path.join("/xdg", "tovu-desktop"),
  );
  assert.equal(
    resolveDesktopUserDataDir({ env: {}, platform: "linux", homedir: "/home/u" }),
    path.join("/home/u", ".config", "tovu-desktop"),
  );
});

test("win32 honours APPDATA and falls back to the conventional Roaming path", () => {
  assert.equal(
    resolveDesktopUserDataDir({ env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, platform: "win32", homedir: "C:\\Users\\u" }),
    path.join("C:\\Users\\u\\AppData\\Roaming", "tovu-desktop"),
  );
  assert.equal(
    resolveDesktopUserDataDir({ env: {}, platform: "win32", homedir: "C:\\Users\\u" }),
    path.join("C:\\Users\\u", "AppData", "Roaming", "tovu-desktop"),
  );
});

test("an unknown platform THROWS rather than guessing a directory", () => {
  // Guessing would mean writing the operator's Projects list somewhere the app will never look,
  // reported as success. Naming the override in the message is what makes the failure actionable.
  assert.throws(
    () => resolveDesktopUserDataDir({ env: {}, platform: "aix", homedir: "/home/u" }),
    /no known userData location for platform 'aix'.*TOVU_DESKTOP_USER_DATA_DIR/s,
  );
});
