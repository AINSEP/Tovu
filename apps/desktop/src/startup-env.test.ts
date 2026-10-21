/**
 * @file `startup-env.ts`: the launch-time env decisions `main.ts` makes once at boot, driven with a
 * plain env object instead of `process.env`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { describeRejectedDefault, explicitStartupSiteDirs, isUnattendedSiteLaunch, resolveCliMode, sitesUiRequested } from "./startup-env.ts";

test("the sites home opens by default, and any pinned destination bypasses it", () => {
  assert.equal(sitesUiRequested({ env: {} }), true);
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_URL: "http://127.0.0.1:4000" } }), false);
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_SITE_DIR: "/sites/a" } }), false);
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_SITE_DIRS: "/sites/a,/sites/b" } }), false);
  // Whitespace-only values pin nothing.
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_URL: "  ", TOVU_DESKTOP_SITE_DIR: " ", TOVU_DESKTOP_SITE_DIRS: " " } }), true);
});

test("an explicit TOVU_DESKTOP_UI=runner opens the sites home even over a pinned site dir", () => {
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_UI: " runner ", TOVU_DESKTOP_SITE_DIR: "/sites/a" } }), true);
  assert.equal(sitesUiRequested({ env: { TOVU_DESKTOP_UI: "classic", TOVU_DESKTOP_SITE_DIR: "/sites/a" } }), false);
});

test("the CLI mode honours an explicit choice and otherwise falls back to the build's default, garbage included", () => {
  assert.equal(resolveCliMode({ env: { TOVU_DESKTOP_CLI_MODE: "compiled" }, defaultCliMode: "source" }), "compiled");
  assert.equal(resolveCliMode({ env: { TOVU_DESKTOP_CLI_MODE: " source " }, defaultCliMode: "compiled" }), "source");
  assert.equal(resolveCliMode({ env: { TOVU_DESKTOP_CLI_MODE: "fast" }, defaultCliMode: "compiled" }), "compiled");
  assert.equal(resolveCliMode({ env: {}, defaultCliMode: "source" }), "source");
});

test("pinned startup site dirs are split, trimmed and blank-filtered; unset or blank means none", () => {
  assert.deepEqual(explicitStartupSiteDirs({ env: { TOVU_DESKTOP_SITE_DIRS: " /a , ,/b ,," } }), ["/a", "/b"]);
  assert.equal(explicitStartupSiteDirs({ env: {} }), null);
  assert.equal(explicitStartupSiteDirs({ env: { TOVU_DESKTOP_SITE_DIRS: "   " } }), null);
});

test("a rejected startup default is explained by its own reason, naming the missing markers", () => {
  assert.equal(describeRejectedDefault({ dir: "/s", kind: "empty" }), "has no site in it yet");
  assert.equal(describeRejectedDefault({ dir: "/s", kind: "unreadable" }), "could not be read (check its permissions, or whether something replaced it)");
  assert.equal(describeRejectedDefault({ dir: "/s", kind: "incomplete", missing: ["tovu.config.json", "content.db"] }),
    "is missing tovu.config.json and content.db — it looks like a half-initialized site");
  assert.equal(describeRejectedDefault({ dir: "/s", kind: "occupied", missing: ["tovu.config.json"] }), "is not a Tovu site (missing tovu.config.json)");
});

test("a launch is unattended exactly when it pinned its site dir(s) by env var", () => {
  assert.equal(isUnattendedSiteLaunch({ env: {} }), false);
  assert.equal(isUnattendedSiteLaunch({ env: { TOVU_DESKTOP_SITE_DIR: "/sites/a" } }), true);
  assert.equal(isUnattendedSiteLaunch({ env: { TOVU_DESKTOP_SITE_DIRS: "/sites/a" } }), true);
  assert.equal(isUnattendedSiteLaunch({ env: { TOVU_DESKTOP_SITE_DIR: " ", TOVU_DESKTOP_URL: "http://127.0.0.1:1" } }), false);
});
