import assert from "node:assert/strict";
import test from "node:test";

import { buildApiEnv } from "../dev.mjs";
import { buildElectronEnv } from "../dev-desktop.mjs";
import { localDevPluginInstallEnv } from "../local-dev-plugin-install.mjs";

/**
 * @file Owner, 2026-10-05: local plugin installs (`TOVU_PLUGIN_LOCAL_INSTALL=1`) are on for local dev.
 * `npm run dev` and `npm run desktop` pass the flag to the server child unless the environment
 * already sets it; an explicit value, including `0`, wins.
 *
 * Run with: `node --test development/scripts/__tests__/dev-plugin-local-install.test.mjs`.
 */

const API = { scheme: "https", apiPort: 3000, vitePort: 5173, supervisorPid: 42 };

test("localDevPluginInstallEnv turns local installs on when the environment says nothing", () => {
  assert.deepEqual(localDevPluginInstallEnv({}), { TOVU_PLUGIN_LOCAL_INSTALL: "1" });
});

test("localDevPluginInstallEnv keeps an explicit value, including 0 and empty", () => {
  for (const value of ["0", "1", ""]) {
    assert.deepEqual(localDevPluginInstallEnv({ TOVU_PLUGIN_LOCAL_INSTALL: value }), { TOVU_PLUGIN_LOCAL_INSTALL: value });
  }
});

test("npm run dev: the API child gets TOVU_PLUGIN_LOCAL_INSTALL=1 by default", () => {
  assert.equal(buildApiEnv(API, { env: {} }).TOVU_PLUGIN_LOCAL_INSTALL, "1");
});

test("npm run dev: an explicit TOVU_PLUGIN_LOCAL_INSTALL=0 reaches the API child unchanged", () => {
  assert.equal(buildApiEnv(API, { env: { TOVU_PLUGIN_LOCAL_INSTALL: "0" } }).TOVU_PLUGIN_LOCAL_INSTALL, "0");
});

test("npm run dev: the extracted API env keeps every entry the inline one had", () => {
  assert.deepEqual(buildApiEnv(API, { env: {} }), {
    TOVU_ADMIN_DEV_PROXY_URL: "https://localhost:5173",
    PORT: "3000",
    TOVU_DEV_SUPERVISOR_PID: "42",
    TOVU_ENABLE_SITE_SWITCHER: "1",
    TOVU_PLUGIN_LOCAL_INSTALL: "1",
  });
});

test("npm run desktop: Electron (which passes its env on to the server child) gets the flag by default", () => {
  assert.deepEqual(buildElectronEnv({ adminVitePort: 5273 }, { env: {} }), { TOVU_ADMIN_DEV_PORT: "5273", TOVU_PLUGIN_LOCAL_INSTALL: "1" });
  assert.deepEqual(buildElectronEnv({ adminVitePort: null }, { env: {} }), { TOVU_PLUGIN_LOCAL_INSTALL: "1" });
});

test("npm run desktop: an explicit TOVU_PLUGIN_LOCAL_INSTALL=0 wins", () => {
  assert.equal(buildElectronEnv({ adminVitePort: null }, { env: { TOVU_PLUGIN_LOCAL_INSTALL: "0" } }).TOVU_PLUGIN_LOCAL_INSTALL, "0");
});
