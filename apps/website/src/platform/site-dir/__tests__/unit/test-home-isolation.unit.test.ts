import { isolatedCatalogHome, isolatedCatalogEnv } from "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertTestHomeIsolation, createSitesWorkspace } from "../../sites-home.js";
import { siteKeySources } from "../../../../features/webhooks/site-key-sources.js";
import { childProcessCoverageEnv } from "../../../../contracts/core/child-process-coverage-env.js";

/** Sweep s01: fail before owner settings/key I/O; exercise the real resolvers without mocks. */
const ISOLATION_ERROR = "Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.";
const realHome = os.userInfo().homedir;

test("node:test refuses an unisolated HOME before resolving the sites workspace or local site keys", () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, "the guard must be exercised under node:test");
  const previousHome = process.env.HOME;
  const previousProfile = process.env.USERPROFILE;
  process.env.HOME = realHome;
  process.env.USERPROFILE = realHome;
  try {
    assert.throws(() => createSitesWorkspace({}, { env: {}, cwd: isolatedCatalogHome, sourceRoots: [] }), { message: ISOLATION_ERROR });
    assert.throws(() => siteKeySources({ mode: "local", env: {}, home: os.homedir(), cwd: isolatedCatalogHome, siteKeyId: "fixture-id" }), { message: ISOLATION_ERROR });
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
  }
});

test("isolated HOME resolves sites, registry profile, settings and site keys inside the temporary home", () => {
  const workspace = createSitesWorkspace({}, { homeDir: isolatedCatalogHome, env: { ...isolatedCatalogEnv }, cwd: isolatedCatalogHome, sourceRoots: [] });
  assert.equal(workspace.home({}), path.join(isolatedCatalogHome, "Documents", "Tovu"));
  assert.equal(workspace.config({}).appData, path.join(isolatedCatalogHome, "desktop-profile"));
  assert.equal(workspace.config({}).configPath, path.join(isolatedCatalogHome, "desktop-profile", "config.json"));
  assert.deepEqual(workspace.registry({}).list({}), []);
  assert.deepEqual(siteKeySources({ mode: "local", env: {}, home: isolatedCatalogHome, cwd: isolatedCatalogHome, siteKeyId: "fixture-id" }), [
    { kind: "per-site-file", path: path.join(isolatedCatalogHome, ".tovu", "site-keys", "fixture-id.hex") },
    { kind: "env" },
    { kind: "legacy-shared-file", path: path.join(isolatedCatalogHome, ".tovu", "integrations-root-key.hex") },
  ]);
});

test("an isolated HOME cannot hide owner catalog/root overrides or a saved owner-home pointer", (t) => {
  for (const [key, value] of [
    ["TOVU_DESKTOP_USER_DATA_DIR", path.join(realHome, "Library", "Application Support", "Tovu")],
    ["TOVU_SITES_HOME", path.join(realHome, "Documents", "Tovu")],
    ["TOVU_SITE_ROOTS", path.join(realHome, "Documents", "Tovu")],
    ["APPDATA", path.join(realHome, "AppData", "Roaming")],
    ["XDG_DATA_HOME", path.join(realHome, ".local", "share")],
  ] as const) {
    assert.throws(() => createSitesWorkspace({}, { homeDir: isolatedCatalogHome, env: { ...isolatedCatalogEnv, [key]: value }, sourceRoots: [] }), { message: ISOLATION_ERROR });
  }
  const profile = fs.mkdtempSync(path.join(isolatedCatalogHome, "saved-profile-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  fs.writeFileSync(path.join(profile, "config.json"), JSON.stringify({ sitesHome: path.join(realHome, "Documents", "Tovu") }));
  assert.throws(() => createSitesWorkspace({}, { homeDir: isolatedCatalogHome, env: {}, appDataDir: profile, sourceRoots: [] }), { message: ISOLATION_ERROR });
});

test("CLI child env keeps the process-owned temporary home even after ambient HOME and catalog overrides change", () => {
  const keys = ["HOME", "USERPROFILE", "TOVU_DESKTOP_USER_DATA_DIR", "TOVU_SITES_HOME", "TOVU_SITE_ROOTS"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { HOME: realHome, USERPROFILE: realHome,
    TOVU_DESKTOP_USER_DATA_DIR: path.join(realHome, "Library", "Application Support", "Tovu"),
    TOVU_SITES_HOME: path.join(realHome, "Documents", "Tovu"), TOVU_SITE_ROOTS: path.join(realHome, "Documents", "Tovu") });
  try {
    const coverage = path.join(isolatedCatalogHome, "child-coverage");
    const env = childProcessCoverageEnv(coverage);
    for (const [key, value] of Object.entries(isolatedCatalogEnv)) assert.equal(env[key], value, key);
    assert.equal(env.HOME, isolatedCatalogHome);
    assert.equal(env.NODE_V8_COVERAGE, coverage);
    assert.equal(env.PATH, process.env.PATH);
    assert.equal(process.env.HOME, realHome, "building a child env must not mutate the caller");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("real runs keep the real-home default and production site keys keep their volume-only paths", () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.doesNotThrow(() => assertTestHomeIsolation({ homeDir: realHome }));
    assert.equal(siteKeySources({ mode: "local", env: {}, home: realHome, cwd: isolatedCatalogHome, siteKeyId: "fixture-id" })[0]?.path,
      path.join(realHome, ".tovu", "site-keys", "fixture-id.hex"));
  } finally {
    if (previous !== undefined) process.env.NODE_TEST_CONTEXT = previous;
  }
  assert.deepEqual(siteKeySources({ mode: "production", env: {}, home: realHome, cwd: isolatedCatalogHome }), [
    { kind: "env" },
    { kind: "volume-file", path: path.join(isolatedCatalogHome, "sites", ".tovu", "site-key.hex") },
    { kind: "legacy-volume-file", path: path.join(isolatedCatalogHome, "sites", ".tovu", "integrations-root-key.hex") },
  ]);
});
