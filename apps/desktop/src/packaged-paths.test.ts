import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DESKTOP_APP_NAME } from "./desktop-user-data-dir.ts";
import { resolveDesktopRoots } from "./packaged-paths.ts";
import { stagePayloadFiles } from "./stage-payload-lib.ts";

const REPO_ROOT = "/Users/someone/Programming/Tovu";
const RESOURCES = "/Applications/Tovu.app/Contents/Resources";
const DOCUMENTS = "/Users/someone/Documents";
const APP_DATA = "/Users/someone/Library/Application Support";

function devRoots() {
  return resolveDesktopRoots({ isPackaged: false, resourcesPath: RESOURCES, repoRoot: REPO_ROOT, documentsDir: DOCUMENTS, appDataDir: APP_DATA });
}

function packagedRoots() {
  return resolveDesktopRoots({ isPackaged: true, resourcesPath: RESOURCES, repoRoot: REPO_ROOT, documentsDir: DOCUMENTS, appDataDir: APP_DATA });
}

test("dev mode reproduces exactly what main.ts derived from REPO_ROOT before this module existed", () => {
  const roots = devRoots();
  assert.equal(roots.payloadRoot, REPO_ROOT);
  assert.equal(roots.devFallbackSiteDir, path.join(REPO_ROOT, "sites", "tovu-dev"));
  assert.deepEqual(roots.siteScanRoots, [path.join(REPO_ROOT, "sites")]);
  assert.equal(roots.defaultCliMode, "source");
});

test("a packaged app resolves the payload out of Resources/tovu, not out of the .app's Contents", () => {
  assert.equal(packagedRoots().payloadRoot, path.join(RESOURCES, "tovu"));
});

test("the staged payload keeps its repo-relative shape, so one path.join serves both modes", () => {
  // The contract `resolveCliEntry` and `buildServeEnv` depend on: `<root>/package.json`,
  // `<root>/apps/admin/dist` and `<root>/apps/site-chat/dist` are correct joins against EITHER root.
  for (const roots of [devRoots(), packagedRoots()]) {
    assert.equal(path.basename(path.join(roots.payloadRoot, "package.json")), "package.json");
    assert.ok(path.join(roots.payloadRoot, "apps", "admin", "dist").startsWith(roots.payloadRoot));
    assert.ok(path.join(roots.payloadRoot, "apps", "site-chat", "dist").startsWith(roots.payloadRoot));
  }
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-payload-layout-"));
  const sourceRoot = path.join(fixture, "repo");
  const payloadRoot = path.join(fixture, "resources", "tovu");
  const files = {
    "package.json": '{"bin":{"tovu":"dist/cli.js"}}',
    "dist/cli.js": "// compiled CLI",
    "apps/admin/dist/index.html": "<html>admin</html>",
    "apps/site-chat/dist/site-assistant.js": "// site chat",
  };
  try {
    fs.mkdirSync(payloadRoot, { recursive: true });
    for (const [relative, bytes] of Object.entries(files)) {
      const file = path.join(sourceRoot, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    // This is the same copy function and shell list the real staging script calls.
    stagePayloadFiles({ repoRoot: sourceRoot, outDir: payloadRoot });
    for (const [relative, bytes] of Object.entries(files)) {
      assert.equal(fs.readFileSync(path.join(payloadRoot, relative), "utf8"), bytes, `${relative} must retain its location and bytes`);
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const config = yaml.load(fs.readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8")) as {
    extraResources: { from: string; to: string; filter?: string[] }[];
  };
  for (const relative of ["dist", "apps", "node_modules", "package.json"]) {
    const resource = config.extraResources.find((entry) => entry.from === `staging/tovu-payload/${relative}`);
    assert.ok(resource, `the staged ${relative} must ship`);
    assert.equal(resource.to, `tovu/${relative}`, `${relative} must keep its repo-relative location`);
    if (relative === "apps") assert.deepEqual(resource.filter, ["**/*"], "both admin/dist and site-chat/dist must ship");
  }
});

test("a packaged app has no dev fallback site, so that precedence tier is absent rather than broken", () => {
  // `null`, not a non-existent path: `resolveDevFallback` short-circuits on a falsy value and
  // reports `rejected: null` ("nothing to try"), where a bogus path would classify and report a
  // rejection the picker would then explain to a user who has no checkout.
  assert.equal(packagedRoots().devFallbackSiteDir, null);
});

test("a packaged app scans a user-writable root instead of the read-only payload", () => {
  const roots = packagedRoots();
  assert.deepEqual(roots.siteScanRoots, [path.join(DOCUMENTS, "Tovu Sites")]);
  for (const root of roots.siteScanRoots) {
    assert.ok(!root.startsWith(roots.payloadRoot), `${root} must not sit inside the read-only payload`);
  }
});

test("a packaged app defaults to compiled mode, because it ships no TypeScript source and no tsx", () => {
  assert.equal(packagedRoots().defaultCliMode, "compiled");
});

test("a packaged app keeps its data in its own folder, never the dev app's tovu-desktop", () => {
  // The first release dmg resolved `userData` to `tovu-desktop` (package.json's name), listed the
  // developer's live site, and ran a second server on its databases.
  const packaged = packagedRoots().userDataDir;
  assert.equal(packaged, path.join(APP_DATA, "Tovu"), "a packaged build must not resolve userData to the dev app's folder");
  assert.notEqual(packaged, devRoots().userDataDir);
});

test("the dev app keeps the tovu-desktop folder its existing data, and the add-site CLI, already use", () => {
  assert.equal(devRoots().userDataDir, path.join(APP_DATA, "tovu-desktop"));
  assert.equal(devRoots().userDataDir, path.join(APP_DATA, DESKTOP_APP_NAME));
});

test("the packaged data folder is named after the bundle electron-builder.yml ships", () => {
  const builderConfig = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "electron-builder.yml"), "utf8");
  const productName = /^productName:\s*(.+)$/m.exec(builderConfig)?.[1]?.trim();
  assert.ok(productName, "expected a productName in electron-builder.yml");
  assert.equal(packagedRoots().userDataDir, path.join(APP_DATA, productName));
});

test("resolveDesktopRoots reads no ambient state — same inputs, same answer", () => {
  assert.deepEqual(packagedRoots(), packagedRoots());
  assert.deepEqual(devRoots(), devRoots());
  const expected = [packagedRoots(), devRoots()];
  const cwd = process.cwd();
  const previous = { HOME: process.env.HOME, APPDATA: process.env.APPDATA, TOVU_SITE_DIR: process.env.TOVU_SITE_DIR };
  const otherCwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-roots-"));
  try {
    process.chdir(otherCwd);
    process.env.HOME = "/unrelated-home";
    process.env.APPDATA = "/unrelated-app-data";
    process.env.TOVU_SITE_DIR = "/unrelated-site";
    assert.deepEqual([packagedRoots(), devRoots()], expected);
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(otherCwd, { recursive: true, force: true });
  }
});

test("dev mode finds the bundled npm devDependency inside this app's own node_modules", () => {
  // Not the workspace root's node_modules: the design (plan-desktop-bundled-npx-2026-09-24.md §6
  // S3) scopes npm to apps/desktop precisely so a root install can never unlink the local Jini.
  assert.equal(devRoots().npmRoot, path.join(REPO_ROOT, "apps", "desktop", "node_modules", "npm"));
});

test("a packaged app finds npm staged next to the payload, not inside node_modules", () => {
  assert.equal(packagedRoots().npmRoot, path.join(RESOURCES, "npm"));
});
